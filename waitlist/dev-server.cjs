// Local dev server: serves the static app/ and runs api/join.js the way Vercel does.
// Run:  npm run dev   then open the printed URL. Without DATABASE_URL, sign-ups go to .data/signups.json.
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
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split("?")[0]);

  // Functions in api/ are ES modules; load them on demand, as Vercel does.
  if (pathname === "/api/join") {
    import("./api/join.js")
      .then(({ default: join }) => join(req, res))
      .catch(error => {
        console.error(error);
        res.statusCode = 500;
        res.end("Function failed");
      });
    return;
  }

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
  // Video clients ask for byte ranges to start playing and to seek.
  if ([".mp4", ".webm"].includes(path.extname(resolved))) {
    fs.stat(resolved, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); res.end("Not found"); return; }
      const headers = { "Content-Type": TYPES[path.extname(resolved)], "Accept-Ranges": "bytes" };
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      let start = 0, end = stat.size - 1;
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
        if (start > end) { res.writeHead(416, { ...headers, "Content-Range": `bytes */${stat.size}` }); res.end(); return; }
        headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers["Content-Length"] = end - start + 1;
      res.writeHead(match ? 206 : 200, headers);
      fs.createReadStream(resolved, { start, end }).pipe(res);
    });
    return;
  }
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
