import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { mainColor } from "../core/project";
import { examples } from "../prompts/examples";
import { useModelStore } from "../store/modelStore";
import { useProjectStore } from "../store/projectStore";
import type { ProjectSummary } from "../store/projectStore";
import { GeneratePanel } from "./GeneratePanel";
import { STYLE_LABELS, shortTime } from "./labels";
import { ProjectView } from "./ProjectView";

/** Saved projects, newest first; hidden until there is one. */
function RecentList() {
  const projects = useProjectStore((state) => state.projects);
  const openId = useProjectStore((state) => state.project?.id);
  const open = useProjectStore((state) => state.open);
  const remove = useProjectStore((state) => state.remove);
  const [pending, setPending] = useState<ProjectSummary | null>(null);
  // Rereads the folder on mount and whenever the window comes back to the front,
  // so projects changed in Finder show up or disappear.
  useEffect(() => {
    if (!isTauri()) return;
    const refresh = () => void useProjectStore.getState().refresh();
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const colors = useMemo(() => new Map(projects.map((p) => [p.id, mainColor(p.spec)])), [projects]);
  // Escape keeps the project, like the cancel button.
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (projects.length === 0) return null;
  const now = new Date();

  return (
    <>
      <h2 className="panel__heading recent__heading" id="recent-heading">
        <span>最近作品</span>
        <span className="recent__count">{projects.length} 个</span>
      </h2>
      <ul className="recent" aria-labelledby="recent-heading">
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              className="recent__item"
              aria-pressed={project.id === openId}
              onClick={() => void open(project.id)}
            >
              <span className="recent__thumb">
                <span style={{ background: colors.get(project.id) ?? "transparent" }} />
              </span>
              <span className="recent__text">
                <span className="recent__name">{project.name}</span>
                <span className="recent__meta">
                  {STYLE_LABELS[project.style]} · v{project.current} · {shortTime(project.updatedAt, now)}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="recent__delete"
              aria-label={`删除「${project.name}」`}
              title="移到废纸篓"
              onClick={() => setPending(project)}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 3.5h7M5 3.5V2h2v1.5M3.5 3.5l.5 6.5h4l.5-6.5" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {pending && (
        <div className="modal">
          <div className="modal__card" role="alertdialog" aria-modal="true" aria-labelledby="trash-title">
            <h2 className="modal__title" id="trash-title">
              删除「{pending.name}」？
            </h2>
            <p className="modal__text">作品文件夹会移到废纸篓，所有版本一起；需要时可以在废纸篓里「放回原处」。</p>
            <div className="modal__actions">
              <button type="button" className="tool-button" onClick={() => setPending(null)} autoFocus>
                取消
              </button>
              <button
                type="button"
                className="export__button"
                onClick={() => {
                  setPending(null);
                  void remove(pending.id);
                }}
              >
                移到废纸篓
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ExamplePanel() {
  const loadSpec = useModelStore((state) => state.loadSpec);
  const project = useProjectStore((state) => state.project);
  const openId = project?.id;
  // A generated model has its own id, so no example stays highlighted.
  const modelId = useModelStore((state) => state.modelId);

  return (
    <section className="panel panel--left" aria-label="作品与示例">
      <div className="left-scroll">
        {project ? (
          <ProjectView project={project} />
        ) : (
          <>
            <RecentList />
            <h2 className="panel__heading" id="examples-heading">
              示例
            </h2>
            <ul className="example-list" aria-labelledby="examples-heading">
              {examples.map((example) => (
                <li key={example.id}>
                  <button
                    type="button"
                    className="example-list__item"
                    aria-pressed={openId === undefined && example.id === modelId}
                    onClick={() => {
                      useProjectStore.getState().close();
                      loadSpec(example.data, example.id);
                    }}
                  >
                    {example.id}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <GeneratePanel />
    </section>
  );
}
