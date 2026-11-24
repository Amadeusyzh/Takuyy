// Password-protected posts (see bin/protect_post.py). The page holds only ciphertext: the rendered post body,
// gzipped and encrypted with AES-256-GCM under a key derived from the password with PBKDF2-SHA256. This script
// asks for the password, decrypts and decompresses the body in the browser (Web Crypto and
// DecompressionStream), inserts it, typesets the math and rebuilds the table of contents. A correct password is
// kept for this browser tab (sessionStorage), so the other languages of the post open without asking again.
(function () {
  "use strict";
  var root = document.querySelector(".protected-post[data-payload]");
  if (!root) return;
  var STORE = "protected-post-password";

  function bytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decrypt(password) {
    var p = JSON.parse(atob(root.getAttribute("data-payload")));
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: bytes(p.salt), iterations: p.iter, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      })
      .then(function (key) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(p.iv) }, key, bytes(p.ct)); })
      .then(function (buf) {
        var stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Response(stream).text();
      });
  }

  function show(html) {
    root.innerHTML = html;
    root.classList.add("protected-open");
    // tables: the same classes and bootstrap-table setup that no_defer.js gives tables at page load
    var $ = window.jQuery;
    if ($) {
      $(root).find("table").each(function () {
        if ($(this).parents("code").length) return;
        if (typeof window.determineComputedTheme === "function" && window.determineComputedTheme() === "dark") {
          $(this).addClass("table-dark");
        }
        $(this).attr("data-toggle", "table").addClass("table-hover");
        if ($.fn.bootstrapTable) {
          try { $(this).bootstrapTable(); } catch (e) { /* plain table */ }
        }
      });
    }
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise([root]).then(function () {
        if (typeof window.fitWideInlineMath === "function") window.fitWideInlineMath();
      }).catch(function () {});
    }
    // The theme builds the table of contents in jQuery ready handlers (common.js, and bootstrap-toc for every
    // nav marked data-toggle="toc"), which jQuery runs asynchronously, sometimes after the load event. A body
    // decrypted before they run (a remembered password) would get one list from each, so the list is rebuilt
    // from scratch in a ready handler registered now: jQuery runs it after theirs.
    function toc() {
      if (!window.jQuery || !window.Toc) return;
      var $nav = window.jQuery("#toc-sidebar");
      if (!$nav.length) return;
      $nav.empty();
      window.Toc.init($nav);
      try { window.jQuery("body").scrollspy("refresh"); } catch (e) { /* no scrollspy */ }
    }
    if (window.jQuery) window.jQuery(function () { setTimeout(toc, 0); });
    if (location.hash) {
      var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    }
  }

  if (!(window.crypto && crypto.subtle && window.DecompressionStream && window.TextEncoder)) {
    var old = document.createElement("p");
    old.textContent = "This browser cannot decrypt the page (Web Crypto and DecompressionStream are needed).";
    root.appendChild(old);
    return;
  }

  var form = document.createElement("form");
  form.className = "protected-form";
  form.style.cssText = "display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin:1rem 0;";
  var input = document.createElement("input");
  input.type = "password";
  input.autocomplete = "current-password";
  input.setAttribute("aria-label", root.getAttribute("data-label") || "Password");
  input.placeholder = root.getAttribute("data-label") || "Password";
  input.style.cssText = "flex:1 1 14rem;min-width:0;padding:0.45rem 0.6rem;border:1px solid var(--global-divider-color);" +
    "border-radius:6px;background:var(--global-bg-color);color:var(--global-text-color);font:inherit;";
  var button = document.createElement("button");
  button.type = "submit";
  button.textContent = root.getAttribute("data-button") || "Unlock";
  button.style.cssText = "padding:0.45rem 1rem;border:1px solid var(--global-theme-color);border-radius:6px;" +
    "background:var(--global-theme-color);color:#fff;font:inherit;cursor:pointer;";
  var msg = document.createElement("p");
  msg.className = "protected-msg";
  msg.setAttribute("role", "status");
  msg.style.cssText = "flex-basis:100%;margin:0;min-height:1.4em;font-size:0.9rem;";
  form.appendChild(input);
  form.appendChild(button);
  form.appendChild(msg);
  root.appendChild(form);

  function attempt(password, remember) {
    button.disabled = true;
    msg.textContent = root.getAttribute("data-busy") || "Decrypting...";
    return decrypt(password).then(function (html) {
      if (remember) {
        try { sessionStorage.setItem(STORE, password); } catch (e) { /* storage unavailable */ }
      }
      show(html);
      return true;
    }, function () {
      button.disabled = false;
      msg.textContent = remember ? (root.getAttribute("data-wrong") || "Wrong password.") : "";
      return false;
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (input.value) attempt(input.value, true);
  });

  var saved = null;
  try { saved = sessionStorage.getItem(STORE); } catch (e) { saved = null; }
  if (saved) attempt(saved, false);
})();
