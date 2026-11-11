// Inline formulas cannot wrap. When one is wider than its line (a long formula on a phone), give it
// the class mjx-wide, which shows it as its own horizontally scrollable line (see _sass/_base.scss)
// instead of widening or clipping the page. Re-checked when the viewport width changes.
function fitWideInlineMath() {
  var els = Array.prototype.slice.call(document.querySelectorAll('mjx-container[jax="CHTML"]:not([display="true"])'));
  els.forEach(function (el) {
    el.classList.remove("mjx-wide");
  });
  var wide = els.filter(function (el) {
    var box = el.parentElement;
    while (box && getComputedStyle(box).display.indexOf("inline") === 0) box = box.parentElement;
    if (!box) return false;
    var cs = getComputedStyle(box);
    var avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return el.getBoundingClientRect().width > avail + 0.5;
  });
  wide.forEach(function (el) {
    el.classList.add("mjx-wide");
  });
}

window.MathJax = {
  tex: {
    tags: "ams",
    inlineMath: [
      ["$", "$"],
      ["\\(", "\\)"],
    ],
  },
  startup: {
    pageReady: function () {
      return MathJax.startup.defaultPageReady().then(function () {
        fitWideInlineMath();
        var lastWidth = window.innerWidth,
          timer = 0;
        window.addEventListener("resize", function () {
          if (window.innerWidth === lastWidth) return; // mobile URL bar: height only
          lastWidth = window.innerWidth;
          clearTimeout(timer);
          timer = setTimeout(fitWideInlineMath, 150);
        });
      });
    },
  },
  options: {
    renderActions: {
      addCss: [
        200,
        function (doc) {
          const style = document.createElement("style");
          style.innerHTML = `
          .mjx-container {
            color: inherit;
          }
        `;
          document.head.appendChild(style);
        },
        "",
      ],
    },
  },
};
