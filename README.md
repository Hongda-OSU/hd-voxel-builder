<img src="src-tauri/icons/icon.png" width="128" height="128" alt="HD Voxel Builder icon: a smiling pixel-art voxel cube">

# HD Voxel Builder

A local macOS app that turns a short description into a voxel model with Claude, previews it in 3D, and sends it to MagicaVoxel.

## Features

- Generate original chibi characters and objects from a description, with Opus or Sonnet; a result that fails validation is retried once.
- Inspect models in an orbiting 3D viewport with part highlighting.
- Check models for bounds, colors, duplicate names, and floating parts.
- Send `.vox` files to MagicaVoxel's project list, restarting it after confirmation.

## Tech Stack

- Desktop: Tauri 2 and Rust, which runs the logged-in Claude Code (`claude -p`) and handles files and MagicaVoxel.
- UI: Vite, React 19, TypeScript (strict mode), Zustand, and handwritten CSS.
- Model pipeline: deterministic geometry, a Canvas 2D renderer, and a `.vox` writer, all in TypeScript.

## Getting Started

### Prerequisites

- macOS 12+ with Xcode Command Line Tools
- Node.js 22.12+ and pnpm 12.9.1
- Rust
- [Claude Code](https://claude.com/claude-code), installed and logged in; generation uses your own subscription and the app stores no API key
- [MagicaVoxel](https://ephtracy.github.io) in `/Applications`, with the quarantine flag removed so it does not open to a black screen:

  ```sh
  xattr -dr com.apple.quarantine /Applications/MagicaVoxel-*/
  ```

### Installation

```sh
git clone https://github.com/Hongda-OSU/hd-voxel-builder.git
cd hd-voxel-builder
pnpm install
```

## Usage

```sh
pnpm dev    # Run the desktop app
pnpm build  # Build src-tauri/target/release/bundle/macos/HD Voxel Builder.app
```

Pick a style, write a description, and press ⌘↵ to generate. **在 MagicaVoxel 中打开** writes the model into MagicaVoxel's model folder (change it under **设置**) and restarts MagicaVoxel; then click the file in its Project list.

To try prompts without the app, `pnpm gen` saves a spec to `src/prompts/examples/<slug>-<model>.local.json`, which git ignores:

```sh
pnpm gen basketball --style object --model sonnet "一个篮球"
pnpm gen hero --style chibi --model opus --image ref.png "做成图里这个角色"
pnpm gen hero --describe --image ref.png   # Draft a description from images
```
