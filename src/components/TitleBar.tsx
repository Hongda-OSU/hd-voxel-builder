import { isTauri } from "@tauri-apps/api/core";
import { useModelStore } from "../store/modelStore";
import { STYLE_LABELS } from "./labels";
import { ModelPicker } from "./ModelPicker";

// The window uses an overlay title bar; this strip is its drag region.
export function TitleBar() {
  const spec = useModelStore((state) => state.spec);

  return (
    <header className="title-bar" data-tauri-drag-region>
      <span className="title-bar__name">{spec?.name ?? "HD 体素工坊"}</span>
      {spec && <span className="title-bar__meta">· {STYLE_LABELS[spec.style]}</span>}
      {/* Generation only reaches the native side, so the browser build leaves the model out. */}
      {isTauri() && (
        <div className="title-bar__tools">
          <ModelPicker />
        </div>
      )}
    </header>
  );
}
