// Test page: press "Run all" and post the table every 3 s until the run stops.
(function () {
  function rows() {
    var out = [];
    var trs = document.querySelectorAll("#rows tr");
    for (var i = 0; i < trs.length; i++) {
      var tds = trs[i].querySelectorAll("td"), cols = [];
      for (var j = 0; j < tds.length; j++) cols.push(tds[j].innerText.replace(/\s+/g, " ").trim());
      out.push(cols.join(" | "));
    }
    return out;
  }
  window.addEventListener("load", function () {
    setTimeout(function () {
      var btn = document.getElementById("all");
      window.__post({ kind: "info", data: document.getElementById("info").innerText });
      btn.click();
      var iv = setInterval(function () {
        var done = !btn.disabled;
        window.__post({ kind: "table", done: done, rows: rows() });
        if (done) clearInterval(iv);
      }, 3000);
    }, 1500);
  });
})();
