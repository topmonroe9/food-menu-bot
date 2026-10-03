import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { alert, confirm, haptic } from "../tg";
import type { Slot } from "../types";
import { addDays, shortDay, today, weekStart } from "../format";
import { Empty, Field, Sheet } from "../ui";

type Draft = Omit<Slot, "id" | "booked"> & { id?: number };

export function SlotsPage() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = () => api.get<Slot[]>("/slots").then(setSlots);
  useEffect(() => void load(), []);

  if (!slots) return <Empty>Загрузка…</Empty>;

  const weeks = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = weekStart(s.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(s);
  }

  const copyWeek = async (start: string) => {
    const { created } = await api.post<{ created: number }>("/slots/copy-week", { weekStart: start });
    haptic();
    alert(created > 0 ? `Добавлено окошек: ${created}` : "На следующей неделе такие окошки уже есть");
    await load();
  };

  const remove = async (s: Slot) => {
    const warn = s.booked > 0 ? `\nНа это окошко уже ${s.booked} заказ(а) — они останутся.` : "";
    if (!(await confirm(`Удалить окошко ${shortDay(s.date)} ${s.start_time}–${s.end_time}?${warn}`))) return;
    await api.del(`/slots/${s.id}`);
    await load();
  };

  const lastDraft = slots[slots.length - 1];
  const newDraft = (): Draft => ({
    date: lastDraft && lastDraft.date >= today() ? addDays(lastDraft.date, 1) : today(),
    start_time: lastDraft?.start_time ?? "17:00",
    end_time: lastDraft?.end_time ?? "21:00",
    capacity: lastDraft?.capacity ?? 0,
  });

  return (
    <section>
      <h1>Окошки</h1>
      <p class="muted small">
        Когда вы готовы отдавать заказы. Клиенты выбирают время внутри окошка, а ещё могут предложить свою дату.
      </p>
      <button class="primary wide" onClick={() => setDraft(newDraft())}>
        + Добавить окошко
      </button>
      {slots.length === 0 && <Empty>Окошек пока нет — клиенты смогут только написать желаемую дату</Empty>}
      {[...weeks.entries()].map(([start, list]) => (
        <div class="week">
          <div class="row between">
            <h3>
              {shortDay(start)} – {shortDay(addDays(start, 6))}
            </h3>
            <button class="link small" onClick={() => copyWeek(start)}>
              Повторить на след. неделе
            </button>
          </div>
          {list.map((s) => (
            <div class={s.date < today() ? "card slot past" : "card slot"}>
              <button class="slot-main" onClick={() => setDraft({ ...s })}>
                <b>{shortDay(s.date)}</b> · {s.start_time}–{s.end_time}
                <div class="muted small">
                  {s.capacity > 0 ? `заказов ${s.booked} из ${s.capacity}` : `заказов: ${s.booked}, без лимита`}
                </div>
              </button>
              <button class="icon" onClick={() => remove(s)}>
                🗑
              </button>
            </div>
          ))}
        </div>
      ))}
      {draft && (
        <SlotSheet
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={async (again) => {
            await load();
            setDraft(again ? { ...draft, id: undefined, date: addDays(draft.date, 1) } : null);
          }}
        />
      )}
    </section>
  );
}

function SlotSheet(props: { draft: Draft; onClose: () => void; onSaved: (again: boolean) => void }) {
  const [form, setForm] = useState(props.draft);
  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => setForm(props.draft), [props.draft]);

  const save = async (again: boolean) => {
    const body = { date: form.date, start_time: form.start_time, end_time: form.end_time, capacity: Number(form.capacity) };
    if (form.id) await api.put(`/slots/${form.id}`, body);
    else await api.post("/slots", body);
    haptic();
    props.onSaved(again);
  };

  return (
    <Sheet title={form.id ? "Окошко" : "Новое окошко"} onClose={props.onClose}>
      <Field label="Дата">
        <input type="date" value={form.date} onInput={(e) => set({ date: e.currentTarget.value })} />
      </Field>
      <div class="row gap">
        <Field label="С">
          <input type="time" value={form.start_time} step={1800} onInput={(e) => set({ start_time: e.currentTarget.value })} />
        </Field>
        <Field label="До">
          <input type="time" value={form.end_time} step={1800} onInput={(e) => set({ end_time: e.currentTarget.value })} />
        </Field>
      </div>
      <Field label="Сколько заказов максимум" hint="0 — без ограничения">
        <input type="number" inputMode="numeric" min={0} value={form.capacity} onInput={(e) => set({ capacity: Number(e.currentTarget.value) })} />
      </Field>
      <button class="primary wide" onClick={() => save(false)}>
        Сохранить
      </button>
      {!form.id && (
        <button class="wide" onClick={() => save(true)}>
          Сохранить и добавить на следующий день
        </button>
      )}
    </Sheet>
  );
}
