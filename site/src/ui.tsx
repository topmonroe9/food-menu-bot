import type { ComponentChildren } from "preact";

export function Stepper(props: { qty: number; onChange: (delta: number) => void; label?: string }) {
  if (props.qty === 0) {
    return (
      <button class="add" onClick={() => props.onChange(1)} aria-label="Добавить в корзину">
        {props.label ?? "＋"}
      </button>
    );
  }
  return (
    <div class="stepper">
      <button onClick={() => props.onChange(-1)} aria-label="Убрать одну">
        −
      </button>
      <b>{props.qty}</b>
      <button onClick={() => props.onChange(1)} aria-label="Добавить ещё">
        ＋
      </button>
    </div>
  );
}

export function Screen(props: { title: string; onBack: () => void; children: ComponentChildren; footer?: ComponentChildren }) {
  return (
    <div class="screen">
      <header class="screen-head">
        <button class="back" onClick={props.onBack} aria-label="Назад">
          ‹
        </button>
        <h1>{props.title}</h1>
      </header>
      <div class="screen-body">{props.children}</div>
      {props.footer && <footer class="bottom-bar">{props.footer}</footer>}
    </div>
  );
}
