// Compiles the pixel shaders that ANGLE translated (report/compile/hlsl/<name>.translated.ps.hlsl, from
// WEBGL_debug_shaders) with the Windows SDK's fxc.exe, the way ANGLE's D3D11 backend calls D3DCompile:
// profile ps_5_0, entry main, optimisation level 2, macro ANGLE_ENABLE_LOOP_FLATTEN=1. The link-time stubs
// (@@ PIXEL OUTPUT @@, @@ PIXEL MAIN PARAMETERS @@, @@ MAIN PROLOGUE @@) are filled as ANGLE's DynamicHLSL
// does. Records wall time (best of RUNS), the instruction slots FXC reports, and how many loops survive in
// the DXBC (loop/endloop) versus the HLSL source. Extra runs: /Od for the SDF shaders, and the original SDF
// shader with [loop] forced on every loop (FXC may not unroll it).
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const REP = path.join(process.env.REPORT_DIR || path.join(__dirname, 'report'), 'compile');
const HL = path.join(REP, 'hlsl');
const RUNS = +(process.env.RUNS || 2);

function findFxc() {
  const roots = ['C:\\Program Files (x86)\\Windows Kits\\10\\bin', 'C:\\Program Files\\Windows Kits\\10\\bin'];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const vers = fs.readdirSync(r).filter((d) => /^10\./.test(d)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse();
    for (const v of vers) { const p = path.join(r, v, 'x64', 'fxc.exe'); if (fs.existsSync(p)) return p; }
    const p = path.join(r, 'x64', 'fxc.exe'); if (fs.existsSync(p)) return p;
  }
  const w = spawnSync('where', ['fxc.exe'], { encoding: 'utf8' });
  return w.status === 0 ? w.stdout.split(/\r?\n/)[0].trim() : null;
}

// GLSL inputs of the fragment shader (name, component count) from the original source
function glslInputs(glsl) {
  const out = [];
  const re = /^\s*(?:(?:flat|smooth|centroid|highp|mediump|lowp)\s+)*(?:in|varying)\s+(?:(?:highp|mediump|lowp)\s+)?(float|vec2|vec3|vec4|int|ivec2|ivec3|ivec4|uint|uvec2|uvec3|uvec4)\s+(\w+)\s*;/mg;
  let m;
  while ((m = re.exec(glsl))) out.push({ type: m[1], name: m[2], n: /4/.test(m[1]) ? 4 : /3/.test(m[1]) ? 3 : /2/.test(m[1]) ? 2 : 1, int: /^[iu]/.test(m[1]) });
  return out;
}

function wrap(hlsl, glsl) {
  const ins = glslInputs(glsl);
  const swz = ['.x', '.xy', '.xyz', ''];
  let psIn = 'struct PS_INPUT\n{\n    float4 dx_Position : SV_Position;\n    float4 gl_Position : TEXCOORD0;\n';
  let prologue = '';
  ins.forEach((v, i) => {
    const t = v.int ? 'nointerpolation int4' : 'float4';
    psIn += `    ${t} v${i} : TEXCOORD${i + 1};\n`;
    if (new RegExp('static\\s+\\w+\\s+_' + v.name + '\\b').test(hlsl)) prologue += `    _${v.name} = input.v${i}${swz[v.n - 1]};\n`;
  });
  const fragCoord = /static float4 gl_FragCoord\b/.test(hlsl);
  if (fragCoord) {
    psIn += `    float4 gl_FragCoord : TEXCOORD${ins.length + 1};\n`;
    prologue += '    float rhw = 1.0 / input.gl_FragCoord.w;\n';
    prologue += /dx_FragCoordOffset/.test(hlsl)
      ? '    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;\n    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;\n'
      : '    gl_FragCoord.x = input.dx_Position.x;\n    gl_FragCoord.y = input.dx_Position.y;\n';
    prologue += '    gl_FragCoord.z = input.dx_Position.z;\n    gl_FragCoord.w = rhw;\n';
  }
  if (/static float2 gl_PointCoord\b/.test(hlsl)) {
    psIn += `    float2 gl_PointCoord : TEXCOORD${ins.length + 2};\n`;
    prologue += '    gl_PointCoord.x = input.gl_PointCoord.x;\n    gl_PointCoord.y = 1.0 - input.gl_PointCoord.y;\n';
  }
  let params = 'PS_INPUT input';
  if (/static bool gl_FrontFacing\b/.test(hlsl)) { params += ', bool isFrontFace : SV_IsFrontFace'; prologue += '    gl_FrontFacing = isFrontFace;\n'; }
  psIn += '};\n\n';
  // outputs: ESSL 3 "static float4 out_<name>" (or arrays), ESSL 1 "static float4 gl_Color[n]"
  const outs = [];
  let m; const reo = /static\s+(float4|int4|uint4)\s+out_(\w+)(\[\d+\])?\s*=/g;
  while ((m = reo.exec(hlsl))) outs.push({ type: m[1], field: 'out_' + m[2], src: 'out_' + m[2] + (m[3] ? '[0]' : '') });
  if (!outs.length && /static float4 gl_Color\[/.test(hlsl)) outs.push({ type: 'float4', field: 'gl_Color0', src: 'gl_Color[0]' });
  let decl = 'struct PS_OUTPUT\n{\n';
  outs.forEach((o, i) => { decl += `    ${o.type} ${o.field} : SV_TARGET${i};\n`; });
  if (!outs.length) decl += '    float4 unused : SV_TARGET0;\n';
  decl += '};\n\nPS_OUTPUT generateOutput()\n{\n    PS_OUTPUT output;\n';
  outs.forEach((o) => { decl += `    output.${o.field} = ${o.src};\n`; });
  if (!outs.length) decl += '    output.unused = float4(0, 0, 0, 1);\n';
  decl += '    return output;\n}\n';
  let s = hlsl.split('@@ PIXEL OUTPUT @@').join(decl);
  s = s.split('@@ PIXEL MAIN PARAMETERS @@').join(params);
  s = s.split('@@ MAIN PROLOGUE @@').join(prologue);
  return psIn + s;
}

function countHLSLLoops(h) { return (h.match(/\bfor\s*\(/g) || []).length + (h.match(/\bwhile\s*\(/g) || []).length; }

function fxc(exe, file, flags, tag, runs) {
  const asm = file.replace(/\.hlsl$/, '') + '.' + tag + '.asm';
  let best = null, last = null;
  for (let i = 0; i < (runs || RUNS); i++) {
    const t0 = process.hrtime.bigint();
    const r = spawnSync(exe, ['/nologo', '/T', 'ps_5_0', '/E', 'main', ...flags, '/D', 'ANGLE_ENABLE_LOOP_FLATTEN=1', '/Fc', asm, file], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    last = r;
    if (best === null || ms < best) best = ms;
    if (r.status !== 0) break;
  }
  const rec = { tag, flags: flags.join(' '), ok: last.status === 0, ms: Math.round(best) };
  if (!rec.ok) rec.err = ((last.stderr || '') + (last.stdout || '')).split(/\r?\n/).filter((l) => /error|warning/i.test(l)).slice(0, 6).join(' | ').slice(0, 900);
  else {
    const w = ((last.stderr || '') + (last.stdout || '')).split(/\r?\n/).filter((l) => /warning/i.test(l));
    if (w.length) rec.warnings = w.slice(0, 4).join(' | ').slice(0, 600);
    try {
      const a = fs.readFileSync(asm, 'utf8');
      const slots = a.match(/Approximately (\d+) instruction slots used/);
      rec.slots = slots ? +slots[1] : null;
      const lines = a.split(/\r?\n/).filter((l) => /^\s*[a-z_]+[\s(]/.test(l) && !/^\s*(dcl_|\/\/|ps_5)/.test(l));
      rec.dxbcInstr = lines.length;
      rec.dxbcLoops = a.split(/\r?\n/).filter((l) => /^\s*loop\s*$/.test(l)).length;
      rec.dxbcTemps = (a.match(/dcl_temps (\d+)/) || [])[1];
      rec.asmKB = Math.round(a.length / 1024);
    } catch (e) { rec.asmError = String(e).slice(0, 200); }
  }
  return rec;
}

const exe = findFxc();
const results = { fxc: exe, runs: RUNS, shaders: [] };
if (!exe) { console.log('fxc.exe not found'); fs.writeFileSync(path.join(REP, 'fxc.json'), JSON.stringify(results, null, 1)); process.exit(0); }
console.log('fxc:', exe);
const files = fs.readdirSync(HL).filter((f) => f.endsWith('.translated.ps.hlsl')).sort((a, b) => (a.startsWith('sdf') ? -1 : 0) - (b.startsWith('sdf') ? -1 : 0) || a.localeCompare(b));
for (const f of files) {
  const name = f.replace('.translated.ps.hlsl', '');
  const glslPath = path.join(__dirname, 'shaders', name + '.frag');
  const glsl = fs.existsSync(glslPath) ? fs.readFileSync(glslPath, 'utf8') : '';
  const src = fs.readFileSync(path.join(HL, f), 'utf8');
  const fin = path.join(HL, name + '.final.ps.hlsl');
  const wrapped = wrap(src, glsl);
  fs.writeFileSync(fin, wrapped);
  const rec = { name, hlslKB: Math.round(wrapped.length / 1024), hlslLoops: countHLSLLoops(src), hlslFunctions: (src.match(/^\w[\w\s]*\s\w+\(.*\)\s*$/mg) || []).length, runs: [] };
  rec.runs.push(fxc(exe, fin, ['/O2'], 'O2'));
  if (name.startsWith('sdf-')) rec.runs.push(fxc(exe, fin, ['/Od'], 'Od', 1));
  if (name === 'sdf-orig') {
    // control: the same HLSL with every loop marked [loop] (FXC must keep them as loops)
    const forced = path.join(HL, 'sdf-orig-forceloop.final.ps.hlsl');
    fs.writeFileSync(forced, wrapped.replace(/\{\s*for\s*\(/g, '{[loop] for(').replace(/\{LOOP for\(/g, '{[loop] for('));
    rec.runs.push(Object.assign(fxc(exe, forced, ['/O2'], 'O2-forceloop'), { file: 'sdf-orig-forceloop' }));
  }
  console.log(JSON.stringify(rec));
  results.shaders.push(rec);
  fs.writeFileSync(path.join(REP, 'fxc.json'), JSON.stringify(results, null, 1));
}
