import { writeFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function main() {
  console.log("Generating SPA shell (dist/client/index.html)...");
  const serverEntry = resolve(ROOT, "dist/server/server.js");
  // pathToFileURL converts Windows absolute paths (C:\...) to valid file:// URLs
  const { default: server } = await import(pathToFileURL(serverEntry).href);
  const req = new Request("http://localhost/", { method: "GET", headers: { accept: "text/html" } });
  const res = await server.fetch(req, {}, {});
  const html = await res.text();
  const outPath = resolve(ROOT, "dist/client/index.html");
  writeFileSync(outPath, html, "utf-8");
  console.log("Shell written to dist/client/index.html (" + html.length + " bytes)");
}

main().catch((err) => { console.error("generate-shell failed:", err); process.exit(1); });
