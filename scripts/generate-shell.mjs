import { writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const clientAssets = resolve(ROOT, "dist/client/assets");
const serverAssets = resolve(ROOT, "dist/server/assets");

// Derive client entry from TanStack Start's server manifest (hash changes each build)
const manifestFile = readdirSync(serverAssets).find(
  (f) => f.startsWith("_tanstack-start-manifest") && f.endsWith(".js")
);
let clientEntryFilename = null;
if (manifestFile) {
  const content = readFileSync(resolve(serverAssets, manifestFile), "utf-8");
  const m = content.match(/clientEntry:\s*["']\/assets\/([^"']+)["']/);
  if (m) clientEntryFilename = m[1];
}
// Fallback: largest index-*.js is the main bundle
if (!clientEntryFilename) {
  clientEntryFilename =
    readdirSync(clientAssets)
      .filter((f) => f.startsWith("index-") && f.endsWith(".js"))
      .sort(
        (a, b) =>
          statSync(resolve(clientAssets, b)).size -
          statSync(resolve(clientAssets, a)).size
      )[0] ?? null;
}

const mainCss = readdirSync(clientAssets).find((f) => f.endsWith(".css")) ?? null;

const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HubM</title>
    ${mainCss ? `<link rel="stylesheet" href="/assets/${mainCss}" />` : ""}
  </head>
  <body>
    ${clientEntryFilename ? `<script type="module" src="/assets/${clientEntryFilename}"></script>` : ""}
  </body>
</html>`;

const outPath = resolve(ROOT, "dist/client/index.html");
writeFileSync(outPath, html, "utf-8");
console.log(`Shell written to dist/client/index.html (${html.length} bytes)`);
console.log(`  clientEntry : ${clientEntryFilename ?? "(not found)"}`);
console.log(`  css         : ${mainCss ?? "(not found)"}`);
