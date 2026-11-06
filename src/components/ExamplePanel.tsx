import { useEffect, useMemo } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { mainColor } from "../core/project";
import { examples } from "../prompts/examples";
import { useModelStore } from "../store/modelStore";
import { useProjectStore } from "../store/projectStore";
import { GeneratePanel } from "./GeneratePanel";
import { STYLE_LABELS, shortTime } from "./labels";

/** Saved projects, newest first; hidden until there is one. */
function RecentList() {
  const projects = useProjectStore((state) => state.projects);
  const openId = useProjectStore((state) => state.project?.id);
  const open = useProjectStore((state) => state.open);
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
          </li>
        ))}
      </ul>
    </>
  );
}

export function ExamplePanel() {
  const loadSpec = useModelStore((state) => state.loadSpec);
  const openId = useProjectStore((state) => state.project?.id);
  // A generated model has its own id, so no example stays highlighted.
  const modelId = useModelStore((state) => state.modelId);

  return (
    <section className="panel panel--left" aria-label="作品与示例">
      <div className="left-scroll">
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
      </div>
      <GeneratePanel />
    </section>
  );
}
