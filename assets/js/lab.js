// Interactive lab on the about page: XPBD cloth simulation and eye-tracked foveated
// rendering. Plain WebGL 1, no dependencies.
(function () {
  "use strict";

  var root = document.getElementById("lab");
  if (!root || !window.WebGLRenderingContext) return;

  // ---------------------------------------------------------------- tabs
  var tabs = root.querySelectorAll('[role="tab"]');
  Array.prototype.forEach.call(tabs, function (tab) {
    tab.addEventListener("click", function () {
      Array.prototype.forEach.call(tabs, function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    });
  });

  // ------------------------------------------------------------- helpers
  function fmt(tpl, vals) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) {
      return vals[k];
    });
  }

  function fail(panel) {
    panel.querySelector(".lab-stage").textContent = root.dataset.nogl;
    panel.querySelector(".lab-controls").style.display = "none";
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  // Links a program and collects its attribute / uniform locations.
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var out = { p: p, a: {}, u: {} };
    var i, info;
    for (i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) {
      info = gl.getActiveAttrib(p, i);
      out.a[info.name] = gl.getAttribLocation(p, info.name);
    }
    for (i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      info = gl.getActiveUniform(p, i);
      out.u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
    }
    return out;
  }

  function buffer(gl, target, data, usage) {
    var b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    return b;
  }

  function attrib(gl, loc, buf, size) {
    if (loc === undefined || loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  // Runs step(dt) on animation frames while the canvas is on screen.
  function animate(canvas, step) {
    var visible = false;
    var raf = 0;
    var prev = 0;
    function tick(now) {
      raf = 0;
      var dt = prev ? Math.min((now - prev) / 1000, 1 / 20) : 1 / 60;
      prev = now;
      step(dt, now);
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
      else prev = 0;
    }
    function kick() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        kick();
      }).observe(canvas);
    } else {
      visible = true;
      kick();
    }
    document.addEventListener("visibilitychange", kick);
  }

  function fitCanvas(canvas, scale) {
    var w = Math.max(1, Math.round(canvas.clientWidth * scale));
    var h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  function cssColor(name) {
    var probe = document.createElement("span");
    probe.style.color = "var(" + name + ")";
    probe.style.display = "none";
    document.body.appendChild(probe);
    var m = getComputedStyle(probe).color.match(/[\d.]+/g) || [128, 128, 128];
    document.body.removeChild(probe);
    return [m[0] / 255, m[1] / 255, m[2] / 255];
  }

  function bindToggles(panel, state, onChange) {
    Array.prototype.forEach.call(panel.querySelectorAll("[data-toggle]"), function (b) {
      var key = b.dataset.toggle;
      b.setAttribute("aria-pressed", state[key] ? "true" : "false");
      b.addEventListener("click", function () {
        state[key] = !state[key];
        b.setAttribute("aria-pressed", state[key] ? "true" : "false");
        if (onChange) onChange(key);
      });
    });
  }

  // small vec3 / mat4 helpers (column-major matrices, like GLSL)
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) {
    var l = Math.sqrt(dot(a, a)) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, target, up) {
    var z = norm(sub(eye, target));
    var x = norm(cross(up, z));
    var y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++)
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    return o;
  }

  // =====================================================================
  // 1. Cloth: Extended Position-Based Dynamics with small substeps
  //    (Macklin et al. 2016, "XPBD"; Macklin et al. 2019, "Small Steps")
  // =====================================================================
  function initCloth(panel) {
    var canvas = panel.querySelector("canvas");
    canvas.style.touchAction = "none";
    var gl = canvas.getContext("webgl", { antialias: true, stencil: true, alpha: false });
    if (!gl) return fail(panel);

    var NX = 40;
    var NY = 40;
    var N = NX * NY;
    var SIZE = 2.0;
    var TOP = 1.15;
    var GROUND = -1.0;
    var SUBSTEPS = 15;
    var TEAR = 1.9; // break a constraint when stretched beyond 190 %
    var BALL_R = 0.36;
    var THICK = 0.015;

    var pos = new Float32Array(N * 3);
    var prev = new Float32Array(N * 3);
    var vel = new Float32Array(N * 3);
    var inv = new Float32Array(N); // inverse mass
    var pinned = new Uint8Array(N);
    var nrm = new Float32Array(N * 3);
    var wind = new Float32Array(N * 3);
    var uvs = new Float32Array(N * 2);
    var screen = new Float32Array(N * 2);
    for (var k0 = 0; k0 < N; k0++) {
      uvs[k0 * 2] = (k0 % NX) / (NX - 1);
      uvs[k0 * 2 + 1] = Math.floor(k0 / NX) / (NY - 1);
    }

    // --- constraints: 0 = stretch, 1 = shear, 2 = bending
    var cA = [], cB = [], cType = [], cL1 = [], cL2 = [];
    function addC(a, b, type, l1, l2) {
      cA.push(a);
      cB.push(b);
      cType.push(type);
      cL1.push(l1 === undefined ? -1 : l1);
      cL2.push(l2 === undefined ? -1 : l2);
      return cA.length - 1;
    }
    function id(i, j) { return j * NX + i; }
    var hE = [], vE = [], dE = [];
    var i, j;
    for (j = 0; j < NY; j++) for (i = 0; i < NX - 1; i++) hE[j * NX + i] = addC(id(i, j), id(i + 1, j), 0);
    for (j = 0; j < NY - 1; j++) for (i = 0; i < NX; i++) vE[j * NX + i] = addC(id(i, j), id(i, j + 1), 0);
    for (j = 0; j < NY - 1; j++)
      for (i = 0; i < NX - 1; i++) {
        dE[j * NX + i] = addC(id(i + 1, j), id(i, j + 1), 1);
        addC(id(i, j), id(i + 1, j + 1), 1);
      }
    for (j = 0; j < NY; j++) for (i = 0; i < NX - 2; i++) addC(id(i, j), id(i + 2, j), 2, hE[j * NX + i], hE[j * NX + i + 1]);
    for (j = 0; j < NY - 2; j++) for (i = 0; i < NX; i++) addC(id(i, j), id(i, j + 2), 2, vE[j * NX + i], vE[(j + 1) * NX + i]);
    var C = cA.length;
    cA = Int32Array.from(cA);
    cB = Int32Array.from(cB);
    cType = Uint8Array.from(cType);
    cL1 = Int32Array.from(cL1);
    cL2 = Int32Array.from(cL2);
    var rest = new Float32Array(C);
    var alive = new Uint8Array(C);

    // --- triangles, each remembering the three edges that hold it together
    var tri = [], triE = [];
    for (j = 0; j < NY - 1; j++)
      for (i = 0; i < NX - 1; i++) {
        var a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1);
        tri.push(a, c, b);
        triE.push(vE[j * NX + i], dE[j * NX + i], hE[j * NX + i]);
        tri.push(b, c, d);
        triE.push(vE[j * NX + i + 1], hE[(j + 1) * NX + i], dE[j * NX + i]);
      }
    var T = tri.length / 3;
    var indices = new Uint16Array(tri.length);
    var indexCount = 0;
    var topologyDirty = true;

    function reset() {
      for (var j = 0; j < NY; j++)
        for (var i = 0; i < NX; i++) {
          var k = id(i, j);
          pos[k * 3] = (i / (NX - 1) - 0.5) * SIZE;
          pos[k * 3 + 1] = TOP - (j / (NY - 1)) * SIZE;
          pos[k * 3 + 2] = 0.03 * Math.sin(i * 0.9) * (j / NY);
          vel[k * 3] = vel[k * 3 + 1] = vel[k * 3 + 2] = 0;
          pinned[k] = j === 0 && i % 3 === 0 ? 1 : 0;
          inv[k] = pinned[k] ? 0 : 1;
        }
      for (var c = 0; c < C; c++) {
        var a = cA[c] * 3, b = cB[c] * 3;
        rest[c] = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], 0);
        alive[c] = 1;
      }
      topologyDirty = true;
      grabbed = -1;
    }

    var state = { wind: true, ball: true, tear: true, tool: "grab", stiffness: 0.85, time: 0 };
    var grabbed = -1;
    var grabTarget = [0, 0, 0];
    var ball = [0, 0, 0];
    var alphaT = [0, 0, 0];

    function updateCompliance(sdt) {
      // XPBD compliance alpha (inverse stiffness), divided by dt^2 as in the paper
      var s = state.stiffness;
      var stretch = Math.pow(10, -4.5 - 4 * s);
      alphaT[0] = stretch / (sdt * sdt);
      alphaT[1] = (stretch * 4) / (sdt * sdt);
      alphaT[2] = Math.pow(10, -5.2 - 1.5 * s) / (sdt * sdt);
    }

    function computeNormals() {
      nrm.fill(0);
      for (var t = 0; t < T; t++) {
        if (!alive[triE[t * 3]] || !alive[triE[t * 3 + 1]] || !alive[triE[t * 3 + 2]]) continue;
        var a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
        var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        var vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (var k = 0; k < 3; k++) {
          var p = tri[t * 3 + k] * 3;
          nrm[p] += nx;
          nrm[p + 1] += ny;
          nrm[p + 2] += nz;
        }
      }
      for (var q = 0; q < N * 3; q += 3) {
        var l = Math.hypot(nrm[q], nrm[q + 1], nrm[q + 2]) || 1;
        nrm[q] /= l;
        nrm[q + 1] /= l;
        nrm[q + 2] /= l;
      }
    }

    function rebuildIndices() {
      indexCount = 0;
      for (var t = 0; t < T; t++) {
        if (!alive[triE[t * 3]] || !alive[triE[t * 3 + 1]] || !alive[triE[t * 3 + 2]]) continue;
        indices[indexCount++] = tri[t * 3];
        indices[indexCount++] = tri[t * 3 + 1];
        indices[indexCount++] = tri[t * 3 + 2];
      }
      topologyDirty = false;
    }

    function simulate(dt) {
      var sdt = dt / SUBSTEPS;
      updateCompliance(sdt);
      var t = state.time;
      ball[0] = 0.35 * Math.sin(t * 0.55);
      ball[1] = -0.2 + 0.1 * Math.sin(t * 0.8);
      ball[2] = 0.85 * Math.sin(t * 0.9);

      // aerodynamic-ish wind: push along the normal, scaled by how much the
      // surface faces the gust, with a travelling ripple for some life
      var wx = 0.35, wz = 1.0;
      var gust = state.wind ? 2.2 * (0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 1.9 + 1.0)) : 0;
      for (var k = 0; k < N; k++) {
        var p = k * 3;
        var ripple = 0.75 + 0.25 * Math.sin(pos[p] * 3.0 + pos[p + 1] * 2.0 + t * 3.0);
        var f = (nrm[p] * wx + nrm[p + 2] * wz) * gust * ripple;
        wind[p] = nrm[p] * f;
        wind[p + 1] = nrm[p + 1] * f;
        wind[p + 2] = nrm[p + 2] * f;
      }

      var torn = false;
      var rr = BALL_R + THICK;
      for (var s = 0; s < SUBSTEPS; s++) {
        for (k = 0; k < N; k++) {
          if (inv[k] === 0 || k === grabbed) continue;
          p = k * 3;
          vel[p] += wind[p] * sdt;
          vel[p + 1] += (wind[p + 1] - 9.81) * sdt;
          vel[p + 2] += wind[p + 2] * sdt;
          prev[p] = pos[p];
          prev[p + 1] = pos[p + 1];
          prev[p + 2] = pos[p + 2];
          pos[p] += vel[p] * sdt;
          pos[p + 1] += vel[p + 1] * sdt;
          pos[p + 2] += vel[p + 2] * sdt;
        }
        if (grabbed >= 0) {
          p = grabbed * 3;
          prev[p] = pos[p];
          prev[p + 1] = pos[p + 1];
          prev[p + 2] = pos[p + 2];
          pos[p] += (grabTarget[0] - pos[p]) * 0.35;
          pos[p + 1] += (grabTarget[1] - pos[p + 1]) * 0.35;
          pos[p + 2] += (grabTarget[2] - pos[p + 2]) * 0.35;
        }

        for (var c = 0; c < C; c++) {
          if (!alive[c]) continue;
          var type = cType[c];
          if (type === 2 && (!alive[cL1[c]] || !alive[cL2[c]])) {
            alive[c] = 0;
            continue;
          }
          var a = cA[c], b = cB[c];
          var wa = inv[a], wb = inv[b];
          if (a === grabbed) wa = 0;
          if (b === grabbed) wb = 0;
          var wsum = wa + wb;
          if (wsum === 0 && !(state.tear && type < 2)) continue;
          var ia = a * 3, ib = b * 3;
          var dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2];
          var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (len < 1e-9) continue;
          if (state.tear && type < 2 && len > rest[c] * TEAR) {
            alive[c] = 0;
            torn = true;
            continue;
          }
          if (wsum === 0) continue;
          var corr = (len - rest[c]) / ((wsum + alphaT[type]) * len);
          pos[ia] += wa * corr * dx;
          pos[ia + 1] += wa * corr * dy;
          pos[ia + 2] += wa * corr * dz;
          pos[ib] -= wb * corr * dx;
          pos[ib + 1] -= wb * corr * dy;
          pos[ib + 2] -= wb * corr * dz;
        }

        for (k = 0; k < N; k++) {
          if (inv[k] === 0 || k === grabbed) continue;
          p = k * 3;
          var contact = false;
          if (state.ball) {
            var bx = pos[p] - ball[0], by = pos[p + 1] - ball[1], bz = pos[p + 2] - ball[2];
            var bd = Math.sqrt(bx * bx + by * by + bz * bz);
            if (bd < rr && bd > 1e-9) {
              pos[p] = ball[0] + (bx / bd) * rr;
              pos[p + 1] = ball[1] + (by / bd) * rr;
              pos[p + 2] = ball[2] + (bz / bd) * rr;
              contact = true;
            }
          }
          if (pos[p + 1] < GROUND + THICK) {
            pos[p + 1] = GROUND + THICK;
            contact = true;
          }
          var damp = contact ? 0.9 : 0.9995;
          vel[p] = ((pos[p] - prev[p]) / sdt) * damp;
          vel[p + 1] = (pos[p + 1] - prev[p + 1]) / sdt * (contact ? 0.5 : 0.9995);
          vel[p + 2] = ((pos[p + 2] - prev[p + 2]) / sdt) * damp;
        }
        if (grabbed >= 0) {
          p = grabbed * 3;
          vel[p] = (pos[p] - prev[p]) / sdt;
          vel[p + 1] = (pos[p + 1] - prev[p + 1]) / sdt;
          vel[p + 2] = (pos[p + 2] - prev[p + 2]) / sdt;
        }
      }
      if (torn) topologyDirty = true;
    }

    // ------------------------------------------------------------ rendering
    var clothProg, objProg, groundProg;
    try {
      clothProg = program(
        gl,
        [
          "attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUv;",
          "uniform mat4 uVP; uniform float uShadow; uniform vec3 uLight; uniform float uGround;",
          "varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;",
          "void main() {",
          "  vec3 p = aPos;",
          "  if (uShadow > 0.5) { p.xz -= uLight.xz * (p.y - uGround) / uLight.y; p.y = uGround + 0.003; }",
          "  vPos = p; vNrm = aNrm; vUv = aUv;",
          "  gl_Position = uVP * vec4(p, 1.0);",
          "}",
        ].join("\n"),
        [
          "precision highp float;",
          "varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;",
          "uniform vec3 uEye; uniform vec3 uLight; uniform vec3 uFront; uniform vec3 uBack; uniform float uShadow;",
          "void main() {",
          "  if (uShadow > 0.5) { float f = 1.0 - smoothstep(1.0, 3.5, length(vPos.xz)); gl_FragColor = vec4(0.0, 0.0, 0.0, 0.55 * f); return; }",
          "  vec3 n = normalize(vNrm);",
          "  vec3 v = normalize(uEye - vPos);",
          "  if (dot(n, v) < 0.0) n = -n;",
          "  vec3 base = gl_FrontFacing ? uFront : uBack;",
          // tartan: wide bands, thin pinstripes, and a fine twill weave
          "  vec2 g = vUv * 6.0;",
          "  vec2 f = abs(fract(g) - 0.5);",
          "  float band = max(1.0 - smoothstep(0.08, 0.1, f.x), 1.0 - smoothstep(0.08, 0.1, f.y));",
          "  vec2 f2 = abs(fract(g * 2.0 + 0.5) - 0.5);",
          "  float pin = max(1.0 - smoothstep(0.015, 0.03, f2.x), 1.0 - smoothstep(0.015, 0.03, f2.y));",
          "  float twill = 0.93 + 0.07 * sin((vUv.x + vUv.y) * 140.0);",
          "  base = mix(base, base * 0.45, band * 0.7);",
          "  base = mix(base, vec3(0.95, 0.85, 0.55), pin * 0.75);",
          "  base *= twill;",
          "  float ndl = dot(n, uLight);",
          "  float wrap = max((ndl + 0.35) / 1.35, 0.0);",
          "  vec3 h = normalize(uLight + v);",
          "  float spec = pow(max(dot(n, h), 0.0), 32.0) * 0.18;",
          "  float sheen = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.45;",
          "  float sky = 0.5 + 0.5 * n.y;",
          "  vec3 col = base * (0.18 + 0.22 * sky + 0.95 * wrap) + spec + sheen * mix(base, vec3(1.0), 0.6);",
          "  gl_FragColor = vec4(col, 1.0);",
          "}",
        ].join("\n")
      );
      objProg = program(
        gl,
        [
          "attribute vec3 aPos;",
          "uniform mat4 uVP; uniform vec3 uCenter; uniform vec3 uScale; uniform float uShadow; uniform vec3 uLight; uniform float uGround;",
          "varying vec3 vPos; varying vec3 vNrm;",
          "void main() {",
          "  vec3 p = uCenter + aPos * uScale;",
          "  vNrm = normalize(aPos / uScale);",
          "  if (uShadow > 0.5) { p.xz -= uLight.xz * (p.y - uGround) / uLight.y; p.y = uGround + 0.003; }",
          "  vPos = p;",
          "  gl_Position = uVP * vec4(p, 1.0);",
          "}",
        ].join("\n"),
        [
          "precision highp float;",
          "varying vec3 vPos; varying vec3 vNrm;",
          "uniform vec3 uEye; uniform vec3 uLight; uniform vec3 uColor; uniform float uShadow; uniform float uMetal;",
          "void main() {",
          "  if (uShadow > 0.5) { float f = 1.0 - smoothstep(1.0, 3.5, length(vPos.xz)); gl_FragColor = vec4(0.0, 0.0, 0.0, 0.55 * f); return; }",
          "  vec3 n = normalize(vNrm); vec3 v = normalize(uEye - vPos);",
          "  vec3 r = reflect(-v, n);",
          // fake studio environment: soft top light, dark floor, a bright key strip
          "  vec3 env = mix(vec3(0.05, 0.055, 0.07), vec3(0.75, 0.8, 0.9), smoothstep(-0.2, 0.8, r.y));",
          "  env += vec3(1.4) * smoothstep(0.92, 0.99, dot(r, uLight));",
          "  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);",
          "  float dif = max(dot(n, uLight), 0.0);",
          "  vec3 col = uColor * (0.15 + 0.85 * dif) * (1.0 - uMetal) + env * mix(fres, 1.0, uMetal) * mix(vec3(1.0), uColor, uMetal);",
          "  gl_FragColor = vec4(col, 1.0);",
          "}",
        ].join("\n")
      );
      groundProg = program(
        gl,
        [
          "attribute vec3 aPos; uniform mat4 uVP; varying vec3 vPos;",
          "void main() { vPos = aPos; gl_Position = uVP * vec4(aPos, 1.0); }",
        ].join("\n"),
        [
          "precision highp float;",
          "varying vec3 vPos; uniform vec3 uBg; uniform vec3 uAccent;",
          "void main() {",
          "  vec2 g = abs(fract(vPos.xz * 2.0) - 0.5);",
          "  float line = 1.0 - smoothstep(0.0, 0.02, min(g.x, g.y) - 0.0);",
          "  float r = length(vPos.xz);",
          "  float spot = exp(-r * r * 0.35);",
          "  vec3 col = vec3(0.11, 0.12, 0.14) * (0.35 + 0.9 * spot) + line * 0.06 * spot;",
          "  col = mix(col, uBg, smoothstep(2.5, 7.0, r));",
          "  gl_FragColor = vec4(col, 1.0);",
          "}",
        ].join("\n")
      );
    } catch (e) {
      return fail(panel);
    }

    // uv sphere for the ball, the curtain rod and the rings
    var sv = [], si = [];
    var SR = 24, SC = 16;
    for (var y = 0; y <= SC; y++)
      for (var x = 0; x <= SR; x++) {
        var th = (y / SC) * Math.PI, ph = (x / SR) * Math.PI * 2;
        sv.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      }
    for (y = 0; y < SC; y++)
      for (x = 0; x < SR; x++) {
        var q = y * (SR + 1) + x;
        si.push(q, q + SR + 1, q + 1, q + 1, q + SR + 1, q + SR + 2);
      }
    var sphereVB = buffer(gl, gl.ARRAY_BUFFER, new Float32Array(sv));
    var sphereIB = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(si));
    var groundVB = buffer(gl, gl.ARRAY_BUFFER, new Float32Array([-12, GROUND, -12, 12, GROUND, -12, -12, GROUND, 12, 12, GROUND, 12]));
    var posVB = buffer(gl, gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    var nrmVB = buffer(gl, gl.ARRAY_BUFFER, nrm, gl.DYNAMIC_DRAW);
    var uvVB = buffer(gl, gl.ARRAY_BUFFER, uvs);
    var clothIB = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

    var cam = { yaw: 0.55, pitch: 0.16, dist: 3.9, target: [0, 0.05, 0] };
    var eye, VP, basis, tanHalf = Math.tan((38 * Math.PI) / 180 / 2);
    var LIGHT = norm([0.45, 1.0, 0.55]);
    var BG = [0.055, 0.063, 0.078];
    var accent = [0.7, 0.1, 0.6];
    function readTheme() {
      accent = cssColor("--global-theme-color");
    }
    readTheme();
    new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    function updateCamera() {
      var cp = Math.cos(cam.pitch);
      eye = [
        cam.target[0] + cam.dist * cp * Math.sin(cam.yaw),
        cam.target[1] + cam.dist * Math.sin(cam.pitch),
        cam.target[2] + cam.dist * cp * Math.cos(cam.yaw),
      ];
      var view = lookAt(eye, cam.target, [0, 1, 0]);
      VP = mul(perspective((38 * Math.PI) / 180, canvas.clientWidth / canvas.clientHeight, 0.05, 50), view);
      var fwd = norm(sub(cam.target, eye));
      var right = norm(cross(fwd, [0, 1, 0]));
      basis = { fwd: fwd, right: right, up: cross(right, fwd) };
    }

    function drawSphere(prog, center, scale, color, metal) {
      gl.uniform3fv(prog.u.uCenter, center);
      gl.uniform3fv(prog.u.uScale, scale);
      if (prog.u.uColor) gl.uniform3fv(prog.u.uColor, color);
      if (prog.u.uMetal) gl.uniform1f(prog.u.uMetal, metal);
      gl.drawElements(gl.TRIANGLES, si.length, gl.UNSIGNED_SHORT, 0);
    }

    function drawObjects(shadow) {
      var u = objProg.u;
      gl.useProgram(objProg.p);
      gl.uniformMatrix4fv(u.uVP, false, VP);
      gl.uniform3fv(u.uEye, eye);
      gl.uniform3fv(u.uLight, LIGHT);
      gl.uniform1f(u.uGround, GROUND);
      gl.uniform1f(u.uShadow, shadow ? 1 : 0);
      attrib(gl, objProg.a.aPos, sphereVB, 3);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIB);
      if (state.ball) drawSphere(objProg, ball, [BALL_R, BALL_R, BALL_R], [0.85, 0.87, 0.9], 0.85);
      drawSphere(objProg, [0, TOP + 0.03, 0], [SIZE / 2 + 0.18, 0.022, 0.022], [0.8, 0.65, 0.35], 0.9);
      if (shadow) return;
      for (var k = 0; k < NX; k++) {
        if (!pinned[k]) continue;
        drawSphere(objProg, [pos[k * 3], pos[k * 3 + 1] + 0.012, pos[k * 3 + 2]], [0.03, 0.03, 0.03], [0.85, 0.7, 0.4], 0.9);
      }
    }

    function drawCloth(shadow) {
      var u = clothProg.u;
      gl.useProgram(clothProg.p);
      gl.uniformMatrix4fv(u.uVP, false, VP);
      gl.uniform3fv(u.uEye, eye);
      gl.uniform3fv(u.uLight, LIGHT);
      gl.uniform1f(u.uGround, GROUND);
      gl.uniform1f(u.uShadow, shadow ? 1 : 0);
      gl.uniform3fv(u.uFront, accent);
      gl.uniform3fv(u.uBack, [accent[0] * 0.75, accent[1] * 0.75, accent[2] * 0.75]);
      attrib(gl, clothProg.a.aPos, posVB, 3);
      attrib(gl, clothProg.a.aNrm, nrmVB, 3);
      attrib(gl, clothProg.a.aUv, uvVB, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, clothIB);
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    }

    function render() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(BG[0], BG[1], BG[2], 1);
      gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      gl.useProgram(groundProg.p);
      gl.uniformMatrix4fv(groundProg.u.uVP, false, VP);
      gl.uniform3fv(groundProg.u.uBg, BG);
      attrib(gl, groundProg.a.aPos, groundVB, 3);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (clothProg.a.aNrm >= 0) gl.disableVertexAttribArray(clothProg.a.aNrm);
      if (clothProg.a.aUv >= 0) gl.disableVertexAttribArray(clothProg.a.aUv);

      // planar shadows, stencilled so overlapping folds do not double-darken
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.EQUAL, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      gl.depthMask(false);
      drawCloth(true);
      if (clothProg.a.aNrm >= 0) gl.disableVertexAttribArray(clothProg.a.aNrm);
      if (clothProg.a.aUv >= 0) gl.disableVertexAttribArray(clothProg.a.aUv);
      drawObjects(true);
      gl.depthMask(true);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);

      drawObjects(false);
      drawCloth(false);
      if (clothProg.a.aNrm >= 0) gl.disableVertexAttribArray(clothProg.a.aNrm);
      if (clothProg.a.aUv >= 0) gl.disableVertexAttribArray(clothProg.a.aUv);
    }

    // ----------------------------------------------------------- interaction
    function rayAt(mx, my) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var nx = (mx / w) * 2 - 1, ny = 1 - (my / h) * 2;
      var a = tanHalf * (w / h);
      var d = [];
      for (var k = 0; k < 3; k++) d[k] = basis.fwd[k] + basis.right[k] * nx * a + basis.up[k] * ny * tanHalf;
      return norm(d);
    }

    function project() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      for (var k = 0; k < N; k++) {
        var x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
        var cw = VP[3] * x + VP[7] * y + VP[11] * z + VP[15];
        screen[k * 2] = ((VP[0] * x + VP[4] * y + VP[8] * z + VP[12]) / cw * 0.5 + 0.5) * w;
        screen[k * 2 + 1] = (0.5 - (VP[1] * x + VP[5] * y + VP[9] * z + VP[13]) / cw * 0.5) * h;
      }
    }

    function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
      var d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
      if (Math.abs(d) < 1e-9) return false;
      var t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
      var u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    function cutAlong(x0, y0, x1, y1) {
      project();
      var any = false;
      for (var c = 0; c < C; c++) {
        if (!alive[c] || cType[c] === 2) continue;
        var a = cA[c] * 2, b = cB[c] * 2;
        if (segHit(x0, y0, x1, y1, screen[a], screen[a + 1], screen[b], screen[b + 1])) {
          alive[c] = 0;
          any = true;
        }
      }
      if (any) topologyDirty = true;
    }

    var hint = panel.querySelector(".lab-hint");
    var drag = null;
    function local(e) {
      var r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    canvas.addEventListener("pointerdown", function (e) {
      var m = local(e);
      canvas.setPointerCapture(e.pointerId);
      hint.style.opacity = "0";
      updateCamera();
      if (state.tool === "cut") {
        drag = { mode: "cut", x: m[0], y: m[1] };
        return;
      }
      // pick the particle closest to the camera within a small radius of the ray
      var d = rayAt(m[0], m[1]);
      var best = -1, bestT = 1e9;
      for (var k = 0; k < N; k++) {
        var px = pos[k * 3] - eye[0], py = pos[k * 3 + 1] - eye[1], pz = pos[k * 3 + 2] - eye[2];
        var t = px * d[0] + py * d[1] + pz * d[2];
        var qx = px - d[0] * t, qy = py - d[1] * t, qz = pz - d[2] * t;
        if (qx * qx + qy * qy + qz * qz < 0.006 && t < bestT) {
          bestT = t;
          best = k;
        }
      }
      if (best >= 0) {
        grabbed = best;
        drag = { mode: "grab", depth: dot(sub([pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]], eye), basis.fwd) };
        grabTarget = [pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]];
        canvas.style.cursor = "grabbing";
      } else {
        drag = { mode: "orbit", x: m[0], y: m[1] };
        canvas.style.cursor = "move";
      }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var m = local(e);
      if (drag.mode === "orbit") {
        cam.yaw -= (m[0] - drag.x) * 0.008;
        cam.pitch = Math.min(1.2, Math.max(-0.05, cam.pitch + (m[1] - drag.y) * 0.006));
        drag.x = m[0];
        drag.y = m[1];
        updateCamera();
      } else if (drag.mode === "grab") {
        var d = rayAt(m[0], m[1]);
        var t = drag.depth / dot(d, basis.fwd);
        grabTarget = [eye[0] + d[0] * t, Math.max(GROUND + 0.02, eye[1] + d[1] * t), eye[2] + d[2] * t];
      } else {
        cutAlong(drag.x, drag.y, m[0], m[1]);
        drag.x = m[0];
        drag.y = m[1];
      }
    });
    function endDrag() {
      drag = null;
      grabbed = -1;
      canvas.style.cursor = state.tool === "cut" ? "crosshair" : "grab";
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.style.cursor = "grab";

    // ------------------------------------------------------------- controls
    bindToggles(panel, state);
    var tools = panel.querySelectorAll("[data-tool]");
    Array.prototype.forEach.call(tools, function (b) {
      b.addEventListener("click", function () {
        state.tool = b.dataset.tool;
        Array.prototype.forEach.call(tools, function (o) {
          o.setAttribute("aria-pressed", o === b ? "true" : "false");
        });
        canvas.style.cursor = state.tool === "cut" ? "crosshair" : "grab";
      });
    });
    panel.querySelector('[data-input="stiffness"]').addEventListener("input", function (e) {
      state.stiffness = +e.target.value;
    });
    panel.querySelector('[data-action="release"]').addEventListener("click", function () {
      for (var k = 0; k < N; k++) {
        pinned[k] = 0;
        inv[k] = 1;
      }
    });
    panel.querySelector('[data-action="reset"]').addEventListener("click", reset);

    // ----------------------------------------------------------------- loop
    var statsEl = panel.querySelector(".lab-stats");
    var statsTpl = panel.dataset.stats;
    var solveMs = 0;
    var frames = 0;
    reset();
    computeNormals();
    animate(canvas, function (dt) {
      fitCanvas(canvas, Math.min(window.devicePixelRatio || 1, 2));
      updateCamera();
      state.time += dt;
      var t0 = performance.now();
      simulate(Math.min(Math.max(dt, 1 / 240), 1 / 30));
      solveMs = solveMs * 0.9 + (performance.now() - t0) * 0.1;
      computeNormals();
      if (topologyDirty) {
        rebuildIndices();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, clothIB);
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indices.subarray(0, indexCount));
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, posVB);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, nrmVB);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, nrm);
      render();
      if (++frames % 15 === 0) {
        var live = 0;
        for (var c = 0; c < C; c++) live += alive[c];
        statsEl.textContent = fmt(statsTpl, { p: N.toLocaleString(), c: live.toLocaleString(), s: SUBSTEPS, ms: solveMs.toFixed(1) });
      }
    });
  }

  // =====================================================================
  // 2. Foveated rendering: ray-march the scene at full resolution only
  //    around the gaze, at 1/2 and 1/4 resolution further out, then blend.
  // =====================================================================
  function initFoveated(panel) {
    var canvas = panel.querySelector("canvas");
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return fail(panel);

    var FULLSCREEN_VS = "attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";
    var SCENE_FS = [
      "precision highp float;",
      "uniform vec2 uRes; uniform float uAspect; uniform float uTime;",
      "float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
      "float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }",
      "float ribInner(vec3 q) { return sdBox(q - vec3(0.0, 1.3, 0.0), vec3(1.55, 1.3, 0.4)) - 0.25; }",
      "vec2 map(vec3 p) {",
      "  vec2 r = vec2(p.y, 1.0);",
      "  float c = 3.0 - p.y; if (c < r.x) r = vec2(c, 2.0);",
      "  float w = 2.0 - abs(p.x); if (w < r.x) r = vec2(w, 3.0);",
      "  vec3 q = p; q.z = mod(q.z, 3.0) - 1.5;",
      "  float rib = max(sdBox(q - vec3(0.0, 1.5, 0.0), vec3(2.3, 1.7, 0.14)), -ribInner(q));",
      "  if (rib < r.x) r = vec2(rib, 4.0);",
      "  return r;",
      "}",
      "vec3 normalAt(vec3 p) {",
      "  vec2 e = vec2(0.002, 0.0);",
      "  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));",
      "}",
      "void main() {",
      "  vec2 uv = gl_FragCoord.xy / uRes;",
      "  vec2 s = (uv * 2.0 - 1.0) * vec2(uAspect, 1.0);",
      "  float t = uTime;",
      "  vec3 ro = vec3(0.45 * sin(t * 0.31), 1.35 + 0.04 * sin(t * 1.9), t * 1.4);",
      "  float yaw = 0.18 * sin(t * 0.23);",
      "  vec3 rd = normalize(vec3(s, 1.5));",
      "  rd.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * rd.xz;",
      "  float d = 0.0; vec2 h = vec2(1.0); float steps = 0.0;",
      "  for (int i = 0; i < 110; i++) {",
      "    h = map(ro + rd * d);",
      "    if (h.x < 0.0006 * d || d > 60.0) break;",
      "    d += h.x; steps += 1.0;",
      "  }",
      "  vec3 p = ro + rd * d;",
      "  vec3 n = normalAt(p);",
      "  vec3 col = vec3(0.0); vec3 emit = vec3(0.0);",
      "  float pulse = 0.5 + 0.5 * sin(p.z * 1.3 - t * 7.0);",
      "  if (h.y < 1.5) {",
      // floor: polished tiles with fine seams and glowing edge strips
      "    vec2 g = abs(fract(p.xz * 2.0) - 0.5);",
      "    float seam = 1.0 - smoothstep(0.46, 0.49, max(g.x, g.y));",
      "    col = vec3(0.06, 0.065, 0.08) * (0.6 + 0.4 * seam) + 0.02 * hash(floor(p.xz * 2.0));",
      "    float strip = smoothstep(1.86, 1.9, abs(p.x)) * (1.0 - smoothstep(1.94, 1.98, abs(p.x)));",
      "    emit += strip * mix(vec3(0.1, 0.8, 1.0), vec3(1.0, 0.2, 0.7), step(0.0, p.x)) * (0.6 + 1.6 * pulse);",
      "  } else if (h.y < 2.5) {",
      // ceiling: a central light strip and a fine grid
      "    vec2 g = abs(fract(p.xz * 4.0) - 0.5);",
      "    col = vec3(0.05) + 0.03 * step(0.46, max(g.x, g.y));",
      "    emit += vec3(1.0, 0.95, 0.85) * 1.2 * (1.0 - smoothstep(0.1, 0.13, abs(p.x)));",
      "  } else if (h.y < 3.5) {",
      // walls: panels covered in tiny status lights (lots of fine detail)
      "    vec2 cell = floor(vec2(p.z * 6.0, p.y * 6.0));",
      "    vec2 f = fract(vec2(p.z * 6.0, p.y * 6.0));",
      "    float seam = step(0.92, max(f.x, f.y));",
      "    col = vec3(0.05, 0.055, 0.07) - 0.03 * seam;",
      "    float r = hash(cell + step(0.0, p.x) * 17.0);",
      "    float led = step(0.86, r) * (1.0 - smoothstep(0.12, 0.2, length(f - 0.5)));",
      "    float blink = step(0.3, fract(r * 13.0 + t * (0.5 + r)));",
      "    emit += led * blink * mix(vec3(0.2, 1.0, 0.6), vec3(1.0, 0.5, 0.1), step(0.95, r)) * 2.0;",
      "    vec2 big = abs(fract(vec2(p.z * 0.5, p.y * 0.5)) - 0.5);",
      "    col *= 0.8 + 0.2 * step(0.47, max(big.x, big.y));",
      "  } else {",
      // ribs: brushed metal frames with neon edges along the opening
      "    vec3 q = p; q.z = mod(q.z, 3.0) - 1.5;",
      "    col = vec3(0.1, 0.105, 0.12) * (0.85 + 0.15 * sin(p.y * 220.0));",
      "    float edge = 1.0 - smoothstep(0.0, 0.018, abs(ribInner(q)));",
      "    emit += edge * vec3(0.3, 0.7, 1.0) * (0.6 + 1.4 * pulse);",
      "  }",
      // lights: one lamp per bay on the ceiling, plus a cool ambient
      "  vec3 lp = vec3(0.0, 2.9, floor(p.z / 3.0) * 3.0 + 1.5);",
      "  vec3 L = lp - p; float ld = dot(L, L); L *= inversesqrt(ld);",
      "  float dif = max(dot(n, L), 0.0) * 3.0 / (1.0 + ld);",
      "  float spec = pow(max(dot(reflect(rd, n), L), 0.0), 40.0) * 2.0 / (1.0 + ld);",
      "  float ao = 1.0 - steps / 110.0;",
      "  col = col * (0.12 * ao + dif) + spec * 0.3 + emit;",
      "  col = mix(vec3(0.01, 0.015, 0.03), col, exp(-0.045 * d));",
      "  col = col / (1.0 + col);",
      "  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);",
      "}",
    ].join("\n");
    var COMPOSITE_FS = [
      "precision highp float;",
      "uniform sampler2D uT0; uniform sampler2D uT1; uniform sampler2D uT2;",
      "uniform vec2 uRes; uniform vec2 uGaze; uniform float uR0; uniform float uR1; uniform float uBand;",
      "uniform float uFov; uniform float uRegions; uniform float uDpr;",
      "void main() {",
      "  vec2 uv = gl_FragCoord.xy / uRes;",
      "  float e = distance(gl_FragCoord.xy, uGaze);",
      "  vec3 col = texture2D(uT0, uv).rgb;",
      "  if (uFov > 0.5) {",
      "    float w0 = 1.0 - smoothstep(uR0 - uBand, uR0, e);",
      "    float w1 = 1.0 - smoothstep(uR1 - uBand, uR1, e);",
      "    col = mix(mix(texture2D(uT2, uv).rgb, texture2D(uT1, uv).rgb, w1), col, w0);",
      "    if (uRegions > 0.5) {",
      "      vec3 tint = e < uR0 ? vec3(0.2, 1.0, 0.45) : (e < uR1 ? vec3(1.0, 0.8, 0.15) : vec3(1.0, 0.25, 0.3));",
      "      col = mix(col, tint, 0.2);",
      "      float ring = min(abs(e - uR0), abs(e - uR1));",
      "      col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 1.5 * uDpr, ring)) * 0.7);",
      "    }",
      "  }",
      "  float ret = abs(e - 7.0 * uDpr);",
      "  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 1.2 * uDpr, ret)) * 0.9);",
      "  col = mix(col, vec3(1.0), (1.0 - smoothstep(1.0 * uDpr, 2.0 * uDpr, e)) * 0.9);",
      "  gl_FragColor = vec4(col, 1.0);",
      "}",
    ].join("\n");

    var scene, comp;
    try {
      scene = program(gl, FULLSCREEN_VS, SCENE_FS);
      comp = program(gl, FULLSCREEN_VS, COMPOSITE_FS);
    } catch (e) {
      return fail(panel);
    }
    var quad = buffer(gl, gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));

    function target(w, h) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex: tex, fbo: fbo, w: w, h: h };
    }
    var layers = [];
    function rebuildLayers() {
      layers.forEach(function (l) {
        gl.deleteTexture(l.tex);
        gl.deleteFramebuffer(l.fbo);
      });
      layers = [1, 2, 4].map(function (f) {
        return target(Math.ceil(canvas.width / f), Math.ceil(canvas.height / f));
      });
    }

    var state = { foveation: true, regions: false, radius: 0.16, playing: true, time: 0 };
    bindToggles(panel, state);
    panel.querySelector('[data-input="radius"]').addEventListener("input", function (e) {
      state.radius = +e.target.value;
    });
    var playBtn = panel.querySelector('[data-action="play"]');
    playBtn.addEventListener("click", function () {
      state.playing = !state.playing;
      playBtn.textContent = state.playing ? playBtn.dataset.play : playBtn.dataset.resume;
    });

    // gaze: follows the pointer; when idle, jumps around like saccades
    var gaze = [0.5, 0.5];
    var gazeGoal = [0.5, 0.5];
    var lastPointer = -1e9;
    var nextSaccade = 0;
    var hint = panel.querySelector(".lab-hint");
    canvas.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      gazeGoal = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
      gaze = gazeGoal.slice();
      lastPointer = performance.now();
      hint.style.opacity = "0";
    });
    canvas.addEventListener("pointerdown", function (e) {
      var r = canvas.getBoundingClientRect();
      gazeGoal = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
      lastPointer = performance.now();
    });

    var statsEl = panel.querySelector(".lab-stats");
    var statsTpl = panel.dataset.stats;
    var fps = 60;
    var frames = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function pass(layer, scissor) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.fbo);
      gl.viewport(0, 0, layer.w, layer.h);
      var area = layer.w * layer.h;
      if (scissor) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(scissor[0], scissor[1], scissor[2], scissor[3]);
        area = scissor[2] * scissor[3];
      }
      gl.uniform2f(scene.u.uRes, layer.w, layer.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
      return area;
    }

    // square around the gaze with radius r (in full-res pixels), in layer pixels
    function rectFor(layer, gx, gy, r) {
      var f = canvas.width / layer.w;
      var x0 = Math.max(0, Math.floor((gx - r) / f) - 1), y0 = Math.max(0, Math.floor((gy - r) / f) - 1);
      var x1 = Math.min(layer.w, Math.ceil((gx + r) / f) + 1), y1 = Math.min(layer.h, Math.ceil((gy + r) / f) + 1);
      return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
    }

    animate(canvas, function (dt, now) {
      if (fitCanvas(canvas, dpr) || !layers.length) rebuildLayers();
      if (state.playing) state.time += dt;

      if (now - lastPointer > 2500 && now > nextSaccade) {
        gazeGoal = [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6];
        nextSaccade = now + 500 + Math.random() * 900;
      }
      var k = Math.min(1, dt * 30);
      gaze[0] += (gazeGoal[0] - gaze[0]) * k;
      gaze[1] += (gazeGoal[1] - gaze[1]) * k;

      var W = canvas.width, H = canvas.height;
      var gx = gaze[0] * W, gy = (1 - gaze[1]) * H;
      var r0 = state.radius * H, r1 = r0 * 2.1, band = r0 * 0.35;

      gl.useProgram(scene.p);
      attrib(gl, scene.a.aPos, quad, 2);
      gl.uniform1f(scene.u.uAspect, W / H);
      gl.uniform1f(scene.u.uTime, state.time);
      var shaded;
      if (state.foveation) {
        shaded = pass(layers[2]);
        shaded += pass(layers[1], rectFor(layers[1], gx, gy, r1));
        shaded += pass(layers[0], rectFor(layers[0], gx, gy, r0));
      } else {
        shaded = pass(layers[0]);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(comp.p);
      attrib(gl, comp.a.aPos, quad, 2);
      for (var i = 0; i < 3; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, layers[i].tex);
        gl.uniform1i(comp.u["uT" + i], i);
      }
      gl.uniform2f(comp.u.uRes, W, H);
      gl.uniform2f(comp.u.uGaze, gx, gy);
      gl.uniform1f(comp.u.uR0, r0);
      gl.uniform1f(comp.u.uR1, r1);
      gl.uniform1f(comp.u.uBand, band);
      gl.uniform1f(comp.u.uFov, state.foveation ? 1 : 0);
      gl.uniform1f(comp.u.uRegions, state.regions ? 1 : 0);
      gl.uniform1f(comp.u.uDpr, dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (i = 0; i < 3; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
      if (++frames % 15 === 0) {
        var pct = (shaded / (W * H)) * 100;
        statsEl.textContent = fmt(statsTpl, { pct: pct.toFixed(0), x: (100 / pct).toFixed(1), fps: Math.round(fps) });
      }
    });
  }

  initCloth(document.getElementById("lab-cloth"));
  initFoveated(document.getElementById("lab-fov"));
})();
