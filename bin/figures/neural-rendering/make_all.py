"""Regenerate every figure of the neural-rendering series into assets/img/blog/neural-rendering/.

    python3 bin/figures/neural-rendering/make_all.py
"""
import pathlib
import runpy
import sys

HERE = pathlib.Path(__file__).resolve().parent

if __name__ == "__main__":
    scripts = sorted(HERE.glob("neural-rendering_[0-9][0-9].py"))
    only = set(sys.argv[1:])  # optional: post numbers, e.g. `make_all.py 02 04`
    for s in scripts:
        if only and s.stem.split("_")[-1] not in only:
            continue
        print(f"== {s.name}")
        runpy.run_path(str(s), run_name="__main__")
