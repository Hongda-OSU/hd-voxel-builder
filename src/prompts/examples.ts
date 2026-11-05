// Bundled example specs, unvalidated: load them through validateSpec.
const committed = import.meta.glob<unknown>(["./examples/*.json", "!./examples/*.local.json"], {
  eager: true,
  import: "default",
});
// `pnpm gen` output is git-ignored and may come from images that must not ship,
// so it only shows up in development.
const local = import.meta.env.DEV
  ? import.meta.glob<unknown>("./examples/*.local.json", { eager: true, import: "default" })
  : {};

export interface Example {
  id: string;
  data: unknown;
}

export const examples: Example[] = Object.entries({ ...committed, ...local })
  .map(([path, data]) => ({ id: path.replace(/^.*\/(.+)\.json$/, "$1"), data }))
  .sort((a, b) => a.id.localeCompare(b.id));
