# The coordinator's scripts

These run the checks between a builder's pull request and its merge, the same way every time. The loop they serve is in `docs/HANDOFF.md`. None of them is part of the engine, and none runs in CI except the translation check's own test.

| Script | What it does | When |
|---|---|---|
| `verify-pr.sh <name> <sha> [--native]` | Checks out `<sha>` fresh in a scratch directory and builds from clean: `npm ci`, the solver, the typecheck, the suite, both goldens, and the behaviour numbers. It records whether the suite left the tracked tree unchanged. With `--native` it also runs the solver's release tests. The lines that matter go to `<name>-summary.txt`. | Every pull request, before its external review. The summary is the evidence the reviewers read. |
| `../review.mjs` | The external review: the dispatch, the diff, CI's lines, and the coordinator's evidence, sent to the review panel (`../panel.js`), with a receipt and a summary for the pull request. | After the verification. The runner's own header gives its usage and its rules. |
| `atlas-linux.sh <checkout> [check]` | Regenerates and checks the Atlas map on Linux through WSL, with the published `@dogfood-lab/atlas@1.17.0`. A map generated on Windows fails the check in CI. | After staging any new file, and after every rebase that touches `atlas/`. |
| `check-translations.mjs <checkout> [token ...]` | Holds each `README.<lang>.md` to the English: the same headings, table rows, and code blocks, and every token as often. The site link is always checked. | After every translation run, before the commit. |

## Running them

- **The scratch directory.** `verify-pr.sh` needs `SCRATCH` set to a directory outside the repository, and it writes its checkouts and logs there. A checkout it made is removed with `git worktree remove`.
- **Copy before running.** Bash reads a script as it runs it, so an edit made while `verify-pr.sh` runs corrupts that run.
- **Red on `main`.** The verification proves the head. To show a new test fails on `main`, use one of two moves:
  - check out the builder's tests-only commit with `verify-pr.sh`;
  - or keep the branch's tests and swap in `main`'s code under test. For a law change, that is `main`'s `solver/dist/solver.mjs`, built from clean. Put the branch's own file back afterwards.
- **The Atlas map on Linux.** Run it from Git Bash with `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash <this directory, as /mnt/...>/atlas-linux.sh <checkout, as /mnt/...>`. Set `LINUX_NODE_BIN` to a Linux node's `bin` directory if the distribution has no node of its own. The script translates a worktree's `.git` pointer for Linux git and restores it afterwards.
- **Translations.** They run locally on the GPU, with `translate-all.mjs README.md --cache-clear` from the polyglot-mcp checkout, and write the seven `README.<lang>.md` files. Then run the check with the tokens a change touched, such as the test count or a new file's name. The Japanese translation drops the site link on most runs; restore it by hand and run the check again.
