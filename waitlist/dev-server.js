// Local dev server: serves the static app/.
// Run:  node dev-server.js   then open the printed URL.
const http = require("http");
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "app");
const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split("?")[0]);

  // Mirror Vercel's cleanUrls (vercel.json): `/privacy` serves privacy.html, and
  // `/privacy.html` redirects to the clean URL — so local behaves like prod.
  if (pathname.endsWith(".html")) {
    const clean = pathname.slice(0, -".html".length);
    res.statusCode = 308;
    res.setHeader("Location", clean === "/index" || clean === "" ? "/" : clean);
    res.end();
    return;
  }
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = path.join(APP_DIR, rel);
  if (!file.startsWith(APP_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  const resolved = path.extname(file) ? file : `${file}.html`;
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", TYPES[path.extname(resolved)] || "application/octet-stream");
    res.end(data);
  });
});

const PORT = process.env.PORT || 4321;
server.listen(PORT, () => {
  console.log(`Local dev (static) → http://localhost:${PORT}`);
});
