import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useExportStore } from "../store/exportStore";
import type { ExportStep } from "../store/exportStore";
import { useModelStore } from "../store/modelStore";

const stem = (file: string) => file.replace(/\.vox$/, "");

function note(state: ExportStep): string {
  switch (state.step) {
    case "idle":
    case "confirm":
      return "写进 MagicaVoxel 的模型目录，重启后在 Project 列表里打开";
    case "working":
      return "正在写入并重启 MagicaVoxel…";
    case "done":
      return state.restarted
        ? `已重启 MagicaVoxel，在 Project 列表里点「${stem(state.file)}」`
        : `已写入 ${state.file}，MagicaVoxel 下次启动时会出现在 Project 列表里`;
    case "error":
      return state.message;
  }
}

/** The inspector footer: sends the model to MagicaVoxel, asking before a restart. */
export function MagicaVoxelPanel() {
  const spec = useModelStore((state) => state.spec);
  const modelId = useModelStore((state) => state.modelId);
  const state = useExportStore((store) => store.state);
  const { send, restart, keep, reset } = useExportStore.getState();
  const native = isTauri();

  // A message about the previous model would be misleading.
  useEffect(() => reset(), [modelId, reset]);

  useEffect(() => {
    if (state.step !== "confirm") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") keep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.step, keep]);

  return (
    <div className="export">
      <button
        type="button"
        className="export__button"
        disabled={!native || !spec || !modelId || state.step === "working"}
        onClick={() => void send()}
      >
        在 MagicaVoxel 中打开
      </button>
      <p className={state.step === "error" ? "export__note export__note--error" : "export__note"} role="status">
        {native ? note(state) : "只能在桌面 app 里使用"}
      </p>
      {state.step === "confirm" && (
        <div className="modal">
          <div className="modal__card" role="alertdialog" aria-modal="true" aria-labelledby="restart-title">
            <h2 className="modal__title" id="restart-title">
              重启 MagicaVoxel？
            </h2>
            <p className="modal__text">
              {state.file} 已写入模型目录。MagicaVoxel 正在运行，要重启后才会出现在 Project
              列表里；重启会丢掉它里面没保存的工作。
            </p>
            <div className="modal__actions">
              <button type="button" className="tool-button" onClick={keep} autoFocus>
                先不重启
              </button>
              <button type="button" className="export__button" onClick={() => void restart()}>
                重启
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
