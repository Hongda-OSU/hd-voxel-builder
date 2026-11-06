// Bundled example specs, unvalidated: load them through validateSpec. `pnpm gen`
// writes *.local.json beside them; those are git-ignored and never bundled.
const modules = import.meta.glob<unknown>(["./examples/*.json", "!./examples/*.local.json"], {
  eager: true,
  import: "default",
});

export interface Example {
  id: string;
  data: unknown;
}

export const examples: Example[] = Object.entries(modules)
  .map(([path, data]) => ({ id: path.replace(/^.*\/(.+)\.json$/, "$1"), data }))
  .sort((a, b) => a.id.localeCompare(b.id));

/**
 * Added as ordinary projects on the first run, in list order. Characters made
 * from someone else's art stay out of the repo, so the starters are objects.
 */
const STARTERS = ["basketball", "volvo"];
export const starterExamples: Example[] = STARTERS.flatMap((id) => examples.filter((example) => example.id === id));
