import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const options = {
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  jsx: "automatic",
  jsxImportSource: "preact",
};

mkdirSync("public/admin", { recursive: true });
await build({ ...options, entryPoints: ["admin/src/main.tsx"], outfile: "public/admin/app.js" });
cpSync("admin/index.html", "public/admin/index.html");
cpSync("admin/styles.css", "public/admin/styles.css");
console.log("admin mini app built");

mkdirSync("public/site", { recursive: true });
await build({ ...options, entryPoints: ["site/src/main.tsx"], outfile: "public/site/app.js" });
cpSync("site/styles.css", "public/site/styles.css");
console.log("menu site built");
