import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "local-plugin-dist");
let html = fs.readFileSync(path.join(output, "local-plugin.html"), "utf8");
html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_tag, url) => {
  const javascript = fs.readFileSync(path.join(output, url.replace(/^\//, "")), "utf8");
  return `<script type="module">${javascript.replace(/<\/script/gi, "<\\/script")}</script>`;
});
html = html.replace(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g, (_tag, url) => `<style>${fs.readFileSync(path.join(output, url.replace(/^\//, "")), "utf8")}</style>`);
if (/<(?:script|link)[^>]+(?:src|href)="(?:\/assets|https?:)/.test(html)) throw new Error("Local plugin must be self-contained.");
const destination = path.resolve(root, "../plugins/clew-local/dist");
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, "workspace.html"), html);
console.log(`Built self-contained Clew Local UI (${Buffer.byteLength(html)} bytes).`);
