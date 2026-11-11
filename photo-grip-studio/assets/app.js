(function () {
"use strict";
var viewport = document.getElementById("viewport");
var stage = document.getElementById("stage");
var photo = document.getElementById("photo");
var emptyState = document.getElementById("emptyState");
var zoomLabel = document.getElementById("zoomLabel");
var calStatus = document.getElementById("calStatus");
var currentItem = document.getElementById("currentItem");
var itemList = document.getElementById("itemList");
var resultsTable = document.getElementById("resultsTable");
var jsonOut = document.getElementById("jsonOut");
var stepTitle = document.getElementById("stepTitle");
var stepHint = document.getElementById("stepHint");
var photoStatus = document.getElementById("photoStatus");
var calInA = document.getElementById("calA");
var calInB = document.getElementById("calB");
var fingerSelRow = document.getElementById("fingerSelRow");
var fingerSel = document.getElementById("fingerSel");
var secAI = document.getElementById("secAI");
var secCal = document.getElementById("secCal");
var secMeas = document.getElementById("secMeas");
var fingerStatusSel = {
index: document.getElementById("fsIndex"),
middle: document.getElementById("fsMiddle"),
ring: document.getElementById("fsRing"),
little: document.getElementById("fsLittle"),
thumb: document.getElementById("fsThumb")
};
var LAST = { out: null, est: null, stl: null, side: "right" };
var STEP_INFO = [
{ name: "1 · Palm up",
hint: "Palm facing up, tape lying along the fingers with its zero at the crease where the hand meets the wrist. This photo gives: hand length, finger lengths, thumb length." },
{ name: "2 · Palm down",
hint: "Palm facing down (back of the hand up), tape lying across the hand, touching it. This photo gives: hand breadth, thumb breadth, and finger widths." },
{ name: "3 · Side view",
hint: "Hand resting on its side so one finger is seen from the side, with the tape upright behind that finger. This photo gives ONE finger thickness; the other three are estimated." }
];
var STEP_ITEMS = [
[
{ key: "wrist",       n: 1, label: "Wrist: the crease where the palm meets the wrist" },
{ key: "index_base",  n: 1, label: "Index finger base: the LOWEST crease, where the finger meets the palm (not the crease on the knuckle)" },
{ key: "index_tip",   n: 1, label: "Index fingertip" },
{ key: "middle_base", n: 1, label: "Middle finger base: the LOWEST crease, where the finger meets the palm (not the knuckle crease)" },
{ key: "middle_tip",  n: 1, label: "Middle fingertip" },
{ key: "ring_base",   n: 1, label: "Ring finger base: the LOWEST crease, where the finger meets the palm (not the knuckle crease)" },
{ key: "ring_tip",    n: 1, label: "Ring fingertip" },
{ key: "little_base", n: 1, label: "Little finger base: the LOWEST crease, where the finger meets the palm (not the knuckle crease)" },
{ key: "little_tip",  n: 1, label: "Little fingertip" },
{ key: "thumb_base",  n: 1, label: "Thumb base: the fold where the thumb joins the hand" },
{ key: "thumb_tip",   n: 1, label: "Thumb tip" }
],
[
{ key: "hand_breadth",  n: 2, label: "Hand breadth: straight across the palm, right below the fingers (the thumb is not included)",
tap1: "one outer edge of the palm", tap2: "the opposite outer edge" },
{ key: "thumb_breadth", n: 2, label: "Thumb breadth: across the thumb at its thickest point",
tap1: "one side edge of the thumb", tap2: "the opposite side edge" },
{ key: "width_index",   n: 2, label: "Index finger width: across the finger at its lowest knuckle (where it joins the hand)",
tap1: "one side edge of the index finger", tap2: "the other side edge" },
{ key: "width_middle",  n: 2, label: "Middle finger width: across the finger at its lowest knuckle (where it joins the hand)",
tap1: "one side edge of the middle finger", tap2: "the other side edge" },
{ key: "width_ring",    n: 2, label: "Ring finger width: across the finger at its lowest knuckle (where it joins the hand)",
tap1: "one side edge of the ring finger", tap2: "the other side edge" },
{ key: "width_little",  n: 2, label: "Little finger width: across the finger at its lowest knuckle (where it joins the hand)",
tap1: "one side edge of the little finger", tap2: "the other side edge" }
],
[
{ key: "finger_thickness", n: 2, label: "Finger thickness: the ONE finger seen from the side",
tap1: "the top surface of that finger", tap2: "the underside surface of the same finger, at the same spot along it" }
]
];
var K_T    = [1.000, 0.870, 0.950, 0.833]; // thickness / width, index..little
var REL_T  = [1.000, 0.909, 0.864, 0.682]; // thickness relative to the index finger
var THUMB_T_B = 0.88;                      // thumb thickness / thumb breadth
function mkStep() {
return {
url: null, iw: 0, ih: 0, hasPhoto: false,
calA: null, calB: null, calAv: 10, calBv: 20,
mode: "cal",
itemIdx: 0, pts: {}, skipped: {},
markers: [],
s: 1, ox: 0, oy: 0, fitScale: 1
};
}
var steps = [mkStep(), mkStep(), mkStep()];
var cur = 0;
var FINGER_STATUS = { index: "present", middle: "present", ring: "present",
little: "present", thumb: "present" };
var FKEYS = ["index", "middle", "ring", "little"];
var ITEM_FINGERS = {   // which digits an item needs; null = always available
wrist: null, hand_breadth: null, finger_thickness: null,
index_base: ["index"], index_tip: ["index"], width_index: ["index"],
middle_base: ["middle"], middle_tip: ["middle"], width_middle: ["middle"],
ring_base: ["ring"], ring_tip: ["ring"], width_ring: ["ring"],
little_base: ["little"], little_tip: ["little"], width_little: ["little"],
thumb_base: ["thumb"], thumb_tip: ["thumb"], thumb_breadth: ["thumb"]
};
function keyHidden(stepIdx, key) {
var need = ITEM_FINGERS[key];
if (need) {
for (var i = 0; i < need.length; i++) {
if (FINGER_STATUS[need[i]] === "missing") return true;
}
}
return false;
}
function itemHidden(stepIdx, it) { return keyHidden(stepIdx, it.key); }
function skipHidden(s, stepIdx) {
var items = STEP_ITEMS[stepIdx];
while (s.itemIdx < items.length && itemHidden(stepIdx, items[s.itemIdx])) s.itemIdx++;
}
function calOK(s) { return mmPerPx(s) != null; }
function mmPerPx(s) {
if (!s.calA || !s.calB) return null;
var dpx = Math.hypot(s.calB.x - s.calA.x, s.calB.y - s.calA.y);
if (dpx < 1) return null;
return Math.abs(s.calBv - s.calAv) * 10 / dpx; // mm
}
function axisUnit(s) {
if (!s.calA || !s.calB) return null;
var dx = s.calB.x - s.calA.x, dy = s.calB.y - s.calA.y;
var d = Math.hypot(dx, dy);
if (d < 1) return null;
return { x: dx / d, y: dy / d };
}
function projMm(s, p, q) {
var u = axisUnit(s), k = mmPerPx(s);
if (!u || !k) return null;
return Math.abs((q.x - p.x) * u.x + (q.y - p.y) * u.y) * k;
}
function distMm(s, p, q) {
var k = mmPerPx(s);
if (!k) return null;
return Math.hypot(q.x - p.x, q.y - p.y) * k;
}
function tapePosCm(s, p) {
var u = axisUnit(s), k = mmPerPx(s);
if (!u || !k || !s.calA) return null;
var along = (p.x - s.calA.x) * u.x + (p.y - s.calA.y) * u.y;
return s.calAv + (along * k) / 10;
}
function pairVal(s, key) {
var P = s.pts[key];
if (!P || !P.p2 || !calOK(s)) return null;
return distMm(s, P.p1, P.p2);
}
function fit() {
var s = steps[cur];
if (!s.hasPhoto) return;
var r = viewport.getBoundingClientRect();
var k = Math.min(r.width / s.iw, r.height / s.ih);
s.fitScale = k; s.s = k;
s.ox = (r.width - s.iw * k) / 2;
s.oy = (r.height - s.ih * k) / 2;
apply();
}
function apply() {
var s = steps[cur];
stage.style.transform = "translate(" + s.ox + "px," + s.oy + "px) scale(" + s.s + ")";
zoomLabel.textContent = Math.round(s.s / s.fitScale * 100) + "%";
for (var i = 0; i < s.markers.length; i++) {
s.markers[i].el.style.transform = "translate(0px,0px) scale(" + (1 / s.s) + ")";
}
}
function clampScale(ns) { return Math.max(steps[cur].fitScale * 0.3, Math.min(steps[cur].fitScale * 24, ns)); }
function zoomAt(cx, cy, factor) {
var s = steps[cur];
var ns = clampScale(s.s * factor);
var px = (cx - s.ox) / s.s, py = (cy - s.oy) / s.s;
s.ox = cx - px * ns; s.oy = cy - py * ns; s.s = ns;
apply();
}
document.getElementById("zoomIn").addEventListener("click", function () {
var r = viewport.getBoundingClientRect();
zoomAt(r.width / 2, r.height / 2, 1.6);
});
document.getElementById("zoomOut").addEventListener("click", function () {
var r = viewport.getBoundingClientRect();
zoomAt(r.width / 2, r.height / 2, 1 / 1.6);
});
document.getElementById("fitBtn").addEventListener("click", fit);
function makeDotEl(m) {
var el = document.createElement("div");
el.className = "dot " + (m.cls || "") + (m.label ? " labeled" : "");
if (m.label) el.textContent = m.label;
el.style.left = m.x + "px";
el.style.top = m.y + "px";
stage.appendChild(el);
return el;
}
function addMarker(x, y, cls, label) {
var m = { x: x, y: y, cls: cls || "", label: label || "" };
m.el = makeDotEl(m);
steps[cur].markers.push(m);
apply();
return m;
}
function removeMarker(m) {
if (!m) return;
var arr = steps[cur].markers;
var i = arr.indexOf(m);
if (i >= 0) arr.splice(i, 1);
if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
}
function removeMarkerIn(stepIdx, m) {  // v3.1.7: for another step's markers
if (!m) return;
var arr = steps[stepIdx].markers;
var i = arr.indexOf(m);
if (i >= 0) arr.splice(i, 1);
if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
}
function clearDots() {
var dots = stage.querySelectorAll(".dot");
for (var i = 0; i < dots.length; i++) dots[i].parentNode.removeChild(dots[i]);
}
function rebuildDots() {
clearDots();
var arr = steps[cur].markers;
for (var i = 0; i < arr.length; i++) arr[i].el = makeDotEl(arr[i]);
apply();
}
function markCurrent(m) {
var arr = steps[cur].markers;
for (var i = 0; i < arr.length; i++) arr[i].el.classList.remove("current");
if (m) m.el.classList.add("current");
}
function markerByEl(el) {
var arr = steps[cur].markers;
for (var i = 0; i < arr.length; i++) if (arr[i].el === el) return arr[i];
return null;
}
function moveMarker(m, x, y) {
m.x = x; m.y = y;
if (m.el) { m.el.style.left = x + "px"; m.el.style.top = y + "px"; }
var s = steps[cur];
if (s.calA === m || s.calB === m) return;   // cal dots store their own x/y
for (var k in s.pts) {                        // keep the measurement in sync
var P = s.pts[k];
if (P.m1 === m && P.p1) { P.p1.x = x; P.p1.y = y; }
if (P.m2 === m && P.p2) { P.p2.x = x; P.p2.y = y; }
}
}
var pointers = new Map();
var pinch = null;
var dragM = null, dragOff = { x: 0, y: 0 }, dragMoved = false;
viewport.addEventListener("pointerdown", function (e) {
var s = steps[cur];
if (!s.hasPhoto) return;
viewport.setPointerCapture(e.pointerId);
if (pointers.size >= 2) dragM = null;  // two fingers: pinch wins over drag
var dotEl = (e.target && e.target.closest) ? e.target.closest(".dot") : null;
if (dotEl && pointers.size === 0) {
var dm = markerByEl(dotEl);
if (dm) {
var dr = viewport.getBoundingClientRect();
dragM = dm; dragMoved = false;
dragOff = { x: dm.x - (e.clientX - dr.left - s.ox) / s.s,
y: dm.y - (e.clientY - dr.top - s.oy) / s.s };
pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: true });
e.preventDefault();
return;
}
}
pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
if (pointers.size === 2) {
dragM = null;
var ids = Array.from(pointers.keys());
var p1 = pointers.get(ids[0]), p2 = pointers.get(ids[1]);
pinch = { d: Math.hypot(p2.x - p1.x, p2.y - p1.y), s: s.s };
}
e.preventDefault();
});
viewport.addEventListener("pointermove", function (e) {
if (!pointers.has(e.pointerId)) return;
var p = pointers.get(e.pointerId);
var s = steps[cur];
if (dragM) {  // dragging a dot: move it, keep everything in sync
var dgr = viewport.getBoundingClientRect();
var dmx = (e.clientX - dgr.left - s.ox) / s.s + dragOff.x;
var dmy = (e.clientY - dgr.top - s.oy) / s.s + dragOff.y;
if (Math.hypot(dmx - dragM.x, dmy - dragM.y) > 2) dragMoved = true;
moveMarker(dragM, dmx, dmy);
p.x = e.clientX; p.y = e.clientY;
return;
}
if (pointers.size === 1) {
var dx = e.clientX - p.x, dy = e.clientY - p.y;
if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) p.moved = true;
if (p.moved) { s.ox += dx; s.oy += dy; apply(); }
p.x = e.clientX; p.y = e.clientY;
} else if (pointers.size === 2 && pinch) {
p.x = e.clientX; p.y = e.clientY; p.moved = true;
var ids = Array.from(pointers.keys());
var q1 = pointers.get(ids[0]), q2 = pointers.get(ids[1]);
var d = Math.hypot(q2.x - q1.x, q2.y - q1.y);
var mid = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 };
var r = viewport.getBoundingClientRect();
if (d > 10) zoomAt(mid.x - r.left, mid.y - r.top, d / pinch.d);
pinch.d = d;
}
});
viewport.addEventListener("pointerup", function (e) {
var p = pointers.get(e.pointerId);
pointers.delete(e.pointerId);
if (pointers.size < 2) pinch = null;
if (!p) return;
var s = steps[cur];
if (dragM) {  // finished dragging a dot: recompute, mark AI dots as verified
var fin = dragM;
dragM = null;
if (dragMoved && fin.cls === "ai") {
fin.cls = "";
if (fin.el) fin.el.className = "dot labeled";
}
if (s.calA === fin || s.calB === fin) updateCal();
else { refreshItems(); computeResults(); }
return;
}
if (!p.moved && s.hasPhoto) {
var r = viewport.getBoundingClientRect();
var ix = (e.clientX - r.left - s.ox) / s.s;
var iy = (e.clientY - r.top - s.oy) / s.s;
handleTap(ix, iy);
}
});
viewport.addEventListener("pointercancel", function (e) { pointers.delete(e.pointerId); pinch = null; dragM = null; });
function handleTap(x, y) {
var s = steps[cur];
if (s.mode === "cal") {
if (!s.calA) {
s.calA = addMarker(x, y, "cal", "1");
markCurrent(s.calA);
calStatus.textContent = "First mark set. Now tap the second tape marking.";
} else if (!s.calB) {
s.calB = addMarker(x, y, "cal", "2");
markCurrent(null);
updateCal();
} else {
removeMarker(s.calA);
s.calA = s.calB;
s.calA.label = "1";
if (s.calA.el) s.calA.el.textContent = "1";
s.calB = addMarker(x, y, "cal", "2");
updateCal();
}
} else {
var items = STEP_ITEMS[cur];
var it = items[s.itemIdx];
if (!it) return;
if (itemHidden(cur, it)) return;  // digit marked missing: not tappable
var P = s.pts[it.key];
if (!P) {
var m = addMarker(x, y, "", String(s.itemIdx + 1));
s.pts[it.key] = { p1: { x: x, y: y }, m1: m };
delete s.skipped[it.key];
var ownT = ITEM_FINGERS[it.key];
if (ownT && ownT.length === 1) SKIP_ASKED[ownT[0]] = false;
if (it.n === 1) { markCurrent(null); advance(); }
else markCurrent(m);
} else if (it.n === 2 && !P.p2) {
var m2 = addMarker(x, y, "", String(s.itemIdx + 1));
P.p2 = { x: x, y: y };
P.m2 = m2;
markCurrent(null);
advance();
}
}
}
function itemComplete(s, it) {
var P = s.pts[it.key];
return !!P && (it.n === 1 || !!P.p2);
}
function advance() {
var s = steps[cur], items = STEP_ITEMS[cur];
while (s.itemIdx < items.length &&
(itemHidden(cur, items[s.itemIdx]) ||
itemComplete(s, items[s.itemIdx]) || s.skipped[items[s.itemIdx].key])) {
s.itemIdx++;
}
refreshItems();
computeResults();
}
function reopenItem(idx) {
var s = steps[cur], items = STEP_ITEMS[cur], it = items[idx];
if (!it || itemHidden(cur, it)) return;
var P = s.pts[it.key];
if (P) {
removeMarker(P.m1);
if (P.m2) removeMarker(P.m2);
delete s.pts[it.key];
}
delete s.skipped[it.key];
s.itemIdx = idx;
markCurrent(null);
refreshItems();
computeResults();
}
function tapeTxt(s, p) {
var tp = tapePosCm(s, p);
return tp == null ? "" : "  ·  tape: " + tp.toFixed(1) + " cm";
}
function pairTxt(s, key) {
var v = pairVal(s, key);
return v == null ? "  ·  not calibrated yet" : "  ·  " + Math.round(v) + " mm";
}
function refreshItems() {
var s = steps[cur], items = STEP_ITEMS[cur];
skipHidden(s, cur);
var it = items[s.itemIdx];
if (s.mode === "cal" && !calOK(s)) {
currentItem.textContent = "First calibrate this photo's tape (button A); the guided taps start right after.";
} else if (!it) {
currentItem.textContent = "All measurements for this photo are done. See Results, or switch to another step.";
} else {
var P = s.pts[it.key];
if (!P) {
currentItem.textContent = "Tap point 1" + (it.n === 2 ? ": " + (it.tap1 || "first edge") : ": " + it.label);
} else {
currentItem.textContent = "Tap point 2: " + (it.tap2 || "second edge") + "  (" + it.label + ")";
}
}
fingerSelRow.style.display = (cur === 2) ? "flex" : "none";
if (cur === 2 && FINGER_STATUS[FKEYS[tRefIdx()]] === "missing") {
for (var rf = 0; rf < 4; rf++) {
if (FINGER_STATUS[FKEYS[rf]] !== "missing") { fingerSel.value = String(rf); break; }
}
}
itemList.innerHTML = "";
for (var i = 0; i < items.length; i++) {
var it2 = items[i];
if (itemHidden(cur, it2)) continue;  // digit not present: no line, no taps
var li = document.createElement("li");
var P2 = s.pts[it2.key];
if (itemComplete(s, it2)) {
li.textContent = (i + 1) + " · " + it2.label + (cur === 0 ? tapeTxt(s, P2.p1) : pairTxt(s, it2.key));
li.className = "done";
} else if (i === s.itemIdx && s.mode === "meas") {
li.textContent = (i + 1) + " · " + it2.label;
li.className = "now";
} else {
li.textContent = (i + 1) + " · " + it2.label;
if (s.skipped[it2.key]) li.style.opacity = "0.45";
}
li.title = "Click to re-tap this measurement";
li.style.cursor = "pointer";
(function (idx) {
li.addEventListener("click", function () {
if (steps[cur].mode !== "meas") return;
reopenItem(idx);
});
})(i);
itemList.appendChild(li);
}
}
var FINGER_ITEMS = {
index: [["index_base", 0], ["index_tip", 0], ["width_index", 1]],
middle: [["middle_base", 0], ["middle_tip", 0], ["width_middle", 1]],
ring: [["ring_base", 0], ["ring_tip", 0], ["width_ring", 1]],
little: [["little_base", 0], ["little_tip", 0], ["width_little", 1]],
thumb: [["thumb_base", 0], ["thumb_tip", 0], ["thumb_breadth", 1]]
};
var SKIP_ASKED = { index: false, middle: false, ring: false, little: false, thumb: false };
function fingerAllSkipped(f) {
for (var k = 0; k < FINGER_ITEMS[f].length; k++) {
var key = FINGER_ITEMS[f][k][0], st = FINGER_ITEMS[f][k][1];
if (steps[st].pts[key]) return false;
if (!steps[st].skipped[key]) return false;
}
return true;
}
document.getElementById("skipBtn").addEventListener("click", function () {
var s = steps[cur], items = STEP_ITEMS[cur];
var it = items[s.itemIdx];
if (!it) return;
s.skipped[it.key] = true;
advance();
var need = ITEM_FINGERS[it.key];
if (need && need.length === 1 && FINGER_STATUS[need[0]] !== "missing"
&& fingerAllSkipped(need[0]) && !SKIP_ASKED[need[0]]) {
var f = need[0];
SKIP_ASKED[f] = true;
var fname = (f === "thumb") ? "thumb" : (f + " finger");
var noGroove = window.confirm(
"You have skipped every measurement point for the " + fname + ".\n\n"
+ "OK: treat it as NOT PRESENT. The handle is built without "
+ (f === "thumb" ? "a thumb channel" : "its groove") + ".\n\n"
+ "Cancel: keep it on the hand, and its size is estimated from your other fingers.");
if (noGroove) {
fingerStatusSel[f].value = "missing";
var secF = document.getElementById("secFingers");
if (secF) secF.open = true;   // show the setting that just changed
applyFingerStatus();
}
}
});
document.getElementById("undoBtn").addEventListener("click", function () {
var s = steps[cur], items = STEP_ITEMS[cur];
if (s.mode === "cal") {
if (s.calB) { removeMarker(s.calB); s.calB = null; calStatus.textContent = "Tap the second marking."; }
else if (s.calA) { removeMarker(s.calA); s.calA = null; calStatus.textContent = "Waiting for two calibration taps…"; }
computeResults();
return;
}
var last = -1;
for (var i = 0; i < items.length; i++) {
if (itemHidden(cur, items[i])) continue;
if (s.pts[items[i].key] || s.skipped[items[i].key]) last = i;
}
if (last < 0) return;
var it = items[last], P = s.pts[it.key];
if (P) {
if (it.n === 2 && P.p2) {
removeMarker(P.m2);
delete P.p2; delete P.m2;
} else {
removeMarker(P.m1);
delete s.pts[it.key];
}
delete s.skipped[it.key];
s.itemIdx = last;
} else if (s.skipped[it.key]) {
delete s.skipped[it.key];
s.itemIdx = last;
}
markCurrent(null);
refreshItems();
computeResults();
});
fingerSel.addEventListener("change", computeResults);
calInA.addEventListener("input", function (e) { steps[cur].calAv = parseFloat(e.target.value) || 0; updateCal(); });
calInB.addEventListener("input", function (e) { steps[cur].calBv = parseFloat(e.target.value) || 0; updateCal(); });
function applyFingerStatus() {
FINGER_STATUS.index = fingerStatusSel.index.value;
FINGER_STATUS.middle = fingerStatusSel.middle.value;
FINGER_STATUS.ring = fingerStatusSel.ring.value;
FINGER_STATUS.little = fingerStatusSel.little.value;
FINGER_STATUS.thumb = fingerStatusSel.thumb.value;
for (var st = 0; st < 3; st++) {
var s = steps[st], items = STEP_ITEMS[st];
for (var i = 0; i < items.length; i++) {
if (!itemHidden(st, items[i])) continue;
var P = s.pts[items[i].key];
if (P) {
removeMarkerIn(st, P.m1);
if (P.m2) removeMarkerIn(st, P.m2);
delete s.pts[items[i].key];
}
}
skipHidden(s, st);
}
markCurrent(null);
refreshItems();
computeResults();
}
["index", "middle", "ring", "little", "thumb"].forEach(function (k) {
fingerStatusSel[k].addEventListener("change", applyFingerStatus);
});
function updateCal() {
var s = steps[cur];
var k = mmPerPx(s);
if (k == null) {
calStatus.textContent = "Set the two tape values, then re-tap the markings.";
} else {
calStatus.textContent = "Calibrated: " + k.toFixed(4) + " mm per pixel.";
if (s.mode === "cal" && s.calA && s.calB) setMode("meas");  // auto-advance: no manual switch needed
}
photoStatus.textContent = s.hasPhoto ? ("Photo loaded. " + (k != null ? "Calibrated: " + k.toFixed(4) + " mm/px." : "Not calibrated yet.")) : "No photo yet for this step.";
computeResults();
}
var modeBtns = { cal: document.getElementById("modeCal"), meas: document.getElementById("modeMeas") };
function setMode(m) {
var s = steps[cur];
s.mode = m;
modeBtns.cal.classList.toggle("active", m === "cal");
modeBtns.meas.classList.toggle("active", m === "meas");
secCal.classList.toggle("active-mode", m === "cal");
secMeas.classList.toggle("active-mode", m === "meas");
if (m === "cal") {
calStatus.textContent = (s.calA && s.calB)
? "Calibrated: " + mmPerPx(s).toFixed(4) + " mm per pixel. Tap again to replace the second mark."
: "Waiting for two calibration taps…";
}
refreshItems();
}
modeBtns.cal.addEventListener("click", function () { setMode("cal"); });
modeBtns.meas.addEventListener("click", function () { setMode("meas"); });
var stepTabBtns = document.querySelectorAll("#stepTabs button");
var stepBaseNames = ["1 · Palm up", "2 · Palm down", "3 · Side view"];
function updateStepTabs() {
for (var i = 0; i < stepTabBtns.length; i++) {
stepTabBtns[i].classList.toggle("active", i === cur);
stepTabBtns[i].textContent = stepBaseNames[i] + (steps[i].hasPhoto ? " ✓" : "");
}
}
for (var bi = 0; bi < stepTabBtns.length; bi++) (function (idx) {
stepTabBtns[idx].addEventListener("click", function () { showStep(idx); });
})(bi);
function showStep(i) {
cur = i;
resetAIStatus();
var s = steps[i];
stepTitle.textContent = STEP_INFO[i].name;
stepHint.textContent = STEP_INFO[i].hint;
secAI.style.display = "block";
calInA.value = s.calAv;
calInB.value = s.calBv;
if (s.hasPhoto) {
photo.src = s.url;
emptyState.style.display = "none";
} else {
emptyState.style.display = "flex";
photo.removeAttribute("src");
}
rebuildDots();
updateStepTabs();
photoStatus.textContent = s.hasPhoto
? ("Photo loaded. " + (calOK(s) ? "Calibrated: " + mmPerPx(s).toFixed(4) + " mm/px." : "Not calibrated yet; do step A."))
: "No photo yet for this step.";
apply();
setMode(s.hasPhoto && calOK(s) ? "meas" : s.mode);  // returning to a calibrated photo goes straight to measuring
computeResults();
}
function revokeURL(u) {
if (u && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function"
&& String(u).indexOf("blob:") === 0) URL.revokeObjectURL(u);
}
document.getElementById("file").addEventListener("change", function (e) {
var f = e.target.files && e.target.files[0];
if (!f) return;
var s = steps[cur];
function photoFailMsg() {
photoStatus.textContent = "That photo could not be loaded. Try a JPEG or PNG, or open this site in Chrome or Safari. For a local copy, keep index.html and its assets folder together.";
}
function startPhoto(url, canRetry) {
photo.onload = function () {
if (photo.src !== url) return;  // a different image is loading (step switch / re-pick): not ours, ignore
photo.onload = null;            // ONE-SHOT: switching steps re-sets photo.src and must never re-run this
photo.onerror = null;
if (s.url) revokeURL(s.url);
s.url = url;
s.iw = photo.naturalWidth; s.ih = photo.naturalHeight;
s.hasPhoto = true;
resetAIStatus();
clearDots();
s.markers = [];
s.calA = s.calB = null;
s.pts = {}; s.skipped = {}; s.itemIdx = 0;
emptyState.style.display = "none";
updateStepTabs();
fit();
setMode("cal");
photoStatus.textContent = "Photo loaded. Not calibrated yet; do step A.";
computeResults();
};
photo.onerror = function () {
photo.onerror = null;
if (canRetry && typeof FileReader !== "undefined") {
var rd = new FileReader();
rd.onload = function () { startPhoto(rd.result, false); };
rd.onerror = function () { photoFailMsg(); };
rd.readAsDataURL(f);
} else {
photoFailMsg();
}
};
photo.src = url;
}
var url = null;
try {
if (window.URL && typeof URL.createObjectURL === "function") url = URL.createObjectURL(f);
} catch (err1) { url = null; }
if (url) {
startPhoto(url, true);
} else if (typeof FileReader !== "undefined") {
var rd2 = new FileReader();
rd2.onload = function () { startPhoto(rd2.result, false); };
rd2.onerror = function () { photoFailMsg(); };
rd2.readAsDataURL(f);
} else {
photoFailMsg();
}
e.target.value = "";
});
function roundMM(v) { return Math.round(v); }  // whole millimetres: one clean number per value
function pairRound(s, key) {
var v = pairVal(s, key);
return v == null ? null : roundMM(v);
}
function tRefIdx() { return parseInt(fingerSel.value, 10) || 0; }
function computeResults() {
document.getElementById("exampleStatus").textContent = "Photo measurement mode. Complete the three guided steps, then review measurements below. For a sample handle, choose Enter measurements and load the baseline.";
var s0 = steps[0], s1 = steps[1], s2 = steps[2];
var out = {
hand_length: null, hand_breadth: null, palm_length: null, palm_depth: null,
grip_diameter_inside: null,
thumb_length: null, thumb_breadth: null, thumb_thickness: null,
finger_widths: [null, null, null, null],
finger_lengths: [null, null, null, null],
finger_thicknesses: [null, null, null, null]
};
var est = { finger_thicknesses: [false, false, false, false],
finger_lengths: [false, false, false, false],
finger_widths: [false, false, false, false],
thumb_thickness: false, grip_diameter_inside: false,
hand_length: false, palm_length: false };
var p0 = s0.pts;
var prim = 1;
if (FINGER_STATUS.middle === "missing") {
prim = -1;
var bl = -1;
for (var pi = 0; pi < 4; pi++) {
var pt = p0[FKEYS[pi] + "_tip"];
if (FINGER_STATUS[FKEYS[pi]] !== "missing" && pt && p0.wrist) {
var d = projMm(s0, p0.wrist.p1, pt.p1);
if (d != null && d > bl) { bl = d; prim = pi; }
}
}
}
var primTip = (prim >= 0) ? p0[FKEYS[prim] + "_tip"] : null;
var primBase = (prim >= 0) ? p0[FKEYS[prim] + "_base"] : null;
if (p0.wrist && primTip) {
var hl = projMm(s0, p0.wrist.p1, primTip.p1);
if (hl != null) out.hand_length = roundMM(hl);
if (prim !== 1) est.hand_length = true;
}
if (p0.wrist && primBase) {
var pl = projMm(s0, p0.wrist.p1, primBase.p1);
if (pl != null) out.palm_length = roundMM(pl);
if (prim !== 1) est.palm_length = true;
}
var names = ["index", "middle", "ring", "little"];
for (var i = 0; i < 4; i++) {
var b = p0[names[i] + "_base"], t = p0[names[i] + "_tip"];
if (b && t) {
var v = projMm(s0, b.p1, t.p1);
if (v != null) out.finger_lengths[i] = roundMM(v);
}
}
if (p0.thumb_base && p0.thumb_tip) {
var tl = distMm(s0, p0.thumb_base.p1, p0.thumb_tip.p1); // thumb crosses the tape: straight distance
if (tl != null) out.thumb_length = roundMM(tl);
}
var measL = [];
for (i = 0; i < 4; i++) {
if (out.finger_lengths[i] != null) measL.push(out.finger_lengths[i]);
}
var meanL = measL.length ? measL.reduce(function (a, b) { return a + b; }, 0) / measL.length : null;
for (i = 0; i < 4; i++) {
if (out.finger_lengths[i] == null && FINGER_STATUS[FKEYS[i]] !== "missing" && meanL != null) {
out.finger_lengths[i] = roundMM(meanL);
est.finger_lengths[i] = true;
}
}
if (s1.pts.hand_breadth)  out.hand_breadth  = pairRound(s1, "hand_breadth");
if (s1.pts.thumb_breadth) out.thumb_breadth = pairRound(s1, "thumb_breadth");
var wkeys = ["width_index", "width_middle", "width_ring", "width_little"];
for (i = 0; i < 4; i++) {
if (s1.pts[wkeys[i]]) out.finger_widths[i] = pairRound(s1, wkeys[i]);
}
var measW = [];
for (i = 0; i < 4; i++) {
if (out.finger_widths[i] != null) measW.push(out.finger_widths[i]);
}
var meanW = measW.length ? measW.reduce(function (a, b) { return a + b; }, 0) / measW.length : null;
for (i = 0; i < 4; i++) {
if (out.finger_widths[i] == null && FINGER_STATUS[FKEYS[i]] !== "missing" && meanW != null) {
out.finger_widths[i] = roundMM(meanW);
est.finger_widths[i] = true;
}
}
var ref = tRefIdx();
if (FINGER_STATUS[FKEYS[ref]] === "missing") ref = -1;  // never attribute the tap to a missing finger
if (ref >= 0 && s2.pts.finger_thickness) {
var tv = pairVal(s2, "finger_thickness");
if (tv != null) {
out.finger_thicknesses[ref] = roundMM(tv);
var ws = out.finger_widths;
var C = (ws[ref] != null && K_T[ref] > 0) ? tv / (ws[ref] * K_T[ref]) : null;
for (i = 0; i < 4; i++) {
if (i === ref) continue;
if (FINGER_STATUS[FKEYS[i]] === "missing") continue;  // stays null: no finger, no groove
if (C != null && ws[i] != null) {
out.finger_thicknesses[i] = roundMM(ws[i] * K_T[i] * C);
} else {
out.finger_thicknesses[i] = roundMM(tv * REL_T[i] / REL_T[ref]);
}
est.finger_thicknesses[i] = true;
}
}
}
if (FINGER_STATUS.thumb !== "missing") {
if (out.thumb_thickness == null && out.thumb_breadth != null) {
out.thumb_thickness = roundMM(out.thumb_breadth * THUMB_T_B);
est.thumb_thickness = true;
} else if (out.thumb_thickness == null && out.finger_thicknesses[0] != null) {
out.thumb_thickness = out.finger_thicknesses[0];
est.thumb_thickness = true;
}
}
if (FINGER_STATUS.thumb !== "missing" && out.thumb_length != null && out.thumb_thickness != null) {
var wrapL = out.finger_lengths[1];
if (FINGER_STATUS.middle === "missing") {
var wl = null;
for (i = 0; i < 4; i++) {
if (FINGER_STATUS[FKEYS[i]] !== "missing" && out.finger_lengths[i] != null &&
(wl == null || out.finger_lengths[i] > wl)) wl = out.finger_lengths[i];
}
wrapL = wl;
}
if (wrapL != null) {
out.grip_diameter_inside = roundMM((out.thumb_length + wrapL + out.thumb_thickness) / Math.PI);
est.grip_diameter_inside = true;
}
}
if (LAST.stl != null && LAST.genSig != null) {
var sig = JSON.stringify(out) + "|" + gripIn.value;
if (sig !== LAST.genSig) {
invalidateBuild();
}
}
renderResults(out, est);
updatePhotoProgress(out);
}
function updatePhotoProgress(out) {
var progress=document.getElementById("photoProgress"),lines=[];
for(var si=0;si<3;si++){
var step=steps[si],items=STEP_ITEMS[si],complete=0,skipped=0,total=0;
for(var i=0;i<items.length;i++){if(itemHidden(si,items[i]))continue;total++;if(itemComplete(step,items[i]))complete++;else if(step.skipped[items[i].key])skipped++;}
var state=!step.hasPhoto?"photo needed":!calOK(step)?"photo loaded, calibration needed":complete+"/"+total+" measurements completed"+(skipped?", "+skipped+" skipped":"");
lines.push((si+1)+" · "+["Palm up","Palm down","Side view"][si]+": "+state);
}
lines.push(out.grip_diameter_inside==null?"Grip estimate: not available yet":"Estimated grip diameter: "+out.grip_diameter_inside+" mm");
progress.textContent=lines.join("\n");
// An old missing-grip error must not remain visible after measurements arrive.
if(out.grip_diameter_inside!=null && genErrorKind==="missing_grip"){
genStatusEl.style.display="none";genErrorKind=null;
}
}
function row(name, v, src, isEst) {
return "<tr><td>" + name + (isEst ? " <span class='est'>(est.)</span>" : "") + "</td>"
+ "<td class='v'>" + (v == null ? "—" : v + " mm") + "</td>"
+ "<td class='hint'>" + src + "</td></tr>";
}
function sect(t) { return "<tr><th class='sect' colspan='3'>" + t + "</th></tr>"; }
function renderResults(out, est) {
LAST.out = out; LAST.est = est;
document.getElementById("copyStatus").textContent="";
document.getElementById("secResults").hidden = false;
var html = "<tr><th>Measurement</th><th>Value</th><th>Source</th></tr>";
html += sect("Photo 1 · Palm up");
html += row("Hand length", out.hand_length,
est.hand_length ? "wrist crease to the longest fingertip you have (middle not present)"
: "wrist crease to middle fingertip", est.hand_length);

var fn = ["index", "middle", "ring", "little"];
var FN = ["Index", "Middle", "Ring", "Little"];
for (var i = 0; i < 4; i++) {
html += (FINGER_STATUS[fn[i]] === "missing")
? row(FN[i] + " finger length", null, "finger not present")
: row(FN[i] + " finger length", out.finger_lengths[i],
est.finger_lengths[i] ? "average of your other measured finger lengths"
: "base crease to fingertip", est.finger_lengths[i]);
}
html += (FINGER_STATUS.thumb === "missing")
? row("Thumb length", null, "thumb not present")
: row("Thumb length", out.thumb_length, "thumb fold to tip, straight line");
html += sect("Photo 2 · Palm down");
html += row("Hand breadth", out.hand_breadth, "across the palm, right below the fingers");
html += (FINGER_STATUS.thumb === "missing")
? row("Thumb breadth", null, "thumb not present")
: row("Thumb breadth", out.thumb_breadth, "across the thumb, thickest point");
for (i = 0; i < 4; i++) {
html += (FINGER_STATUS[fn[i]] === "missing")
? row(FN[i] + " finger width", null, "finger not present")
: row(FN[i] + " finger width", out.finger_widths[i],
est.finger_widths[i] ? "average of your other measured finger widths"
: "across the finger at its lowest knuckle", est.finger_widths[i]);
}
html += sect("Photo 3 · Side view");
var ref = tRefIdx();
if (FINGER_STATUS[FKEYS[ref]] === "missing") ref = -1;
for (i = 0; i < 4; i++) {
if (FINGER_STATUS[fn[i]] === "missing") {
html += row(FN[i] + " finger thickness", null, "finger not present");
} else if (out.finger_thicknesses[i] == null) {
html += row(FN[i] + " finger thickness", null, i === ref ? "tap it in photo 3" : "estimated once one thickness is tapped");
} else {
html += row(FN[i] + " finger thickness", out.finger_thicknesses[i],
i === ref ? "measured in photo 3" : "estimated from the finger width", est.finger_thicknesses[i]);
}
}
html += (FINGER_STATUS.thumb === "missing")
? row("Thumb thickness", null, "thumb not present")
: row("Thumb thickness", out.thumb_thickness,
s2thumbSrc(est.thumb_thickness), est.thumb_thickness);
html += (FINGER_STATUS.thumb === "missing")
? row("Grip diameter (inside)", null,
"the thumb is not present, so no estimate is possible: type your own value in the Generate section")
: row("Grip diameter (inside)", out.grip_diameter_inside,
"estimated from other measurements; an override value replaces it", est.grip_diameter_inside);
var any = out.hand_length != null || out.hand_breadth != null || out.palm_length != null ||
out.thumb_length != null || out.finger_lengths.some(function (v) { return v != null; }) ||
out.finger_widths.some(function (v) { return v != null; }) ||
out.finger_thicknesses.some(function (v) { return v != null; });
if (!any) {
html += "<tr><td colspan='3' class='hint'>Load a photo, calibrate it, and tap the guided points; values appear here.</td></tr>";
}
resultsTable.innerHTML = html;
if (out._example) {
var sourceCells = resultsTable.querySelectorAll("td.hint");
for (var ei = 0; ei < sourceCells.length; ei++) sourceCells[ei].textContent = "Example profile (sample value)";
}
if (any) {
var e = {};
if (est.finger_thicknesses.some(function (v) { return v; })) e.finger_thicknesses = est.finger_thicknesses;
if (est.finger_lengths.some(function (v) { return v; })) e.finger_lengths = est.finger_lengths;
if (est.finger_widths.some(function (v) { return v; })) e.finger_widths = est.finger_widths;
if (est.thumb_thickness) e.thumb_thickness = true;
if (est.hand_length) e.hand_length = "reference finger substituted (middle not present)";

if (est.grip_diameter_inside) e.grip_diameter_inside = "estimate; a grip diameter you measured yourself overrides it";
var json = {
hand_length: out.hand_length,
hand_breadth: out.hand_breadth,

grip_diameter_inside: out.grip_diameter_inside,
thumb_length: out.thumb_length,
thumb_breadth: out.thumb_breadth,
thumb_thickness: out.thumb_thickness,
finger_widths: out.finger_widths,
finger_lengths: out.finger_lengths,
finger_thicknesses: out.finger_thicknesses,
_estimated: e,
_hand: {   // v3.1.7: digit presence as the user set it (the generator ignores this)
fingers: { index: FINGER_STATUS.index, middle: FINGER_STATUS.middle,
ring: FINGER_STATUS.ring, little: FINGER_STATUS.little },
thumb: FINGER_STATUS.thumb
}
};
if (out._example) json._provenance = { source: "hand_template.json example; not measured from photos" };
jsonOut.value = JSON.stringify(json, null, 2);
} else {
jsonOut.value = "";
}
var warns = [];
if (out.hand_length != null && (out.hand_length < 140 || out.hand_length > 235)) {
warns.push("The hand length reads <b>" + out.hand_length + " mm</b>, outside the normal adult range of 140 to 235 mm. "
+ "Two likely causes:<br>"
+ "1) <b>Calibration:</b> check that the two tape marks you tapped really have the cm values you entered. "
+ "Many tapes print inches on one edge; tapping inch numbers while entering cm values shrinks every measurement by 2.54 times.<br>"
+ "2) <b>Wrist point:</b> the list shows each photo-1 point's position on the tape. "
+ "Check the wrist entry: it should match where your wrist crease sits on the printed tape (about 0 cm if the "
+ "tape's zero started there). If it looks like a finger-base position, undo it and tap again.");
}
if (out.hand_breadth != null && (out.hand_breadth < 60 || out.hand_breadth > 110)) {
warns.push("The hand breadth reads <b>" + out.hand_breadth + " mm</b>, outside the normal adult range of 60 to 110 mm. "
+ "Check that the photo-2 calibration used cm (not inches), and that the two palm points sit on opposite outer edges, right below the fingers.");
}
for (var w = 0; w < 4; w++) {
var fw = out.finger_widths[w];
if (fw != null && FINGER_STATUS[fn[w]] === "present" && (fw < 13 || fw > 30)) {
warns.push("The " + fn[w] + " finger width reads <b>" + fw + " mm</b>, outside 13 to 30 mm. "
+ "Tap the two side edges again at the finger's lowest knuckle, and check this photo's calibration.");
}
}
for (w = 0; w < 4; w++) {
var ft = out.finger_thicknesses[w];
if (ft != null && FINGER_STATUS[fn[w]] === "present" && (ft < 12 || ft > 32)) {
warns.push("The " + fn[w] + " finger thickness reads <b>" + ft + " mm</b>, outside 12 to 32 mm. "
+ "Check the photo-3 calibration, and that the two taps are on the top and underside of the same finger.");
}
}
var warnBox = document.getElementById("warnBox");
if (warns.length) {
warnBox.innerHTML = warns.join("<br><br>");
warnBox.style.display = "block";
} else {
warnBox.style.display = "none";
}
}
function s2thumbSrc(isEst) {
return "estimated from the thumb breadth, or the index thickness";
}
document.getElementById("copyBtn").addEventListener("click", async function () {
var status=document.getElementById("copyStatus");
if(!jsonOut.value){status.textContent="No measurements to copy yet.";return;}
try {
if(typeof navigator!=="undefined" && navigator.clipboard && navigator.clipboard.writeText) {
await navigator.clipboard.writeText(jsonOut.value);
} else {
jsonOut.select();
if(!document.execCommand("copy"))throw new Error("Clipboard unavailable");
}
status.textContent="Measurements copied.";
} catch(err) {
jsonOut.select();
status.textContent="This viewer blocked clipboard access. The JSON is selected below; copy it using your browser’s Copy command.";
}
});
var genBtn = document.getElementById("genBtn");
var genStatusEl = document.getElementById("genStatus");
var genErrorKind = null;
var genStatsEl = document.getElementById("genStats");
var dlBtn = document.getElementById("dlBtn");
var gripIn = document.getElementById("gripOverride");
genBtn.addEventListener("click", function () {
if(document.body.dataset.inputMode === "manual") {
try {prepareManualMeasurements();}
catch(err){invalidateBuild();genStatusEl.style.display="block";genStatusEl.textContent="Cannot build yet: "+err.message+" To try the example, choose Load baseline measurements, then Generate STL.";document.getElementById("manualError").textContent=err.message;return;}
}
if (!LAST.out) {
genStatusEl.style.display = "block";
genStatusEl.innerHTML = "Measure first: the generator needs every measurement before it can build the handle.";
return;
}
var fields = ["hand_length", "hand_breadth", "palm_length", "palm_depth",
"grip_diameter_inside", "thumb_length", "thumb_breadth",
"thumb_thickness", "finger_widths", "finger_lengths",
"finger_thicknesses"];
var raw = {};
for (var fi = 0; fi < fields.length; fi++) raw[fields[fi]] = LAST.out[fields[fi]];
LAST.genSig = JSON.stringify(raw) + "|" + gripIn.value;  // v3.1.8 staleness stamp (before the override)
var go = parseFloat(gripIn.value);
if (isFinite(go) && go > 0) raw.grip_diameter_inside = go;
if (raw.grip_diameter_inside == null) {
genErrorKind="missing_grip";
LAST.stl = null;
dlBtn.style.display = "none";
genStatsEl.innerHTML = "";
genStatusEl.style.display = "block";
var pending=[];
if(raw.hand_length==null)pending.push("hand length");
if(raw.hand_breadth==null)pending.push("hand breadth");
if(FINGER_STATUS.thumb!=="missing"&&raw.thumb_length==null)pending.push("thumb length");
if(FINGER_STATUS.thumb!=="missing"&&raw.thumb_breadth==null)pending.push("thumb breadth");
if(!raw.finger_lengths||!raw.finger_lengths.some(function(v){return v!=null&&v>0;}))pending.push("finger lengths");
if(!raw.finger_widths||!raw.finger_widths.some(function(v){return v!=null&&v>0;}))pending.push("finger widths");
if(!raw.finger_thicknesses||!raw.finger_thicknesses.some(function(v){return v!=null&&v>0;}))pending.push("finger thickness");
genStatusEl.textContent="Cannot build: the current photo profile has no grip diameter. "
+(pending.length?"Still needed: "+pending.join(", ")+". ":"")
+"Complete the guided photo measurements to estimate it, or enter a measured grip diameter above. The word ‘estimated’ is a placeholder, not a value. "
+"To test with sample values instead, choose Enter measurements, click Load baseline measurements, then Generate STL.";

return;
}
LAST.side = "right";
var res;
try { res = GEN.generate(raw, LAST.side); }
catch (err) { res = { error: "internal error: " + err.message }; }
if (res.error) {
LAST.stl = null;
dlBtn.style.display = "none";
genStatsEl.innerHTML = "";
genStatusEl.style.display = "block";
genStatusEl.innerHTML = "<b>Cannot build yet:</b> " + res.error.replace(/ — /g, "; ");
return;
}
LAST.stl = res.stl;
window.dispatchEvent(new CustomEvent("grip-generated", {detail:Object.assign({},res,{measurements:raw,handedness:LAST.side})}));
var st = res.stats;
var meshNotice=document.getElementById("meshNotice");
meshNotice.textContent=st.watertight ? "Connectivity check passed. Print suitability, strength, and ergonomic fit have not been verified." : "Mesh repair required: this STL inherits non-closed or non-manifold connectivity from the original model. Download for inspection; repair and validate it before printing.";
meshNotice.hidden=false;
genStatusEl.style.display = "none";genErrorKind=null;
var volCm3 = (st.volume_mm3 / 1000).toFixed(1);
genStatsEl.innerHTML =
"<table><tr><th>Build check</th><th>Value</th></tr>"
+ "<tr><td>Closed mesh connectivity</td><td class='v'>" + (st.watertight ? "yes" : "no") + "</td></tr>"
+ "<tr><td>Triangles</td><td class='v'>" + st.triangles + "</td></tr>"
+ "<tr><td>Volume</td><td class='v'>" + volCm3 + " cm&sup3;</td></tr>"
+ "<tr><td>Handle length</td><td class='v'>" + st.handle_length_mm + " mm</td></tr>"
+ "<tr><td>Fits within hand length</td><td class='v'>"
+ (st.handle_within_hand_length ? "yes" : "<span style='color:#b45309'>no</span>") + "</td></tr>"
+ "<tr><td>Original mesh</td><td class='v'>" + (st.identity ? "unchanged" : "deformed") + "</td></tr>"
+ "</table>";
dlBtn.style.display = "inline-block";
});
function bytesToDataURL(data) {
var u8 = (data instanceof Uint8Array) ? data : new Uint8Array(data);
var CH = 8192, str = "";
for (var o = 0; o < u8.length; o += CH) {
str += String.fromCharCode.apply(null, u8.subarray(o, Math.min(o + CH, u8.length)));
}
return "data:application/octet-stream;base64," + btoa(str);
}
dlBtn.addEventListener("click", function () {
if (!LAST.stl) return;
var blob = new Blob([LAST.stl], { type: "model/stl" });
var url = null;
try {
if (window.URL && typeof URL.createObjectURL === "function") url = URL.createObjectURL(blob);
} catch (err2) { url = null; }
if (!url) url = bytesToDataURL(LAST.stl);
var a = document.createElement("a");
a.href = url;
a.download = "prybar_handle_" + LAST.side + ".stl";
document.body.appendChild(a);
a.click();
setTimeout(function () {
revokeURL(url);
if (a.parentNode) a.parentNode.removeChild(a);
}, 2000);
});
var aiBtn = document.getElementById("aiBtn");
var aiStatusEl = document.getElementById("aiStatus");
var aiModelPromise = null;
function resetAIStatus() {
aiSay("AI suggestions apply to the selected photo. Check every proposed point against the hand edge or crease before generating.", false);
}
function aiSay(html, isErr) {
aiStatusEl.innerHTML = html;
aiStatusEl.style.color = isErr ? "#7f1d1d" : "#6b6353";
aiStatusEl.style.background = isErr ? "#cfa6a6" : "transparent";
aiStatusEl.style.border = isErr ? "1px solid #a03030" : "none";
aiStatusEl.style.borderRadius = "0";
aiStatusEl.style.padding = isErr ? "8px 10px" : "0";
}
function aiGetModel() {
if (!aiModelPromise) {
aiModelPromise = (async function () {
var CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
var mod = await import(CDN);
var vision = await mod.FilesetResolver.forVisionTasks(CDN + "/wasm");
var make = function (delegate) {
return mod.HandLandmarker.createFromOptions(vision, {
baseOptions: {
modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
delegate: delegate
},
runningMode: "IMAGE",
numHands: 1
});
};
try { return await make("GPU"); }
catch (eGPU) { return await make("CPU"); }
})();
}
return aiModelPromise;
}
function aiPlace(s, key, p) {
if (s.pts[key]) return false;
var num = 0, items0 = STEP_ITEMS[0];
for (var qi = 0; qi < items0.length; qi++) if (items0[qi].key === key) num = qi + 1;
var m = addMarker(p.x, p.y, "ai", String(num));
s.pts[key] = { p1: { x: p.x, y: p.y }, m1: m };
delete s.skipped[key];
var ownA = ITEM_FINGERS[key];
if (ownA && ownA.length === 1) SKIP_ASKED[ownA[0]] = false;
return true;
}
aiBtn.addEventListener("click", async function () {
var s = steps[cur];
if (!s.hasPhoto) { aiSay("Load this step's photo first.", true); return; }
var aiStep=cur, aiUrl=s.url;
aiBtn.disabled = true;
aiSay("Loading the hand-landmark model (first use only, ~10 MB)…", false);
var model;
try { model = await aiGetModel(); }
catch (err) {
aiBtn.disabled = false;
if(cur===aiStep && steps[aiStep].url===aiUrl) aiSay("Could not load the AI model. Check your internet connection or open this site in Chrome or Safari, then retry. You can also place points manually.", true);
return;
}
if(cur!==aiStep||steps[aiStep].url!==aiUrl){aiBtn.disabled=false;resetAIStatus();return;}
var res;
try { res = model.detect(photo); }
catch (err) {
aiBtn.disabled = false;
aiSay("The AI could not read this photo. Tap the points yourself.", true);
return;
}
if (!res.landmarks || !res.landmarks.length) {
aiBtn.disabled = false;
aiSay("No hand found in this photo. Make sure the whole hand is in frame, well lit, and not blurred; then try again, or tap the points yourself.", true);
return;
}
var LM = res.landmarks[0];
function px(i) { return { x: LM[i].x * s.iw, y: LM[i].y * s.ih }; }
if(aiStep===1||aiStep===2){
try {
var sourceCanvas=document.createElement("canvas");sourceCanvas.width=s.iw;sourceCanvas.height=s.ih;
var sourceCtx=sourceCanvas.getContext("2d",{willReadFrequently:true});sourceCtx.drawImage(photo,0,0,s.iw,s.ih);
var image=sourceCtx.getImageData(0,0,s.iw,s.ih),suggestions=[],helper=window.handEdgeAssist;
function addPair(key,pair){if(pair&&!keyHidden(aiStep,key))suggestions.push([key,pair]);}
if(aiStep===1){
var idx=px(5),little=px(17),dir=helper.unit(little.x-idx.x,little.y-idx.y);
if(dir){var ia=helper.pair(image,idx,dir),la=helper.pair(image,little,dir);if(ia&&la)addPair("hand_breadth",[ia[0],la[1]]);}
addPair("thumb_breadth",helper.across(image,px(2),px(3)));
for(var fi=0;fi<4;fi++)addPair(["width_index","width_middle","width_ring","width_little"][fi],helper.across(image,px([5,9,13,17][fi]),px([6,10,14,18][fi])));
}else{
var finger=tRefIdx();
addPair("finger_thickness",helper.across(image,px([5,9,13,17][finger]),px([6,10,14,18][finger])));
}
var placedPairs=0,existingPairs=0;
for(var si=0;si<suggestions.length;si++){
var key=suggestions[si][0],points=suggestions[si][1];if(s.pts[key]){existingPairs++;continue;}
var index=STEP_ITEMS[aiStep].findIndex(function(item){return item.key===key;});
var m1=addMarker(points[0].x,points[0].y,"ai",String(index+1));
var m2=addMarker(points[1].x,points[1].y,"ai",String(index+1));
s.pts[key]={p1:{x:points[0].x,y:points[0].y},p2:{x:points[1].x,y:points[1].y},m1:m1,m2:m2};delete s.skipped[key];placedPairs++;
}
markCurrent(null);advance();if(calOK(s))setMode("meas");computeResults();
var expected=aiStep===1?6:1;
aiSay(placedPairs?"<b>Suggested "+placedPairs+" measurement pair(s).</b> Check and drag every teal dot to the actual visible edge. "+(existingPairs?existingPairs+" existing pair(s) kept. ":"")+(placedPairs+existingPairs<expected?"Some edges could not be estimated; tap the remaining measurements yourself. ":"")+(aiStep===2?"Confirm the selected finger matches the finger visible in the side photo. ":"")+(calOK(s)?"":"Calibrate the tape first."):"No reliable edge pairs found. Tap the visible edges manually.",!placedPairs);
} catch(error){aiSay("Could not estimate visible edges: "+error.message+". Tap the edges manually.",true);}
aiBtn.disabled=false;return;
}
var wr = px(0);
function thumbBase() {  // basal fold sits a little toward the palm from the thumb knuckle
var p = px(2), q = px(1);
return { x: p.x + (q.x - p.x) * 0.30, y: p.y + (q.y - p.y) * 0.30 };
}
var MAP = [
["wrist", wr],
["index_base", px(5)], ["index_tip", px(8)],
["middle_base", px(9)], ["middle_tip", px(12)],
["ring_base", px(13)], ["ring_tip", px(16)],
["little_base", px(17)], ["little_tip", px(20)],
["thumb_base", thumbBase()], ["thumb_tip", px(4)]
];
var placed = 0, already = 0;
for (var mi = 0; mi < MAP.length; mi++) {
if (keyHidden(0, MAP[mi][0])) continue;  // digit marked missing
if (s.pts[MAP[mi][0]]) { already++; continue; }
if (aiPlace(s, MAP[mi][0], MAP[mi][1])) placed++;
}
markCurrent(null);
advance();
setMode("meas");  // switch to Measure so button B highlights and the measure block tints
var hsets = res.handednesses || res.handedness || [];
var hand = (hsets.length && hsets[0].length) ? hsets[0][0].categoryName : "";
var msg = "<b>AI placed " + placed + " point" + (placed === 1 ? "" : "s") + "</b> (teal, numbered like the list)"
+ (already ? "; " + already + " point" + (already === 1 ? " you already tapped was" : "s you already tapped were") + " left alone" : "") + "."
+ "<br>The dots sit on the finger joints; for most hands the finger-base dots land right on the lowest creases. Check each finger base and the thumb fold that appears in your list against the photo, then drag any dot to fine-tune it (dragging an AI dot turns it green, which means you have checked it). To start over on one point, click its line in the list."
+ (hand ? "<br>Detected a <b>" + String(hand).toLowerCase() + "</b> hand as photographed; cameras can mirror photos; this grip is designed for the right hand." : "")
+ (calOK(s) ? "" : "<br>Calibrate the tape (button A) to turn the dots into measurements.");
var hl = projMm(s, wr, px(12));
if (hl != null && (hl < 100 || hl > 260)) {
msg += "<br><b>Warning:</b> the wrist to middle fingertip distance reads " + Math.round(hl) + " mm with this calibration; the AI dots may be misplaced (phones sometimes store photos with rotation data). If the dots look wrong, take the photo again or tap the points yourself.";
aiSay(msg, true);
} else {
aiSay(msg, false);
}
aiBtn.disabled = false;
});
function invalidateBuild() {
LAST.stl = null; LAST.genSig = null;
dlBtn.style.display = "none";
genStatsEl.innerHTML = "";
document.getElementById("meshNotice").hidden = true;
window.dispatchEvent(new CustomEvent("grip-invalidated"));
}
function measuredFlags() {
return {finger_lengths:[false,false,false,false],finger_widths:[false,false,false,false],finger_thicknesses:[false,false,false,false]};
}
function selectInputMode(mode) {
var changed=document.body.dataset.inputMode!==mode;
document.body.dataset.inputMode=mode;
if(changed){invalidateBuild();genStatusEl.style.display="none";if(mode==="photo")computeResults();else {LAST.out=null;document.getElementById("secResults").hidden=true;document.getElementById("exampleStatus").textContent="Manual measurement mode. Review your entered values and generate to update the preview.";} }
document.getElementById("manualMode").setAttribute("aria-pressed",String(mode==="manual"));
document.getElementById("photoMode").setAttribute("aria-pressed",String(mode==="photo"));
}
document.getElementById("manualMode").addEventListener("click",function(){selectInputMode("manual");});
document.getElementById("photoMode").addEventListener("click",function(){selectInputMode("photo");});
document.getElementById("manualHand").addEventListener("input",invalidateBuild);
gripIn.addEventListener("input",invalidateBuild);
var BASELINE_HAND = GRIP_BASELINE;
var EXAMPLE_HAND = JSON.parse(JSON.stringify(BASELINE_HAND));
var manualFields = document.querySelectorAll("#manualFields input");
function fillManualFields(profile) {
manualFields.forEach(function(input){var v=profile[input.dataset.field];if(input.dataset.index!==undefined)v=v&&v[Number(input.dataset.index)];input.value=v==null?"":v;});
}
function manualEdited(){invalidateBuild();LAST.out=null;document.getElementById("secResults").hidden=true;document.getElementById("manualError").textContent="Measurements changed. Apply them to build the new grip.";}
document.getElementById("manualFields").addEventListener("input",function(){
var profile={palm_depth:null,finger_lengths:[],finger_widths:[],finger_thicknesses:[]};
manualFields.forEach(function(input){var v=input.value.trim()===""?null:Number(input.value);if(input.dataset.index!==undefined)profile[input.dataset.field][Number(input.dataset.index)]=v;else profile[input.dataset.field]=v;});
document.getElementById("manualHand").value=JSON.stringify(profile,null,2);manualEdited();
});
document.getElementById("manualHand").addEventListener("input",function(){manualEdited();try{fillManualFields(JSON.parse(this.value));}catch(err){document.getElementById("manualError").textContent="JSON is incomplete or invalid.";}});
document.getElementById("loadBaseline").addEventListener("click",function(){
var profile=JSON.parse(JSON.stringify(BASELINE_HAND));fillManualFields(profile);document.getElementById("manualHand").value=JSON.stringify(profile,null,2);manualEdited();
document.getElementById("manualError").textContent="Baseline measurements loaded into the editable new-hand fields. Adjust them or click Apply measurements and generate.";
});
function manualExample(){var profile=JSON.parse(JSON.stringify(EXAMPLE_HAND));delete profile.palm_length;delete profile.palm_depth;return profile;}
function loadExample() {
fillManualFields(EXAMPLE_HAND);
document.getElementById("manualHand").value=JSON.stringify(manualExample(),null,2);
document.getElementById("manualError").textContent="";
LAST.stl = null;
LAST.genSig = null;
gripIn.value = "";
for (var key in FINGER_STATUS) FINGER_STATUS[key] = "present";
["fsIndex", "fsMiddle", "fsRing", "fsLittle", "fsThumb"].forEach(function (id) {
document.getElementById(id).value = "present";
});
var profile = JSON.parse(JSON.stringify(EXAMPLE_HAND));
profile._example = true;
renderResults(profile, measuredFlags());
document.getElementById("exampleStatus").textContent = "Baseline example loaded: 190 mm hand length, 55 mm grip diameter, right hand. The generated handle is ready in the Generate section below. Sample measurements only; no hand photos are loaded.";
genBtn.click();
}
document.getElementById("exampleResultsBtn").addEventListener("click", function () {
document.getElementById("secGen").scrollIntoView({behavior:"smooth"});
});
document.getElementById("manualHand").value = JSON.stringify(manualExample(), null, 2);
function prepareManualMeasurements(){
var raw;
try{raw=JSON.parse(document.getElementById("manualHand").value);}catch(err){throw new Error("The manual measurements are not valid JSON. Check the advanced measurements or reload the baseline.");}
var checkInput=Object.assign({},raw),override=parseFloat(gripIn.value);
if(isFinite(override)&&override>0)checkInput.grip_diameter_inside=override;
var checked=GEN.validateHand(checkInput);if(checked.error)throw new Error(checked.error);
var keys=["index","middle","ring","little"],ids=["fsIndex","fsMiddle","fsRing","fsLittle"];
for(var i=0;i<4;i++){FINGER_STATUS[keys[i]]=checked.val.finger_lengths[i]===0?"missing":"present";document.getElementById(ids[i]).value=FINGER_STATUS[keys[i]];}
FINGER_STATUS.thumb=checked.val.thumb_length===null?"missing":"present";document.getElementById("fsThumb").value=FINGER_STATUS.thumb;
// Preserve null entries for missing digits; the generator validates them itself.
renderResults(raw,measuredFlags());
var cells=resultsTable.querySelectorAll("td.hint");for(var c=0;c<cells.length;c++)cells[c].textContent="Entered manually";
document.getElementById("exampleStatus").textContent="Using your entered new-hand measurements. Reference baseline unchanged.";
document.getElementById("manualError").textContent="";
}
document.getElementById("applyHand").addEventListener("click",function(){genBtn.click();});

showStep(0);
loadExample();
selectInputMode("manual");
})();
