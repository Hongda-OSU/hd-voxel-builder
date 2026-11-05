import { isTauri } from "@tauri-apps/api/core";
import { useModelStore } from "../store/modelStore";
import { useSettingsStore } from "../store/settingsStore";
import { STYLE_LABELS } from "./labels";
import { ModelPicker } from "./ModelPicker";
import { SettingsPanel } from "./SettingsPanel";

// The window uses an overlay title bar; this strip is its drag region.
export function TitleBar() {
  const spec = useModelStore((state) => state.spec);
  const open = useSettingsStore((state) => state.open);
  const toggle = useSettingsStore((state) => state.toggle);

  return (
    <header className="title-bar" data-tauri-drag-region>
      <span className="title-bar__name">{spec?.name ?? "HD 体素工坊"}</span>
      {spec && <span className="title-bar__meta">· {STYLE_LABELS[spec.style]}</span>}
      {/* Generation and settings only reach the native side, so the browser build leaves them out. */}
      {isTauri() && (
        <div className="title-bar__tools">
          <ModelPicker />
          <button
            type="button"
            className="title-bar__control"
            aria-expanded={open}
            data-settings-toggle
            onClick={toggle}
          >
            设置
          </button>
        </div>
      )}
      {open && <SettingsPanel />}
    </header>
  );
}
