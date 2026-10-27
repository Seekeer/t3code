---
name: fork-sync-build
description: Sync a personal T3 Code fork with upstream main, push it, wait for the "Build Windows installer" GitHub Actions run, and hand back a direct installer download link. Use for "update my fork from main", "merge upstream and build me an installer", or "give me the latest Windows release link". Not for upstream contribution PRs or npm releases.
---

# Fork sync build

This skill builds a personal fork's Windows installer from the latest upstream code. It runs the
whole loop — sync, push, build, wait, link — and ends with a link the user can download from.
The fork serves the user, so its workflow and its history are the user's decisions; each step below
carries the check that keeps the push from changing something the user did not ask to change.

Assume the standard layout from the user's git remotes:

- `origin` — the user's fork, which holds `build-gitea.yml`,
- `upstream` — `pingdotgg/t3code`, the source of the code.

Read them with `git remote -v` first. When no `upstream` exists, ask which URL is the source
instead of guessing. Work in the checkout that `git remote -v` came from. The fork branch is
whatever branch is checked out (normally `main`), and merging upstream into it is asked for by
the invocation.

## 1. Fetch and measure the gap

```bash
git fetch origin && git fetch upstream
git status --porcelain=v1
git rev-list --left-right --count <fork-branch>...upstream/main
```

The output is `<ahead> <behind>`. Report both numbers in the final answer.

Ahead commits are why the fork exists: the `build-gitea.yml` workflow and hosted-runner fixes,
possibly other local work. A merge preserves them and keeps each one's hash. Report anything
uncommitted (untracked scratch files such as a stray `b` included) and leave it alone.

## 2. Confirm the fork's build is intact

The build workflow is fork-only: upstream has no `build-gitea.yml`, so a merge never brings or removes
it, and a conflict on that file is not a risk. Confirm it survives the merge by checking the fork
branch itself:

```bash
git ls-tree --name-only HEAD .github/workflows/build-gitea.yml
```

A missing file means the fork branch lost the only build path that produces the installer link; stop
and ask the user how they want to handle it. When the file is present, continue without an approval
step — that is the normal case for a fork sync.

## 3. Merge upstream into the fork branch

```bash
git merge upstream/main --no-edit
```

Conflicts are the one place to slow down. Stop and ask when a conflict is genuinely ambiguous: a wrong
resolution ships a broken installer. When the hunks are mechanical, resolve them and account for every
block:

- **Both sides added the same import or helper.** Keep the union, then grep for each kept name: a fork
  helper that the fork's own code still calls (`memberKey`, `workspaceRootFailureFor`) must survive, and
  an import the merge orphaned (`useEffect`, `useRef`) must go or lint fails.
- **Upstream replaced a fork block with an extracted helper.** Port the fork's behaviour onto the helper
  rather than keeping either side verbatim; the fork's feature is the thing that must still work.
- **Fork-only fields next to upstream-only fields.** Keep both when both have readers. A fork field with
  zero readers is dead: drop it instead of resurrecting it.

Then typecheck the packages the conflicts touched, per package, not the repo:

```bash
vp run --filter=@t3tools/web --filter=t3 --filter=@t3tools/mobile typecheck
```

A fresh checkout on Windows reports hundreds of pre-existing `TS2307`/`TS7006` errors from optional
native and private packages that are not installed (`@pierre/highlights`, `mdast`, `@betteroffice/*`).
Treat those as noise and judge the merge only by errors naming the conflicted files; run `vp install`
first when a package the conflicts touch cannot resolve at all.

After the merge, `vp run check:changed` compares against upstream and checks hundreds of upstream
commits; it is not the gate here. The fork's own build job is; the push starts it.

## 4. Push

```bash
git push origin <fork-branch>
```

Then resolve the run the push created:

```bash
fork=$(git remote get-url origin | sed -E 's#(\.git)?/*$##; s#.*[:/]([^/]+/[^/]+)$#\1#')
sha=$(git rev-parse HEAD)
run=$(gh run list --repo "$fork" --workflow build-gitea.yml --commit "$sha" --event push \
  --json databaseId --jq '.[0].databaseId')
```

Derive the fork from the `origin` URL, never from `gh repo view`: when the user is logged in as an
upstream maintainer, `gh repo view` describes the checkout's upstream, and the run lookups then 404
against a repository with no `build-gitea.yml`. `gh run list` takes `OWNER/REPO`, never a remote
name like `origin`, and `--commit` filters server-side, so no `--jq` string matching is needed. If the
run is still missing, workflow dispatch can lag the push by a few seconds; retry before concluding the
push did not trigger a build.

## 5. Wait for the job

```bash
gh run watch "$run" --repo "$fork" --exit-status --interval 30
```

`--exit-status` turns the build result into the exit code. A timeout or a failed step ends the run,
so a poll loop with a sleep is the wrong shape here — `gh run watch` exits when the run concludes. Long
builds (Spectre-mitigated MSVC libs, Rust target, NSIS packaging) take roughly 10 minutes; the workflow
allows 90.

When the run is `failure` or `cancelled`:

- Failed job — `gh run view "$run" --repo "$fork" --log-failed` names the failing step. Upstream drift
  usually shows up as a renamed script, a new native dependency, or a runner image change. Fix it on the
  fork, push, and watch the new run from step 4.
- Cancelled or superseded attempt — re-resolve the run from step 4 and continue from step 5, since
  only the newest attempt publishes artifacts.

## 6. Hand over the release link

`build-gitea.yml` publishes the installer to its own `build-<short sha>` release when the build passes,
and prunes older `build-*` releases down to the two newest. Resolve the link from that release:

```bash
tag="build-$(git rev-parse --short HEAD)"
gh release view "$tag" --repo "$fork" --json assets --jq '.assets[].name'
```

Give the release page and the asset URL, then confirm the download works before reporting it:

```bash
curl -sIL -o /dev/null -w '%{http_code}\n' \
  "https://github.com/$fork/releases/download/$tag/<asset>.exe"
```

A release asset answers `200` anonymously after its redirect. Report that status in the answer, because
"the build is green" on its own does not mean the user can download anything.

The workflow needs `permissions: contents: write` to publish and prune. If releases stop appearing while
the build stays green, check that permission first; a fork can also disable workflow write access
entirely in its settings.

Workflow artifacts are no longer produced, and the old `actions/artifacts/<id>/zip` URL is not a
download link for a human: it answers `302` to a blob URL signed for about ten minutes, and a browser
lands on `404`. Never offer it as "the direct link".

Only the two newest `build-*` releases survive a build. If the user needs a specific build kept, say so
before the next one runs, or it is deleted with its tag.

## Report

Close with: ahead/behind counts before the merge, the merged upstream SHA (`git log --oneline -1 upstream/main`
at merge time), the pushed fork commit, the run number, and both links above.
