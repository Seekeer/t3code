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
for i in $(seq 1 30); do
  run=$(gh run list --repo "$fork" --workflow build-gitea.yml --limit 20 \
    --json databaseId,headSha,event --jq "[.[] | select(.headSha==\"$sha\" and .event==\"push\")][0].databaseId")
  [ -n "$run" ] && break; sleep 10
done
```

Derive the fork from the `origin` URL, never from `gh repo view`: when the user is logged in as an
upstream maintainer, `gh repo view` describes the checkout's upstream, and the run lookups then 404
against a repository with no `build-gitea.yml`. `gh run list` takes `OWNER/REPO`, never a remote
name like `origin`. When the fork has never pushed the branch, `--limit 20` can page past the
matching run; raise the limit rather than assuming the newest run is the right one.

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

## 6. Hand over the artifact link

There is no GitHub Release in the fork (`release.yml` is disabled there); the installer is the
workflow artifact. Resolve it from the run that just succeeded:

```bash
gh run view "$run" --repo "$fork" --json attempt
id=$(gh api "repos/$fork/actions/runs/$run/artifacts" \
  --jq '.artifacts[] | select(.name=="t3-desktop-windows-x64") | .id')
```

Artifacts belong to a run attempt, so read `attempt` from the run and mention it when the build needed
more than one. Give the user both forms:

- **Human page:** `https://github.com/$fork/actions/runs/$run` — open the run, download
  `t3-desktop-windows-x64` from its Artifacts section. Sign in to GitHub first; the run page works for
  the repository owner in a browser.
- **Direct file:** `https://github.com/$fork/actions/artifacts/$id/zip` — the zip itself,
  no navigation. This URL requires an authenticated request (browser session or `gh`); unauthenticated
  requests get `404`, because GitHub hides artifacts from anonymous callers.

The artifact expires in 30 days and `cleanup-artifacts.yml` keeps only the newest one per name, so
older installers disappear as new builds land. Say that in the answer.

## Report

Close with: ahead/behind counts before the merge, the merged upstream SHA (`git log --oneline -1 upstream/main`
at merge time), the pushed fork commit, the run number, and both links above.
