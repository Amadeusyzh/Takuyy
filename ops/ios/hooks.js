// Loaded before the page's own scripts. Records WebGL calls that block the page for more than 100 ms,
// context-lost and -restored events, animation-frame gaps over 400 ms and errors, and posts them to /report.
(function () {
  var REPORT = location.origin + "/report";
  var t0 = Date.now();
  window.__ev = [];
  function now() { return Date.now() - t0; }
  function post(obj) {
    try {
      var x = new XMLHttpRequest(); x.open("POST", REPORT, true);
      x.setRequestHeader("Content-Type", "text/plain"); x.send(JSON.stringify(obj));
    } catch (e) {}
  }
  window.__post = post;
  function ev(kind, data) { var e = { t: now(), kind: kind, data: data }; window.__ev.push(e); post(e); }
  window.__evRec = ev;
  window.addEventListener("error", function (e) { ev("error", String(e.message) + " @" + (e.filename || "") + ":" + (e.lineno || "")); });
  window.addEventListener("unhandledrejection", function (e) { ev("rejection", String(e.reason)); });
  var gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type) {
    var c = gc.apply(this, arguments);
    if (c && /webgl/.test(type) && !this.__hooked) {
      this.__hooked = true;
      var id = (this.closest && this.closest("[id]") ? this.closest("[id]").id : "?") + "/" + type;
      this.addEventListener("webglcontextlost", function () { ev("contextlost", id); });
      this.addEventListener("webglcontextrestored", function () { ev("contextrestored", id); });
      ev("context", id + " " + (c.getExtension && c.getExtension("KHR_parallel_shader_compile") ? "parallel" : "no-parallel"));
    }
    return c;
  };
  ["getProgramParameter", "getShaderParameter", "getUniformLocation", "getActiveUniform", "getError",
   "readPixels", "finish", "clientWaitSync", "linkProgram", "compileShader", "drawArrays", "useProgram",
   "getShaderInfoLog", "getProgramInfoLog"].forEach(function (name) {
    [window.WebGL2RenderingContext, window.WebGLRenderingContext].forEach(function (C) {
      if (!C || !C.prototype[name]) return;
      var f = C.prototype[name];
      C.prototype[name] = function () {
        var a = performance.now(), r = f.apply(this, arguments), d = performance.now() - a;
        if (d > 100) ev("slowcall", name + " " + Math.round(d) + " ms");
        return r;
      };
    });
  });
  var last = performance.now();
  (function raf() {
    var t = performance.now();
    if (t - last > 400) ev("gap", Math.round(t - last) + " ms");
    last = t;
    requestAnimationFrame(raf);
  })();
})();
