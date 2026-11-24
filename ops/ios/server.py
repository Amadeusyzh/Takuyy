#!/usr/bin/env python3
"""Static server for the iOS simulator check: serves www/ and appends every POST /report body to a file."""
import http.server, os, sys, time

PORT, ROOT, OUT = int(sys.argv[1]), sys.argv[2], sys.argv[3]


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(n).decode("utf-8", "replace").replace("\n", " ")
        with open(OUT, "a", encoding="utf-8") as f:
            f.write("%.1f %s\n" % (time.time(), body))
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (time.strftime("%H:%M:%S"), fmt % args))


http.server.ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
