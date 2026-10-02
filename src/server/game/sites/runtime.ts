import type { SiteDefT } from "../core/blueprint";
import type { GameState } from "../core/state";
import type { SiteContribution, SiteRequest, SiteResponse } from "../primitives/types";
import { escapeHtml } from "../primitives/types";
import type { TeamWorld } from "../world";
import { minify } from "./sourcemap";

/**
 * Renders a team's instance of a synthetic website. The site is assembled from
 * its blueprint definition plus the contributions of every node attached to it
 * that the team has unlocked — so the site changes as the investigation
 * progresses. All content is escaped text authored as data; the only script is
 * the generated client bundle below (trusted DOSSIER code).
 */

export interface BuiltSite {
  def: SiteDefT;
  handle(req: SiteRequest, basePath: string): { res: SiteResponse; node: string | null };
}

interface Tagged<T> {
  node: string;
  item: T;
}

const CSS = (accent: string) => `
:root{--accent:${accent};--ink:#1d2430;--mute:#5d6878;--line:#dfe3ea;--bg:#f5f7fa;--card:#fff}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--accent)}header.top{background:var(--card);border-bottom:1px solid var(--line)}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}.brand{display:flex;align-items:center;gap:12px;padding:14px 0}
.logo{width:34px;height:34px;border-radius:8px;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700}
.brand b{display:block;font-size:16px}.brand small{color:var(--mute)}nav.main{display:flex;gap:4px;flex-wrap:wrap;padding-bottom:10px}
nav.main a{padding:6px 12px;border-radius:6px;text-decoration:none;color:var(--ink)}nav.main a.on,nav.main a:hover{background:var(--bg)}
main{padding:28px 0 60px}.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin-bottom:18px}
h1{font-size:24px;margin:0 0 6px}h2{font-size:16px;margin:0 0 10px}.muted{color:var(--mute)}.small{font-size:13px}
table.data{width:100%;border-collapse:collapse;font-size:14px}table.data th,table.data td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}
.news article{padding:10px 0;border-bottom:1px solid var(--line)}.news article:last-child{border:0}.pill{display:inline-block;padding:2px 8px;border-radius:99px;background:var(--bg);font-size:12px}
.status-ok{color:#1c7c3c}.status-warn{color:#a15c00}footer{color:var(--mute);font-size:12px;padding:24px 0;border-top:1px solid var(--line)}
.osint h1{font-size:22px}.osint.post{border-left:3px solid var(--accent);padding-left:14px}
`;

const SW = `
/* offline shell */
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open("portal-shell-v3").then(function (c) { return c.addAll(["./", "assets/site.css"]); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (url.pathname.indexOf("/offline/") === -1) return;
  e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }));
});
`;

function appSource(def: SiteDefT, notes: string[], config: Record<string, unknown>): string {
  const noteLines = notes.map((n) => `  // NOTE: ${n.replace(/\n/g, " ")}`).join("\n");
  return `/*
 * ${def.title} — portal client
 * build 3.2.${(def.id.length * 7) % 40}
 */
(function () {
  "use strict";
${noteLines}
  var CONFIG = ${JSON.stringify({ client: "portal", version: "3.2", ...config })};
  var PAGE = document.body.getAttribute("data-page") || "home";

  function $(sel) { return document.querySelector(sel); }
  function getJson(path) {
    return fetch(path, { credentials: "same-origin", headers: { "X-Portal-Client": CONFIG.version } }).then(function (r) {
      return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
    });
  }

  // service status widget
  getJson("api/status").then(function (r) {
    var el = $("#svc-status");
    if (!el) { return; }
    el.textContent = r.body.state === "ok" ? "All systems nominal" : "Degraded: " + r.body.state;
    el.className = r.body.state === "ok" ? "status-ok" : "status-warn";
  }).catch(function () {});

  // offline sync bootstrap (storage, drafts, cached notes)
  getJson("api/bootstrap?page=" + encodeURIComponent(PAGE)).then(function (r) {
    var b = r.body;
    (b.storage || []).forEach(function (x) {
      try { (x.kind === "local" ? localStorage : sessionStorage).setItem(x.key, x.value); } catch (e) {}
    });
    (b.indexedDb || []).forEach(function (spec) {
      if (!window.indexedDB) { return; }
      var open = indexedDB.open(spec.db, 1);
      open.onupgradeneeded = function () { var d = open.result; if (!d.objectStoreNames.contains(spec.store)) { d.createObjectStore(spec.store); } };
      open.onsuccess = function () {
        var d = open.result;
        if (!d.objectStoreNames.contains(spec.store)) { d.close(); var again = indexedDB.open(spec.db, d.version + 1); again.onupgradeneeded = function () { again.result.createObjectStore(spec.store); }; again.onsuccess = function () { write(again.result); }; return; }
        write(d);
        function write(db) { var tx = db.transaction(spec.store, "readwrite"); spec.records.forEach(function (rec) { tx.objectStore(spec.store).put(rec.value, rec.key); }); }
      };
    });
    if (window.caches) {
      (b.cache || []).forEach(function (c) {
        caches.open(c.cache).then(function (store) { return store.put(new Request(c.url), new Response(c.body, { headers: { "content-type": c.contentType } })); }).catch(function () {});
      });
    }
    (b.console || []).forEach(function (m) { (console[m.level] || console.log).call(console, m.message); });
    (b.dom || []).forEach(function (d) {
      var host = $("main") || document.body;
      var holder = document.createElement("div");
      holder.innerHTML = d.html;
      while (holder.firstChild) { host.appendChild(holder.firstChild); }
    });
  }).catch(function () {});

  // controlled record panels
  Array.prototype.forEach.call(document.querySelectorAll("[data-endpoint]"), function (panel) {
    getJson(panel.getAttribute("data-endpoint")).then(function (r) {
      if (!r.ok) { panel.innerHTML = ""; var p = document.createElement("p"); p.className = "muted"; p.textContent = "Access denied (" + r.status + "): " + (r.body.error || "unavailable"); panel.appendChild(p); return; }
      var t = document.createElement("table"); t.className = "data";
      var head = document.createElement("tr");
      r.body.columns.forEach(function (c) { var th = document.createElement("th"); th.textContent = c; head.appendChild(th); });
      t.appendChild(head);
      r.body.rows.forEach(function (row) { var tr = document.createElement("tr"); row.forEach(function (cell) { var td = document.createElement("td"); td.textContent = cell; tr.appendChild(td); }); t.appendChild(tr); });
      panel.innerHTML = ""; var h = document.createElement("h2"); h.textContent = r.body.title; panel.appendChild(h); panel.appendChild(t);
    }).catch(function () {});
  });

  if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }
  console.log("%c" + CONFIG.client + " " + CONFIG.version, "color:#888");
})();
`;
}

function page(def: SiteDefT, base: string, path: string, title: string, body: string, nav: { path: string; title: string }[], comments: string[], hidden: string[]): string {
  const navHtml = nav.map((n) => `<a href="${n.path}"${n.path === path ? ' class="on"' : ""}>${escapeHtml(n.title)}</a>`).join("");
  const c = comments.map((x) => `<!-- ${x.replace(/--/g, "- -")} -->`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base href="${base}">
<title>${escapeHtml(title)} · ${escapeHtml(def.title)}</title>
<link rel="stylesheet" href="assets/site.css">
</head>
<body data-page="${escapeHtml(path || "home")}">
${c}
<header class="top"><div class="wrap"><div class="brand"><div class="logo">${escapeHtml(def.title.slice(0, 1))}</div><div><b>${escapeHtml(def.title)}</b><small>${escapeHtml(def.org || def.tagline)}</small></div></div><nav class="main">${navHtml}</nav></div></header>
<main><div class="wrap">${body}${hidden.join("")}</div></main>
<footer><div class="wrap">${escapeHtml(def.org || def.title)} · Internal use only · <span class="pill" id="svc-status">checking…</span></div></footer>
<script src="assets/app.min.js" defer></script>
</body>
</html>`;
}

/** Tiny safe markdown for organiser-authored page bodies (paragraphs, bold, internal links). */
function md(src: string): string {
  return src
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\(([a-z0-9][a-z0-9-/]{0,60})\)/g, '<a href="$2">$1</a>').replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function buildSite(def: SiteDefT, contributions: Tagged<SiteContribution>[]): BuiltSite {
  const pages = new Map<string, { title: string; html: string; nav: boolean; node: string | null }>();
  const news = def.news.map((n) => `<article><div class="small muted">${escapeHtml(n.date)}</div><b>${escapeHtml(n.title)}</b><div>${escapeHtml(n.body)}</div></article>`).join("");
  if (def.template === "intranet") {
    pages.set("", {
      title: "Home",
      nav: true,
      node: null,
      html: `<div class="grid"><div><div class="panel"><h1>${escapeHtml(def.title)}</h1><p class="muted">${escapeHtml(def.tagline)}</p></div><div class="panel news"><h2>Announcements</h2>${news || '<p class="muted">No announcements.</p>'}</div></div><div><div class="panel"><h2>Quick links</h2><p><a href="directory">Staff directory</a><br><a href="about">About the lab</a></p></div></div></div>`,
    });
    pages.set("directory", {
      title: "Directory",
      nav: true,
      node: null,
      html: `<div class="panel"><h1>Staff directory</h1><table class="data"><tr><th>Name</th><th>Title</th><th>Email</th><th>Ext.</th></tr>${def.people.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.title)}</td><td>${escapeHtml(p.email)}</td><td>${escapeHtml(p.ext)}</td></tr>`).join("")}</table></div>`,
    });
    pages.set("about", { title: "About", nav: true, node: null, html: `<div class="panel"><h1>About</h1>${md(def.tagline)}</div>` });
  } else {
    pages.set("", { title: def.title, nav: true, node: null, html: `<div class="panel"><h1>${escapeHtml(def.title)}</h1><p class="muted">${escapeHtml(def.tagline)}</p>${news ? `<div class="news">${news}</div>` : ""}</div>` });
  }
  for (const p of def.pages) pages.set(p.path, { title: p.title, html: `<div class="panel"><h1>${escapeHtml(p.title)}</h1>${md(p.body)}</div>`, nav: p.nav, node: null });
  for (const { node, item } of contributions) for (const p of item.pages ?? []) pages.set(p.path, { title: p.title, html: p.html, nav: p.nav ?? true, node });

  const comments = new Map<string, string[]>();
  const hidden = new Map<string, string[]>();
  const endpoints = new Map<string, { node: string; handle: (r: SiteRequest) => SiteResponse }>();
  const cookies: { name: string; value: string; httpOnly?: boolean }[] = [];
  const storage: SiteContribution["storage"] = [];
  const idb: NonNullable<SiteContribution["indexedDb"]> = [];
  const cache: SiteContribution["cache"] = [];
  const consoleMsgs: SiteContribution["console"] = [];
  const dom: { path: string; html: string }[] = [];
  const notes: string[] = [];
  const config: Record<string, unknown> = {};
  const statusHeaders: Record<string, string> = {};
  const statusFields: Record<string, unknown> = {};
  for (const { node, item } of contributions) {
    for (const c of item.comments ?? []) comments.set(c.path, [...(comments.get(c.path) ?? []), c.text]);
    for (const h of item.hiddenElements ?? []) hidden.set(h.path, [...(hidden.get(h.path) ?? []), h.html]);
    for (const e of item.endpoints ?? []) endpoints.set(`${e.method} ${e.path}`, { node, handle: e.handle });
    cookies.push(...(item.cookies ?? []));
    storage!.push(...(item.storage ?? []));
    for (const x of item.indexedDb ?? []) {
      const ex = idb.find((y) => y.db === x.db && y.store === x.store);
      if (ex) ex.records.push(...x.records);
      else idb.push({ ...x, records: [...x.records] });
    }
    cache!.push(...(item.cache ?? []));
    consoleMsgs!.push(...(item.console ?? []));
    dom.push(...(item.domInserted ?? []));
    notes.push(...(item.sourceNotes ?? []));
    Object.assign(config, item.sourceConfig ?? {});
    for (const [k, v] of Object.entries(item.statusHeaders ?? {})) statusHeaders[k] = statusHeaders[k] ? `${statusHeaders[k]}, ${v}` : v;
    Object.assign(statusFields, item.statusFields ?? {});
  }
  const nav = [...pages.entries()].filter(([, p]) => p.nav).map(([path, p]) => ({ path: path || "./", title: p.title }));
  const bundle = minify(appSource(def, notes, config), "portal/src/app.js", "app.min.js");

  const json = (status: number, body: unknown, headers: Record<string, string> = {}): SiteResponse => ({ status, contentType: "application/json; charset=utf-8", headers, body: JSON.stringify(body) });

  return {
    def,
    handle(req, basePath) {
      const p = req.path.replace(/^\/+/, "").replace(/\/+$/, "");
      if (req.method === "GET" || req.method === "HEAD") {
        if (p === "assets/site.css") return { res: { status: 200, contentType: "text/css; charset=utf-8", body: CSS(def.accent) }, node: null };
        if (p === "assets/app.min.js") return { res: { status: 200, contentType: "application/javascript; charset=utf-8", body: bundle.code, headers: { SourceMap: "app.min.js.map" } }, node: null };
        if (p === "assets/app.min.js.map") return { res: { status: 200, contentType: "application/json; charset=utf-8", body: bundle.map }, node: null };
        if (p === "sw.js") return { res: { status: 200, contentType: "application/javascript; charset=utf-8", body: SW }, node: null };
        if (p === "api/status")
          return { res: json(200, { state: "ok", build: "3.2", region: "campus-1", uptime: 86400 * 3 + 1234, ...statusFields }, { "Server-Timing": "app;dur=12", ...statusHeaders }), node: null };
        if (p === "api/bootstrap") {
          const pg = req.query.get("page") ?? "home";
          const key = pg === "home" ? "" : pg;
          return { res: json(200, { storage, indexedDb: idb, cache, console: consoleMsgs, dom: dom.filter((d) => d.path === key).map((d) => ({ html: d.html })) }), node: null };
        }
      }
      const ep = endpoints.get(`${req.method === "HEAD" ? "GET" : req.method} ${p}`);
      if (ep) return { res: ep.handle(req), node: ep.node };
      if (req.method === "GET" || req.method === "HEAD") {
        const pg = pages.get(p);
        if (pg) {
          // Only seed cookies the browser does not already hold: state carried in a cookie must survive navigation.
          const setCookies = cookies.filter((c) => req.cookies[c.name] === undefined).map((c) => `${c.name}=${c.value}; Path=${basePath}; SameSite=Lax${c.httpOnly ? "; HttpOnly" : ""}`);
          const html = page(def, basePath, p, pg.title, pg.html, nav, comments.get(p) ?? [], hidden.get(p) ?? []);
          return { res: { status: 200, contentType: "text/html; charset=utf-8", body: html, setCookies }, node: pg.node };
        }
      }
      return { res: { status: 404, contentType: "text/html; charset=utf-8", body: `<!doctype html><title>Not found</title><p>404 — not found.</p>` }, node: null };
    },
  };
}

/** Assembles a team's site from the unlocked (or solved) nodes attached to it. */
export function siteForTeam(def: SiteDefT, world: TeamWorld, state: GameState): BuiltSite | null {
  const contributions: Tagged<SiteContribution>[] = [];
  for (const [id, ni] of world.nodes) {
    if (!state.nodes[id]) continue;
    const c = ni.primitive.site?.(ni.instance, ni.ctx);
    if (c && c.site === def.id) contributions.push({ node: id, item: c });
  }
  if (!contributions.length) return null;
  return buildSite(def, contributions);
}
