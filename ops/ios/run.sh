#!/bin/bash
# iOS simulator check: boots the newest iPhone simulator, opens a page in Mobile Safari and records what the
# page posts back (see hooks.js), screenshots and WebKit log lines. Usage: run.sh <sdf|lab> <out dir>
set -u
TEST=$1; OUT=$2; mkdir -p "$OUT"
HERE=$(cd "$(dirname "$0")" && pwd); WWW="$RUNNER_TEMP/www"; mkdir -p "$WWW"
SITE=https://amadeusyzh.github.io/Takuyy
PORT=8123
xcodebuild -version > "$OUT/xcode.txt" 2>&1; xcrun simctl list runtimes > "$OUT/runtimes.txt" 2>&1
cp "$HERE"/hooks.js "$HERE"/auto-*.js "$WWW/"
if [ "$TEST" = sdf ] || [ "${TEST#page:}" != "$TEST" ]; then
  if [ "$TEST" = sdf ]; then curl -fsSL "$SITE/labtest/sdf.html?r=$RANDOM" -o "$WWW/page.html"; else cp "$HERE/pages/${TEST#page:}" "$WWW/page.html"; fi
  python3 - "$WWW/page.html" <<'PY2'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
s = s.replace("var TIMEOUT = 45000;", "var TIMEOUT = 150000;")
s = s.replace("<head>", '<head>\n<script src="/hooks.js"></script>', 1)
s = s.replace("</body>", '<script src="/auto-sdf.js"></script>\n</body>', 1)
open(p, "w", encoding="utf-8").write(s)
PY2
else
  curl -fsSL "$SITE/?r=$RANDOM" -o "$WWW/page.html"
  python3 - "$WWW/page.html" "$SITE/" <<'PY2'
import sys
p, base = sys.argv[1], sys.argv[2]; s = open(p, encoding="utf-8").read()
i = s.index("<head>") + len("<head>")
s = s[:i] + '\n<base href="%s">\n<script src="http://localhost:8123/hooks.js"></script>\n<script src="http://localhost:8123/auto-lab.js"></script>\n' % base + s[i:]
open(p, "w", encoding="utf-8").write(s)
PY2
fi
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
d = json.load(sys.stdin)["devices"]; best = None
for rt, devs in d.items():
    if ".iOS-" not in rt: continue
    ver = [int(x) for x in rt.split(".iOS-")[1].split("-")]
    for dev in devs:
        if dev["name"].startswith("iPhone"):
            key = (ver, "Pro" in dev["name"] and "Max" not in dev["name"], dev["name"])
            if best is None or key > best[0]: best = (key, dev["udid"], rt, dev["name"])
print(best[1]); sys.stderr.write("%s | %s\n" % (best[2], best[3]))
' 2> "$OUT/device.txt")
cat "$OUT/device.txt"
xcrun simctl boot "$UDID" 2>&1 | tail -2
xcrun simctl bootstatus "$UDID" -b > /dev/null 2>&1
sleep 20
python3 "$HERE/server.py" $PORT "$WWW" "$OUT/report.txt" 2> "$OUT/server.log" &
SRV=$!
sleep 1
xcrun simctl spawn "$UDID" log stream --style compact --level info \
  --predicate 'process BEGINSWITH "com.apple.WebKit" OR process == "MobileSafari" OR process CONTAINS "MTLCompiler" OR eventMessage CONTAINS[c] "jetsam"' \
  > "$RUNNER_TEMP/log.txt" 2>&1 &
LOG=$!
xcrun simctl openurl "$UDID" "http://localhost:$PORT/page.html?auto=1"
START=$(date +%s)
for i in $(seq 1 90); do
  sleep 10
  T=$(( $(date +%s) - START ))
  if [ $((i % 2)) -eq 1 ]; then xcrun simctl io "$UDID" screenshot "$OUT/shot-$(printf %04d $T).png" > /dev/null 2>&1; fi
  if grep -q '"done": *true' "$OUT/report.txt" 2>/dev/null; then echo "done after $T s"; break; fi
done
sleep 3
xcrun simctl io "$UDID" screenshot "$OUT/shot-final.png" > /dev/null 2>&1
kill $LOG $SRV 2> /dev/null
grep -iE 'gpu|webgl|angle|metal|crash|terminat|jetsam|memory|compil|lost|hang|timeout|watchdog|kill' "$RUNNER_TEMP/log.txt" | tail -n 600 | cut -c1-400 > "$OUT/log-filtered.txt"
tail -n 400 "$RUNNER_TEMP/log.txt" | cut -c1-400 > "$OUT/log-tail.txt"
wc -l "$RUNNER_TEMP/log.txt" "$OUT/report.txt"
exit 0
