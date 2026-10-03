(function () {
  var root = document.body.getAttribute("data-root") || ".";

  // Mobile nav toggle
  var btn = document.querySelector(".menu-btn");
  if (btn) {
    btn.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", String(open));
    });
  }
  var cur = document.querySelector('.sidebar a[aria-current="page"]');
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "center" });

  // Search
  var q = document.getElementById("q");
  var box = document.getElementById("results");
  var idx = window.SEARCH_INDEX || [];
  if (!q || !box) return;

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function run() {
    var term = q.value.trim().toLowerCase();
    if (term.length < 2) { box.hidden = true; return; }
    var words = term.split(/\s+/);
    var hits = idx
      .map(function (p) {
        var title = p.t.toLowerCase(), score = 0;
        for (var i = 0; i < words.length; i++) {
          var inTitle = title.indexOf(words[i]) >= 0, inBody = p.x.indexOf(words[i]) >= 0;
          if (!inTitle && !inBody) return null;
          score += inTitle ? 10 : 1;
        }
        return { p: p, score: score };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 8);
    box.innerHTML = hits.length
      ? hits.map(function (h) {
          return '<li><a href="' + root + "/" + h.p.u + '">' + esc(h.p.t) + "<small>" + h.p.s + "</small></a></li>";
        }).join("")
      : '<li class="empty">No results</li>';
    box.hidden = false;
  }

  q.addEventListener("input", run);
  q.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { box.hidden = true; q.blur(); }
    if (e.key === "Enter") { var a = box.querySelector("a"); if (a) location.href = a.href; }
  });
  document.addEventListener("click", function (e) {
    if (!box.contains(e.target) && e.target !== q) box.hidden = true;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); q.focus();
    }
  });

  // Mermaid diagrams (loaded lazily only when a page has them)
  var diagrams = document.querySelectorAll("pre.mermaid");
  if (diagrams.length) {
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    s.onload = function () {
      var cs = getComputedStyle(document.documentElement);
      window.mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          primaryColor: cs.getPropertyValue("--color-primary-subtle").trim(),
          primaryBorderColor: cs.getPropertyValue("--color-primary").trim(),
          primaryTextColor: cs.getPropertyValue("--color-text-primary").trim(),
          lineColor: cs.getPropertyValue("--color-text-tertiary").trim(),
          fontFamily: "Be Vietnam Pro, sans-serif"
        }
      });
      window.mermaid.run({ nodes: diagrams });
    };
    document.head.appendChild(s);
  }
})();
