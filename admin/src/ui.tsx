import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";

export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    document.body.classList.add("locked");
    return () => document.body.classList.remove("locked");
  }, []);
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <h2>{props.title}</h2>
          <button class="icon" onClick={props.onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label class="toggle">
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <i />
    </label>
  );
}

export function Chips<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="chips">
      {props.options.map(([value, label]) => (
        <button class={value === props.value ? "chip active" : "chip"} onClick={() => props.onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Empty(props: { children: ComponentChildren }) {
  return <div class="empty">{props.children}</div>;
}

export function Field(props: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <label class="field">
      <span>{props.label}</span>
      {props.children}
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}
