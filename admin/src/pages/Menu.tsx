import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { confirm, haptic } from "../tg";
import type { Category, Dish, Variant } from "../types";
import { money } from "../format";
import { shrinkImage } from "../image";
import { Empty, Field, PromptSheet, Sheet, Toggle } from "../ui";

interface MenuData {
  categories: Category[];
  dishes: Dish[];
}

function priceRange(dish: Dish): string {
  const prices = dish.variants.map((v) => v.price);
  if (prices.length === 0) return "нет цены";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}

function move<T extends { id: number }>(list: T[], id: number, delta: number): number[] {
  const ids = list.map((x) => x.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

export function MenuPage() {
  const [data, setData] = useState<MenuData | null>(null);
  const [editing, setEditing] = useState<{ dish: Dish | null; categoryId: number } | null>(null);
  const [naming, setNaming] = useState<Category | "new" | null>(null);

  const load = () => api.get<MenuData>("/menu").then(setData);
  useEffect(() => void load(), []);

  if (!data) return <Empty>Загрузка…</Empty>;

  const saveCategoryName = async (title: string) => {
    if (naming === "new") await api.post("/categories", { title });
    else if (naming) await api.patch(`/categories/${naming.id}`, { title });
    setNaming(null);
    await load();
  };

  const toggleCategory = async (c: Category) => {
    await api.patch(`/categories/${c.id}`, { is_visible: !c.is_visible });
    await load();
  };

  const removeCategory = async (c: Category) => {
    const count = data.dishes.filter((d) => d.category_id === c.id).length;
    const warn = count > 0 ? ` Вместе с ним удалятся ${count} блюд(а).` : "";
    if (!(await confirm(`Удалить раздел «${c.title}»?${warn}`))) return;
    await api.del(`/categories/${c.id}`);
    await load();
  };

  const moveCategory = async (c: Category, delta: number) => {
    await api.post("/categories/reorder", { ids: move(data.categories, c.id, delta) });
    await load();
  };

  const moveDish = async (dishes: Dish[], d: Dish, delta: number) => {
    await api.post("/dishes/reorder", { ids: move(dishes, d.id, delta) });
    await load();
  };

  const toggleDish = async (d: Dish) => {
    await api.patch(`/dishes/${d.id}/visible`, { is_visible: !d.is_visible });
    await load();
  };

  return (
    <section>
      <h1>Меню</h1>
      <p class="muted small">Скрытые разделы и блюда не видны клиентам. «Стоп-лист» — выключите вариант в карточке блюда.</p>
      {data.categories.length === 0 && <Empty>Начните с раздела, например «Горячее» или «Десерты»</Empty>}
      {data.categories.map((c) => {
        const dishes = data.dishes.filter((d) => d.category_id === c.id);
        return (
          <div class={c.is_visible ? "category" : "category hidden"}>
            <div class="category-head">
              <h2 onClick={() => setNaming(c)}>{c.title} <span class="muted small">✏️</span></h2>
              <div class="tools">
                <button class="icon" onClick={() => moveCategory(c, -1)} aria-label="Выше">↑</button>
                <button class="icon" onClick={() => moveCategory(c, 1)} aria-label="Ниже">↓</button>
                <button class="icon" onClick={() => toggleCategory(c)} aria-label="Видимость">{c.is_visible ? "👁" : "🚫"}</button>
                <button class="icon" onClick={() => removeCategory(c)} aria-label="Удалить">🗑</button>
              </div>
            </div>
            {dishes.map((d) => (
              <div class={d.is_visible ? "dish" : "dish hidden"}>
                <button class="dish-main" onClick={() => setEditing({ dish: d, categoryId: c.id })}>
                  {d.photo_path ? <img src={`/media/${d.photo_path}`} alt="" /> : <div class="no-photo">📷</div>}
                  <div>
                    <b>{d.title}</b>
                    <div class="muted small">
                      {d.variants.length > 1 ? `${d.variants.length} варианта · ` : ""}
                      {priceRange(d)}
                    </div>
                    {!d.is_visible && <div class="small danger-text">скрыто</div>}
                  </div>
                </button>
                <div class="tools vertical">
                  <button class="icon" onClick={() => moveDish(dishes, d, -1)}>↑</button>
                  <button class="icon" onClick={() => toggleDish(d)}>{d.is_visible ? "👁" : "🚫"}</button>
                  <button class="icon" onClick={() => moveDish(dishes, d, 1)}>↓</button>
                </div>
              </div>
            ))}
            <button class="add" onClick={() => setEditing({ dish: null, categoryId: c.id })}>
              + Блюдо в «{c.title}»
            </button>
          </div>
        );
      })}
      <button class="wide" onClick={() => setNaming("new")}>
        + Новый раздел
      </button>
      {naming && (
        <PromptSheet
          title={naming === "new" ? "Новый раздел" : "Название раздела"}
          initial={naming === "new" ? "" : naming.title}
          placeholder="Например, «Горячее»"
          onSubmit={saveCategoryName}
          onClose={() => setNaming(null)}
        />
      )}
      {editing && (
        <DishEditor
          dish={editing.dish}
          categoryId={editing.categoryId}
          categories={data.categories}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

const emptyVariant = (): Variant => ({ title: "", weight: "", price: 0, is_available: true });

function DishEditor(props: {
  dish: Dish | null;
  categoryId: number;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const d = props.dish;
  const [title, setTitle] = useState(d?.title ?? "");
  const [description, setDescription] = useState(d?.description ?? "");
  const [categoryId, setCategoryId] = useState(d?.category_id ?? props.categoryId);
  const [visible, setVisible] = useState(d ? !!d.is_visible : true);
  const [variants, setVariants] = useState<Variant[]>(d?.variants.length ? d.variants.map((v) => ({ ...v })) : [emptyVariant()]);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(d?.photo_path ? `/media/${d.photo_path}` : null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateVariant = (i: number, patch: Partial<Variant>) =>
    setVariants((list) => list.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const blob = await shrinkImage(file);
    setPhoto(blob);
    setRemovePhoto(false);
    setPreview(URL.createObjectURL(blob));
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        category_id: categoryId,
        title,
        description,
        is_visible: visible,
        variants: variants.map((v) => ({ ...v, price: Number(v.price), is_available: !!v.is_available })),
      };
      const saved = d ? await api.put<Dish>(`/dishes/${d.id}`, body) : await api.post<Dish>("/dishes", body);
      if (photo) {
        const form = new FormData();
        form.append("photo", photo, "photo.jpg");
        await api.post(`/dishes/${saved.id}/photo`, form);
      } else if (removePhoto && d?.photo_path) {
        await api.del(`/dishes/${saved.id}/photo`);
      }
      haptic();
      props.onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!d || !(await confirm(`Удалить «${d.title}» из меню?`))) return;
    await api.del(`/dishes/${d.id}`);
    props.onSaved();
  };

  return (
    <Sheet title={d ? "Блюдо" : "Новое блюдо"} onClose={props.onClose}>
      <label class="photo-picker">
        {preview ? <img src={preview} alt="" /> : <span>📷 Добавить фото</span>}
        <input type="file" accept="image/*" onChange={(e) => pickPhoto(e.currentTarget.files?.[0])} />
      </label>
      {preview && (
        <button
          class="link small"
          onClick={() => {
            setPhoto(null);
            setPreview(null);
            setRemovePhoto(true);
          }}
        >
          Убрать фото
        </button>
      )}
      <Field label="Название">
        <input value={title} placeholder="Курица в соусе терияки" onInput={(e) => setTitle(e.currentTarget.value)} />
      </Field>
      <Field label="Описание">
        <textarea rows={3} value={description} placeholder="Состав, подача, сколько хранится" onInput={(e) => setDescription(e.currentTarget.value)} />
      </Field>
      <Field label="Раздел">
        <select value={categoryId} onChange={(e) => setCategoryId(Number(e.currentTarget.value))}>
          {props.categories.map((c) => (
            <option value={c.id}>{c.title}</option>
          ))}
        </select>
      </Field>

      <h3>Варианты и цены</h3>
      <p class="muted small">Например: «Терияки» · «1 кг» · 1700. Если вариант один — название можно не писать.</p>
      {variants.map((v, i) => (
        <div class={v.is_available ? "variant" : "variant off"}>
          <input value={v.title} placeholder="Вариант (соус, начинка)" onInput={(e) => updateVariant(i, { title: e.currentTarget.value })} />
          <div class="row gap">
            <input value={v.weight} placeholder="Вес / порция" onInput={(e) => updateVariant(i, { weight: e.currentTarget.value })} />
            <input
              type="number"
              inputMode="numeric"
              value={v.price || ""}
              placeholder="Цена ₽"
              onInput={(e) => updateVariant(i, { price: Number(e.currentTarget.value) })}
            />
          </div>
          <div class="row between">
            <Toggle label="В наличии" checked={!!v.is_available} onChange={(value) => updateVariant(i, { is_available: value })} />
            {variants.length > 1 && (
              <button class="link danger-text" onClick={() => setVariants((list) => list.filter((_, idx) => idx !== i))}>
                Удалить
              </button>
            )}
          </div>
        </div>
      ))}
      <button class="add" onClick={() => setVariants((list) => [...list, emptyVariant()])}>
        + Ещё вариант
      </button>

      <Toggle label="Показывать в меню" checked={visible} onChange={setVisible} />
      <button class="primary wide" disabled={saving || !title.trim()} onClick={save}>
        {saving ? "Сохраняю…" : "Сохранить"}
      </button>
      {d && (
        <button class="danger wide" onClick={remove}>
          Удалить блюдо
        </button>
      )}
    </Sheet>
  );
}
