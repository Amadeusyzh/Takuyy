#!/usr/bin/env python3
"""Recovers the plaintext sources of a password-protected post from docs/protected/<slug>.bundle.json.

Usage: PROTECT_PASSWORD=... python3 bin/unprotect_bundle.py docs/protected/<slug>.bundle.json <out-dir>
The bundle holds the markdown sources (posts/<lang>/...), figure SVGs (figs/) and figure scripts (scripts/), as
written by bin/protect_post.py. Check the result against docs/protected/<slug>.sha256.txt with sha256sum.
"""
import base64, gzip, io, json, os, sys, tarfile

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    pw = os.environ.get("PROTECT_PASSWORD", "")
    b = json.load(open(sys.argv[1]))
    d = lambda k: base64.b64decode(b[k])
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=d("salt"), iterations=b["iter"]).derive(pw.encode("utf-8"))
    try:
        data = AESGCM(key).decrypt(d("iv"), d("ct"), None)
    except Exception:
        raise SystemExit("wrong password or damaged bundle")
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(data)), mode="r") as tar:
        tar.extractall(sys.argv[2], filter="data")
    print("extracted into", sys.argv[2])


if __name__ == "__main__":
    main()
