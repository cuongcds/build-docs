// Builds Markdown doc folders into a static HTML site, driven by a JSON config.
// Usage: node build.mjs [--config <file>]   (default: docs.config.json)
// See docs.config.example.json and README.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import hljs from "highlight.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cfgIdx = args.indexOf("--config");
const CONFIG_FILE = path.resolve(cfgIdx >= 0 ? args[cfgIdx + 1] : path.join(here, "docs.config.json"));

if (!fs.existsSync(CONFIG_FILE)) {
  console.error(
    `Config not found: ${CONFIG_FILE}\n` +
      `Copy docs.config.example.json to docs.config.json and edit it (see README.md).`,
  );
  process.exit(1);
}

// ---------- config ----------
const cfgDir = path.dirname(CONFIG_FILE);
const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
const at = (p) => (p ? path.resolve(cfgDir, p) : null);
const need = (cond, msg) => {
  if (!cond) {
    console.error(`Invalid config (${CONFIG_FILE}): ${msg}`);
    process.exit(1);
  }
};

const site = {
  name: "Docs",
  titleSuffix: "Docs",
  lang: "en",
  homeTitle: "Documentation",
  homeLead: "",
  ...cfg.site,
};
need(cfg.output, '"output" is required');
need(Array.isArray(cfg.sections) && cfg.sections.length, '"sections" must be a non-empty array');
const OUT = at(cfg.output);
const CLEAN_URLS = cfg.cleanUrls === true;
const THEME = at(cfg.theme?.css);
const FONT_URL = cfg.theme?.fontUrl || "";
const LOGO = at(cfg.logo);
const FAVICON = at(cfg.favicon);
for (const [label, f] of [["theme.css", THEME], ["logo", LOGO], ["favicon", FAVICON]])
  need(!f || fs.existsSync(f), `${label} not found: ${f}`);

const sections = cfg.sections.map((s) => {
  need(s.id && s.title && s.dir, 'each section needs "id", "title" and "dir"');
  need(fs.existsSync(at(s.dir)), `section "${s.id}": dir not found: ${at(s.dir)}`);
  return {
    ...s,
    dir: at(s.dir),
    index: at(s.index),
    last: s.last || [],
    exclude: s.exclude || [],
    assets: (s.assets || []).map(at),
  };
});

// ---------- helpers ----------
// With "cleanUrls", pages are written as <dir>/index.html and linked as <dir>/ (no ".html").
const pageOut = (dir, name) => (CLEAN_URLS ? `${dir}/${name}/index.html` : `${dir}/${name}.html`);
const toUrl = (out) => (CLEAN_URLS ? out.replace(/(^|\/)index\.html$/, "$1") : out);
function relUrl(fromDir, out) {
  const target = toUrl(out);
  if (target === out) return path.posix.relative(fromDir, out);
  return (path.posix.relative(fromDir, target) || ".") + "/";
}
const key = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase().replace(/\/$/, "");
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w_-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: raw.slice(m[0].length) };
}

// Matches kramdown-style ids so existing #anchors keep working.
const slugify = (s) =>
  s.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/ /g, "-");

// ---------- collect pages ----------
const pages = [];

function addPage({ src, section, out, title, order, parent, last = false, isIndex = false, fallbackTitle }) {
  const { meta, body } = parseFrontMatter(fs.readFileSync(src, "utf8"));
  const h1 = body.match(/^#\s+(.+)$/m);
  pages.push({
    src,
    section,
    out,
    isIndex,
    last,
    name: path.basename(src),
    title: title || meta.title || (h1 && h1[1].replace(/`/g, "")) || fallbackTitle,
    order: order ?? (meta.nav_order ? Number(meta.nav_order) : 999),
    parent: parent === undefined ? meta.parent || null : parent,
    body,
  });
}

for (const s of sections) {
  const indexKey = s.index && key(s.index);
  if (s.index) {
    need(fs.existsSync(s.index), `section "${s.id}": index not found: ${s.index}`);
    addPage({
      src: s.index,
      section: s.id,
      out: `${s.id}/index.html`,
      title: s.indexTitle,
      order: -1,
      parent: null,
      isIndex: true,
      fallbackTitle: s.title,
    });
  }
  const files = fs
    .readdirSync(s.dir)
    .filter((f) => f.endsWith(".md") && !s.exclude.includes(f) && key(path.join(s.dir, f)) !== indexKey)
    .sort();
  for (const f of files)
    addPage({
      src: path.join(s.dir, f),
      section: s.id,
      out: pageOut(s.id, f.replace(/\.md$/, "")),
      last: s.last.includes(f),
      fallbackTitle: f,
    });
}

const byKey = new Map(pages.map((p) => [key(p.src), p]));
const sectionHome = (s) => pages.find((p) => p.section === s.id && p.isIndex) || sortPages(pages.filter((p) => p.section === s.id))[0];
const dirHome = new Map(sections.map((s) => [key(s.dir), sectionHome(s)]));

// Non-Markdown files (e.g. downloadable files) copied next to the section.
const assets = new Map();
for (const s of sections)
  for (const dir of s.assets)
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : [])
      assets.set(key(path.join(dir, f)), { src: path.join(dir, f), out: `${s.id}/${path.basename(dir)}/${f}` });

function sortPages(list) {
  return [...list].sort(
    (a, b) => Number(a.last) - Number(b.last) || a.order - b.order || a.name.localeCompare(b.name),
  );
}

// ---------- markdown ----------
function renderPage(page) {
  const toc = [];
  const used = new Map();
  const outDir = path.posix.dirname(page.out);

  const resolveHref = (href) => {
    if (!href || href.startsWith("#") || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return { href };
    const [p, hash] = href.split("#");
    const abs = path.resolve(path.dirname(page.src), p);
    const targetPage = byKey.get(key(abs)) || dirHome.get(key(abs));
    const target = targetPage?.out || assets.get(key(abs))?.out;
    if (!target) return { dead: true };
    const rel = targetPage ? relUrl(outDir, target) : path.posix.relative(outDir, target);
    return { href: rel + (hash ? "#" + hash : "") };
  };

  const md = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        const plain = text.replace(/`/g, "");
        const base = slugify(plain) || "section";
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: plain });
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const r = resolveHref(href);
        if (r.dead) return `<span class="dead-link" title="Not included in the built docs">${inner}</span>`;
        const ext = /^https?:/i.test(r.href) ? ' target="_blank" rel="noopener"' : "";
        return `<a href="${esc(r.href)}"${title ? ` title="${esc(title)}"` : ""}${ext}>${inner}</a>`;
      },
      code({ text, lang }) {
        const l = (lang || "").split(/\s+/)[0];
        if (l === "mermaid") return `<pre class="mermaid">${esc(text)}</pre>\n`;
        const ok = l && hljs.getLanguage(l);
        const html = ok ? hljs.highlight(text, { language: l }).value : esc(text);
        return `<pre><code class="hljs${l ? " language-" + esc(l) : ""}">${html}</code></pre>\n`;
      },
    },
  });

  let html = md.parse(page.body);
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
  return { html, toc };
}

// ---------- templates ----------
function sidebar(page) {
  const outDir = path.posix.dirname(page.out);
  const href = (p) => relUrl(outDir, p.out);
  const item = (p, cls = "") =>
    `<li class="${cls}"><a href="${href(p)}"${p === page ? ' aria-current="page"' : ""}>${esc(p.title)}</a></li>`;

  return sections
    .map((s) => {
      const list = pages.filter((p) => p.section === s.id);
      let li = "";
      for (const t of sortPages(list.filter((p) => !p.parent))) {
        li += item(t);
        const kids = sortPages(list.filter((k) => k.parent === t.title));
        if (kids.length) li += `<li class="group"><ul>${kids.map((k) => item(k, "child")).join("")}</ul></li>`;
      }
      return `<div class="nav-section"><h2>${esc(s.title)}</h2><ul>${li}</ul></div>`;
    })
    .join("");
}

function layout({ title, outPath, body, toc = [], nav = "", wide = false }) {
  const rootRel = path.posix.relative(path.posix.dirname(outPath), "") || ".";
  const tocHtml = toc.length
    ? `<aside class="toc" aria-label="On this page"><h2>On this page</h2><ul>${toc
        .map((t) => `<li class="d${t.depth}"><a href="#${t.id}">${esc(t.text)}</a></li>`)
        .join("")}</ul></aside>`
    : "";
  const fontLinks = FONT_URL
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${esc(FONT_URL)}" rel="stylesheet">
`
    : "";
  return `<!doctype html>
<html lang="${esc(site.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(site.titleSuffix)}</title>
${FAVICON ? `<link rel="icon" type="image/x-icon" href="${rootRel}/assets/favicon.ico">\n` : ""}${fontLinks}<link rel="stylesheet" href="${rootRel}/assets/tokens.css">
<link rel="stylesheet" href="${rootRel}/assets/docs.css">
</head>
<body data-root="${rootRel}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <button class="menu-btn" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">&#9776;</button>
  <a class="brand" href="${CLEAN_URLS ? rootRel + "/" : rootRel + "/index.html"}">${LOGO ? `<img src="${rootRel}/assets/logo.png" alt="" height="28">` : ""}<span>${esc(site.name)}</span></a>
  <div class="search">
    <input id="q" type="search" placeholder="Search docs…" aria-label="Search docs" autocomplete="off">
    <ul id="results" hidden></ul>
  </div>
</header>
<div class="shell${wide ? " wide" : ""}">
  ${nav ? `<nav id="sidebar" class="sidebar" aria-label="Documentation">${nav}</nav>` : ""}
  <main id="main" class="content"><article class="prose">${body}</article></main>
  ${tocHtml}
</div>
<script src="${rootRel}/search-index.js"></script>
<script src="${rootRel}/assets/docs.js"></script>
</body>
</html>
`;
}

function homePage() {
  const cards = sections
    .map((s) => {
      const home = sectionHome(s);
      const n = pages.filter((p) => p.section === s.id).length;
      return `<a class="card" href="${toUrl(home.out)}"><h2>${esc(s.title)}</h2><p>${esc(s.description || "")}</p><span class="meta">${n} pages &rarr;</span></a>`;
    })
    .join("\n");
  return `<div class="hero">
<h1>${esc(site.homeTitle)}</h1>
${site.homeLead ? `<p class="lead">${esc(site.homeLead)}</p>` : ""}
</div>
<div class="cards">
${cards}
</div>`;
}

// ---------- write ----------
function write(rel, content) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

const owned = [...sections.map((s) => s.id), "assets"];
for (const d of owned) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
for (const f of ["index.html", "search-index.js"]) fs.rmSync(path.join(OUT, f), { force: true });

const titleOf = new Map(sections.map((s) => [s.id, s.title]));
const index = [];
for (const page of pages) {
  const { html, toc } = renderPage(page);
  const text = html
    .replace(/<pre[\s\S]*?<\/pre>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  index.push({ t: page.title, u: toUrl(page.out), s: titleOf.get(page.section), x: text.slice(0, 4000).toLowerCase() });
  write(page.out, layout({ title: page.title, outPath: page.out, body: html, toc, nav: sidebar(page) }));
}
write("index.html", layout({ title: "Home", outPath: "index.html", body: homePage(), wide: true }));
write("search-index.js", `window.SEARCH_INDEX=${JSON.stringify(index)};`);

// Only the :root token blocks — avoids theme.css global body/button rules.
const tokens = THEME ? (fs.readFileSync(THEME, "utf8").match(/:root\s*{[^}]*}/g) || []).join("\n\n") : "";
write("assets/tokens.css", tokens + "\n");
fs.copyFileSync(path.join(here, "docs.css"), path.join(OUT, "assets/docs.css"));
fs.copyFileSync(path.join(here, "docs.js"), path.join(OUT, "assets/docs.js"));
if (LOGO) fs.copyFileSync(LOGO, path.join(OUT, "assets/logo.png"));
if (FAVICON) fs.copyFileSync(FAVICON, path.join(OUT, "assets/favicon.ico"));
for (const a of assets.values()) {
  fs.mkdirSync(path.dirname(path.join(OUT, a.out)), { recursive: true });
  fs.copyFileSync(a.src, path.join(OUT, a.out));
}

console.log(`Built ${pages.length} pages -> ${OUT}`);
