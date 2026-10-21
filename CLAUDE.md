# HD Voxel Builder

A local macOS voxel workshop for one user: Claude writes build steps, deterministic code builds, previews, and exports the model; never let AI output raw voxels.

## Stack

- Desktop: Tauri 2; Rust handles API requests, local files, and native integration.
- UI: Vite, React 19, TypeScript (strict), Zustand, handwritten CSS tokens (dark only).
- Package manager: **pnpm**; keep `pnpm-lock.yaml` and `Cargo.lock` tracked.
- Tests: Vitest, beside sources as `*.test.ts`.
- Not used: Three.js, Electron, databases, local AI models, third-party `.vox` libraries.

## Commands

| Purpose | Command |
| --- | --- |
| Install | `pnpm install` |
| Desktop dev | `pnpm dev` |
| Frontend only | `pnpm dev:web` |
| All tests | `pnpm test` |
| One test file | `pnpm test src/core/buildModel.test.ts` |
| Types, lint, tests, Rust fmt + Clippy | `pnpm check` |
| Package the app | `pnpm build` |
| Docs whitespace | `git diff --check` |

## Rules

- Follow the implementation plan's stage order; the current stage is 2 (preview UI).
- AI returns `VoxelSpec` build steps only. Keep `src/core/types.ts`, `src/prompts/tool.json`, and `src/core/spec.ts` validation in sync; type assertions do not validate external JSON.
- Coordinates: size `[w, d, h]`, cells `[x, h, d]`, boxes `[x0, x1, h0, h1, d0, d1]`, inclusive; the front faces max `d`. Later parts overwrite earlier ones; part names are unique and stable.
- Preserve `paint`, `mirrorX`, `chamfer`, `sphere`, and `group` semantics from the generation contract. Animated parts use `group`.
- Limits: each dimension 1–64, palette ≤ 24 colors (warn above 10), ≤ 60 parts.
- Export X = x, Y = d, Z = h, then rotate 180° around Z.
- Keep `src/core` free of React and native APIs; keep part provenance per voxel for highlighting.
- Code lives in `src/core`, `src/render`, `src/prompts`, `src/store`, `src/components`, and `src-tauri/src`.
- The API key lives in a Rust-read app-data config file (mode 0600); never return it to the frontend.
- Projects and reference images live under `~/HDVoxel/projects/`, never in the repo.
- Once `src/prompts` exists it is authoritative; sync the Notion copies.
- After code changes run affected tests and `pnpm check`; do not commit failing checks.
- Test geometry and `.vox` contracts; verify rendering and real MagicaVoxel output by eye.
- Atomic Conventional Commits; subject and body lines ≤ 72 chars; bodies only explain why.
- Update README in the same commit as command or configuration changes; document only verified commands.
- Review suggestions are proposals until accepted.
- Keep this file ≤ 120 lines and ≤ 600 words.

## Gotchas

- Vite only transpiles; type errors surface only through `tsc --noEmit` (`pnpm typecheck`).
- MagicaVoxel cannot open a given file: write to its `vox/` directory, ask before quitting it, restart it, and tell the user which file to click. Never automate its UI.
- Dragging a `.vox` into MagicaVoxel imports it with the current palette; colors look wrong. Open it from the Project list.

## Read these only when relevant

- [Product specification](https://app.notion.com/p/3f560d3cf9f381cbb1f3cae5d02edb27): scope, architecture, milestones, UI.
- [Implementation plan](https://app.notion.com/p/40060d3cf9f3818d8ff3ce07edc6f4d9): stage tasks and checkpoints; read before starting a stage.
- [Generation contract](https://app.notion.com/p/3fa60d3cf9f38101a2d2fdf65aff3522): field details, validation feedback, prompt drafts.
- [Modeling lessons](https://app.notion.com/p/3f560d3cf9f381079b9af6ac5f50aa5a): before changing appearance or MagicaVoxel integration.
- [Workflow](https://app.notion.com/p/3e460d3cf9f38059bb59c60d2c49bc0a): commit, README, and CLAUDE.md standards.

## When unsure

If a change touches more than three files, or any schema or public interface,
propose the approach before writing code. Ask before adding a dependency.
