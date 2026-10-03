import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const out = "public/admin";
mkdirSync(out, { recursive: true });

await build({
  entryPoints: ["admin/src/main.tsx"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  jsx: "automatic",
  jsxImportSource: "preact",
  outfile: `${out}/app.js`,
});

cpSync("admin/index.html", `${out}/index.html`);
cpSync("admin/styles.css", `${out}/styles.css`);
console.log("admin mini app built");
