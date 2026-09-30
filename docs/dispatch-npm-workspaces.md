# Dispatch — npm workspaces

2026-09-30. `@si-rpg-engine/frame`, `@si-rpg-engine/tick`, `@si-rpg-engine/host`, and `@si-rpg-engine/load` are on the registry at `0.0.0`. Each trusted publisher is GitHub Actions for `mcp-tool-shop-org/si-rpg-engine`, workflow filename `release.yml`, with permission to `npm publish`, `npm stage publish`, and `npm dist-tag`. The root package on main is private and named `si-rpg-engine`. Main has no `release.yml`.

## Pins

1. The root package stays private. The workspaces are `packages/frame`, `packages/tick`, `packages/host`, and `packages/load`, named `@si-rpg-engine/frame`, `@si-rpg-engine/tick`, `@si-rpg-engine/host`, and `@si-rpg-engine/load`, at `0.3.0`. `propose`, `bench`, and `tool` have no public manifest.
2. `.github/workflows/release.yml` is the workflow file. The publish job has `id-token: write`. It installs `npm@11.21.0` and sets no `NODE_AUTH_TOKEN`. The release job leaves the package-manager cache off.
3. The job publishes the staged tree from `tools/stage-release.mjs`, because the modules import siblings and `solver/dist/solver.mjs` by relative path. The bins chdir three levels up from `packages/<name>/bin`. That directory is the stage root, so the stage carries `predicates/`, and the host and load stages also carry `worlds/`.
4. A full release publishes with `--tag latest` and then runs `npm dist-tag add <name>@<version> latest`. A prerelease publishes with `--tag next` and then runs `npm dist-tag add <name>@<version> next`. A version already on the registry is not published again. The dist-tag command still runs. A registry lookup that fails for a reason other than a missing version refuses to publish.
5. `workflow_dispatch` defaults to a dry run. A published GitHub release, including a prerelease, is the live path. The solver step is `node solver/build.mjs --check`.
6. Each package README uses the brand logo at `https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png`.
7. The product golden stays `69a671f962665563`. The arithmetic golden stays `0d38671370d12d1e`. The Linux digest stays `fe5d46350f944426a684742479a41b352340c4caee47a56733eb50ce3a2e8bf3`. A Windows build does not write `fixtures/solver.sha256`.

## Acceptance

`npm test` on this branch printed `# tests 521`, `# pass 521`, `# fail 0`. The README count is that line. `node --test tools/stage-release.test.js` packs the frame stage with the hash, the readme, and the license, and packs the tick stage from inside the repository with `solver/dist/solver.mjs` in the file list. Typecheck is clean after the solver build.

## Not in this slice

No tag, and no npm publish from the machine that opens the pull request. The `0.0.0` packages stay on the registry until a GitHub release publishes `0.3.0`. Product imports stay relative. The handbook's two unproven items stay on their own dispatches.
