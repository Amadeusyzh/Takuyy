// Home page: scroll to the Lab, wait on the default demo, open SDF, then go back to other demos, posting the
// stats line of the visible panel every 2 s.
(function () {
  function stats(id) {
    var p = document.getElementById(id), st = p && p.querySelector(".lab-stats");
    return st ? st.textContent.replace(/\s+/g, " ").slice(0, 160) : "(no stats)";
  }
  function tab(name) {
    var b = document.getElementById("lab-tab-" + name);
    if (!b) { window.__post({ kind: "step", data: "no tab " + name }); return; }
    b.scrollIntoView({ block: "start" });
    b.click();
    window.__post({ kind: "step", data: "tab " + name });
  }
  // on the first SDF visit: select the shape in the middle (a tap), then the slice view, then back
  function sdfActions(sec) {
    var p = document.getElementById("lab-sdf"), c = p && p.querySelector("canvas");
    if (!c) return;
    if (sec === 40) {
      var r = c.getBoundingClientRect(), x = r.left + r.width * 0.5, y = r.top + r.height * 0.55;
      var o = { clientX: x, clientY: y, pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, button: 0, buttons: 1 };
      c.dispatchEvent(new PointerEvent("pointerdown", o));
      o.buttons = 0;
      setTimeout(function () { c.dispatchEvent(new PointerEvent("pointerup", o)); window.__post({ kind: "step", data: "tap shape" }); }, 80);
    }
    if (sec === 70) { var b = p.querySelector('[data-view="2"]'); if (b) b.click(); window.__post({ kind: "step", data: "slice view" }); }
    if (sec === 90) { var b0 = p.querySelector('[data-view="0"]'); if (b0) b0.click(); window.__post({ kind: "step", data: "shaded view" }); }
  }
  var plan = [["pt", 12], ["sdf", 120], ["pt", 30], ["rs", 20], ["cloth", 20], ["sdf", 40]];
  window.addEventListener("load", function () {
    setTimeout(function () {
      var i = 0;
      (function next() {
        if (i >= plan.length) { window.__post({ kind: "done", done: true }); return; }
        var name = plan[i][0], secs = plan[i][1], n = 0; i++;
        tab(name);
        var first = name === "sdf" && !window.__sdfSeen;
        if (name === "sdf") window.__sdfSeen = true;
        var iv = setInterval(function () {
          if (first) sdfActions(n * 2);
          window.__post({ kind: "stats", tab: name, s: n * 2, data: stats("lab-" + name) });
          if (++n * 2 >= secs) { clearInterval(iv); next(); }
        }, 2000);
      })();
    }, 3000);
  });
})();
