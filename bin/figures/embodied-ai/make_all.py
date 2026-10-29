"""Regenerate every figure of the embodied-ai series into assets/img/blog/embodied-ai/.

    python3 bin/figures/embodied-ai/make_all.py

Needs numpy, scipy, matplotlib; posts 02, 04 and 05 also train small PyTorch models on the CPU
(post 02 runs the post's PPO four times, a few minutes in parallel), and post 03 needs `mujoco`.
"""
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
for nn in range(1, 7):
    script = HERE / f"embodied-ai_{nn:02d}.py"
    print(f"== {script.name}", flush=True)
    subprocess.run([sys.executable, str(script)], check=True)
