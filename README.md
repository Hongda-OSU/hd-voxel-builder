<img src="src-tauri/icons/icon.png" width="128" height="128" alt="HD Voxel Builder icon">

# HD Voxel Builder

A local macOS app that turns text descriptions and reference images into voxel models, with interactive previews, conversational edits, and MagicaVoxel export.

**Status:** Desktop scaffold. The window opens with a placeholder; geometry, preview, generation, export, and storage are not implemented yet.

## Features

Planned:

- Generate original chibi characters, objects, and small scenes from text, optionally drafted from reference images.
- Preview models with rotation, ambient occlusion, part highlighting, and build animations.
- Refine models through conversation, with saved versions and rollback.
- Export `.vox` files to MagicaVoxel and reopen saved projects locally.

## Tech Stack

- Desktop: Tauri 2 and Rust for Claude API requests and native operations.
- UI: Vite, React 19, TypeScript (strict mode), Zustand, and handwritten CSS.
- Model pipeline: custom Canvas 2D renderer, deterministic geometry, and `.vox` writer in TypeScript.
- Storage: local project folders; no database or cloud account.

## Getting Started

Requires macOS 12+, Node.js 22.12+, pnpm 12.9.1, Rust, and Xcode Command Line Tools.

```sh
pnpm install
pnpm dev
```

## Usage

```sh
pnpm test   # Unit tests (Vitest)
pnpm check  # TypeScript, ESLint, tests, Rust formatting, and Clippy
pnpm build  # Build the macOS application
```

The app is built at `src-tauri/target/release/bundle/macos/HD Voxel Builder.app`. See the [product specification](https://app.notion.com/p/3f560d3cf9f381cbb1f3cae5d02edb27) for milestones.
