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
  var plan = [["pt", 12], ["sdf", 120], ["pt", 30], ["rs", 20], ["cloth", 20], ["sdf", 40]];
  window.addEventListener("load", function () {
    setTimeout(function () {
      var i = 0;
      (function next() {
        if (i >= plan.length) { window.__post({ kind: "done", done: true }); return; }
        var name = plan[i][0], secs = plan[i][1], n = 0; i++;
        tab(name);
        var iv = setInterval(function () {
          window.__post({ kind: "stats", tab: name, s: n * 2, data: stats("lab-" + name) });
          if (++n * 2 >= secs) { clearInterval(iv); next(); }
        }, 2000);
      })();
    }, 3000);
  });
})();
