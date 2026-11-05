import { isTauri } from "@tauri-apps/api/core";
import { useGenerateStore } from "../store/generateStore";
import type { Model } from "../store/generateStore";
import { useModelStore } from "../store/modelStore";
import { useSettingsStore } from "../store/settingsStore";
import { STYLE_LABELS } from "./labels";
import { SettingsPanel } from "./SettingsPanel";

const MODELS: { id: Model; label: string }[] = [
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
];

// The window uses an overlay title bar; this strip is its drag region.
export function TitleBar() {
  const spec = useModelStore((state) => state.spec);
  const open = useSettingsStore((state) => state.open);
  const toggle = useSettingsStore((state) => state.toggle);
  const model = useGenerateStore((state) => state.model);
  const setModel = useGenerateStore((state) => state.setModel);
  const generating = useGenerateStore((state) => state.phase.step === "generating");

  return (
    <header className="title-bar" data-tauri-drag-region>
      <span className="title-bar__name">{spec?.name ?? "HD 体素工坊"}</span>
      {spec && <span className="title-bar__meta">· {STYLE_LABELS[spec.style]}</span>}
      {/* Generation and settings only reach the native side, so the browser build leaves them out. */}
      {isTauri() && (
        <div className="title-bar__tools">
          <select
            className="title-bar__control"
            value={model}
            aria-label="生成用的模型"
            title="Opus 更稳，Sonnet 快一倍"
            disabled={generating}
            onChange={(event) => setModel(event.target.value as Model)}
          >
            {MODELS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <button type="button" className="title-bar__control" aria-expanded={open} onClick={toggle}>
            设置
          </button>
        </div>
      )}
      {open && <SettingsPanel />}
    </header>
  );
}
