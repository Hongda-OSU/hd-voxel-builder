<img src="src-tauri/icons/icon.png" width="128" height="128" alt="HD Voxel Builder icon: a smiling pixel-art voxel cube">

# HD Voxel Builder

A local macOS app that turns a short description into a voxel model with Claude, previews it in 3D, and sends it to MagicaVoxel.

## Features

- Generate original chibi characters and objects from a description, with Opus or Sonnet; a result that fails validation is retried once.
- Start from up to three reference images: Claude drafts a description from them, and they can go along with the request.
- Refine a model through conversation: every version is saved with the parts it changed, and any version can be reopened.
- Inspect models in an orbiting 3D viewport with part highlighting and checks for bounds, colors, names, and floating parts.
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

Pick a style, write a description, and press Return to generate (Shift+Return adds a line). To start from pictures, drop up to three images on the left column or paste them into the box, then click 看图写描述 for a draft to edit; with 附图 on, the images go with the request too. Every project is saved with all its versions to `~/HDVoxel/projects/<id>/`. Click a project in the list to view it; its 修改 button (or a double-click) opens its versions, and the same box then takes edit requests such as 「车斗再长两格」. Clicking an older version returns to it. At launch the project you last viewed is shown again, or the newest one; the first launch adds a basketball and a car to start from.

Click the file name under the export button to show the `.vox` in Finder, or the trash button on the chosen project to move it to the Trash. **在 MagicaVoxel 中打开** writes the model into MagicaVoxel's model folder (change it with ⌘,) and restarts MagicaVoxel; then click the file in its Project list.

To try prompts without the app, `pnpm gen` saves a spec to `src/prompts/examples/<slug>-<model>.local.json`, which git ignores:

```sh
pnpm gen basketball --style object --model sonnet "一个篮球"
pnpm gen hero --style chibi --model opus --image ref.png "做成图里这个角色"
pnpm gen hero --describe --image ref.png   # Draft a description from images
```
