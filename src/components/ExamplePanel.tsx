import { useEffect, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { mainColor } from "../core/project";
import { MAX_REFS } from "../core/refs";
import { isBusy, useGenerateStore } from "../store/generateStore";
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
  const edit = useProjectStore((state) => state.edit);
  const busy = useGenerateStore((state) => isBusy(state.phase));
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

  if (projects.length === 0) {
    return <p className="recent__empty">还没有作品。在下面描述一个新模型。</p>;
  }
  const now = new Date();

  return (
    <>
      <h2 className="panel__heading recent__heading" id="recent-heading">
        <span>最近作品</span>
        <span className="recent__count">{projects.length} 个</span>
      </h2>
      <ul className="recent" aria-labelledby="recent-heading">
        {projects.map((project) => (
          <li key={project.id} className={project.id === openId ? "recent__row recent__row--on" : "recent__row"}>
            <button
              type="button"
              className="recent__item"
              aria-pressed={project.id === openId}
              title="点一下查看，双击修改"
              onClick={() => {
                if (project.id !== openId) void open(project.id);
              }}
              onDoubleClick={() => {
                if (!busy) void edit(project.id);
              }}
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
            {/* Only the chosen row has buttons, so a project is seen before it is changed or deleted. */}
            {project.id === openId && (
              <div className="recent__actions">
                <button type="button" className="recent__edit" disabled={busy} onClick={() => void edit(project.id)}>
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 10l.6-2.4L8 2.2 9.8 4 4.4 9.4zM7 3.2L8.8 5" />
                  </svg>
                  修改
                </button>
                <button
                  type="button"
                  className="recent__delete"
                  aria-label={`删除「${project.name}」`}
                  title="移到废纸篓"
                  disabled={busy}
                  onClick={() => setPending(project)}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 3.5h7M5 3.5V2h2v1.5M3.5 3.5l.5 6.5h4l.5-6.5" />
                  </svg>
                </button>
              </div>
            )}
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

const hasFiles = (event: ReactDragEvent) => event.dataTransfer.types.includes("Files");

/** The left column: the projects, or the edited project's versions, above the composer. */
export function ExamplePanel() {
  const project = useProjectStore((state) => (state.editing ? state.project : null));
  const busy = useGenerateStore((state) => isBusy(state.phase));
  // Images dropped anywhere on the column become reference images of the next new project.
  const accepts = !project && !busy;
  const [dragging, setDragging] = useState(false);

  // A file dropped outside the column must not replace the whole page with that file.
  useEffect(() => {
    const block = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  return (
    <section
      className="panel panel--left"
      aria-label="作品"
      onDragOver={(event) => {
        if (!accepts || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        // Moving onto a child also fires dragleave; only leaving the column counts.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        setDragging(false);
        if (!accepts || !hasFiles(event)) return;
        event.preventDefault();
        void useGenerateStore.getState().addRefs([...event.dataTransfer.files]);
      }}
    >
      <div className="left-scroll">{project ? <ProjectView project={project} /> : <RecentList />}</div>
      <GeneratePanel />
      {dragging && (
        <div className="drop-zone" aria-hidden="true">
          <span>松开添加参考图</span>
          <small>PNG、JPG、WebP · 最多 {MAX_REFS} 张</small>
        </div>
      )}
    </section>
  );
}
