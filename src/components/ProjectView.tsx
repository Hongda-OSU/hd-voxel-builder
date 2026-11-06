import { useEffect, useRef } from "react";
import type { Project, Version } from "../core/project";
import { useGenerateStore } from "../store/generateStore";
import { useProjectStore } from "../store/projectStore";
import { STYLE_LABELS } from "./labels";

const KIND_LABELS: Record<Version["kind"], string> = { generate: "生成", edit: "修改", example: "自带" };
const MODEL_LABELS = { opus: "Opus", sonnet: "Sonnet" } as const;
/** Long change lists wrap badly in a 260px column; the rest collapses into "+N". */
const MAX_CHIPS = 6;

/** v3 · 修改 · 基于 v1 · Opus · 41 秒 */
function versionLine(version: Version): string {
  const parts = [KIND_LABELS[version.kind]];
  if (version.base !== undefined && version.base !== version.n - 1) parts.push(`基于 v${version.base}`);
  if (version.model) parts.push(MODEL_LABELS[version.model]);
  if (version.seconds !== undefined) parts.push(`${version.seconds} 秒`);
  return parts.join(" · ");
}

function Changes({ version }: { version: Version }) {
  if (version.base === undefined) {
    return <span className="chip">{version.spec.parts.length} 个部件</span>;
  }
  const chips = [
    ...version.changes.added.map((name) => ({ kind: "add", mark: "+", name })),
    ...version.changes.removed.map((name) => ({ kind: "del", mark: "−", name })),
    ...version.changes.changed.map((name) => ({ kind: "mod", mark: "~", name })),
  ];
  if (chips.length === 0) return <span className="chip">没有改动</span>;
  const label = { add: "新增", del: "删掉", mod: "改了" } as const;
  return (
    <>
      {chips.slice(0, MAX_CHIPS).map(({ kind, mark, name }) => (
        <span key={`${kind}-${name}`} className={`chip chip--${kind}`} title={`${label[kind as keyof typeof label]}「${name}」`}>
          <i aria-hidden="true">{mark}</i>
          {name}
        </span>
      ))}
      {chips.length > MAX_CHIPS && <span className="chip">+{chips.length - MAX_CHIPS}</span>}
    </>
  );
}

/** The left column while a project is open: its title and every version, oldest first. */
export function ProjectView({ project }: { project: Project }) {
  const select = useProjectStore((state) => state.select);
  const close = useProjectStore((state) => state.close);
  const phase = useGenerateStore((state) => state.phase);
  const description = useGenerateStore((state) => state.description);
  const busy = phase.step === "generating";
  const pending = busy && phase.editing;
  const end = useRef<HTMLLIElement>(null);

  // Keeps the newest version, or the one being made, in view.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [project.versions.length, pending]);

  return (
    <>
      <div className="project-head">
        <button type="button" className="project-head__back" disabled={busy} onClick={close}>
          ‹ 作品
        </button>
        <span className="project-head__name" title={project.name}>
          {project.name}
        </span>
        <span className="project-head__meta">
          {STYLE_LABELS[project.style]} · {project.versions.length} 版
        </span>
      </div>
      <h2 className="panel__heading recent__heading" id="versions-heading">
        <span>版本</span>
        <span className="recent__count">{project.versions.length}</span>
      </h2>
      <ol className="versions" aria-labelledby="versions-heading">
        {project.versions.map((version) => (
          <li key={version.n}>
            <button
              type="button"
              className="version"
              aria-pressed={version.n === project.current}
              disabled={busy}
              onClick={() => void select(version.n)}
            >
              <span className="version__top">
                <b>v{version.n}</b>
                <span>{versionLine(version)}</span>
              </span>
              <span className="version__prompt">
                {version.prompt || (version.kind === "example" ? "app 自带的作品" : "（没有描述）")}
              </span>
              <span className="version__changes">
                <Changes version={version} />
              </span>
            </button>
          </li>
        ))}
        {pending && (
          <li className="version version--pending" aria-live="polite">
            <span className="version__top">
              <b>v{Math.max(...project.versions.map((v) => v.n)) + 1}</b>
              <span>{phase.attempt === 1 ? "修改中" : "校验没通过，正在重试"}</span>
              <span className="version__spinner" aria-hidden="true" />
            </span>
            <span className="version__prompt version__prompt--muted">{description}</span>
          </li>
        )}
        <li ref={end} aria-hidden="true" />
      </ol>
    </>
  );
}
