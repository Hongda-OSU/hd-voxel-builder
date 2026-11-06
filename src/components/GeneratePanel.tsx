import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Style } from "../core/types";
import { useGenerateStore } from "../store/generateStore";
import type { ClaudeStatus, GeneratePhase } from "../store/generateStore";

const STYLE_OPTIONS: { id: Style; label: string; note: string }[] = [
  { id: "chibi", label: "Q 版", note: "Q 版人物，默认画布 26 × 16 × 36" },
  { id: "object", label: "物体", note: "物体，按真实比例，最长边 24–40" },
  { id: "diorama", label: "场景", note: "场景小件，还没有预设" },
];

const CLAUDE_NOTES: Partial<Record<ClaudeStatus, string>> = {
  missing: "找不到 Claude Code。先安装，再在终端里运行 claude 登录。",
  loggedOut: "Claude Code 没有登录。在终端里运行 claude 登录后再试。",
};

function phaseNote(phase: GeneratePhase, now: number): string {
  switch (phase.step) {
    case "idle":
      return "";
    case "generating": {
      const seconds = Math.max(0, Math.round((now - phase.startedAt) / 1000));
      return phase.attempt === 1 ? `生成中 · ${seconds} 秒` : `校验没通过，正在重试 · ${seconds} 秒`;
    }
    case "done":
      return phase.retried ? `生成完成，用了 ${phase.seconds} 秒（重试了 1 次）` : `生成完成，用了 ${phase.seconds} 秒`;
    case "error":
      return phase.message;
  }
}

/** The composer pinned to the bottom of the left column: description, style and send. */
export function GeneratePanel() {
  const { style, description, claude, phase } = useGenerateStore();
  const { setStyle, setDescription, checkClaude, generate, cancel } = useGenerateStore.getState();
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

  const ready = native && claude === "ready" && style !== "diorama";
  const canGenerate = ready && !generating && description.trim() !== "";
  const blocked = !native
    ? "只能在桌面 app 里生成"
    : (CLAUDE_NOTES[claude] ?? (style === "diorama" ? "还没有「场景小件」的风格预设" : undefined));
  const status = blocked ?? phaseNote(phase, now);
  const isError = Boolean(blocked) || phase.step === "error";

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
          aria-label="描述"
          placeholder="描述一个新模型……"
          disabled={generating}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.metaKey && canGenerate) void generate();
          }}
        />
        <div className="composer__bar">
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
          {generating ? (
            <button type="button" className="composer__send" aria-label="停止生成" title="停止生成" onClick={() => void cancel()}>
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
