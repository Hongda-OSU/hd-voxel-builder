import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useExportStore, voxFileName } from "../store/exportStore";
import type { ExportStep } from "../store/exportStore";
import { useModelStore } from "../store/modelStore";

const stem = (file: string) => file.replace(/\.vox$/, "");

/** The bar under the button: the file to write, then what happened to it. */
function note(state: ExportStep, file: string | null): string {
  switch (state.step) {
    case "idle":
    case "confirm":
      return file ?? "";
    case "working":
      return "正在写入并重启 MagicaVoxel…";
    case "done":
      return state.restarted ? `在 Project 列表里点「${stem(state.file)}」` : `已写入 ${state.file}，下次启动时出现`;
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
  const text = native ? note(state, modelId ? voxFileName(modelId) : null) : "只能在桌面 app 里使用";

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
      <div className="export__action">
        <button
          type="button"
          className="export__button"
          disabled={!native || !spec || !modelId || state.step === "working"}
          onClick={() => void send()}
        >
          在 MagicaVoxel 中打开
        </button>
      </div>
      <p className={state.step === "error" ? "export__bar export__bar--error" : "export__bar"} role="status" title={text}>
        {text}
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
