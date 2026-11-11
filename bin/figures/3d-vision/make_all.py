"""Regenerate every figure of the 3d-vision series.

Runs each vision3d_*.py in this folder (in name order) in its own process, so one script's
matplotlib state cannot leak into the next.

    python3 bin/figures/3d-vision/make_all.py
"""
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent

if __name__ == "__main__":
    failed = []
    for script in sorted(HERE.glob("vision3d_*.py")):
        print(f"== {script.name}", flush=True)
        if subprocess.run([sys.executable, str(script)], cwd=HERE).returncode != 0:
            failed.append(script.name)
    if failed:
        sys.exit("failed: " + ", ".join(failed))
