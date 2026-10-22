import { useModelStore } from "../store/modelStore";
import { STYLE_LABELS } from "./labels";

// The window uses an overlay title bar; this strip is its drag region.
export function TitleBar() {
  const spec = useModelStore((state) => state.spec);
  return (
    <header className="title-bar" data-tauri-drag-region>
      <span className="title-bar__name">{spec?.name ?? "HD 体素工坊"}</span>
      {spec && <span className="title-bar__meta">· {STYLE_LABELS[spec.style]}</span>}
    </header>
  );
}
