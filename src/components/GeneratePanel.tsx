import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { MAX_REFS, dataUrl } from "../core/refs";
import type { Style } from "../core/types";
import { isBusy, useGenerateStore } from "../store/generateStore";
import type { ClaudeStatus, GeneratePhase } from "../store/generateStore";
import { useModelStore } from "../store/modelStore";
import { useProjectStore } from "../store/projectStore";
import { ModelPicker } from "./ModelPicker";

const STYLE_OPTIONS: { id: Style; label: string; note: string }[] = [
  { id: "chibi", label: "Q 版", note: "Q 版人物，默认画布 26 × 16 × 36" },
  { id: "object", label: "物体", note: "物体，按真实比例，最长边 24–40" },
  { id: "diorama", label: "场景", note: "场景小件，底板上最多 4 个物体，默认画布 32 × 32 × 24" },
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
    case "describing":
      return `正在看图写描述 · ${Math.max(0, Math.round((now - phase.startedAt) / 1000))} 秒`;
    case "described":
      return "描述写好了，改一改再发送";
    case "error":
      return phase.message;
  }
}

const PEN = (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 10l.6-2.4L8 2.2 9.8 4 4.4 9.4zM7 3.2L8.8 5" />
  </svg>
);

/** On: images go with the request. Off: they stay with the project, unsent. */
function AttachToggle({ on, disabled, onChange }: { on: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="composer__attach"
      aria-pressed={on}
      title={on ? "发送时附上参考图" : "发送时不带参考图"}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        {on ? (
          <path d="M2.5 6.2L5 8.5l4.5-5" />
        ) : (
          <>
            <rect x="1.5" y="2" width="9" height="8" rx="1.5" />
            <path d="M1.8 8.6l2.7-2.6 2 1.8 1.6-1.4 2.1 2" />
          </>
        )}
      </svg>
      附图
    </button>
  );
}

/** The new project's reference images, with 看图写描述 and the attach switch below them. */
function RefTray({ busy, canAsk }: { busy: boolean; canAsk: boolean }) {
  const { refs, attach, phase } = useGenerateStore();
  const { addRefs, removeRef, setAttach, describe } = useGenerateStore.getState();
  const picker = useRef<HTMLInputElement>(null);
  if (refs.length === 0) return null;
  const describing = phase.step === "describing";

  return (
    <>
      <ul className="composer__refs" aria-label="参考图">
        {refs.map((ref, index) => (
          <li key={`${index}-${ref.data.length}`} className="composer__ref">
            <img src={dataUrl(ref)} alt={`参考图 ${index + 1}`} />
            <button
              type="button"
              className="composer__unref"
              aria-label={`去掉参考图 ${index + 1}`}
              disabled={busy}
              onClick={() => removeRef(index)}
            >
              ×
            </button>
          </li>
        ))}
        {refs.length < MAX_REFS && (
          <li>
            <button
              type="button"
              className="composer__ref composer__ref--add"
              aria-label="再加一张参考图"
              disabled={busy}
              onClick={() => picker.current?.click()}
            >
              +
            </button>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                void addRefs([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </li>
        )}
      </ul>
      <div className="composer__refbar">
        <button type="button" className="composer__describe" disabled={!canAsk || busy} onClick={() => void describe()}>
          {describing ? <span className="composer__spinner" aria-hidden="true" /> : PEN}
          {describing ? "看图中" : "看图写描述"}
        </button>
        <AttachToggle on={attach} disabled={busy} onChange={setAttach} />
      </div>
      <div className="composer__divider" />
    </>
  );
}

/** The composer pinned to the bottom of the left column: description, style and send. */
export function GeneratePanel() {
  const { style, description, claude, phase, refs, attachFor } = useGenerateStore();
  const { setStyle, setDescription, checkClaude, generate, cancel, addRefs, setAttach } = useGenerateStore.getState();
  const projectError = useProjectStore((state) => state.error);
  // While a project is being edited the composer writes edits to its current version.
  const project = useProjectStore((state) => (state.editing ? state.project : null));
  const projectRefs = useProjectStore((state) => state.refs);
  const latest = project ? Math.max(...project.versions.map((version) => version.n)) : 0;
  const shownId = useModelStore((state) => state.modelId);
  const native = isTauri();
  const generating = isBusy(phase);
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

  const canAsk = native && claude === "ready";
  const ready = canAsk;
  const canGenerate = ready && !generating && description.trim() !== "";
  const blocked = !native
    ? "只能在桌面 app 里生成"
    : CLAUDE_NOTES[claude];
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
        {!project && <RefTray busy={generating} canAsk={canAsk} />}
        <textarea
          className="composer__text"
          value={description}
          rows={3}
          aria-label={project ? "修改指令" : "描述"}
          placeholder={
            project
              ? "说要改什么，比如「车斗再长两格」"
              : refs.length > 0
                ? "描述一个新模型，或者先让 Claude 看图写"
                : "描述一个新模型，也可以拖入或粘贴参考图"
          }
          disabled={generating}
          onChange={(event) => setDescription(event.target.value)}
          onPaste={(event) => {
            // A pasted screenshot becomes a reference image; pasted text stays text.
            const images = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
            if (project || images.length === 0) return;
            event.preventDefault();
            void addRefs(images);
          }}
          onKeyDown={(event) => {
            // Return sends and Shift+Return breaks the line, like a chat. While an input method
            // is composing (pinyin), Return picks a candidate and must not send; WebKit reports
            // that keystroke as keyCode 229 even when isComposing is already false.
            const composing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
            if (event.key !== "Enter" || event.shiftKey || composing) return;
            event.preventDefault();
            if (canGenerate) void generate();
          }}
        />
        <div className="composer__bar">
          {project ? (
            // Warns when an older version is shown: the edit starts from it, not from the latest.
            <>
              <span className={project.current === latest ? "composer__base" : "composer__base composer__base--older"}>
                在 v{project.current} 上修改
              </span>
              {projectRefs.length > 0 && (
                <AttachToggle on={attachFor === project.id} disabled={generating} onChange={setAttach} />
              )}
            </>
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
              title="发送（↵）"
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
