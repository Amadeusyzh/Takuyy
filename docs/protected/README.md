# Protected posts

Encrypted sources and public SHA-256 commitments of password-protected posts (see `docs/BLOG_GUIDE.md`, section 12).

- `<slug>.bundle.json`: the post's plaintext sources (markdown in three languages, figure SVGs, figure scripts) as a
  deterministic tar.gz, encrypted with AES-256-GCM under a key derived from the post's password (PBKDF2-SHA256).
  Recover them with `PROTECT_PASSWORD=... python3 bin/unprotect_bundle.py docs/protected/<slug>.bundle.json <dir>`.
- `<slug>.sha256.txt`: the SHA-256 of each markdown source and of the three together, fixed on the date given. Once
  the content is made public, anyone can check that it has not changed since that date.
