// Path-tracer pixel shader under ANGLE's three D3DCompile configurations (default /O2, + skip validation /Vd,
// + skip optimisation /Od), and the same shader with sampleBSDF written with a single return.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const IN = path.join(__dirname, 'hlsl3');
const OUT = path.join(process.env.REPORT_DIR || path.join(__dirname, 'report'), 'fxc3');
fs.mkdirSync(OUT, { recursive: true });
function findFxc() {
  const r = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  const vers = fs.readdirSync(r).filter((d) => /^10\./.test(d)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse();
  for (const v of vers) { const p = path.join(r, v, 'x64', 'fxc.exe'); if (fs.existsSync(p)) return p; }
  return null;
}
const exe = findFxc();
const jobs = [
  ['lab-pt-0', ['/O2'], 'O2 (ANGLE default)'],
  ['lab-pt-0', ['/O2', '/Vd'], 'O2 + skip validation'],
  ['lab-pt-0', ['/O2', '/Od'], 'skip optimization'],
  ['lab-pt-0-bsdf1ret', ['/O2'], 'O2, sampleBSDF single return'],
];
const res = [];
for (const [name, flags, tag] of jobs) {
  const file = path.join(IN, name + '.ps.hlsl');
  const asm = path.join(OUT, name + '.' + flags.join('').replace(/\//g, '') + '.asm');
  let best = null, r = null;
  for (let i = 0; i < 2; i++) {
    const t0 = process.hrtime.bigint();
    r = spawnSync(exe, ['/nologo', '/T', 'ps_5_0', '/E', 'main', ...flags, '/D', 'ANGLE_ENABLE_LOOP_FLATTEN=1', '/Fc', asm, file], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (best === null || ms < best) best = ms;
  }
  const rec = { name, tag, flags: flags.join(' '), ok: r.status === 0, ms: Math.round(best) };
  const msgs = ((r.stderr || '') + (r.stdout || '')).split(/\r?\n/).filter((l) => /error|warning/i.test(l)).map((l) => l.replace(/^.*?\): /, ''));
  if (msgs.length) rec.msgs = msgs.slice(0, 5).join(' | ').slice(0, 600);
  if (rec.ok && fs.existsSync(asm)) { const a = fs.readFileSync(asm, 'utf8'); const m = a.match(/Approximately (\d+) instruction slots used/); rec.slots = m ? +m[1] : null; rec.loops = a.split(/\r?\n/).filter((l) => /^\s*loop\s*$/.test(l)).length; }
  console.log(JSON.stringify(rec)); res.push(rec);
  fs.writeFileSync(path.join(OUT, 'fxc3.json'), JSON.stringify(res, null, 1));
}
