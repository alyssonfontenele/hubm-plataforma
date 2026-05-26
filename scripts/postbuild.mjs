import { copyFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const shellPath = resolve(ROOT, "dist/client/_shell.html");
const outPath = resolve(ROOT, "dist/client/index.html");

if (!existsSync(shellPath)) {
  console.error("postbuild: _shell.html not found in dist/client — SPA prerender may have failed");
  process.exit(1);
}

copyFileSync(shellPath, outPath);
console.log("postbuild: copied _shell.html → dist/client/index.html (" + outPath + ")");
