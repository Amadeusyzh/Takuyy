"""Regenerate every figure of the world-models series (and the weights inside the rollout widget).

    python3 bin/figures/world-models/make_all.py

Needs numpy, matplotlib and torch (CPU). The whole run takes roughly 10-15 minutes on a laptop CPU,
most of it in the small training runs (pendulum model, DDPM, latent action model, SDS, collapse toy).
"""
import os
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
for n in range(1, 6):
    script = HERE / f"world_models_0{n}.py"
    print(f"== {script.name}", flush=True)
    subprocess.run([sys.executable, str(script)], check=True, cwd=HERE, env=env)
