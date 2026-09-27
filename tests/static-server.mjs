import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("docs");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith("/spotdiff/")) {
      res.writeHead(404).end();
      return;
    }
    const target = resolve(
      root,
      path.slice("/spotdiff/".length) || "index.html",
    );
    if (!target.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(target);
    res.writeHead(200, {
      "Content-Type": mime[extname(target)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4173, "127.0.0.1");
