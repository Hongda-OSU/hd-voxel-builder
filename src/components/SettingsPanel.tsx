import { useEffect, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

/** A popover under the title bar; for now it only holds the model folder. */
export function SettingsPanel() {
  const { defaultDir, customDir, error } = useSettingsStore();
  const { save, close } = useSettingsStore.getState();
  // Null until edited, so the saved value shows once it has loaded.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? customDir ?? "";
  const submit = async (dir: string | null) => {
    if (await save(dir)) setDraft(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <section className="settings" aria-labelledby="settings-title">
      <h2 className="settings__title" id="settings-title">
        MagicaVoxel 模型目录
      </h2>
      <input
        className="settings__input"
        value={value}
        placeholder={defaultDir ?? "没找到 MagicaVoxel"}
        aria-label="模型目录"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit(value.trim() || null);
        }}
      />
      <p className="settings__note">
        {defaultDir
          ? `留空就写进 MagicaVoxel 自己的目录：${defaultDir}`
          : "没在「应用程序」里找到 MagicaVoxel，需要填一个目录"}
      </p>
      {error && <p className="settings__note settings__note--error">{error}</p>}
      <div className="settings__actions">
        <button type="button" className="tool-button" disabled={!customDir} onClick={() => void submit(null)}>
          恢复默认
        </button>
        <button type="button" className="export__button" onClick={() => void submit(value.trim() || null)}>
          保存
        </button>
      </div>
    </section>
  );
}
