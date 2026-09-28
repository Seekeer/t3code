---
name: sync-main-windows-installer
description: Merge upstream/main into the current fork branch, push it, wait for its GitHub Windows build, and download the installer.
disable-model-invocation: true
---

# Sync main and download the Windows installer

Use only when the user explicitly invokes this skill. It updates and pushes the current branch.

## Prepare

1. From the repository root, inspect `git status --short --branch`, the current branch, `git branch -vv`, and `git remote -v`.
2. Require a clean working tree, a non-`main` branch tracking its matching `origin` branch, and an `upstream` remote whose `main` is the intended primary branch. If any condition is unclear, stop and ask. Never stash, reset, rebase, or force-push user work.
3. Confirm `gh auth status`, identify the repository with `gh repo view --json nameWithOwner --jq .nameWithOwner`, and inspect `.github/workflows/build-gitea.yml` for its workflow name, push trigger, and Windows artifact name. Stop before changing Git state if GitHub access or the artifact workflow is unavailable.

## Merge and push

1. Fetch `upstream/main` and the current branch from `origin`.
2. If `origin/<branch>` contains commits not present locally, fast-forward or merge those commits first when safe. If local and remote histories have diverged, stop without pushing and explain the divergence.
3. Merge `upstream/main` into the current branch. Preserve both upstream behavior and fork-specific changes. Resolve conflicts only when the correct combined behavior is clear; otherwise leave the merge state intact and ask for guidance. Never push an unresolved merge.
4. Review the merge result, confirm `upstream/main` is an ancestor of `HEAD`, and run focused checks for manually resolved conflicts.
5. Push with `git push origin HEAD`; use no force options. Record the pushed commit SHA and branch.

## Wait for and download the build

1. Find the GitHub Actions run for the exact pushed SHA, branch, and workflow found in the workflow file. Do not use a previous successful run or an unrelated PR run. If no matching run appears after checking Actions again, report that no run was created and stop.
2. Wait for that run to finish with `gh run watch <run-id> --repo <owner/repo> --exit-status`. If the watch connection drops, query `gh run view` and continue until the run is complete. On failure, report the run URL and failed jobs; do not download an artifact from a failed run.
3. Download only the Windows installer artifact from that exact run with `gh run download <run-id> --repo <owner/repo> --name <artifact-name> --dir .t3/artifacts/windows/<commit-sha>`. Keep downloaded binaries under `.t3`, outside version control.
4. Confirm the download contains an `.exe`. Report its full local path and the GitHub Actions run URL. If the artifact is missing or expired, report that clearly.
5. Finish by checking `git status --short --branch` and confirm the branch is pushed and the working tree is clean.
