import { db } from "./index.js";
import type { ButtonStyle } from "../lib/buttons.js";

export interface Category {
  id: number;
  title: string;
  position: number;
  is_visible: number;
  button_style: ButtonStyle;
}

export interface Dish {
  id: number;
  category_id: number;
  title: string;
  description: string;
  photo_path: string | null;
  photo_file_id: string | null;
  position: number;
  is_visible: number;
}

export interface Variant {
  id: number;
  dish_id: number;
  title: string;
  weight: string;
  price: number;
  position: number;
  is_available: number;
}

export interface DishWithVariants extends Dish {
  variants: Variant[];
}

export function variantLabel(v: Pick<Variant, "title" | "weight">): string {
  return [v.title, v.weight].filter(Boolean).join(", ");
}

export function listCategories(): Category[] {
  return db.prepare("SELECT * FROM categories ORDER BY position, id").all() as Category[];
}

export function listVisibleCategories(): (Category & { dishes_count: number })[] {
  return db
    .prepare(
      `SELECT c.*, COUNT(DISTINCT d.id) AS dishes_count
       FROM categories c
       JOIN dishes d ON d.category_id = c.id AND d.is_visible = 1
       JOIN variants v ON v.dish_id = d.id AND v.is_deleted = 0 AND v.is_available = 1
       WHERE c.is_visible = 1
       GROUP BY c.id
       ORDER BY c.position, c.id`,
    )
    .all() as (Category & { dishes_count: number })[];
}

export function getCategory(id: number): Category | undefined {
  return db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as Category | undefined;
}

export function createCategory(title: string, buttonStyle: ButtonStyle = ""): number {
  const max = db.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM categories").get() as { p: number };
  return Number(
    db
      .prepare("INSERT INTO categories (title, position, button_style) VALUES (?, ?, ?)")
      .run(title, max.p + 1, buttonStyle).lastInsertRowid,
  );
}

export function updateCategory(id: number, patch: { title?: string; is_visible?: boolean; button_style?: ButtonStyle }) {
  if (patch.title !== undefined) db.prepare("UPDATE categories SET title = ? WHERE id = ?").run(patch.title, id);
  if (patch.button_style !== undefined)
    db.prepare("UPDATE categories SET button_style = ? WHERE id = ?").run(patch.button_style, id);
  if (patch.is_visible !== undefined)
    db.prepare("UPDATE categories SET is_visible = ? WHERE id = ?").run(patch.is_visible ? 1 : 0, id);
}

export function deleteCategory(id: number) {
  db.transaction(() => {
    db.prepare(
      "DELETE FROM cart_items WHERE variant_id IN (SELECT v.id FROM variants v JOIN dishes d ON d.id = v.dish_id WHERE d.category_id = ?)",
    ).run(id);
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  })();
}

export function reorder(table: "categories" | "dishes", ids: number[]) {
  const stmt = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id)))();
}

function variantsFor(dishIds: number[], onlyAvailable: boolean): Map<number, Variant[]> {
  const map = new Map<number, Variant[]>();
  if (dishIds.length === 0) return map;
  const rows = db
    .prepare(
      `SELECT * FROM variants
       WHERE dish_id IN (${dishIds.map(() => "?").join(",")}) AND is_deleted = 0
       ${onlyAvailable ? "AND is_available = 1" : ""}
       ORDER BY position, id`,
    )
    .all(...dishIds) as Variant[];
  for (const v of rows) {
    if (!map.has(v.dish_id)) map.set(v.dish_id, []);
    map.get(v.dish_id)!.push(v);
  }
  return map;
}

export function listDishes(categoryId?: number): DishWithVariants[] {
  const dishes = (
    categoryId
      ? db.prepare("SELECT * FROM dishes WHERE category_id = ? ORDER BY position, id").all(categoryId)
      : db.prepare("SELECT * FROM dishes ORDER BY category_id, position, id").all()
  ) as Dish[];
  const variants = variantsFor(dishes.map((d) => d.id), false);
  return dishes.map((d) => ({ ...d, variants: variants.get(d.id) ?? [] }));
}

export function listVisibleDishes(categoryId: number): DishWithVariants[] {
  const dishes = db
    .prepare("SELECT * FROM dishes WHERE category_id = ? AND is_visible = 1 ORDER BY position, id")
    .all(categoryId) as Dish[];
  const variants = variantsFor(dishes.map((d) => d.id), true);
  return dishes.map((d) => ({ ...d, variants: variants.get(d.id) ?? [] })).filter((d) => d.variants.length > 0);
}

export function getDish(id: number): DishWithVariants | undefined {
  const dish = db.prepare("SELECT * FROM dishes WHERE id = ?").get(id) as Dish | undefined;
  if (!dish) return undefined;
  return { ...dish, variants: variantsFor([id], false).get(id) ?? [] };
}

export function getVariant(id: number): (Variant & { dish_title: string; is_deleted: number }) | undefined {
  return db
    .prepare("SELECT v.*, d.title AS dish_title FROM variants v JOIN dishes d ON d.id = v.dish_id WHERE v.id = ?")
    .get(id) as (Variant & { dish_title: string; is_deleted: number }) | undefined;
}

export interface DishInput {
  category_id: number;
  title: string;
  description: string;
  is_visible: boolean;
  variants: { id?: number; title: string; weight: string; price: number; is_available: boolean }[];
}

export function saveDish(id: number | null, input: DishInput): number {
  return db.transaction(() => {
    let dishId = id;
    if (dishId === null) {
      const max = db
        .prepare("SELECT COALESCE(MAX(position), 0) AS p FROM dishes WHERE category_id = ?")
        .get(input.category_id) as { p: number };
      dishId = Number(
        db
          .prepare(
            "INSERT INTO dishes (category_id, title, description, is_visible, position) VALUES (?, ?, ?, ?, ?)",
          )
          .run(input.category_id, input.title, input.description, input.is_visible ? 1 : 0, max.p + 1)
          .lastInsertRowid,
      );
    } else {
      db.prepare("UPDATE dishes SET category_id = ?, title = ?, description = ?, is_visible = ? WHERE id = ?").run(
        input.category_id,
        input.title,
        input.description,
        input.is_visible ? 1 : 0,
        dishId,
      );
    }

    const keep = new Set<number>();
    input.variants.forEach((v, i) => {
      const values = [v.title, v.weight, Math.round(v.price), i, v.is_available ? 1 : 0];
      if (v.id) {
        db.prepare(
          "UPDATE variants SET title = ?, weight = ?, price = ?, position = ?, is_available = ? WHERE id = ? AND dish_id = ?",
        ).run(...values, v.id, dishId);
        keep.add(v.id);
      } else {
        const newId = db
          .prepare(
            "INSERT INTO variants (title, weight, price, position, is_available, dish_id) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(...values, dishId).lastInsertRowid;
        keep.add(Number(newId));
      }
    });

    // variants stay in db as deleted so old orders and carts don't break
    const existing = db.prepare("SELECT id FROM variants WHERE dish_id = ? AND is_deleted = 0").all(dishId) as {
      id: number;
    }[];
    for (const { id: variantId } of existing) {
      if (!keep.has(variantId)) {
        db.prepare("UPDATE variants SET is_deleted = 1 WHERE id = ?").run(variantId);
        db.prepare("DELETE FROM cart_items WHERE variant_id = ?").run(variantId);
      }
    }
    return dishId;
  })();
}

export function setDishVisible(id: number, visible: boolean) {
  db.prepare("UPDATE dishes SET is_visible = ? WHERE id = ?").run(visible ? 1 : 0, id);
}

export function setDishPhoto(id: number, photoPath: string | null) {
  db.prepare("UPDATE dishes SET photo_path = ?, photo_file_id = NULL WHERE id = ?").run(photoPath, id);
}

export function cacheDishFileId(id: number, fileId: string) {
  db.prepare("UPDATE dishes SET photo_file_id = ? WHERE id = ?").run(fileId, id);
}

export function deleteDish(id: number) {
  db.transaction(() => {
    db.prepare("DELETE FROM cart_items WHERE variant_id IN (SELECT id FROM variants WHERE dish_id = ?)").run(id);
    db.prepare("UPDATE order_items SET variant_id = NULL WHERE variant_id IN (SELECT id FROM variants WHERE dish_id = ?)").run(id);
    db.prepare("DELETE FROM dishes WHERE id = ?").run(id);
  })();
}
