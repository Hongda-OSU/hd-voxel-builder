<img src="src-tauri/icons/icon.png" width="128" height="128" alt="HD Voxel Builder icon">

# HD Voxel Builder

A local macOS app that turns text descriptions and reference images into voxel models, with interactive previews, conversational edits, and MagicaVoxel export.

**Status:** M1 complete. The app previews bundled example models in an orbiting 3D viewport with layer slices, part highlighting, and validation, and sends them to MagicaVoxel. Generation inside the app and project storage are not implemented yet.

## Features

Available:

- Inspect models in an orbiting 3D viewport with layer slices and part highlighting.
- Validate models for bounds, colors, duplicate names, and floating parts.
- Send `.vox` files to MagicaVoxel's model list, restarting it after confirmation.
- Try generation prompts from the command line with `pnpm gen`.

Planned:

- Generate original chibi characters, objects, and small scenes in the app, optionally drafted from reference images.
- Refine models through conversation, with saved versions and rollback.
- Play build animations and reopen saved projects locally.

## Tech Stack

- Desktop: Tauri 2 and Rust, which calls the logged-in Claude Code (`claude -p`) and handles native operations.
- UI: Vite, React 19, TypeScript (strict mode), Zustand, and handwritten CSS.
- Model pipeline: custom Canvas 2D renderer, deterministic geometry, and `.vox` writer in TypeScript.
- Storage: local project folders; no database or cloud account.

## Getting Started

Requires macOS 12+, Node.js 22.12+, pnpm 12.9.1, Rust, and Xcode Command Line Tools. Opening models needs MagicaVoxel in `/Applications`; the app writes into its model folder, which can be changed in Settings.

```sh
pnpm install
pnpm dev
```

## Usage

```sh
pnpm test   # Unit tests (Vitest)
pnpm check  # TypeScript, ESLint, tests, Rust formatting, Clippy, and Rust tests
pnpm build  # Build the macOS application
```

The app is built at `src-tauri/target/release/bundle/macos/HD Voxel Builder.app`. See the [product specification](https://app.notion.com/p/3f560d3cf9f381cbb1f3cae5d02edb27) for milestones.

To try the prompts without the app, `pnpm gen` asks the logged-in Claude Code for a spec and saves it to `src/prompts/examples/<slug>-<model>.local.json`, which git ignores:

```sh
pnpm gen basketball --style object --model sonnet "一个篮球"
pnpm gen hero --style chibi --model opus --image ref.png "做成图里这个角色"
pnpm gen hero --describe --image ref.png   # Draft a description from images
```
