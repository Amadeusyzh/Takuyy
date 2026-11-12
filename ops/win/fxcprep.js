// Extracts the HLSL that ANGLE passed to FXC (the "COMPILER INPUT HLSL" section of the translated shader that
// variants/hlsldump.js puts into the stats line) from results.json and writes <dir>/sdf-ps.hlsl.
// Usage: node fxcprep.js <results.json> <out dir>
const fs = require('fs'), path = require('path');
const res = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const r of res) {
  const t = r.after15s || '';
  const a = t.indexOf('// COMPILER INPUT HLSL BEGIN'), b = t.indexOf('// COMPILER INPUT HLSL END');
  if (a < 0 || b < 0) continue;
  const src = t.slice(a + '// COMPILER INPUT HLSL BEGIN'.length, b);
  fs.writeFileSync(path.join(process.argv[3], 'sdf-ps.hlsl'), src);
  console.log('wrote sdf-ps.hlsl', src.length, 'chars');
  break;
}
