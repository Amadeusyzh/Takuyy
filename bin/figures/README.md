# Blog figures

Each series has its own folder (`graphics/`, `neural-rendering/`, `world-models/`, `embodied-ai/`)
with Python scripts that regenerate every figure of that series into `assets/img/blog/<series>/`.

```bash
python3 -m pip install matplotlib numpy scipy   # once
python3 bin/figures/graphics/make_all.py         # regenerate one series
```

All scripts share `bin/figures/style.py` (palette, fonts, SVG export). Interactive widgets live in
`assets/js/widgets/<series>-*.js` and are embedded with `{% include widget.liquid name="..." %}`.
