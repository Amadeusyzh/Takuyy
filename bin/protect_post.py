#!/usr/bin/env python3
"""Password-protects a post: only ciphertext reaches the public repository and the public site.

Workflow (see docs/protected/README.md):
  1. Build the site locally with the plaintext post files present but NOT committed.
  2. Run this script. For each language it takes the rendered body (the inner HTML of #markdown-content) of
     the plaintext post, inlines the post's figures as data URIs, gzips it, encrypts it with AES-256-GCM under a
     key derived from the password (PBKDF2-SHA256), and writes a public stub post whose body holds only the
     ciphertext and an unlock form (assets/js/protected.js decrypts it in the browser).
  3. It also writes docs/protected/<slug>.bundle.json: the plaintext sources (markdown, figure SVGs, scripts, and
     working notes in notes/ that are never rendered) in a deterministic tar.gz, encrypted the same way, so that whoever has the password can recover them
     (bin/unprotect_bundle.py), and docs/protected/<slug>.sha256.txt: the SHA-256 of each markdown source,
     a public, dated commitment to the content.
  4. Delete the plaintext files, rebuild, and commit only the stubs and docs/protected/.

Usage:
  PROTECT_PASSWORD=... python3 bin/protect_post.py --slug <slug> --date 2026-11-24 \
      --src <dir with posts/{en-us,zh-cn,ja-jp}/*.md, figs/*.svg, scripts/*> --site _site \
      --title-en "..." --title-zh "..." --title-ja "..." [--description-en ...]
"""
import argparse, base64, gzip, hashlib, io, json, os, re, sys, tarfile, urllib.parse

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITER = 600_000
LANGS = [("en-us", ""), ("zh-cn", "zh-cn/"), ("ja-jp", "ja-jp/")]
UI = {
    "en-us": {"lead": "This post is the detailed research plan of the 3D GUI Agent column. It is protected with a "
                      "password until the work is published.",
              "label": "Password", "button": "Unlock", "wrong": "Wrong password.", "busy": "Decrypting…",
              "commit": "Content fixed on {date}. SHA-256 of the source: {h}"},
    "zh-cn": {"lead": "本文是 3D GUI Agent 专栏的详细研究计划，"
                      "在工作发表之前需要密码才能阅读。",
              "label": "密码", "button": "解锁", "wrong": "密码不正确。",
              "busy": "正在解密…",
              "commit": "内容定稿于 {date}。源文件的 SHA-256：{h}"},
    "ja-jp": {"lead": "この記事は 3D GUI Agent 連載の詳しい研究"
                      "計画です。研究が発表されるまで、"
                      "閲覧にはパスワードが必要です。",
              "label": "パスワード", "button": "解除",
              "wrong": "パスワードが違います。",
              "busy": "復号中…",
              "commit": "{date} 時点で内容を確定。ソースの SHA-256：{h}"},
}


def encrypt(data: bytes, password: str) -> dict:
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password.encode("utf-8"))
    ct = AESGCM(key).encrypt(iv, data, None)  # ciphertext || 16-byte tag, as WebCrypto expects
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER, "alg": "AES-256-GCM", "zip": "gzip",
            "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}


def det_gzip(data: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as f:
        f.write(data)
    return buf.getvalue()


def det_targz(root: str) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for dirpath, dirs, files in os.walk(root):
            dirs.sort()
            for name in sorted(files):
                path = os.path.join(dirpath, name)
                info = tar.gettarinfo(path, arcname=os.path.relpath(path, root))
                info.mtime, info.uid, info.gid, info.uname, info.gname = 0, 0, 0, "", ""
                with open(path, "rb") as fh:
                    tar.addfile(info, fh)
    return det_gzip(buf.getvalue())


def body_of(html: str) -> str:
    m = re.search(r'<div id="markdown-content">', html)
    if not m:
        raise SystemExit("no #markdown-content in the rendered page")
    i, depth = m.end(), 1
    for t in re.finditer(r"<(/?)div\b[^>]*>", html[i:]):
        depth += -1 if t.group(1) else 1
        if depth == 0:
            return html[i:i + t.start()]
    raise SystemExit("unbalanced #markdown-content")


def inline_images(body: str, figdir: str, slug_series: str) -> str:
    # SVGs go in as percent-encoded text (gzip then shrinks them about as well as the files themselves;
    # base64 would not compress); other images as base64
    def rep(m):
        src = m.group(2)
        name = os.path.basename(src.split("?")[0])
        path = os.path.join(figdir, name)
        if "/assets/img/blog/" + slug_series + "/" not in src or not os.path.exists(path):
            return m.group(0)
        if name.endswith(".svg"):
            text = open(path, encoding="utf-8").read()
            uri = "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(text, safe="=:/;.,-_()!*~@+?' ")
        else:
            uri = "data:image/png;base64," + base64.b64encode(open(path, "rb").read()).decode("ascii")
        return m.group(1) + uri + m.group(3)
    out = re.sub(r'(<img\b[^>]*?\bsrc=")([^"]+)(")', rep, body)
    left = re.findall(r'src="([^"]*/assets/img/blog/' + slug_series + r'/[^"]+)"', out)
    if left:
        raise SystemExit("figures not inlined (missing from the source folder): " + ", ".join(left))
    if re.search(r"<script\b", out):
        raise SystemExit("the protected post contains <script> tags (widgets); they would not run after decryption")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--series", default="3d-gui-agent")
    ap.add_argument("--series-order", type=int, default=5)
    ap.add_argument("--date", required=True)
    ap.add_argument("--time", default="12:05:00+0900")
    ap.add_argument("--src", required=True)
    ap.add_argument("--site", default="_site")
    ap.add_argument("--repo", default=".")
    for l in ("en", "zh", "ja"):
        ap.add_argument("--title-" + l, required=True)
        ap.add_argument("--description-" + l, default="")
    a = ap.parse_args()
    pw = os.environ.get("PROTECT_PASSWORD", "")
    if len(pw) < 12:
        raise SystemExit("set PROTECT_PASSWORD (12 characters or more)")

    # commitment: SHA-256 of each markdown source, and of the three hashes together
    hashes_ = {}
    for lang, _ in LANGS:
        p = os.path.join(a.src, "posts", lang, f"{a.date}-{a.slug}.md")
        hashes_[lang] = hashlib.sha256(open(p, "rb").read()).hexdigest()
    combined = hashlib.sha256("".join(hashes_[l] for l, _ in LANGS).encode("ascii")).hexdigest()

    titles = {"en-us": a.title_en, "zh-cn": a.title_zh, "ja-jp": a.title_ja}
    descs = {"en-us": a.description_en, "zh-cn": a.description_zh, "ja-jp": a.description_ja}
    figdir = os.path.join(a.src, "figs")
    for lang, prefix in LANGS:
        page = os.path.join(a.site, prefix + f"blog/{a.date[:4]}/{a.slug}/index.html")
        body = inline_images(body_of(open(page, encoding="utf-8").read()), figdir, a.series)
        payload = encrypt(det_gzip(body.encode("utf-8")), pw)
        enc = base64.b64encode(json.dumps(payload, separators=(",", ":")).encode("ascii")).decode("ascii")
        ui = UI[lang]
        commit = ui["commit"].format(date=a.date, h=combined)
        stub = f"""---
layout: post
title: "{titles[lang]}"
date: {a.date} {a.time}
description: "{descs[lang]}"
categories: {a.series}
series: {a.series}
series_order: {a.series_order}
toc:
  sidebar: left
related_posts: false
protected: true
---

<div class="protected-post" markdown="0" data-payload="{enc}" data-label="{ui['label']}" data-button="{ui['button']}" data-wrong="{ui['wrong']}" data-busy="{ui['busy']}">
<p class="protected-lead">{ui['lead']}</p>
<p class="protected-commit"><small>{commit}</small></p>
<noscript><p>JavaScript is required to decrypt this page.</p></noscript>
</div>
<script defer src="{{{{ '/assets/js/protected.js' | relative_url }}}}"></script>
"""
        out = os.path.join(a.repo, "_posts", lang, f"{a.date}-{a.slug}.md")
        open(out, "w", encoding="utf-8").write(stub)
        print(f"{lang}: stub {out} ({len(enc) // 1024} KB payload, body {len(body) // 1024} KB)")

    os.makedirs(os.path.join(a.repo, "docs", "protected"), exist_ok=True)
    bundle = encrypt(det_targz(a.src), pw)
    bpath = os.path.join(a.repo, "docs", "protected", f"{a.slug}.bundle.json")
    json.dump(bundle, open(bpath, "w"), indent=1)
    hpath = os.path.join(a.repo, "docs", "protected", f"{a.slug}.sha256.txt")
    with open(hpath, "w") as f:
        f.write(f"# {a.slug}: SHA-256 of the plaintext markdown sources, fixed on {a.date}\n")
        for lang, _ in LANGS:
            f.write(f"{hashes_[lang]}  {a.date}-{a.slug}.md ({lang})\n")
        f.write(f"{combined}  combined: sha256 of the three hashes above, concatenated as hex in the order en-us, zh-cn, ja-jp\n")
        notes = os.path.join(a.src, "notes")
        if os.path.isdir(notes):
            for name in sorted(os.listdir(notes)):
                h = hashlib.sha256(open(os.path.join(notes, name), "rb").read()).hexdigest()
                f.write(f"{h}  notes/{name} (working notes, in the bundle only)\n")
    print("bundle", bpath, "| hashes", hpath, "| combined", combined)


if __name__ == "__main__":
    sys.exit(main())
