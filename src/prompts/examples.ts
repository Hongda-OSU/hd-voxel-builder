// Bundled example specs, unvalidated: load them through validateSpec.
const modules = import.meta.glob<unknown>("./examples/*.json", { eager: true, import: "default" });

export interface Example {
  id: string;
  data: unknown;
}

export const examples: Example[] = Object.entries(modules)
  .map(([path, data]) => ({ id: path.replace(/^.*\/(.+)\.json$/, "$1"), data }))
  .sort((a, b) => a.id.localeCompare(b.id));
