/* Static server for the explainer. Serves ONLY explainer/ and frontend/
   (the film loads the real Taskify CSS, JS and logos from frontend/), so
   nothing else in the repository (.env, backend) is ever exposed.

     node tools/serve.mjs            → http://127.0.0.1:5502/explainer/
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALLOWED = ["explainer", "frontend"];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".wav": "audio/wav", ".mp3": "audio/mpeg",
  ".mp4": "video/mp4", ".vtt": "text/vtt; charset=utf-8", ".srt": "text/plain; charset=utf-8", ".woff2": "font/woff2"
};

export function startServer(port = 5502) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (rel === "" ) { res.writeHead(302, { Location: "/explainer/" }); return res.end(); }
    // helpers.js asks the API which features are switched on; the film has no API.
    if (rel === "explainer/no-api/features") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"data":{}}'); }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(ROOT, rel);
    const top = path.relative(ROOT, file).split(path.sep)[0];
    if (!ALLOWED.includes(top) || path.relative(ROOT, file).startsWith("..")) { res.writeHead(404); return res.end("Not found"); }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); return res.end("Not found"); }
      const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
      const range = req.headers.range;
      // Range requests let the browser seek inside the soundtrack.
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Number(m[2]) : stat.size - 1;
        res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "no-cache" });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 5502;
  startServer(port).then(() => console.log(`Taskify explainer: http://127.0.0.1:${port}/explainer/`));
}
