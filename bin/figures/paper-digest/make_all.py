"""Regenerate the figures of every Paper Digest issue.

    python3 bin/figures/paper-digest/make_all.py

Runs every script named paper_digest_NN.py in this folder (one per issue). Each script reads its
curated data from data/NN-papers.json and writes SVGs to assets/img/blog/paper-digest/NN-*.svg.
Needs numpy and matplotlib only; the whole run takes a few seconds.
"""
import os
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
for script in sorted(HERE.glob("paper_digest_[0-9][0-9].py")):
    print(f"== {script.name}", flush=True)
    subprocess.run([sys.executable, str(script)], check=True, cwd=HERE, env=env)
