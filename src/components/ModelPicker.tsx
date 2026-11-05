import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useGenerateStore } from "../store/generateStore";
import type { Model } from "../store/generateStore";

const MODELS: { id: Model; label: string; note: string }[] = [
  { id: "opus", label: "Opus", note: "更守规则，造型更细" },
  { id: "sonnet", label: "Sonnet", note: "快一倍，造型更粗" },
];

/** The title bar's model menu, drawn in the app's own style instead of a native select. */
export function ModelPicker() {
  const model = useGenerateStore((state) => state.model);
  const setModel = useGenerateStore((state) => state.setModel);
  const generating = useGenerateStore((state) => state.phase.step === "generating");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const shown = open && !generating;
  const current = MODELS.find(({ id }) => id === model) ?? MODELS[0];

  useEffect(() => {
    if (!shown) return;
    list.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [shown]);

  const show = () => {
    setActive(Math.max(0, MODELS.findIndex(({ id }) => id === model)));
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (id: Model) => {
    setModel(id);
    hide();
  };

  const onListKey = (event: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      setActive((index) => (index + step + MODELS.length) % MODELS.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = MODELS[active];
      if (option) choose(option.id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      hide();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="picker" ref={root}>
      <button
        ref={button}
        type="button"
        className="picker__button"
        aria-haspopup="listbox"
        aria-expanded={shown}
        aria-label={`生成用的模型：${current?.label ?? ""}`}
        disabled={generating}
        onClick={() => (shown ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
      >
        {current?.label}
      </button>
      {shown && (
        <ul
          ref={list}
          className="picker__menu"
          role="listbox"
          tabIndex={-1}
          aria-label="生成用的模型"
          aria-activedescendant={`model-${MODELS[active]?.id ?? ""}`}
          onKeyDown={onListKey}
        >
          {MODELS.map(({ id, label, note }, index) => (
            <li
              key={id}
              id={`model-${id}`}
              className="picker__option"
              role="option"
              aria-selected={id === model}
              data-active={index === active}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(id)}
            >
              <svg className="picker__check" viewBox="0 0 12 10" aria-hidden="true">
                {id === model && <path d="M1 5l3.5 3.5L11 1" />}
              </svg>
              <span className="picker__label">{label}</span>
              <span className="picker__note">{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
