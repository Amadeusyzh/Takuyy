#!/usr/bin/env node
// Builds the PDF CV in English, Chinese and Japanese:
//   assets/pdf/<lang>/cv.pdf
// from _data/<lang>/cv.yml, _bibliography/papers.bib (own name highlighted)
// and the research interests on _pages/<lang>/about.md.
//
//   node bin/build_cv.js            # all languages
//   node bin/build_cv.js en-us      # one language
//   node bin/build_cv.js --html     # also keep the intermediate HTML next to each PDF
//
// Needs Ruby (already required by Jekyll) to read YAML, and Playwright with
// Chromium. Re-run it after editing cv.yml, papers.bib or the interests.
"use strict";
var fs = require("fs");
var path = require("path");
var execFileSync = require("child_process").execFileSync;
var chromium = require("playwright").chromium;

var ROOT = path.join(__dirname, "..");
var LANGS = ["en-us", "zh-cn", "ja-jp"];

var L = {
  "en-us": {
    htmlLang: "en", cv: "Curriculum Vitae", pubs: "Publications", website: "Website", updated: "Last updated",
    page: "Page {p} of {n}", font: "Caladea, 'Liberation Serif', serif",
    date: function (d) { return d.toLocaleDateString("en-US", { year: "numeric", month: "long" }); },
  },
  "zh-cn": {
    htmlLang: "zh-CN", cv: "\u4e2a\u4eba\u7b80\u5386", pubs: "\u8bba\u6587\u53d1\u8868", website: "\u4e2a\u4eba\u4e3b\u9875", updated: "\u66f4\u65b0\u4e8e",
    page: "\u7b2c {p} \u9875\uff0c\u5171 {n} \u9875", font: "Inter, 'WenQuanYi Zen Hei', sans-serif",
    date: function (d) { return d.getFullYear() + "\u5e74" + (d.getMonth() + 1) + "\u6708"; },
  },
  "ja-jp": {
    htmlLang: "ja", cv: "\u5c65\u6b74\u66f8\u30fb\u696d\u7e3e\u4e00\u89a7", pubs: "\u7814\u7a76\u696d\u7e3e\uff08\u8ad6\u6587\uff09", website: "\u30a6\u30a7\u30d6\u30b5\u30a4\u30c8", updated: "\u6700\u7d42\u66f4\u65b0",
    page: "{p} / {n} \u30da\u30fc\u30b8", font: "Inter, 'IPAPGothic', 'IPAGothic', sans-serif",
    date: function (d) { return d.getFullYear() + "\u5e74" + (d.getMonth() + 1) + "\u6708"; },
  },
};

// ------------------------------------------------------------------ inputs
function readYaml(file) {
  var out = execFileSync("ruby", ["-ryaml", "-rjson", "-rdate", "-e", "puts JSON.generate(YAML.load_file(ARGV[0], permitted_classes: [Date, Time]))", file], { encoding: "utf8" });
  return JSON.parse(out);
}

function readConfig() {
  var c = readYaml(path.join(ROOT, "_config.yml"));
  var socials = readYaml(path.join(ROOT, "_data/socials.yml")) || {};
  return {
    url: (c.url || "") + (c.baseurl || ""),
    first: [].concat(c.scholar && c.scholar.first_name || c.first_name || []),
    last: [].concat(c.scholar && c.scholar.last_name || c.last_name || []),
    defaultLang: (c.languages || LANGS)[0],
    socials: socials,
  };
}

// Minimal BibTeX reader: @type{key, field = {value} | "value" | number, ...}
function parseBib(text) {
  var entries = [], i = 0;
  while ((i = text.indexOf("@", i)) >= 0) {
    // skip commented lines ("% ... @...")
    var ls = text.lastIndexOf("\n", i) + 1;
    if (/^\s*%/.test(text.slice(ls, i))) { i++; continue; }
    var m = /^@(\w+)\s*\{\s*([^,\s]+)\s*,/.exec(text.slice(i));
    if (!m) { i++; continue; }
    var e = { type: m[1].toLowerCase(), key: m[2], f: {} };
    var j = i + m[0].length, depth = 1;
    while (j < text.length && depth > 0) {
      var fm = /^\s*([\w-]+)\s*=\s*/.exec(text.slice(j));
      if (!fm) {
        if (text[j] === "}") depth--;
        j++;
        continue;
      }
      j += fm[0].length;
      var val = "";
      if (text[j] === "{") {
        var d = 0, s = j;
        do {
          if (text[j] === "{") d++;
          else if (text[j] === "}") d--;
          j++;
        } while (d > 0 && j < text.length);
        val = text.slice(s + 1, j - 1);
      } else if (text[j] === '"') {
        var s2 = ++j;
        while (j < text.length && text[j] !== '"') j++;
        val = text.slice(s2, j++);
      } else {
        var vm = /^[^,}\s]+/.exec(text.slice(j));
        val = vm ? vm[0] : "";
        j += val.length;
      }
      e.f[fm[1].toLowerCase()] = val.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    }
    entries.push(e);
    i = j;
  }
  return entries;
}

function readInterests(lang) {
  var md = fs.readFileSync(path.join(ROOT, "_pages", lang, "about.md"), "utf8").split(/^---\s*$/m).slice(2).join("---");
  var intro = "", title = "", items = [];
  var paras = md.split(/\n\s*\n/).map(function (p) { return p.trim(); });
  for (var k = 0; k < paras.length; k++) {
    var p = paras[k];
    if (!intro && p && !/^[#<{\-]/.test(p)) intro = p.replace(/\s*\n\s*/g, " ");
    if (/^###\s/.test(p) && !title) {
      title = p.split("\n")[0].replace(/^###\s*/, "");
      var list = p.split("\n").slice(1).join("\n") || paras[k + 1] || "";
      list.split("\n").forEach(function (ln) {
        var mm = /^\s*[-*]\s+(.*)$/.exec(ln);
        if (mm) items.push(mm[1]);
      });
    }
  }
  return { intro: intro, title: title, items: items };
}

// ------------------------------------------------------------------ html
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// escapes, then keeps **bold**, *italic* and [links](url)
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function authorList(authors, cfg) {
  var names = authors.split(/\s+and\s+/).map(function (a) {
    var parts = a.split(",").map(function (x) { return x.trim(); });
    var first = parts.length > 1 ? parts[1] : a.split(" ").slice(0, -1).join(" ");
    var last = parts.length > 1 ? parts[0] : a.split(" ").slice(-1)[0];
    var full = (first ? first + " " : "") + last;
    var me = cfg.last.indexOf(last) >= 0 && cfg.first.some(function (f) { return first.indexOf(f) === 0; });
    return me ? '<span class="me">' + esc(full) + "</span>" : esc(full);
  });
  if (names.length <= 2) return names.join(" and ");
  return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}

function publication(e, cfg) {
  var f = e.f;
  var venue = f.booktitle || f.journal || f.publisher || f.howpublished || "";
  var bits = [venue && "<em>" + esc(venue) + "</em>", f.address && esc(f.address), f.pages && "pp. " + esc(f.pages.replace(/--/g, "\u2013")), esc(f.year || "")]
    .filter(Boolean).join(", ");
  var links = [];
  if (f.doi) links.push('<a href="https://doi.org/' + esc(f.doi) + '">doi:' + esc(f.doi) + "</a>");
  if (f.arxiv) links.push('<a href="https://arxiv.org/abs/' + esc(f.arxiv) + '">arXiv:' + esc(f.arxiv) + "</a>");
  if (f.code) links.push('<a href="' + esc(f.code) + '">code</a>');
  return '<li><span class="badge">' + esc(f.abbr || "") + "</span><div>" + authorList(f.author || "", cfg) +
    '. <span class="ptitle">' + esc(f.title || "") + ".</span> " + bits + "." +
    (links.length ? ' <span class="links">' + links.join(" \u00b7 ") + "</span>" : "") + "</div></li>";
}

function section(sec) {
  var h = '<section><h2>' + esc(sec.title) + "</h2>";
  var c = sec.contents || [];
  if (sec.type === "map") {
    h += '<table class="map">' + c.map(function (r) {
      return "<tr><th>" + esc(r.name) + "</th><td>" + inline(r.value) + "</td></tr>";
    }).join("") + "</table>";
  } else if (sec.type === "time_table") {
    h += c.map(function (r) {
      var desc = (r.description || []).concat(r.items || []);
      return '<div class="entry"><div class="year">' + esc(r.year || "") + '</div><div class="body">' +
        (r.title ? '<div class="etitle">' + inline(r.title) + "</div>" : "") +
        (r.institution ? '<div class="inst">' + inline(r.institution) + "</div>" : "") +
        (desc.length ? "<ul>" + desc.map(function (d) { return "<li>" + inline(d) + "</li>"; }).join("") + "</ul>" : "") +
        "</div></div>";
    }).join("");
  } else if (sec.type === "nested_list") {
    h += "<ul>" + c.map(function (r) {
      return "<li><strong>" + inline(r.title) + "</strong>" + (r.items ? "<ul>" + r.items.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>" : "") + "</li>";
    }).join("") + "</ul>";
  } else {
    h += "<ul>" + c.map(function (x) { return "<li>" + inline(typeof x === "string" ? x : x.name || "") + "</li>"; }).join("") + "</ul>";
  }
  return h + "</section>";
}

function buildHtml(lang, cfg) {
  var t = L[lang];
  var cv = readYaml(path.join(ROOT, "_data", lang, "cv.yml")) || [];
  var bib = parseBib(fs.readFileSync(path.join(ROOT, "_bibliography/papers.bib"), "utf8"));
  bib.sort(function (a, b) { return (+b.f.year || 0) - (+a.f.year || 0); });
  var interests = readInterests(lang);

  // the first map section ("General Information") becomes the header
  var head = cv[0] && cv[0].type === "map" ? cv.shift().contents || [] : [];
  var name = head.length ? head[0].value : cfg.first[0] + " " + cfg.last[0];
  var sub = head.slice(1).map(function (r) { return inline(r.value); });

  var site = cfg.url + (lang === cfg.defaultLang ? "/" : "/" + lang + "/");
  var contact = ['<a href="' + esc(site) + '">' + esc(site.replace(/^https?:\/\//, "").replace(/\/$/, "")) + "</a>"];
  var s = cfg.socials;
  if (s.email) contact.unshift('<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a>");
  if (s.github_username) contact.push('<a href="https://github.com/' + esc(s.github_username) + '">github.com/' + esc(s.github_username) + "</a>");
  if (s.scholar_userid) contact.push('<a href="https://scholar.google.com/citations?user=' + esc(s.scholar_userid) + '">Google Scholar</a>');
  if (s.orcid_id) contact.push('<a href="https://orcid.org/' + esc(s.orcid_id) + '">ORCID ' + esc(s.orcid_id) + "</a>");

  var body = "";
  if (interests.items.length) {
    body += "<section><h2>" + esc(interests.title) + "</h2>" +
      (interests.intro ? '<p class="intro">' + inline(interests.intro) + "</p>" : "") +
      '<ul class="tags">' + interests.items.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul></section>";
  }
  cv.forEach(function (sec) { body += section(sec); });
  if (bib.length) body += '<section><h2>' + esc(t.pubs) + '</h2><ol class="pubs">' + bib.map(function (e) { return publication(e, cfg); }).join("") + "</ol></section>";

  return "<!doctype html><html lang=\"" + t.htmlLang + "\"><head><meta charset=\"utf-8\"><title>" + esc(name) + " - CV</title><style>" +
    "@page { size: A4; margin: 17mm 18mm 18mm; }" +
    "* { box-sizing: border-box; }" +
    "body { margin: 0; font-family: " + t.font + "; font-size: 10pt; line-height: 1.45; color: #1d1d1f; }" +
    "a { color: inherit; text-decoration: none; }" +
    "header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #8a1538; padding-bottom: 8pt; margin-bottom: 4pt; }" +
    "h1 { font-family: Inter, " + t.font + "; font-size: 22pt; font-weight: 600; margin: 0; letter-spacing: -0.01em; }" +
    ".kind { font-family: Inter, " + t.font + "; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.12em; color: #8a1538; margin-bottom: 2pt; }" +
    ".sub { margin-top: 3pt; color: #444; }" +
    ".contact { text-align: right; font-size: 8.8pt; color: #333; line-height: 1.55; }" +
    "h2 { font-family: Inter, " + t.font + "; font-size: 11pt; font-weight: 600; color: #8a1538; text-transform: uppercase; letter-spacing: 0.08em; margin: 14pt 0 5pt; padding-bottom: 2pt; border-bottom: 0.6pt solid #d8c4ca; break-after: avoid; }" +
    ":lang(zh-CN) h2, :lang(ja) h2 { letter-spacing: 0.04em; }" +
    "section { break-inside: auto; }" +
    ".intro { margin: 0 0 5pt; }" +
    "ul { margin: 2pt 0; padding-left: 14pt; }" +
    "ul.tags { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 4pt 6pt; }" +
    "ul.tags li { border: 0.6pt solid #c9b3ba; border-radius: 3pt; padding: 0.5pt 6pt; }" +
    "ul.tags strong { font-weight: 400; }" +
    // CJK fonts here have no bold face; keep mixed-script titles at one weight
    ":lang(zh-CN) .etitle, :lang(ja) .etitle { font-weight: 400; color: #000; }" +
    "table.map { border-collapse: collapse; } table.map th { text-align: left; font-weight: 600; padding: 1pt 12pt 1pt 0; vertical-align: top; white-space: nowrap; } table.map td { padding: 1pt 0; }" +
    ".entry { display: flex; gap: 12pt; margin-bottom: 6pt; break-inside: avoid; }" +
    ".year { flex: 0 0 72pt; color: #555; font-variant-numeric: tabular-nums; }" +
    ".body { flex: 1; } .etitle { font-weight: 600; } .inst { color: #333; }" +
    "ol.pubs { list-style: none; padding: 0; margin: 0; }" +
    "ol.pubs li { display: flex; gap: 8pt; margin-bottom: 7pt; break-inside: avoid; }" +
    ".badge { flex: 0 0 46pt; align-self: flex-start; text-align: center; font-family: Inter, sans-serif; font-size: 7.5pt; font-weight: 600; color: #fff; background: #8a1538; border-radius: 2pt; padding: 1pt 0; margin-top: 1.5pt; }" +
    ".badge:empty { visibility: hidden; }" +
    ".ptitle { font-weight: 600; } .me { font-weight: 700; text-decoration: underline; text-underline-offset: 1.5pt; }" +
    ".links { color: #8a1538; font-size: 8.8pt; white-space: nowrap; }" +
    "</style></head><body>" +
    '<header><div><div class="kind">' + esc(t.cv) + "</div><h1>" + esc(name) + "</h1>" +
    sub.map(function (x) { return '<div class="sub">' + x + "</div>"; }).join("") + "</div>" +
    '<div class="contact">' + contact.join("<br>") + "</div></header>" + body + "</body></html>";
}

// ------------------------------------------------------------------ main
async function main() {
  var args = process.argv.slice(2);
  var keepHtml = args.indexOf("--html") >= 0;
  var langs = args.filter(function (a) { return LANGS.indexOf(a) >= 0; });
  if (!langs.length) langs = LANGS;
  var cfg = readConfig();
  var browser = await chromium.launch();
  try {
    for (var k = 0; k < langs.length; k++) {
      var lang = langs[k], t = L[lang];
      var html = buildHtml(lang, cfg);
      var dir = path.join(ROOT, "assets/pdf", lang);
      fs.mkdirSync(dir, { recursive: true });
      if (keepHtml) fs.writeFileSync(path.join(dir, "cv.html"), html);
      var page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(function () { return document.fonts.ready; });
      var foot = '<div style="width: 100%; padding: 0 18mm; font-size: 7.5pt; color: #777; font-family: ' + t.font.replace(/"/g, "'") +
        '; display: flex; justify-content: space-between;"><span>' + esc(t.updated) + " " + esc(t.date(new Date())) + "</span><span>" +
        esc(t.page).replace("{p}", '<span class="pageNumber"></span>').replace("{n}", '<span class="totalPages"></span>') + "</span></div>";
      await page.pdf({
        path: path.join(dir, "cv.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: foot,
      });
      await page.close();
      console.log("wrote assets/pdf/" + lang + "/cv.pdf");
    }
  } finally {
    await browser.close();
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
