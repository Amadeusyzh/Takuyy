#!/usr/bin/env node
// Writes a small synthetic 3D Gaussian Splatting scene as a standard binary
// little-endian .ply (same fields as the reference 3DGS trainer: x, y, z,
// nx, ny, nz, f_dc_0..2, f_rest_0..44, opacity, scale_0..2, rot_0..3), for
// testing the .ply import of the Gaussian World demo.
//
//   node bin/make_test_ply.js out.ply [count]
//
// The scene (a striped sphere on a checkered disc, plus a ring of small
// elongated Gaussians) is stored y-down like COLMAP-based captures.
"use strict";
var fs = require("fs");

var out = process.argv[2];
var count = +(process.argv[3] || 30000);
if (!out) {
  console.error("usage: node bin/make_test_ply.js out.ply [count]");
  process.exit(1);
}

var C0 = 0.28209479177387814;
var REST = 45;
var props = ["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2"];
for (var r = 0; r < REST; r++) props.push("f_rest_" + r);
props.push("opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3");
var header = "ply\nformat binary_little_endian 1.0\nelement vertex " + count + "\n" +
  props.map(function (p) { return "property float " + p + "\n"; }).join("") + "end_header\n";

var seed = 12345;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function logit(p) { return Math.log(p / (1 - p)); }
function dc(c) { return (c - 0.5) / C0; }
// quaternion (w, x, y, z) rotating +x onto direction d
function quatFromX(d) {
  var w = 1 + d[0], x = 0, y = -d[2], z = d[1];
  var l = Math.hypot(w, x, y, z);
  if (l < 1e-6) return [0, 0, 1, 0];
  return [w / l, x / l, y / l, z / l];
}

var stride = props.length * 4;
var buf = Buffer.alloc(header.length + count * stride);
buf.write(header, 0, "latin1");
var off = header.length;
for (var i = 0; i < count; i++) {
  var u = i / count, p, col, sc, q;
  if (u < 0.5) { // sphere of radius 1 centred 1 above the ground, striped
    var z = rnd() * 2 - 1, a = rnd() * 6.2832, s = Math.sqrt(1 - z * z);
    var n = [s * Math.cos(a), z, s * Math.sin(a)];
    p = [n[0], 1 + n[1], n[2]];
    col = Math.floor((n[1] + 1) * 4) % 2 ? [0.9, 0.25, 0.2] : [0.95, 0.9, 0.85];
    sc = [0.004, 0.05, 0.05]; // flat discs tangent to the sphere (thin along the normal)
    q = quatFromX(n);
  } else if (u < 0.85) { // checkered ground disc of radius 3
    var rr = 3 * Math.sqrt(rnd()), b = rnd() * 6.2832;
    p = [rr * Math.cos(b), 0, rr * Math.sin(b)];
    col = (Math.floor(p[0] * 2) + Math.floor(p[2] * 2)) & 1 ? [0.2, 0.45, 0.8] : [0.85, 0.85, 0.8];
    sc = [0.07, 0.003, 0.07];
    q = [1, 0, 0, 0];
  } else { // a ring of elongated Gaussians, tangent to the ring
    var c = rnd() * 6.2832;
    p = [2.2 * Math.cos(c), 2.4 + 0.1 * Math.sin(5 * c), 2.2 * Math.sin(c)];
    col = [0.3 + 0.7 * Math.abs(Math.sin(c)), 0.9, 0.3 + 0.7 * Math.abs(Math.cos(c))];
    sc = [0.12, 0.015, 0.015];
    q = quatFromX([-Math.sin(c), 0, Math.cos(c)]);
  }
  // stored y-down: rotate the whole scene 180 degrees about x
  var vals = [p[0], -p[1], -p[2], 0, 0, 0, dc(col[0]), dc(col[1]), dc(col[2])];
  for (r = 0; r < REST; r++) vals.push((rnd() - 0.5) * 0.02);
  // the same rotation applied to the quaternion: q' = (0, 1, 0, 0) * q
  var qq = [-q[1], q[0], -q[3], q[2]];
  vals.push(logit(0.92), Math.log(sc[0]), Math.log(sc[1]), Math.log(sc[2]), qq[0] * 2, qq[1] * 2, qq[2] * 2, qq[3] * 2);
  for (var k = 0; k < vals.length; k++) buf.writeFloatLE(vals[k], off + k * 4);
  off += stride;
}
fs.writeFileSync(out, buf);
console.log("wrote " + count + " Gaussians (" + (buf.length / 1048576).toFixed(1) + " MB) to " + out);
