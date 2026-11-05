import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Style } from "../core/types";
import { useGenerateStore } from "../store/generateStore";
import type { ClaudeStatus, GeneratePhase } from "../store/generateStore";
import { STYLE_LABELS } from "./labels";

const STYLES: Style[] = ["chibi", "object", "diorama"];

const CANVAS_NOTES: Record<Style, string> = {
  chibi: "默认画布 26 × 16 × 36",
  object: "按物体比例，最长边 24–40",
  diorama: "还没有这个风格的预设",
};

const CLAUDE_NOTES: Partial<Record<ClaudeStatus, string>> = {
  missing: "找不到 Claude Code。先安装，再在终端里运行 claude 登录。",
  loggedOut: "Claude Code 没有登录。在终端里运行 claude 登录后再试。",
};

function phaseNote(phase: GeneratePhase, now: number): string {
  switch (phase.step) {
    case "idle":
      return "写好描述后按 ⌘↵ 生成";
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

/** The top of the left column: style, description and the generate button. */
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
  const blocked = !native ? "只能在桌面 app 里生成" : CLAUDE_NOTES[claude];

  return (
    <div className="generate">
      <h2 className="panel__heading">风格</h2>
      <div className="segmented segmented--three" role="radiogroup" aria-label="风格">
        {STYLES.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            className="segmented__item"
            aria-checked={style === id}
            disabled={generating}
            onClick={() => setStyle(id)}
          >
            {STYLE_LABELS[id]}
          </button>
        ))}
      </div>
      <p className="generate__note">{CANVAS_NOTES[style]}</p>

      <h2 className="panel__heading">描述</h2>
      <textarea
        className="generate__text"
        value={description}
        rows={5}
        aria-label="描述"
        placeholder="主体、特征、配色……"
        disabled={generating}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.metaKey && canGenerate) void generate();
        }}
      />

      <div className="generate__actions">
        {generating ? (
          <button type="button" className="tool-button generate__button" onClick={() => void cancel()}>
            取消
          </button>
        ) : (
          <button
            type="button"
            className="export__button generate__button"
            disabled={!canGenerate}
            onClick={() => void generate()}
          >
            生成
          </button>
        )}
      </div>
      <p className={phase.step === "error" || blocked ? "generate__note generate__note--error" : "generate__note"} role="status">
        {blocked ?? phaseNote(phase, now)}
        {native && claude !== "ready" && claude !== "unknown" && (
          <button type="button" className="generate__recheck" onClick={() => void checkClaude()}>
            重新检查
          </button>
        )}
      </p>
    </div>
  );
}
