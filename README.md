# HD Voxel Builder

A local macOS app that turns text descriptions into voxel models, with interactive previews, conversational edits, and MagicaVoxel export.

**Status:** Pre-implementation. This repository currently contains project documentation and configuration; the app is not runnable yet.

## Features

Planned:

- Generate original chibi characters, objects, and small scenes from text.
- Preview models with rotation, ambient occlusion, and part highlighting.
- Refine models through conversation, with saved versions and rollback.
- Export `.vox` files to MagicaVoxel and reopen saved projects locally.
- Replay construction animations for demos and recordings.

## Tech Stack

- Desktop: Tauri 2 and Rust for Claude API requests and native operations.
- UI: Vite, React 19, TypeScript (strict mode), Zustand, and handwritten CSS.
- Models: custom Canvas 2D renderer, deterministic geometry, and `.vox` writer in TypeScript.
- Storage: local project folders; no database or cloud account.

## Getting Started

The planned development environment is macOS with Node.js, pnpm, Rust, and Xcode Command Line Tools. Install and launch commands will be added with the working Tauri scaffold after verification.

The first milestone loads a complete local avatar specification, previews it, and exports it to MagicaVoxel. See the [product specification](https://app.notion.com/p/3f560d3cf9f381cbb1f3cae5d02edb27) for scope and milestones.

## Usage

Once implemented: describe a model, inspect and refine the preview, then export it. The app will write the file to MagicaVoxel's model directory, restart MagicaVoxel, and show the filename to select in its Project list.
