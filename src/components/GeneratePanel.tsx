import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Style } from "../core/types";
import { useGenerateStore } from "../store/generateStore";
import type { ClaudeStatus, GeneratePhase } from "../store/generateStore";
import { useModelStore } from "../store/modelStore";
import { useProjectStore } from "../store/projectStore";
import { ModelPicker } from "./ModelPicker";

const STYLE_OPTIONS: { id: Style; label: string; note: string }[] = [
  { id: "chibi", label: "Q 版", note: "Q 版人物，默认画布 26 × 16 × 36" },
  { id: "object", label: "物体", note: "物体，按真实比例，最长边 24–40" },
  { id: "diorama", label: "场景", note: "场景小件，还没有预设" },
];

const CLAUDE_NOTES: Partial<Record<ClaudeStatus, string>> = {
  missing: "找不到 Claude Code。先安装，再在终端里运行 claude 登录。",
  loggedOut: "Claude Code 没有登录。在终端里运行 claude 登录后再试。",
};

function phaseNote(phase: GeneratePhase, now: number, shownId: string | null): string {
  switch (phase.step) {
    case "idle":
      return "";
    case "generating": {
      const seconds = Math.max(0, Math.round((now - phase.startedAt) / 1000));
      const verb = phase.editing ? "修改中" : "生成中";
      return phase.attempt === 1 ? `${verb} · ${seconds} 秒` : `校验没通过，正在重试 · ${seconds} 秒`;
    }
    case "done":
      // Only while its result is on screen; after switching models it would mislead.
      if (phase.id !== shownId) return "";
      return `${phase.editing ? "修改" : "生成"}完成，用了 ${phase.seconds} 秒${phase.retried ? "（重试了 1 次）" : ""}`;
    case "error":
      return phase.message;
  }
}

/** The composer pinned to the bottom of the left column: description, style and send. */
export function GeneratePanel() {
  const { style, description, claude, phase } = useGenerateStore();
  const { setStyle, setDescription, checkClaude, generate, cancel } = useGenerateStore.getState();
  const projectError = useProjectStore((state) => state.error);
  // With a project open the composer writes edits to its current version.
  const project = useProjectStore((state) => state.project);
  const latest = project ? Math.max(...project.versions.map((version) => version.n)) : 0;
  const shownId = useModelStore((state) => state.modelId);
  const native = isTauri();
  const generating = phase.step === "generating";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (native) void checkClaude();
  }, [native, checkClaude]);

  // Ticks the elapsed time while a generation runs.
  useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  const activeStyle = project?.style ?? style;
  const ready = native && claude === "ready" && activeStyle !== "diorama";
  const canGenerate = ready && !generating && description.trim() !== "";
  const blocked = !native
    ? "只能在桌面 app 里生成"
    : (CLAUDE_NOTES[claude] ?? (activeStyle === "diorama" ? "还没有「场景小件」的风格预设" : undefined));
  // A failed save or open outranks the generation note: the model on screen is not on disk.
  const status = blocked ?? projectError ?? phaseNote(phase, now, shownId);
  const isError = Boolean(blocked) || Boolean(projectError) || phase.step === "error";

  return (
    <div className="composer">
      <p className={isError ? "composer__status composer__status--error" : "composer__status"} role="status">
        {status}
        {native && claude !== "ready" && claude !== "unknown" && (
          <button type="button" className="composer__recheck" onClick={() => void checkClaude()}>
            重新检查
          </button>
        )}
      </p>
      <div className="composer__box">
        <textarea
          className="composer__text"
          value={description}
          rows={3}
          aria-label={project ? "修改指令" : "描述"}
          placeholder={project ? "说要改什么，比如「车斗再长两格」" : "描述一个新模型……"}
          disabled={generating}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.metaKey && canGenerate) void generate();
          }}
        />
        <div className="composer__bar">
          {project ? (
            // Warns when an older version is shown: the edit starts from it, not from the latest.
            <span className={project.current === latest ? "composer__base" : "composer__base composer__base--older"}>
              在 v{project.current} 上修改
            </span>
          ) : (
            <div className="composer__styles" role="radiogroup" aria-label="风格">
              {STYLE_OPTIONS.map(({ id, label, note }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  className="composer__pill"
                  aria-checked={style === id}
                  title={note}
                  disabled={generating}
                  onClick={() => setStyle(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {native && <ModelPicker />}
          {generating ? (
            <button type="button" className="composer__send" aria-label="停止" title="停止" onClick={() => void cancel()}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <rect x="3" y="3" width="6" height="6" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="composer__send"
              aria-label="生成"
              title="生成（⌘↵）"
              disabled={!canGenerate}
              onClick={() => void generate()}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
