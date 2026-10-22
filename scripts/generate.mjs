// Dev script for stage 3: asks the logged-in Claude Code for a VoxelSpec
// (or, with --describe, a description draft) and records how long it took.
// Specs land in src/prompts/examples/<slug>-<model>.local.json, which git
// ignores; drop ".local" to commit one.

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, resolve } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `Usage:
  pnpm gen <slug> --style chibi|object [--model sonnet|opus] [--image file]... "description"
  pnpm gen <slug> --describe [--model sonnet|opus] --image file...`;

const MEDIA_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const root = resolve(import.meta.dirname, "..");
const prompts = resolve(root, "src/prompts");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    style: { type: "string" },
    model: { type: "string", default: "sonnet" },
    image: { type: "string", multiple: true, default: [] },
    describe: { type: "boolean", default: false },
  },
});
const [slug, description = ""] = positionals;
if (!slug || (!values.describe && (!values.style || !description)) || (values.describe && values.image.length === 0)) {
  console.error(USAGE);
  process.exit(1);
}

const read = (path) => readFile(resolve(prompts, path), "utf8");

async function systemPrompt() {
  if (values.describe) return read("describe.md");
  const [template, preset, reference, example] = await Promise.all([
    read("system.md"),
    read(`presets/${values.style}.md`),
    read("reference.md"),
    read("examples/hd.json"),
  ]);
  const style = values.image.length > 0 ? `${preset.trim()}\n\n${reference.trim()}` : preset.trim();
  return template.replace("{{STYLE_PRESET}}", style).replace("{{EXAMPLE_SPEC}}", example.trim());
}

async function userMessage() {
  const images = await Promise.all(
    values.image.map(async (file) => {
      const mediaType = MEDIA_TYPES[extname(file).toLowerCase()];
      if (!mediaType) throw new Error(`unsupported image type: ${file}`);
      const data = (await readFile(file)).toString("base64");
      return { type: "image", source: { type: "base64", media_type: mediaType, data } };
    }),
  );
  const text = values.describe ? "根据图片写描述。" : description;
  return { type: "user", message: { role: "user", content: [...images, { type: "text", text }] } };
}

const args = [
  "-p",
  // Keeps the user's CLAUDE.md, hooks and MCP servers out of the request.
  "--safe-mode",
  "--no-session-persistence",
  "--tools",
  "",
  "--model",
  values.model,
  "--system-prompt",
  await systemPrompt(),
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
];
if (!values.describe) args.push("--json-schema", await read("tool.json"));

// Pretty JSON with number arrays such as boxes kept on one line.
const format = (spec) =>
  JSON.stringify(spec, null, 2).replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_, inner) => `[${inner.split(/,\s+/).join(", ")}]`);

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const started = performance.now();
const child = spawn("claude", args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "inherit"] });
child.stdin.end(`${JSON.stringify(await userMessage())}\n`);

let output = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => (output += chunk));
const code = await new Promise((done) => child.on("close", done));
const seconds = ((performance.now() - started) / 1000).toFixed(1);

const events = output
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const result = events.findLast((event) => event.type === "result");
if (code !== 0 || !result || result.is_error) {
  console.error(`claude exited with ${code} after ${seconds}s`);
  console.error(JSON.stringify(result ?? events.at(-1), null, 2));
  process.exit(1);
}

const usage = result.usage ?? {};
console.log(
  `${slug} · ${values.model} · ${seconds}s · ${usage.input_tokens ?? "?"} in / ${usage.output_tokens ?? "?"} out tokens`,
);
if (values.describe) {
  console.log(`\n${result.result}`);
} else {
  const spec = result.structured_output ?? parseJson(result.result);
  if (!spec) {
    console.error("no JSON in the result:");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  const file = resolve(prompts, `examples/${slug}-${values.model}.local.json`);
  await writeFile(file, `${format(spec)}\n`);
  console.log(`saved ${file}`);
}
