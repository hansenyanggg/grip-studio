
/* Evertonians prybar handle generator v0.11 -- JavaScript port of
* grip_generator_v11.py.  The handle is the user's own smoothed hand
* scan (embedded below as the "TG06" template blob), warped per hand
* input: axial segment scales from the finger row spacing, radial
* scale from the grip diameter, groove depths from the finger
* thicknesses, thumb scoop length / width / depth from the thumb
* measurements.  Each groove's band width follows its own finger's
* measured width and its angular wrap follows that finger's own
* length; the template is smoothed at load (grid box-blur plus a
* radial Laplacian pass in the groove zone only).  Web spaces are no
* longer measured: ridge spacing now scales with the grip diameter,
* so hand JSONs that still contain web_spaces are accepted and
* ignored.  v0.8: finger groove bands are 50% wider by DEFAULT
* (grooveWiden default 1.5) and each groove's floor (deepest strip)
* is stretched 40% wider around its per-row dent minimum.  v0.10: the
* back cap is REMOVED ENTIRELY (no dome, no hemisphere -- the back
* end is the scanned template's own taper), and the final radius-
* field Jacobi smoothing is FINGER-GROOVES-ONLY (the thumb scoop zone
* is excluded from every build-stage smoothing weight, so the thumb
* keeps exactly its template shape) and strengthened (FS_PASSES 6,
* FS_LAMBDA 0.5).  v0.11: the mesh is re-tessellated on the template
* grid's own REGULAR LATTICE (239 stations x 180 columns + 2 conical
* cap apexes, 86,040 uniform triangles) sampling the SAME organic
* scan field -- the irregular scan triangulation (0.04-2.4 mm
* triangles, noisy normals) read as bumps and jagged edges in every
* mesh viewer; the v0.9/v0.10 tangential mesh relaxation is gone
* with it.  The reference hand reproduces the smoothed lattice
* template exactly outside the finger zone (all ratios are exactly
* 1).
* v0.5.5 missing / shortened finger support carries over: a null
* finger_lengths entry = finger not present (its groove is
* chord-filled); a null thumb_length = no thumb (the scoop is
* chord-filled); null widths / thicknesses are filled from the
* measured fingers.
* Port verified against the Python reference build: byte-identical
* STL output.  Self-contained: no dependencies, plain browser
* JavaScript; the base64 blob is decoded with a manual decoder (no
* atob, so this also runs in restricted sandboxes). */
var GEN = (function () {
"use strict";
var K = {
RIDGE_HALF: 22,        // groove ridge window, stations (+/- 11 mm)
RIDGE_T_HALF: 56,      // thumb ridge window, stations (+/- 28 mm)
RIDGE_KEEP: 10.0,      // min ridge between widened grooves, xd units (0.5 mm)
THUMB_BLEND: 6.0,      // thumb influence blend width
EDGE_BLEND: 0.07,      // chord-fill edge blend
SM_LAMBDA: 0.5,        // groove-zone vertex smoothing strength
SM_PASSES: 3,          // Laplacian passes (Jacobi)
SM_FADE_MM: 3.0,       // x-fade of the smoothing zone (mm)
GRID_SMOOTH: 2,        // grid box-blur passes (radius 1)
ANG_FADE: 4,           // rows of fade at groove support edges
K_EDGE_FADE: 40.0,     // xd units (2 mm) fade of depth-k at mask edges
DS_STEP: 5.0,          // displacement lattice step (xd = 0.25 mm)
DS_BLUR_X: 8,          // displacement blur radius (lattice samples)
DS_PASSES: 2,          // displacement blur passes
DS_THETA_BLUR: 2,      // displacement theta blur radius (rows)
DEFAULT_GROOVE_WIDEN: 1.5,  // v0.8: bands 50% wider by default
FLOOR_FRAC: 0.25,      // v0.8: floor window = central half of band
FLOOR_WIDEN: 1.4,      // v0.8: floor window stretched 40% wider
FS_PASSES: 6,          // v0.11: final radius-field Jacobi passes
FS_LAMBDA: 0.5         // v0.11: final smoothing strength
};
var STL_HEADER = "Evertonians HY base handle";
var FINGERS = ["index", "middle", "ring", "pinkie"];
var B64IDX = (function () {
var a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var idx = new Array(128);
for (var i = 0; i < 64; i++) idx[a.charCodeAt(i)] = i;
return idx;
}());
function b64decode(s) {
var len = s.length;
while (len > 0 && s.charAt(len - 1) === "=") len--;
var out = new Uint8Array(Math.floor(len * 3 / 4));
var buf = 0, bits = 0, o = 0;
for (var p = 0; p < len; p++) {
var c = B64IDX[s.charCodeAt(p)];
if (c === undefined) continue;
buf = buf * 64 + c;
bits += 6;
if (bits >= 8) {
bits -= 8;
out[o++] = Math.floor(buf / Math.pow(2, bits)) % 256;
buf = buf % Math.pow(2, bits);
}
}
return out;
}
var T = (function () {
var b = b64decode(TEMPLATE_B64);
if (b[0] !== 84 || b[1] !== 71 || b[2] !== 48 || b[3] !== 54 ||
b[4] !== 2) {
throw new Error("bad template blob");
}
var dv = new DataView(b.buffer);
var nv = dv.getUint16(5, true);
var ntri = dv.getUint32(7, true);
var nst = dv.getUint16(11, true);
var nt = dv.getUint16(13, true);
var o = 15, i, j, k;
var vx = new Float64Array(nv), vy = new Float64Array(nv),
vz = new Float64Array(nv);
for (i = 0; i < nv; i++) {
vx[i] = dv.getInt16(o, true) * 0.01;
vy[i] = dv.getInt16(o + 2, true) * 0.01;
vz[i] = dv.getInt16(o + 4, true) * 0.01;
o += 6;
}
var tq = new Uint16Array(nv);
for (i = 0; i < nv; i++) { tq[i] = dv.getUint16(o, true); o += 2; }
var tris = new Uint16Array(3 * ntri);
for (i = 0; i < 3 * ntri; i++) { tris[i] = dv.getUint16(o, true); o += 2; }
var grid = new Float64Array(nst * nt);
for (i = 0; i < nst * nt; i++) { grid[i] = b[o] * 0.1; o += 1; }
grid = smoothGridBox(grid, K.GRID_SMOOTH);
var cyf = new Float64Array(nst), czf = new Float64Array(nst);
for (i = 0; i < nst; i++) { cyf[i] = dv.getInt16(o, true) * 0.01; o += 2; }
for (i = 0; i < nst; i++) { czf[i] = dv.getInt16(o, true) * 0.01; o += 2; }
var maskLo = new Int32Array(5 * nt), maskHi = new Int32Array(5 * nt);
for (k = 0; k < 5 * nt; k++) {
maskLo[k] = dv.getUint16(o, true);
maskHi[k] = dv.getUint16(o + 2, true);
o += 4;
}
if (o !== b.length) throw new Error("template blob length mismatch");
var dmin = new Array(4 * nt);
for (k = 0; k < 4 * nt; k++) dmin[k] = null;
for (i = 0; i < 4; i++) {
for (k = 0; k < nt; k++) {
if (maskLo[i * nt + k] === 65535) continue;
var f0 = (TEMPLATE_META.x_tip_lo + maskLo[i * nt + k] * 0.05
- TEMPLATE_META.x0) / TEMPLATE_META.step;
var i0 = Math.floor(f0);
if (i0 < 0) i0 = 0;
if (i0 > nst - 1) i0 = nst - 1;
var f1 = (TEMPLATE_META.x_tip_lo + maskHi[i * nt + k] * 0.05
- TEMPLATE_META.x0) / TEMPLATE_META.step;
var i1 = Math.floor(f1);
if (i1 > nst - 1) i1 = nst - 1;
if (i1 < i0) i1 = i0;
var bi = i0;
var bv = grid[i0 * nt + k];
for (j = i0 + 1; j <= i1; j++) {
var gv = grid[j * nt + k];
if (gv < bv) { bv = gv; bi = j; }
}
dmin[i * nt + k] =
(TEMPLATE_META.x0 + bi * TEMPLATE_META.step
- TEMPLATE_META.x_tip_lo) * 20.0;
}
}
function buildRidge(half) {
var out = new Float64Array(nst * nt);
for (k = 0; k < nt; k++) {
for (i = 0; i < nst; i++) {
var lo = i - half;
if (lo < 0) lo = 0;
var hi = i + half;
if (hi > nst - 1) hi = nst - 1;
var m = grid[lo * nt + k];
for (j = lo + 1; j <= hi; j++) {
var v = grid[j * nt + k];
if (v > m) m = v;
}
out[i * nt + k] = m;
}
}
return out;
}
var ridge = buildRidge(K.RIDGE_HALF);
var ridgeT = buildRidge(K.RIDGE_T_HALF);
var spanLo_ = TEMPLATE_META.thumb.span_lo,
spanHi_ = TEMPLATE_META.thumb.span_hi,
xsLo_ = TEMPLATE_META.thumb.xs_lo,
xsHi_ = TEMPLATE_META.thumb.xs_hi;
function smoothGridBox(g, passes) {
var cur = g, inv = 1.0 / 9.0, p, i2, k2;
for (p = 0; p < passes; p++) {
var nxt = new Float64Array(nst * nt);
for (i2 = 0; i2 < nst; i2++) {
var im = i2 > 0 ? i2 - 1 : 0;
var ip = i2 < nst - 1 ? i2 + 1 : nst - 1;
var b0 = im * nt, b1 = i2 * nt, b2 = ip * nt;
for (k2 = 0; k2 < nt; k2++) {
var km = k2 - 1; if (km < 0) km = nt - 1;
var kp = k2 + 1; if (kp > nt - 1) kp = 0;
var s = cur[b0 + km] + cur[b0 + k2] + cur[b0 + kp]
+ cur[b1 + km] + cur[b1 + k2] + cur[b1 + kp]
+ cur[b2 + km] + cur[b2 + k2] + cur[b2 + kp];
nxt[b1 + k2] = s * inv;
}
}
cur = nxt;
}
return cur;
}
function arcCenterRow(sup) {
var n = sup.length;
if (n === 0) return 0.0;
if (n >= nt) return nt * 0.5;
var bestGap = -1, bestI = 0, i2;
for (i2 = 0; i2 < n; i2++) {
var cur = sup[i2];
var nxt = sup[(i2 + 1) % n];
var gap = ((nxt - cur) % nt + nt) % nt;
if (n === 1) gap = nt;
if (gap > bestGap) { bestGap = gap; bestI = (i2 + 1) % n; }
}
var start = sup[bestI];
var s = 0;
for (i2 = 0; i2 < n; i2++) s += ((sup[i2] - start) % nt + nt) % nt;
var mean = s / n;
var c = start + mean;
if (c >= nt) c -= nt;
return c;
}
function grooveRowWeights() {
var half = Math.floor(nt / 2);
var gW = [], gC = [];
for (var gi = 0; gi < 4; gi++) {
var sup = [];
for (var k = 0; k < nt; k++) {
if (maskLo[gi * nt + k] !== 65535) sup.push(k);
}
var wrow = new Float64Array(nt);
var crow = 0.0;
if (sup.length > 0) {
var supset = {};
for (var si = 0; si < sup.length; si++) supset[sup[si]] = true;
for (k = 0; k < nt; k++) {
var d;
if (supset[k]) {
d = half;
for (var s = 1; s <= half; s++) {
if (!supset[(k + s) % nt]) { d = s; break; }
}
} else {
d = -half;
for (s = 1; s <= half; s++) {
if (supset[(k + s) % nt] ||
supset[((k - s) % nt + nt) % nt]) { d = -s; break; }
}
}
wrow[k] = smooth01((d + K.ANG_FADE) / (2.0 * K.ANG_FADE));
}
crow = arcCenterRow(sup);
}
gW.push(wrow);
gC.push(crow * 2.0);
}
return [gW, gC];
}
function thetaZoneWeights(gW) {
var out = new Float64Array(nt);
for (var k = 0; k < nt; k++) {
var m = 0.0;
for (var gi = 0; gi < 4; gi++) {
if (gW[gi][k] > m) m = gW[gi][k];
}
var wt = smooth01((k - (spanLo_ - K.ANG_FADE)) / K.ANG_FADE)
* smooth01(((spanHi_ + K.ANG_FADE) - k) / K.ANG_FADE);
if (wt > m) m = wt;
out[k] = m;
}
return out;
}
function fingerRowWeights(gW) {
var out = new Float64Array(nt);
for (var k = 0; k < nt; k++) {
var m = 0.0;
for (var gi = 0; gi < 4; gi++) {
if (gW[gi][k] > m) m = gW[gi][k];
}
out[k] = m;
}
return out;
}
function smoothTemplateVerts() {
var sets = [];
for (var i = 0; i < nv; i++) sets.push(new Set());
for (var j = 0; j < ntri; j++) {
var a = tris[3 * j], b = tris[3 * j + 1], c = tris[3 * j + 2];
sets[a].add(b); sets[a].add(c);
sets[b].add(a); sets[b].add(c);
sets[c].add(a); sets[c].add(b);
}
var nbr = [];
for (i = 0; i < nv; i++) {
var arr = Array.from(sets[i]);
arr.sort(function (p, q) { return p - q; });
nbr.push(arr);
}
var glo = 1e9, ghi = -1e9;
for (var gi = 0; gi < 4; gi++) {
for (var k = 0; k < nt; k++) {
if (maskLo[gi * nt + k] !== 65535) {
if (maskLo[gi * nt + k] < glo) glo = maskLo[gi * nt + k];
if (maskHi[gi * nt + k] > ghi) ghi = maskHi[gi * nt + k];
}
}
}
var tipLo_ = TEMPLATE_META.x_tip_lo;
var zoneLo = tipLo_ + glo * 0.05;
if (xsLo_ < zoneLo) zoneLo = xsLo_;
zoneLo -= K.SM_FADE_MM;
var zoneHi = tipLo_ + ghi * 0.05;
if (xsHi_ > zoneHi) zoneHi = xsHi_;
zoneHi += K.SM_FADE_MM;
function centerAtL(x) {
var f = (x - TEMPLATE_META.x0) / TEMPLATE_META.step;
if (f < 0.0) f = 0.0;
if (f > nst - 1) f = nst - 1;
var i0 = Math.floor(f);
if (i0 > nst - 2) i0 = nst - 2;
var fx = f - i0;
var cy = cyf[i0] + (cyf[i0 + 1] - cyf[i0]) * fx;
var cz = czf[i0] + (czf[i0 + 1] - czf[i0]) * fx;
return [cy, cz];
}
var wv = new Float64Array(nv);
for (i = 0; i < nv; i++) {
var wx = smooth01((vx[i] - zoneLo) / K.SM_FADE_MM)
* smooth01((zoneHi - vx[i]) / K.SM_FADE_MM);
wv[i] = wx * rowZoneW[Math.floor(tq[i] / 200)];
}
var wvF = new Float64Array(nv);
for (i = 0; i < nv; i++) {
var wxF = smooth01((vx[i] - zoneLo) / K.SM_FADE_MM)
* smooth01((zoneHi - vx[i]) / K.SM_FADE_MM);
wvF[i] = wxF * rowFingerW[Math.floor(tq[i] / 200)];
}
var ro = new Float64Array(nv);
for (i = 0; i < nv; i++) {
var cc = centerAtL(vx[i]);
var dy = vy[i] - cc[0], dz = vz[i] - cc[1];
ro[i] = Math.sqrt(dy * dy + dz * dz);
}
var r = ro;
for (var p = 0; p < K.SM_PASSES; p++) {
var rNew = new Float64Array(nv);
for (i = 0; i < nv; i++) {
var w = wv[i];
if (w > 0.0) {
var nb = nbr[i];
if (nb.length > 0) {
var s = 0.0;
for (var q = 0; q < nb.length; q++) s += r[nb[q]];
rNew[i] = r[i] + K.SM_LAMBDA * w * (s / nb.length - r[i]);
} else {
rNew[i] = r[i];
}
} else {
rNew[i] = r[i];
}
}
r = rNew;
}
for (i = 0; i < nv; i++) {
if (wv[i] > 0.0 && r[i] !== ro[i] && ro[i] > 0.0) {
var cc2 = centerAtL(vx[i]);
var sc = r[i] / ro[i];
vy[i] = cc2[0] + (vy[i] - cc2[0]) * sc;
vz[i] = cc2[1] + (vz[i] - cc2[1]) * sc;
}
}
T_smWv = wv;
T_smWvF = wvF;
T_nbr = nbr;
}
var L_NV = nst * nt + 2;
var L_VX = new Float64Array(L_NV);
var L_VY = new Float64Array(L_NV);
var L_VZ = new Float64Array(L_NV);
var L_TQ = new Uint16Array(L_NV);
for (var s2 = 0; s2 < nst; s2++) {
var xs_ = TEMPLATE_META.x0 + s2 * TEMPLATE_META.step;
var cy_ = cyf[s2];
var cz_ = czf[s2];
for (var k3 = 0; k3 < nt; k3++) {
var i3 = s2 * nt + k3;
var th_ = k3 * 2.0;
var r_ = grid[s2 * nt + k3];
var a_ = th_ * 0.017453292519943295;
L_VX[i3] = xs_;
L_VY[i3] = cy_ + r_ * Math.cos(a_);
L_VZ[i3] = cz_ + r_ * Math.sin(a_);
L_TQ[i3] = Math.floor(th_ * 100.0);
}
}
for (var cap = 0; cap < 2; cap++) {
var i4 = nst * nt + cap;
var cx_ = cap === 0 ? TEMPLATE_META.x_tip_lo : TEMPLATE_META.x_tip_hi;
var s3 = cap === 0 ? 0 : nst - 1;
L_VX[i4] = cx_;
L_VY[i4] = cyf[s3];
L_VZ[i4] = czf[s3];
L_TQ[i4] = 0;
}
var L_TRIS = [];
for (var s4 = 0; s4 < nst - 1; s4++) {
for (var k4 = 0; k4 < nt; k4++) {
var k2l = k4 + 1 < nt ? k4 + 1 : 0;
var a2 = s4 * nt + k4;
var b2 = (s4 + 1) * nt + k4;
var c2 = (s4 + 1) * nt + k2l;
var d2 = s4 * nt + k2l;
L_TRIS.push(a2, c2, b2);
L_TRIS.push(a2, d2, c2);
}
}
var capA = nst * nt;
var capB = nst * nt + 1;
for (k4 = 0; k4 < nt; k4++) {
var k22 = k4 + 1 < nt ? k4 + 1 : 0;
L_TRIS.push(capA, k4, k22);
var s5 = nst - 1;
L_TRIS.push(capB, s5 * nt + k22, s5 * nt + k4);
}
nv = L_NV;
ntri = L_TRIS.length / 3;
vx = L_VX;
vy = L_VY;
vz = L_VZ;
tq = L_TQ;
tris = new Uint16Array(L_TRIS);
var gw = grooveRowWeights();
var gWrow = gw[0], gCenter = gw[1];
var rowZoneW = thetaZoneWeights(gWrow);
var rowFingerW = fingerRowWeights(gWrow);
var T_smWv = null, T_smWvF = null, T_nbr = null;
smoothTemplateVerts();
var maxHyp = 0.0;
for (i = 0; i < nv; i++) {
var h = Math.hypot(vy[i], vz[i]);
if (h > maxHyp) maxHyp = h;
}
var dentG = [];
for (i = 0; i < 4; i++) {
var ax = TEMPLATE_META.anchors.g[i];
var st = Math.trunc((ax - TEMPLATE_META.x0) / TEMPLATE_META.step + 0.5);
dentG.push(ridge[st * nt + 170] - grid[st * nt + 170]);
}
var xc = (TEMPLATE_META.thumb.xs_lo + TEMPLATE_META.thumb.xs_hi) * 0.5;
var stc = Math.trunc((xc - TEMPLATE_META.x0) / TEMPLATE_META.step + 0.5);
var dentT = ridgeT[stc * nt + 85] - grid[stc * nt + 85];
return {
nv: nv, ntri: ntri, nst: nst, nt: nt,
vx: vx, vy: vy, vz: vz, tq: tq, tris: tris,
grid: grid, ridge: ridge, ridgeT: ridgeT,
cyf: cyf, czf: czf, maskLo: maskLo, maskHi: maskHi,
dmin: dmin,
maxHyp: maxHyp, dentG: dentG, dentT: dentT,
x0: TEMPLATE_META.x0, step: TEMPLATE_META.step,
tipLo: TEMPLATE_META.x_tip_lo, tipHi: TEMPLATE_META.x_tip_hi,
cal: TEMPLATE_META.cal,
anchorsG: TEMPLATE_META.anchors.g,
spanLo: TEMPLATE_META.thumb.span_lo, spanHi: TEMPLATE_META.thumb.span_hi,
xsLo: TEMPLATE_META.thumb.xs_lo, xsHi: TEMPLATE_META.thumb.xs_hi,
gWrow: gWrow, gCenter: gCenter, rowZoneW: rowZoneW,
rowFingerW: rowFingerW,
smWv: T_smWv, smWvF: T_smWvF, nbr: T_nbr
};
}());
function clamp01(u) {
if (u < 0.0) return 0.0;
if (u > 1.0) return 1.0;
return u;
}
function smooth01(u) {
u = clamp01(u);
return u * u * u * (10.0 - 15.0 * u + 6.0 * u * u);
}
function snap1(v) {
if (v - 1.0 < 1e-9 && v - 1.0 > -1e-9) return 1.0;
return v;
}
function sampleGrid(vals, x, th) {
var f = (x - T.x0) / T.step;
if (f < 0.0) f = 0.0;
if (f > T.nst - 1) f = T.nst - 1;
var i0 = Math.floor(f);
if (i0 > T.nst - 2) i0 = T.nst - 2;
var fx = f - i0;
var rf = th * 0.5;
var k0 = Math.floor(rf);
if (k0 > T.nt - 1) k0 = T.nt - 1;
var k1 = k0 + 1;
if (k1 > T.nt - 1) k1 = 0;
var fy = rf - k0;
var b0 = i0 * T.nt, b1 = b0 + T.nt;
var v00 = vals[b0 + k0], v10 = vals[b1 + k0];
var v01 = vals[b0 + k1], v11 = vals[b1 + k1];
return (v00 * (1.0 - fx) + v10 * fx) * (1.0 - fy)
+ (v01 * (1.0 - fx) + v11 * fx) * fy;
}
function centerAt(x) {
var f = (x - T.x0) / T.step;
if (f < 0.0) f = 0.0;
if (f > T.nst - 1) f = T.nst - 1;
var i0 = Math.floor(f);
if (i0 > T.nst - 2) i0 = T.nst - 2;
var fx = f - i0;
var cy = T.cyf[i0] + (T.cyf[i0 + 1] - T.cyf[i0]) * fx;
var cz = T.czf[i0] + (T.czf[i0 + 1] - T.czf[i0]) * fx;
return [cy, cz];
}
function validateHand(raw) {
var errs = [];
function isNum(x) { return typeof x === "number" && isFinite(x); }
function isNull(x) { return x === null || x === undefined; }
var val = {palm_length: 105};
var REQ = [
["hand_length", 140, 235], ["hand_breadth", 60, 115],
["grip_diameter_inside", 30, 85],
["thumb_length", 8, 105], ["thumb_breadth", 8, 36]  // v0.5.5: null = no thumb
];
for (var i = 0; i < REQ.length; i++) {
var rk = REQ[i][0], lo = REQ[i][1], hi = REQ[i][2], rv = raw[rk];
if (isNull(rv)) {
if (rk === "thumb_length" || rk === "thumb_breadth") val[rk] = null;
else errs.push(rk + " must be a number (only thumb_length and thumb_breadth may be null = no thumb)");
continue;
}
if (!isNum(rv)) errs.push("missing or invalid value: " + rk);
else if (rv < lo || rv > hi) errs.push(rk + " = " + rv + " mm is outside " + lo + "-" + hi + " mm");
else val[rk] = rv;
}
var GROUPS = [
["finger_widths", 5, 30], ["finger_lengths", 5, 115],
["finger_thicknesses", 4, 30]
];
for (i = 0; i < GROUPS.length; i++) {
var gk = GROUPS[i][0], glo = GROUPS[i][1], ghi = GROUPS[i][2];
var gv = raw[gk], arr;
if (isNum(gv)) arr = [gv, gv, gv, gv];
else if (gv && gv.length === 4) arr = gv.slice();
else { errs.push(gk + " must be a number or a list of 4 values"); continue; }
for (var j = 0; j < 4; j++) {
if (isNull(arr[j])) { arr[j] = null; continue; }  // v0.5.5: null = not measured / not present
if (!isNum(arr[j])) { arr[j] = null; continue; }
if (arr[j] < glo || arr[j] > ghi) {
errs.push(gk + " value " + arr[j] + " mm is outside " + glo + "-" + ghi + " mm (null = finger not present or not measured)");
arr[j] = null;
}
}
val[gk] = arr;
}
val.palm_depth = isNum(raw.palm_depth) ? raw.palm_depth : null;
val.thumb_thickness = isNum(raw.thumb_thickness) ? raw.thumb_thickness : null;
var fl = val.finger_lengths;
if (fl) {
var present = 0;
for (i = 0; i < 4; i++) if (fl[i] !== null) present++;
if (present === 0) errs.push("at least one of the four fingers must be present (every finger_lengths entry is null)");
var fillKeys = ["finger_widths", "finger_thicknesses"];
for (var fk = 0; fk < 2; fk++) {
var fkey = fillKeys[fk], farr = val[fkey];
if (!farr) continue;
var fsum = 0, fcnt = 0;
for (var fm = 0; fm < 4; fm++) if (farr[fm] !== null) { fsum += farr[fm]; fcnt++; }
if (fcnt === 0) { errs.push(fkey + ": at least one finger needs a measured value (the rest can be null)"); continue; }
var fmean = fsum / fcnt;
for (fm = 0; fm < 4; fm++) if (farr[fm] === null) farr[fm] = fmean;
}
for (i = 0; i < 4; i++) if (fl[i] === null) fl[i] = 0.0;
}
if (val.thumb_length === null) {
val.thumb_breadth = null;  // no thumb: the scoop is chord-filled
} else if (val.thumb_breadth === null) {
errs.push("thumb_breadth is required when the thumb is present (only thumb_length may be null = no thumb)");
}
if (errs.length) return { error: errs.join(" · ") };
return { val: val };
}
function layout(val, grooveWiden) {
if (grooveWiden === undefined) grooveWiden = K.DEFAULT_GROOVE_WIDEN;
var cal = T.cal;
var R = snap1(val.grip_diameter_inside * cal.grip);
var P = 1.0; // Palm-driven stretching removed; retain the reference section length.
var w = val.finger_widths;
var S1 = snap1((w[0] + w[1]) * 0.5 * cal.sp1);
var S2 = snap1((w[1] + w[2]) * 0.5 * cal.sp2);
var S3 = snap1((w[2] + w[3]) * 0.5 * cal.sp3);
var fl = val.finger_lengths;
var present = [fl[0] > 0.0, fl[1] > 0.0, fl[2] > 0.0, fl[3] > 0.0];
var msum = 0.0, mcnt = 0;
for (var i = 0; i < 4; i++) if (fl[i] > 0.0) { msum += fl[i]; mcnt++; }
var F = snap1((msum / mcnt) * cal.flen);
var t = val.finger_thicknesses;
var kG = [
snap1(t[0] * cal.thick[0]), snap1(t[1] * cal.thick[1]),
snap1(t[2] * cal.thick[2]), snap1(t[3] * cal.thick[3])
];
var wf = [
snap1(w[0] * cal.width[0]), snap1(w[1] * cal.width[1]),
snap1(w[2] * cal.width[2]), snap1(w[3] * cal.width[3])
];
var lf = [1.0, 1.0, 1.0, 1.0];
for (var li = 0; li < 4; li++) {
if (present[li]) {
var v = fl[li] * cal.flen4[li];
if (v < 0.5) v = 0.5;
if (v > 1.6) v = 1.6;
lf[li] = snap1(v);
}
}
var A = [T.tipLo, T.anchorsG[0], T.anchorsG[1], T.anchorsG[2],
T.anchorsG[3], T.tipHi];
var sc = [P, S1, S2, S3, F];
var O = [0.0];
for (i = 0; i < 5; i++) O.push(O[i] + (A[i + 1] - A[i]) * sc[i]);
var total = O[5];
var kT = null, TL = null, TB = null;
if (val.thumb_length !== null) {
var tt = val.thumb_thickness;
if (tt === null) tt = val.thumb_breadth * cal.thumb_thk / cal.thumb_brd;
kT = snap1(tt * cal.thumb_thk);
TL = val.thumb_length * cal.thumb_len;
if (TL < 0.35) TL = 0.35;
if (TL > 1.75) TL = 1.75;
TL = snap1(TL);
TB = val.thumb_breadth * cal.thumb_brd;
if (TB < 0.4) TB = 0.4;
if (TB > 1.8) TB = 1.8;
TB = snap1(TB);
}
return {
R: R, P: P, S: [S1, S2, S3], F: F,
kGroove: kG, present: present,
A: A, O: O, scale: sc, totalLength: total,
kThumb: kT, TL: TL, TB: TB,
wf: wf, lf: lf,
thumbPresent: val.thumb_length !== null,
withinHand: total <= val.hand_length,
rEnvelope: R * T.maxHyp * 1.02,
thC: T.spanLo + T.spanHi + 1.0,
xCs: (T.xsLo + T.xsHi) * 0.5,
grooveWiden: grooveWiden
};
}
function warpX(L, x) {
var A = L.A, O = L.O;
if (x <= A[0]) return O[0] + (x - A[0]) * 1.0;
var j = 0;
for (var i = 0; i < 5; i++) if (x >= A[i]) j = i;
if (j === 4 && x >= A[5]) return O[5];
return O[j] + (x - A[j]) * ((O[j + 1] - O[j]) / (A[j + 1] - A[j]));
}
function grooveRowMaps(T, L) {
var fac = [
L.wf[0] * L.grooveWiden, L.wf[1] * L.grooveWiden,
L.wf[2] * L.grooveWiden, L.wf[3] * L.grooveWiden
];
var identity = true;
for (var fi = 0; fi < 4; fi++) {
if (fac[fi] !== 1.0) { identity = false; break; }
}
if (identity) return null;
var nt = T.nt;
var maps = [];
for (var k = 0; k < nt; k++) {
var wins = [];
for (var gi = 0; gi < 4; gi++) {
var mk = T.maskLo[gi * nt + k];
if (mk !== 65535) wins.push([gi, mk, T.maskHi[gi * nt + k]]);
}
var mkt = T.maskLo[4 * nt + k];
if (mkt !== 65535) wins.push([4, mkt, T.maskHi[4 * nt + k]]);
if (wins.length === 0) { maps.push(null); continue; }
wins.sort(function (a, b) {
if (a[1] < b[1]) return -1;
if (a[1] > b[1]) return 1;
if (a[2] < b[2]) return -1;
if (a[2] > b[2]) return 1;
return 0;
});
var n = wins.length;
var desL = new Array(n), desR = new Array(n);
for (var i2 = 0; i2 < n; i2++) { desL[i2] = 0.0; desR[i2] = 0.0; }
for (i2 = 0; i2 < n; i2++) {
var g = wins[i2][0];
if (g < 4) {
var d = (wins[i2][2] - wins[i2][1]) * (fac[g] - 1.0) * 0.5;
desL[i2] = d;
desR[i2] = d;
}
}
var expL = desL.slice(), expR = desR.slice();
for (i2 = 0; i2 < n - 1; i2++) {
var gap = wins[i2 + 1][1] - wins[i2][2];
var da = desR[i2];
var db = desL[i2 + 1];
if (da > 0.0 && db > 0.0) {
var avail = gap - K.RIDGE_KEEP;
if (avail <= 0.0) {
expR[i2] = 0.0;
expL[i2 + 1] = 0.0;
continue;
}
var ea = da < avail * 0.5 ? da : avail * 0.5;
var eb = db < avail - ea ? db : avail - ea;
var extra = avail - ea - eb;
if (extra > 0.0) {
if (da > ea) {
var add = da - ea;
if (add > extra) add = extra;
ea += add;
extra -= add;
}
if (extra > 0.0 && db > eb) {
var add2 = db - eb;
if (add2 > extra) add2 = extra;
eb += add2;
}
}
expR[i2] = ea;
expL[i2 + 1] = eb;
} else if (da > 0.0) {
var avail2 = gap - db - K.RIDGE_KEEP;
if (avail2 < 0.0) avail2 = 0.0;
expR[i2] = da < avail2 ? da : avail2;
} else if (db > 0.0) {
var avail3 = gap - da - K.RIDGE_KEEP;
if (avail3 < 0.0) avail3 = 0.0;
expL[i2 + 1] = db < avail3 ? db : avail3;
}
}
var srcs = [], dsts = [];
for (i2 = 0; i2 < n; i2++) {
var lo = wins[i2][1];
var hi = wins[i2][2];
if (wins[i2][0] < 4) {
var dmn = T.dmin[wins[i2][0] * nt + k];
if (dmn !== null && hi > lo) {
var d = dmn;
if (d < lo) d = lo;
if (d > hi) d = hi;
var wfl = (hi - lo) * K.FLOOR_FRAC;
var n1 = d - wfl;
if (n1 < lo) n1 = lo;
var n2 = d + wfl;
if (n2 > hi) n2 = hi;
var s = ((hi + expR[i2]) - (lo - expL[i2])) / (hi - lo);
var extra = (n2 - n1) * s * (K.FLOOR_WIDEN - 1.0) * 0.5;
var capL = (n1 - lo) * s * 0.5;
var capR = (hi - n2) * s * 0.5;
if (extra > capL) extra = capL;
if (extra > capR) extra = capR;
var b0 = lo - expL[i2];
var d1 = b0 + (n1 - lo) * s - extra;
var d2 = b0 + (n2 - lo) * s + extra;
srcs.push(lo);
srcs.push(n1);
srcs.push(n2);
srcs.push(hi);
dsts.push(b0);
dsts.push(d1);
dsts.push(d2);
dsts.push(hi + expR[i2]);
} else {
srcs.push(lo);
srcs.push(hi);
dsts.push(lo - expL[i2]);
dsts.push(hi + expR[i2]);
}
} else {
srcs.push(lo);
srcs.push(hi);
dsts.push(lo);
dsts.push(hi);
}
}
for (var j = 1; j < dsts.length; j++) {
if (dsts[j] < dsts[j - 1]) dsts[j] = dsts[j - 1];
}
maps.push([srcs, dsts]);
}
return maps;
}
function displacementField(maps) {
if (maps === null) return null;
var nt = T.nt;
var nds = Math.floor(((T.tipHi - T.tipLo) * 20.0) / K.DS_STEP) + 1;
var d = [];
for (var k = 0; k < nt; k++) {
var m = maps[k];
var row = new Float64Array(nds);
if (m !== null) {
for (var j = 0; j < nds; j++) {
var xd = j * K.DS_STEP;
row[j] = applyRowMap(m, xd) - xd;
}
}
d.push(row);
}
var invx = 1.0 / (2 * K.DS_BLUR_X + 1);
for (var p = 0; p < K.DS_PASSES; p++) {
var nd = [];
for (k = 0; k < nt; k++) {
var cur = d[k];
var out = new Float64Array(nds);
for (j = 0; j < nds; j++) {
var s = 0.0;
for (var b = -K.DS_BLUR_X; b <= K.DS_BLUR_X; b++) {
var jj = j + b;
if (jj < 0) jj = 0;
if (jj > nds - 1) jj = nds - 1;
s += cur[jj];
}
out[j] = s * invx;
}
nd.push(out);
}
d = nd;
}
var invt = 1.0 / (2 * K.DS_THETA_BLUR + 1);
var nd2 = [];
for (k = 0; k < nt; k++) {
var out2 = new Float64Array(nds);
for (j = 0; j < nds; j++) {
var s2 = 0.0;
for (var b2 = -K.DS_THETA_BLUR; b2 <= K.DS_THETA_BLUR; b2++) {
var kk = ((k + b2) % nt + nt) % nt;
s2 += d[kk][j];
}
out2[j] = s2 * invt;
}
nd2.push(out2);
}
d = nd2;
return [d, nds];
}
function applyRowMap(m, xd) {
var srcs = m[0], dsts = m[1];
var n = srcs.length;
if (xd < srcs[0]) return xd;
if (xd > srcs[n - 1]) return xd;
var j = 0;
while (j + 1 < n && xd > srcs[j + 1]) j++;
var s0 = srcs[j], s1 = srcs[j + 1];
var d0 = dsts[j], d1 = dsts[j + 1];
if (s1 <= s0) return d1;
var t = (xd - s0) / (s1 - s0);
return d0 + (d1 - d0) * t;
}
function buildMesh(val, L, palmSide) {
var nv = T.nv, nt = T.nt;
var R = L.R;
var kG = L.kGroove, present = L.present;
var thC = L.thC, xCs = L.xCs;
var tip = T.tipLo;
var spanLo = T.spanLo, spanHi = T.spanHi;
var xsLo = T.xsLo, xsHi = T.xsHi;
var thumbPresent = L.thumbPresent;
var kT = L.kThumb, TB = L.TB, TL = L.TL;
var loRow = spanLo - 6, hiRow = spanHi + 6;
var xLo = xsLo - K.THUMB_BLEND, xHi = xsHi + K.THUMB_BLEND;
var smWv = T.smWvF, nbr = T.nbr;
var px = T.vx;
var rowMaps = grooveRowMaps(T, L);
var ds = null, nds = 0;
if (rowMaps !== null) {
var df = displacementField(rowMaps);
ds = df[0];
nds = df[1];
}
var lf4 = L.lf;
var gWrow = T.gWrow, gCenter = T.gCenter;
var angOn = false;
for (var giA = 0; giA < 4; giA++) {
if (present[giA] && lf4[giA] !== 1.0) { angOn = true; break; }
}
var vx = new Float64Array(nv), vy = new Float64Array(nv),
vz = new Float64Array(nv);
var cys = new Float64Array(nv), czs = new Float64Array(nv);
var dys = new Float64Array(nv), dzs = new Float64Array(nv);
var rs = new Float64Array(nv), rfs = new Float64Array(nv);
var xs = new Float64Array(nv);
for (var i = 0; i < nv; i++) {
var x = px[i], y = T.vy[i], z = T.vz[i];
var q = T.tq[i];
var th = q * 0.01;
var krow = Math.floor(q / 200);
var reg = -1, mlo = 0, mhi = 0;
var xd = (x - tip) * 20.0;
for (var gi = 0; gi < 4; gi++) {
var mk = T.maskLo[gi * nt + krow];
if (mk !== 65535 && mk <= xd && xd <= T.maskHi[gi * nt + krow]) {
reg = gi;
mlo = mk;
mhi = T.maskHi[gi * nt + krow];
break;
}
}
var cc = centerAt(x);
var cy = cc[0], cz = cc[1];
var dy = y - cy, dz = z - cz;
var r = Math.sqrt(dy * dy + dz * dz);
if (r <= 1e-9) {
cys[i] = cy;
czs[i] = cz;
dys[i] = 0.0;
dzs[i] = 0.0;
rs[i] = 0.0;
rfs[i] = 0.0;
xs[i] = x;
continue;
}
var wsm = smWv[i];
if (wsm > 0.0) {
var rg = sampleGrid(T.grid, x, th);
var ru2 = r + wsm * (rg - r);
if (r > 1e-9) {
var sc = ru2 / r;
dy = dy * sc;
dz = dz * sc;
}
r = ru2;
}
var rfin;
if (reg >= 0) {
if (present[reg]) {
var ru = r;
if (angOn) {
var lf = lf4[reg];
if (lf !== 1.0) {
var wq = gWrow[reg][krow];
if (wq > 0.0) {
var c = gCenter[reg];
var thSrc = c + (th - c) / lf;
var gsA = sampleGrid(T.grid, x, thSrc);
var goA = sampleGrid(T.grid, x, th);
ru = r + wq * (gsA - goA);
}
}
}
var rd = sampleGrid(T.ridge, x, th);
var ke = smooth01(Math.min(xd - mlo, mhi - xd) / K.K_EDGE_FADE)
* gWrow[reg][krow];
var kf = 1.0 + (kG[reg] - 1.0) * ke;
rfin = rd - (rd - ru) * kf;
} else {
var lo = tip + mlo * 0.05;
var hi = tip + mhi * 0.05;
if (hi > lo) {
var s = (x - lo) / (hi - lo);
var glo = sampleGrid(T.grid, lo, th);
var ghi = sampleGrid(T.grid, hi, th);
var chord = glo + (ghi - glo) * s;
var m = s;
if (1.0 - s < m) m = 1.0 - s;
m = smooth01(m / K.EDGE_BLEND);
rfin = r + (chord - r) * m;
} else {
rfin = r;
}
}
} else {
var ru = r, w = 0.0;
if (krow >= loRow && krow <= hiRow) {
var wb = smooth01((krow - loRow) / K.THUMB_BLEND)
* smooth01((hiRow - krow) / K.THUMB_BLEND);
if (x >= xLo && x <= xHi) {
var wx = smooth01((x - xLo) / K.THUMB_BLEND)
* smooth01((xHi - x) / K.THUMB_BLEND);
w = wb * wx;
}
}
if (w > 0.0) {
var tlo = T.maskLo[4 * nt + krow];
var thi = T.maskHi[4 * nt + krow];
var inScoop = tlo !== 65535 && tlo <= xd && xd <= thi;
if (thumbPresent) {
var B = 1.0 + (TB - 1.0) * w;
var Lx = 1.0 + (TL - 1.0) * w;
var thSrc = thC + (th - thC) / B;
var xSrc = xCs + (x - xCs) / Lx;
var xsA = xsLo; if (x < xsA) xsA = x;
var xsB = xsHi; if (x > xsB) xsB = x;
if (xSrc < xsA) xSrc = xsA;
if (xSrc > xsB) xSrc = xsB;
var gs = sampleGrid(T.grid, xSrc, thSrc);
var go = sampleGrid(T.grid, x, th);
ru = r + w * (gs - go);
if (inScoop) {
var rdt = sampleGrid(T.ridgeT, x, th);
var ket = smooth01((xd - tlo) / K.K_EDGE_FADE)
* smooth01((thi - xd) / K.K_EDGE_FADE)
* smooth01((krow - spanLo) / K.ANG_FADE)
* smooth01((spanHi - krow) / K.ANG_FADE);
var kft = 1.0 + (kT - 1.0) * ket;
rfin = rdt - (rdt - ru) * kft;
} else {
rfin = ru;
}
} else if (inScoop) {
var lo2 = tip + tlo * 0.05;
var hi2 = tip + thi * 0.05;
if (hi2 > lo2) {
var s2 = (x - lo2) / (hi2 - lo2);
var glo2 = sampleGrid(T.grid, lo2, th);
var ghi2 = sampleGrid(T.grid, hi2, th);
var chord2 = glo2 + (ghi2 - glo2) * s2;
var m2 = s2;
if (1.0 - s2 < m2) m2 = 1.0 - s2;
m2 = smooth01(m2 / K.EDGE_BLEND);
rfin = r + (chord2 - r) * m2;
} else {
rfin = r;
}
} else {
rfin = r;
}
} else {
rfin = r;
}
}
if (ds !== null) {
var dl = ds[krow];
if (dl !== null) {
var fD = xd / K.DS_STEP;
if (fD < 0.0) fD = 0.0;
var j0 = Math.floor(fD);
if (j0 > nds - 2) j0 = nds - 2;
var fxD = fD - j0;
x = tip + (xd + dl[j0] * (1.0 - fxD) + dl[j0 + 1] * fxD) * 0.05;
}
}
cys[i] = cy;
czs[i] = cz;
dys[i] = dy;
dzs[i] = dz;
rs[i] = r;
rfs[i] = rfin;
xs[i] = x;
}
for (var fp = 0; fp < K.FS_PASSES; fp++) {
var rf2 = new Float64Array(rfs);
for (var fi = 0; fi < nv; fi++) {
var fw = smWv[fi];
if (fw > 0.0) {
var fnb = nbr[fi];
if (fnb.length > 0) {
var fs2 = 0.0;
for (var fq = 0; fq < fnb.length; fq++) fs2 += rfs[fnb[fq]];
rf2[fi] = rfs[fi] + K.FS_LAMBDA * fw
* (fs2 / fnb.length - rfs[fi]);
}
}
}
rfs = rf2;
}
for (var i2 = 0; i2 < nv; i2++) {
var x2 = xs[i2];
var cy2 = cys[i2];
var cz2 = czs[i2];
var dy2 = dys[i2];
var dz2 = dzs[i2];
var r2v = rs[i2];
var rfin2 = rfs[i2];
var xn = warpX(L, x2);
var nr = R * rfin2;
vx[i2] = xn;
if (r2v > 1e-9) {
var ratio = nr / r2v;
vy[i2] = R * cy2 + dy2 * ratio;
vz[i2] = R * cz2 + dz2 * ratio;
} else {
vy[i2] = R * cy2;
vz[i2] = R * cz2;
}
}
var tris;
if (palmSide === "left") {                    // left hand: y-mirror
for (i = 0; i < nv; i++) vy[i] = -vy[i];
tris = new Uint16Array(T.tris.length);
for (i = 0; i < T.tris.length; i += 3) {
tris[i] = T.tris[i];
tris[i + 1] = T.tris[i + 2];
tris[i + 2] = T.tris[i + 1];
}
} else {
tris = T.tris;
}
return { vx: vx, vy: vy, vz: vz, tris: tris };
}
function r2(v) { return Math.round(v * 100) / 100; }
function r4(v) { return Math.round(v * 10000) / 10000; }
function meshStats(m, L) {
var tris = m.tris, nv = T.nv, ntri = tris.length / 3;
var edges = {}, key, closed = true, nEdges = 0;
for (var i = 0; i < tris.length; i += 3) {
var a = tris[i], b = tris[i + 1], c = tris[i + 2];
var u = a, v = b;                       // edge 1 of 3
key = u < v ? u * 100000 + v : v * 100000 + u;
edges[key] = (edges[key] || 0) + 1;
u = b; v = c;                           // edge 2 of 3
key = u < v ? u * 100000 + v : v * 100000 + u;
edges[key] = (edges[key] || 0) + 1;
u = c; v = a;                           // edge 3 of 3
key = u < v ? u * 100000 + v : v * 100000 + u;
edges[key] = (edges[key] || 0) + 1;
}
var vol = 0.0;
for (i = 0; i < tris.length; i += 3) {
var ia = tris[i], ib = tris[i + 1], ic = tris[i + 2];
var ax = m.vx[ia], ay = m.vy[ia], az = m.vz[ia];
var bx = m.vx[ib], by = m.vy[ib], bz = m.vz[ib];
var cx = m.vx[ic], cy = m.vy[ic], cz = m.vz[ic];
vol += (ax * (by * cz - bz * cy)
- ay * (bx * cz - bz * cx)
+ az * (bx * cy - by * cx)) / 6.0;
}
for (key in edges) {
nEdges++;
if (edges[key] !== 2) closed = false;
}
var watertight = (nv - nEdges + ntri === 2 && closed && vol > 0.0);
var maxR = 0.0;
for (i = 0; i < nv; i++) {
var rr = Math.hypot(m.vy[i], m.vz[i]);
if (rr > maxR) maxR = rr;
}
var widenMaps = grooveRowMaps(T, L);
var m170 = widenMaps === null ? null : widenMaps[170];
var grooves = [];
for (i = 0; i < 4; i++) {
var lo = T.maskLo[i * T.nt + 170], hi = T.maskHi[i * T.nt + 170];
var owin = null;
var fwin = null;
if (lo !== 65535) {
var oloXd = m170 === null ? lo : applyRowMap(m170, lo);
var ohiXd = m170 === null ? hi : applyRowMap(m170, hi);
owin = [r2(warpX(L, T.tipLo + oloXd * 0.05)),
r2(warpX(L, T.tipLo + ohiXd * 0.05))];
var dmn = T.dmin[i * T.nt + 170];
if (dmn !== null) {
var fd = dmn;
if (fd < lo) fd = lo;
if (fd > hi) fd = hi;
var fwfl = (hi - lo) * K.FLOOR_FRAC;
var fn1 = fd - fwfl;
if (fn1 < lo) fn1 = lo;
var fn2 = fd + fwfl;
if (fn2 > hi) fn2 = hi;
var f1Xd = m170 === null ? fn1 : applyRowMap(m170, fn1);
var f2Xd = m170 === null ? fn2 : applyRowMap(m170, fn2);
fwin = [r2(warpX(L, T.tipLo + f1Xd * 0.05)),
r2(warpX(L, T.tipLo + f2Xd * 0.05))];
}
}
grooves.push({
finger: FINGERS[i],
present: L.present[i],
depth_scale: r4(L.kGroove[i]),
band_width_factor: r4(L.wf[i] * L.grooveWiden),
angular_wrap_factor: r4(L.lf[i]),
template_anchor_x_mm: T.anchorsG[i],
output_anchor_x_mm: r2(warpX(L, T.anchorsG[i])),
template_window_mm: lo === 65535 ? null : [r2(T.tipLo + lo * 0.05), r2(T.tipLo + hi * 0.05)],
output_window_mm: owin,
output_floor_window_mm: fwin,
floor_widen_factor: K.FLOOR_WIDEN,
template_dent_mm: r2(T.dentG[i])
});
}
var thumb = {
present: L.thumbPresent,
depth_scale: L.kThumb === null ? null : r4(L.kThumb),
angular_scale: L.TB === null ? null : r4(L.TB),
length_scale: L.TL === null ? null : r4(L.TL),
template_x_span_mm: [T.xsLo, T.xsHi],
template_row_span: [T.spanLo, T.spanHi],
template_dent_mm: r2(T.dentT)
};
return {
vertices: nv, triangles: ntri,
watertight: watertight, volume_mm3: Math.round(vol * 10) / 10,
handle_length_mm: r2(L.totalLength),
max_mesh_radius_mm: r2(maxR),
envelope_radius_mm: r2(L.rEnvelope),
envelope_margin_mm: r2(L.rEnvelope - maxR),
envelope_ok: maxR <= L.rEnvelope + 1e-6,
handle_within_hand_length: L.withinHand,
groove_widen: L.grooveWiden,
groove_audit: grooves, thumb_audit: thumb,
mesh_relax: {
mesh: "regular lattice (0.5 mm x 2 deg; v0.11 re-tessellation "
+ "of the same scan field)",
final_field_passes: K.FS_PASSES,
final_field_lambda: K.FS_LAMBDA,
zone: "finger grooves only (v0.7 groove supports; thumb excluded)"
},
axis: "forked dome (thumb side) at x=0 to the scanned back taper; smoothed template geometry, warped per hand (v0.11 regular-lattice mesh)"
};
}
function buildSTL(m) {
var tris = m.tris;
var nT = tris.length / 3;
var buf = new ArrayBuffer(84 + 50 * nT);
var dv = new DataView(buf);
for (var h = 0; h < 80; h++) {
dv.setUint8(h, h < STL_HEADER.length ? STL_HEADER.charCodeAt(h) : 0);
}
dv.setUint32(80, nT, true);
var o = 84;
for (var i = 0; i < tris.length; i += 3) {
var a = tris[i], b = tris[i + 1], c = tris[i + 2];
var ax = m.vx[a], ay = m.vy[a], az = m.vz[a];
var bx = m.vx[b], by = m.vy[b], bz = m.vz[b];
var cx = m.vx[c], cy = m.vy[c], cz = m.vz[c];
var u0 = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
var u1 = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
var u2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
var ln = Math.sqrt(u0 * u0 + u1 * u1 + u2 * u2);
if (ln < 1e-30) ln = 1e-30;
dv.setFloat32(o, u0 / ln, true);
dv.setFloat32(o + 4, u1 / ln, true);
dv.setFloat32(o + 8, u2 / ln, true);
dv.setFloat32(o + 12, ax, true);
dv.setFloat32(o + 16, ay, true);
dv.setFloat32(o + 20, az, true);
dv.setFloat32(o + 24, bx, true);
dv.setFloat32(o + 28, by, true);
dv.setFloat32(o + 32, bz, true);
dv.setFloat32(o + 36, cx, true);
dv.setFloat32(o + 40, cy, true);
dv.setFloat32(o + 44, cz, true);
dv.setUint16(o + 48, 0, true);
o += 50;
}
return buf;
}
function generate(raw, palmSide, grooveWiden) {
var v = validateHand(raw);
if (v.error) return { error: v.error };
var L = layout(v.val, grooveWiden);
var mesh = buildMesh(v.val, L, palmSide || "right");
var stats = meshStats(mesh, L);
if (!stats.watertight) {
return { error: "the mesh failed the watertight check — an internal error, not your measurements; report the values you used" };
}
return { stats: stats, stl: buildSTL(mesh), layout: L };
}
return {
generate: generate,
regionAt: function(x,theta) {
var row=Math.floor(((theta%360)+360)%360/2),xd=(x-T.tipLo)*20;
for(var region=4;region>=0;region--){var lo=T.maskLo[region*180+row],hi=T.maskHi[region*180+row];if(lo!==65535&&xd>=lo&&xd<=hi)return region;}
return -1;
},
validateHand: validateHand,
layout: layout,
buildMesh: buildMesh,
meshStats: meshStats,
buildSTL: buildSTL,
K: K
};
})();
