import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(join(config.dataDir, "media"), { recursive: true });

export const db = new Database(join(config.dataDir, "bot.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const migrations: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT,
    username TEXT,
    last_activity_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE admins (
    user_id INTEGER PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'helper',
    notify INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_visible INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    photo_path TEXT,
    photo_file_id TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_visible INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dish_id INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    weight TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_available INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE cart_items (
    user_id INTEGER NOT NULL REFERENCES users(id),
    variant_id INTEGER NOT NULL REFERENCES variants(id),
    qty INTEGER NOT NULL,
    PRIMARY KEY (user_id, variant_id)
  );

  CREATE TABLE slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL,
    slot_id INTEGER REFERENCES slots(id) ON DELETE SET NULL,
    requested_at TEXT,
    requested_note TEXT,
    scheduled_at TEXT,
    comment TEXT,
    total INTEGER NOT NULL,
    payment_reminded INTEGER NOT NULL DEFAULT 0,
    pickup_reminded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX orders_user ON orders(user_id);
  CREATE INDEX orders_status ON orders(status);

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id INTEGER,
    dish_title TEXT NOT NULL,
    variant_title TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL
  );

  CREATE TABLE order_messages (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    PRIMARY KEY (order_id, chat_id)
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE user_state (
    user_id INTEGER PRIMARY KEY,
    state TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}'
  );
  `,
  `
  ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_by INTEGER NOT NULL,
    source_chat_id INTEGER NOT NULL,
    source_message_id INTEGER NOT NULL,
    control_message_id INTEGER,
    with_menu_button INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    preview_text TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL DEFAULT 0,
    sent INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    finished_at TEXT
  );
  `,
  `
  ALTER TABLE categories ADD COLUMN button_style TEXT NOT NULL DEFAULT '';
  `,
];

function migrate() {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

migrate();
