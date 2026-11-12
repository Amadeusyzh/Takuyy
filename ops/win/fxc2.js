// Compiles the exact pixel-shader HLSL that ANGLE passed to D3DCompile in Chrome (hlsl/<name>.ps.hlsl, taken
// from the "COMPILER INPUT HLSL" section of WEBGL_debug_shaders after link) with the Windows SDK's fxc.exe and
// ANGLE's D3D11 settings: ps_5_0, entry main, /O2 (D3DCOMPILE_OPTIMIZATION_LEVEL2), ANGLE_ENABLE_LOOP_FLATTEN=1.
// Per shader: wall time (best of RUNS), instruction slots, DXBC instruction lines, loops left in the DXBC,
// temp registers. Controls for the SDF shaders: /Od, and the original with [loop] forced on every loop.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const IN = path.join(__dirname, 'hlsl');
const OUT = path.join(process.env.REPORT_DIR || path.join(__dirname, 'report'), 'fxc');
fs.mkdirSync(OUT, { recursive: true });
const RUNS = +(process.env.RUNS || 2);

function findFxc() {
  for (const r of ['C:\\Program Files (x86)\\Windows Kits\\10\\bin', 'C:\\Program Files\\Windows Kits\\10\\bin']) {
    if (!fs.existsSync(r)) continue;
    const vers = fs.readdirSync(r).filter((d) => /^10\./.test(d)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse();
    for (const v of vers) { const p = path.join(r, v, 'x64', 'fxc.exe'); if (fs.existsSync(p)) return p; }
  }
  return null;
}

function compile(exe, file, flags, tag, runs) {
  const base = path.join(OUT, path.basename(file).replace(/\.ps\.hlsl$/, '') + '.' + tag);
  let best = null, last = null;
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    last = spawnSync(exe, ['/nologo', '/T', 'ps_5_0', '/E', 'main', ...flags, '/D', 'ANGLE_ENABLE_LOOP_FLATTEN=1', '/Fc', base + '.asm', file],
      { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (best === null || ms < best) best = ms;
    if (last.status !== 0) break;
  }
  const rec = { tag, flags: flags.join(' '), ok: last.status === 0, ms: Math.round(best) };
  const msgs = ((last.stderr || '') + (last.stdout || '')).split(/\r?\n/).filter((l) => /error|warning/i.test(l));
  if (!rec.ok) rec.err = msgs.slice(0, 6).join(' | ').slice(0, 900);
  else {
    if (msgs.length) rec.warnings = msgs.slice(0, 6).map((l) => l.replace(/^.*?\): /, '')).join(' | ').slice(0, 700);
    const a = fs.readFileSync(base + '.asm', 'utf8');
    const m = a.match(/Approximately (\d+) instruction slots used/);
    rec.slots = m ? +m[1] : null;
    const lines = a.split(/\r?\n/);
    rec.dxbcInstr = lines.filter((l) => /^\s*[a-z][a-z0-9_]*(\s|$)/.test(l) && !/^\s*(dcl_|ps_\d)/.test(l)).length;
    rec.dxbcLoops = lines.filter((l) => /^\s*loop\s*$/.test(l)).length;
    rec.dxbcTemps = +((a.match(/dcl_temps (\d+)/) || [])[1] || 0);
    rec.asmKB = Math.round(a.length / 1024);
  }
  return rec;
}

const exe = findFxc();
const res = { fxc: exe, runs: RUNS, shaders: [] };
if (!exe) { console.log('fxc.exe not found'); process.exit(0); }
console.log('fxc:', exe);
const files = fs.readdirSync(IN).filter((f) => f.endsWith('.ps.hlsl'))
  .sort((a, b) => (b.startsWith('sdf-') - a.startsWith('sdf-')) || a.localeCompare(b));
for (const f of files) {
  const name = f.replace('.ps.hlsl', '');
  const file = path.join(IN, f);
  const src = fs.readFileSync(file, 'utf8');
  const rec = { name, hlslKB: Math.round(src.length / 1024), hlslLoops: (src.match(/\bfor\s*\(/g) || []).length, runs: [] };
  rec.runs.push(compile(exe, file, ['/O2'], 'O2', RUNS));
  if (name.startsWith('sdf-')) rec.runs.push(compile(exe, file, ['/Od'], 'Od', 1));
  if (name === 'sdf-orig' || name === 'sdf-merged') {
    const forced = path.join(OUT, name + '-forceloop.ps.hlsl');
    fs.writeFileSync(forced, src.replace(/\{\s*(LOOP\s*)?for\s*\(/g, '{[loop] for('));
    rec.runs.push(compile(exe, forced, ['/O2'], 'O2-forceloop', RUNS));
  }
  console.log(JSON.stringify(rec));
  res.shaders.push(rec);
  fs.writeFileSync(path.join(OUT, 'fxc.json'), JSON.stringify(res, null, 1));
}
