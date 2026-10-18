# HD Voxel Builder

A local macOS voxel workshop: Claude produces build instructions; deterministic code builds, previews, and exports the model.

## Sources

- [Product specification](https://app.notion.com/p/3f560d3cf9f381cbb1f3cae5d02edb27): scope, architecture, milestones.
- [Generation contract](https://app.notion.com/p/3fa60d3cf9f38101a2d2fdf65aff3522): authoritative field details and prompt draft.
- [Modeling lessons](https://app.notion.com/p/3f560d3cf9f381079b9af6ac5f50aa5a): read before changing appearance or MagicaVoxel integration.
- [Workflow](https://app.notion.com/p/3e460d3cf9f38059bb59c60d2c49bc0a) and [document standards](https://app.notion.com/p/3e260d3cf9f3810681cff76340080477): follow for relevant work.
- Review suggestions are proposals until accepted; do not silently treat them as specification changes.

## Stack and scope

- Tauri 2, Vite, React 19, TypeScript (strict mode), Zustand, handwritten CSS tokens.
- Use pnpm. Keep pnpm-lock.yaml and Cargo.lock tracked once created.
- Use .tsx for React components and .ts for core logic, stores, the Canvas 2D renderer, and .vox serializer.
- Rust handles API requests, local files, and native app integration.
- No Three.js, Electron, database, or local AI model.
- Follow M1 through M4. Construction views and reference images remain P2.

## Current state and commands

- Documentation only; no package.json, Cargo.toml, app, or test runner exists yet.
- The first implementation step is the Tauri + TypeScript M1 scaffold and a complete local avatar fixture.
- Documentation check: `git diff --check` (also inspect newly created files).
- Add exact install, development, check, test, and build commands here when implemented and verified. Update this section as the repository changes.

## Model contracts

- AI returns VoxelSpec build steps, never raw voxel lists or executable code.
- Define VoxelSpec, Part, and VoxelGrid in src/core/types.ts. Keep types, prompts/tool.json, and spec.ts runtime validation synchronized; type assertions do not validate external JSON.
- Coordinates: size [w, d, h], cells [x, h, d], boxes [x0, x1, h0, h1, d0, d1], inclusive. Front faces maximum d.
- Later parts overwrite earlier parts. Part names are unique and stable.
- Preserve paint, mirrorX, chamfer, sphere, and group semantics from the generation contract.
- Limit each dimension to 1–64, palette to 24 colors, and parts to 60; warn above 10 colors.
- Export X=x, Y=d, Z=h, then rotate 180 degrees around Z.
- Keep geometry independent of React and native APIs. Retain part provenance for highlighting.

## Implementation discipline

- Planned boundaries: src/core, src/render, src/prompts, src/store, src/components, and src-tauri/src.
- Keep the API key in a Rust-read app-data configuration file with mode 0600. Never return it through frontend settings APIs.
- Save projects outside the repository, under ~/HDVoxel/projects/.
- MagicaVoxel integration writes the file, restarts the app, and identifies the file to open. Do not automate its UI.
- Propose the approach before changes spanning more than three files or changing a schema/public interface. Check existing authorization before asking about new dependencies or interface changes.
- After code changes, run affected tests. Once available, run the project check command before commits; do not commit failing checks.
- Once scaffolded, include `tsc --noEmit` in project checks alongside linting; Vite builds alone do not check types.
- Test geometry and .vox contracts; visually verify rendering and real MagicaVoxel output.
- Use atomic Conventional Commits; subject and body lines stay within 72 characters. Bodies explain only reasons not evident from the diff.
- Update README in the same commit as command or configuration changes. Document only verified commands.
- Once prompts exist in src/prompts, they become authoritative; keep the Notion prompt/schema copies synchronized.
- Keep this file within 120 lines and 600 words, including any expanded imports. Put detailed documentation in docs/ when needed.
