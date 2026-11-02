#!/usr/bin/env node
/*
 * Checks the drawing toolkit's pure math (no canvas needed):
 *
 *   node tools/test-draw.mjs
 *
 * Loads the component modules the pages embed, in page order, into one
 * scope and exercises SVG path parsing, trim, morph, viewBox fitting,
 * layout, the spring follower, two-bone IK, visemes, word beats, and draws
 * the character and SVG layers on a recording mock canvas in every look and
 * with malformed input (no NaN geometry, balanced save/restore, no snaps
 * between keyframed poses). Exits non-zero
 * with the failing check's message.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'components');
const src = ['00-registry.js', '01-catalog.js', '02-helpers.js', '02a-vector.js', '02b-figure.js', '02c-toon.js', '02d-kit.js', '02e-conversation.js', '02f-sets.js', '02g-story.js']
  .map(f => readFileSync(join(dir, f), 'utf8')).join('\n');
/* A recording stand-in for the canvas: every coordinate handed to it must
   be finite (canvas silently drops NaN geometry, so a NaN shows up as a
   missing limb rather than an error) and save/restore must balance. */
const bad = [];
const finite = (where, args) => {
  for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) { bad.push(`${where}(${args.map(String).join(', ')})`); return; }
};
const PATH_OPS = ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'closePath'];
class Path2D {
  addPath(p, m) { if (m) finite('addPath', [m.a, m.b, m.c, m.d, m.e, m.f]); }
}
for (const op of PATH_OPS) Path2D.prototype[op] = function (...a) { finite(op, a); };
class DOMMatrix {
  constructor(m) { Object.assign(this, m || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); }
  multiply(n) {
    const m = this;
    return new DOMMatrix({ a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f });
  }
  translate(x, y) { return this.multiply({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }); }
  rotate(deg) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return this.multiply({ a: c, b: s, c: -s, d: c, e: 0, f: 0 }); }
  scale(x, y) { return this.multiply({ a: x, b: 0, c: 0, d: y ?? x, e: 0, f: 0 }); }
}
class MockCtx {
  constructor() {
    this.depth = 0;
    this.fillStyle = this.strokeStyle = this.shadowColor = '#000';
    this.font = '10px sans-serif'; this.textAlign = 'left'; this.textBaseline = 'alphabetic';
    this.lineCap = 'butt'; this.lineJoin = 'miter'; this.globalCompositeOperation = 'source-over';
    this._num = { lineWidth: 1, globalAlpha: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, lineDashOffset: 0, miterLimit: 10 };
  }
  save() { this.depth++; }
  restore() { if (this.depth === 0) bad.push('restore() without save()'); else this.depth--; }
  measureText(t) { return { width: String(t).length * 8 }; }
  createLinearGradient(...a) { finite('createLinearGradient', a); return { addColorStop: (o) => finite('addColorStop', [o]) }; }
  createRadialGradient(...a) { finite('createRadialGradient', a); return { addColorStop: (o) => finite('addColorStop', [o]) }; }
  setLineDash(d) { finite('setLineDash', d || []); }
  getLineDash() { return []; }
}
for (const key of ['lineWidth', 'globalAlpha', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'lineDashOffset', 'miterLimit']) {
  Object.defineProperty(MockCtx.prototype, key, {
    get() { return this._num[key]; },
    set(v) { finite(key, [v]); this._num[key] = v; }
  });
}
for (const op of [...PATH_OPS, 'beginPath', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
  'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform', 'drawImage']) {
  MockCtx.prototype[op] = function (...a) { finite(op, a); };
}

const ctx = vm.createContext({ console, Math, Map, Array, Object, String, Number, JSON, isFinite, parseFloat, parseInt, Path2D, DOMMatrix });
vm.runInContext(src + '\n;globalThis.__sw = { SWDraw, swParsePath, swTrim, swBox, swBeat, swAutoDirect, swStoryBlocking, swStoryAt };', ctx);
const { SWDraw, swParsePath, swTrim, swBeat, swAutoDirect, swStoryBlocking, swStoryAt } = ctx.__sw;

let failed = 0;
const near = (a, b, eps) => Math.abs(a - b) <= (eps ?? 1e-6);
function check(name, ok, detail) {
  if (ok) return;
  failed++;
  console.error(`FAIL ${name}${detail ? ': ' + detail : ''}`);
}

// Path parsing: lines, relative moves, arcs, cubic/quadratic lengths.
{
  const sq = swParsePath('M0 0 H10 V10 H0 Z');
  check('square: one closed subpath', sq.length === 1 && sq[0].closed);
  check('square: perimeter 40', near(sq[0].len, 40, 1e-9), sq[0].len);
  const circle = swParsePath('M50 50 m-30 0 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0');
  check('circle: a moveto followed by moveto draws nothing', circle.length === 1, circle.length);
  check('circle: length 2*pi*r', near(circle[0].len, 2 * Math.PI * 30, 0.6), circle[0].len);
  const far = circle[0].pts.reduce((m, p) => Math.max(m, Math.hypot(p[0] - 50, p[1] - 50)), 0);
  check('circle: every sample on the circle', near(far, 30, 0.05), far);
  const quad = swParsePath('M0 0 Q50 0 100 0');
  check('collinear quadratic: length 100', near(quad[0].len, 100, 1e-6), quad[0].len);
  const rel = swParsePath('m10 10 l5 0 l0 5');
  check('relative lineto after moveto', near(rel[0].len, 10, 1e-9) && rel[0].pts[2][0] === 15 && rel[0].pts[2][1] === 15);
  const implicit = swParsePath('M0 0 10 0 10 10');
  check('implicit lineto after moveto', near(implicit[0].len, 20, 1e-9));
  check('pathLength sums subpaths', near(SWDraw.pathLength('M0 0 H10 M0 5 H20'), 30, 1e-9));
}

// Trim: half of a 0..100 line ends at x = 50.
{
  const t = swTrim(swParsePath('M0 0 H100'), 0, 0.5);
  const end = t[0].pts[t[0].pts.length - 1];
  check('trim end at half length', near(end[0], 50, 1e-9) && near(end[1], 0, 1e-9), JSON.stringify(end));
  const mid = swTrim(swParsePath('M0 0 H100'), 0.25, 0.75);
  check('trim window', near(mid[0].pts[0][0], 25, 1e-9) && near(mid[0].pts[mid[0].pts.length - 1][0], 75, 1e-9));
  const p = SWDraw.pointOnPath('M0 0 H100 V100', 0.75);
  check('pointOnPath at 75% of an L', near(p.x, 100, 1e-6) && near(p.y, 50, 1e-6) && near(p.angle, Math.PI / 2, 0.02), JSON.stringify(p));
}

// Morph: endpoints reproduce the inputs; the midpoint of a circle and a
// square of opposite winding stays a full shape (no collapse).
{
  const circle = 'M50 50 m-30 0 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0';
  const square = 'M20 20 H80 V80 H20 Z';
  const area = pts => Math.abs(pts.reduce((m, p, j) => { const q = pts[(j + 1) % pts.length]; return m + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const m0 = SWDraw.morph(circle, square, 0, 128)[0].pts;
  const m1 = SWDraw.morph(circle, square, 1, 128)[0].pts;
  const mh = SWDraw.morph(circle, square, 0.5, 128)[0].pts;
  check('morph t=0 is the circle', near(area(m0), Math.PI * 900, 60), area(m0));
  check('morph t=1 is the square', near(area(m1), 3600, 60), area(m1));
  check('morph midpoint keeps its area', area(mh) > 2600 && area(mh) < 3700, area(mh));
}

// viewBox fit (preserveAspectRatio).
{
  const box = { x: 100, y: 200, width: 400, height: 200 };
  const meet = SWDraw.fitViewBox([0, 0, 100, 100], box, 'xMidYMid meet');
  check('meet scales by the smaller axis', near(meet.sx, 2) && near(meet.sy, 2));
  check('meet centres horizontally', near(meet.tx, 200) && near(meet.ty, 200), JSON.stringify(meet));
  const slice = SWDraw.fitViewBox([0, 0, 100, 100], box, 'xMinYMin slice');
  check('slice scales by the larger axis', near(slice.sx, 4) && near(slice.tx, 100) && near(slice.ty, 200));
  const none = SWDraw.fitViewBox('10 10 100 50', box, 'none');
  check('none stretches each axis', near(none.sx, 4) && near(none.sy, 4) && near(none.tx, 60) && near(none.ty, 160));
}

// Layout: rows/grids tile the area; resolve separates and keeps inside.
{
  const L = SWDraw.layout;
  const area = { x: 0, y: 0, width: 1000, height: 400 };
  const row = L.row(4, area, 20);
  check('row: 4 equal boxes', row.length === 4 && near(row[0].width, 235) && near(row[3].x + row[3].width, 1000));
  const grid = L.grid(5, 2, area, 10);
  check('grid: 5 items in 2 columns, 3 rows', grid.length === 5 && near(grid[4].y, 2 * (380 / 3 + 10)) && near(grid[1].x, 505));
  const side = L.anchorTo({ x: 100, y: 100, width: 200, height: 100 }, 'right', 24, { width: 50, height: 40 });
  check('anchorTo right sits gap px outside, centred', near(side.x, 324) && near(side.cy, 150));
  const res = L.resolve([
    { x: 100, y: 100, width: 300, height: 150 },
    { x: 200, y: 150, width: 300, height: 150 },
    { x: 260, y: 120, width: 300, height: 150 }
  ], { x: 0, y: 0, width: 1080, height: 800 }, 16);
  let overlap = false;
  for (let i = 0; i < res.length; i++) for (let j = i + 1; j < res.length; j++) {
    const a = res[i], b = res[j];
    if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlap = true;
  }
  check('resolve leaves no overlaps', !overlap, JSON.stringify(res.map(b => [b.x, b.y])));
  check('resolve keeps boxes inside the area', res.every(b => b.x >= 0 && b.y >= 0 && b.x + b.width <= 1080 && b.y + b.height <= 800));
  const px = L.fitInside({ x: 1000, y: -40, width: 200, height: 100, }, area);
  check('fitInside clamps into the area', near(px.x, 800) && near(px.y, 0));
  check('a 1 px box is not mistaken for a fraction', near(L.row(1, { x: 1, y: 1, width: 1, height: 1 }, 0)[0].x, 1));
}

// Spring follower: settles on a constant, lags then overshoots a step, and
// is a pure function of time.
{
  const f = SWDraw.follow(() => 5, 3, {});
  check('follow settles on a constant signal', near(f, 5, 1e-9), f);
  const step = t => (t >= 1 ? 1 : 0);
  const at = t => SWDraw.follow(step, t, { freq: 2, damping: 0.3, window: 2, steps: 200 });
  check('follow lags right after a step', at(1.05) < 0.3, at(1.05));
  const peak = Math.max(...[1.2, 1.25, 1.3, 1.35, 1.4].map(at));
  check('underdamped follow overshoots', peak > 1.05, peak);
  check('follow is deterministic', at(1.3) === at(1.3));
}

// Two-bone IK: the chain reaches a reachable target with exact bone lengths.
{
  const r = SWDraw.ik2(0, 0, 60, 50, 60, 56, 1);
  check('ik2 reaches the target', near(r.ex, 60, 1e-6) && near(r.ey, 50, 1e-6), JSON.stringify(r));
  check('ik2 keeps the upper bone length', near(Math.hypot(r.jx, r.jy), 60, 1e-9));
  check('ik2 keeps the lower bone length', near(Math.hypot(r.ex - r.jx, r.ey - r.jy), 56, 1e-9));
  const far = SWDraw.ik2(0, 0, 1000, 0, 60, 56, 1);
  check('ik2 stops at full reach toward an unreachable target', far.ex > 115 && far.ex <= 116 && near(far.ey, 0, 1));
}

// Visemes follow the letters under the playhead.
{
  const w = [{ id: 'a', text: 'mama', start: 0, end: 1 }, { id: 'b', text: 'oof', start: 1, end: 2 }];
  check('M at the start of "mama"', SWDraw.viseme(w, 0.1).key === 'M');
  const a = SWDraw.viseme(w, 0.35);
  check('A in the open vowel of "mama"', a.key === 'A' && a.open > 0.6, JSON.stringify(a));
  check('closed lips on M', SWDraw.viseme(w, 0.55).open < 0.2);
  check('rounded lips on "oo"', SWDraw.viseme(w, 1.3).round > 0.9);
  check('rest between words', SWDraw.viseme(w, 2.5).key === 'rest' && SWDraw.viseme(w, 2.5).open === 0);
  check('Turkish dotless i maps to E', SWDraw.viseme([{ id: 'c', text: 'ı', start: 0, end: 1 }], 0.5).key === 'E');
}

// Colour mixing used by the cel shader.
{
  check('mix halfway', SWDraw.mix('#000000', '#FFFFFF', 0.5) === 'rgb(128,128,128)', SWDraw.mix('#000000', '#FFFFFF', 0.5));
  check('short hex', SWDraw.mix('#F00', '#F00', 0.3) === 'rgb(255,0,0)');
  check('rgba alpha carried', /rgba\(0,0,0,0\.500\)/.test(SWDraw.mix('rgba(0,0,0,0.5)', 'rgba(0,0,0,0.5)', 0)));
}

// The character draws every combination of its looks without a NaN
// coordinate, an exception or an unbalanced save/restore.
{
  const W = 1080, H = 1920;
  const boxes = [{ id: 'card', componentId: 'statBadge', x: 600, y: 500, width: 300, height: 160, cx: 750, cy: 580, w: 300, h: 160 }];
  const env = { W, H, boxes, boxOf: id => boxes.find(b => b.id === id || b.componentId === id) || null };
  const words = [{ id: 'a', text: 'Hello', start: 0.2, end: 0.6 }, { id: 'b', text: 'WORLD!', start: 0.7, end: 1.2 }];
  const draw = (o, label) => {
    const c = new MockCtx(), before = bad.length;
    let r = null;
    try { r = SWDraw.character(c, Object.assign({}, env, o)); }
    catch (e) { check(`character ${label} throws`, false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); return null; }
    if (c.depth !== 0) check(`character ${label} leaves save() open`, false, c.depth);
    if (bad.length > before) check(`character ${label} draws non-finite geometry`, false, bad.slice(before, before + 3).join('; '));
    if (r && !(Number.isFinite(r.fingertip.x) && Number.isFinite(r.fingertip.y) && Number.isFinite(r.head.x))) check(`character ${label} returns a non-finite fingertip`, false, JSON.stringify(r.fingertip));
    return r;
  };
  const poses = ['present', 'idle', 'point', 'wave', 'celebrate', 'think', 'explain', 'shrug', 'thumbsUp', 'hold', 'walk', 'moonwalk'];
  const outfits = ['jacket', 'suit', 'tshirt', 'hoodie', 'cape'];
  const hairs = ['modern', 'short', 'curly', 'bun', 'wavy', 'long', 'buzz', 'bald', 'none', 'mohawk'];
  const styles = ['detailed', 'flat', 'cartoon', 'geo'];
  check('every style is listed', JSON.stringify(SWDraw.characterStyles) === JSON.stringify(styles), JSON.stringify(SWDraw.characterStyles));
  for (const style of styles) for (const pose of poses) for (const outfit of outfits) for (const hairStyle of hairs) {
    const t = (poses.indexOf(pose) * 0.37 + hairs.indexOf(hairStyle) * 0.11) % 3;
    const r = draw({ style, pose, outfit, hairStyle, time: t, words, x: 0.3, y: 0.6, scale: 1.2, glasses: hairStyle === 'bun' }, `${style}/${pose}/${outfit}/${hairStyle}`);
    if (r && style !== 'detailed' && r.style !== style) check(`style ${style} is drawn by the stylised rig`, false, r.style);
  }
  const emotions = [...Object.keys(SWDraw.emotions), 'angry'];
  const hands = ['open', 'wave', 'relaxed', 'point', 'fist', 'thumbsUp', 'hold', 'peace'];
  for (const emotion of emotions) for (const handPose of hands) for (const facing of [1, -1]) {
    draw({ emotion, handPose, leftHandPose: handPose, facing, headTurn: facing * 0.8, headTilt: -0.5, time: 1.3 }, `${emotion}/${handPose}/${facing}`);
  }
  const odd = {
    'string coordinates': { x: 'abc', y: 'left', scale: 'big' },
    'NaN numbers': { x: NaN, y: NaN, scale: NaN, headTurn: NaN, pointAmount: NaN, time: NaN },
    'zero scale': { scale: 0 },
    'empty pointAt': { pointAt: {} },
    'unknown component id': { pointAt: 'missing' },
    'component id': { pointAt: 'card', pointAmount: 0.5 },
    'point inside a box': { pointAt: { x: 750, y: 580 } },
    'target behind the figure': { x: 900, pointAt: { x: 100, y: 1800 } },
    'target on the shoulder': { x: 500, y: 1000, pointAt: { x: 500, y: 900 } },
    'raw box': { pointAt: { x: 0.6, y: 0.2, width: 0.2, height: 0.1 }, aim: 'title' },
    'odd words': { words: [null, {}, { text: 42, start: 'x' }, { text: 'ok', start: 0.1, end: 0.3 }], time: 0.2 },
    'unsorted pose keys': { pose: [[2, 'wave'], [0, 'point'], ['x', 'think'], [1]], time: 1.2, localTime: 1.2 },
    'empty pose keys': { pose: [], emotion: [[0]] },
    'keyed numbers': { x: [[0, 0.1], [2, 0.8]], scale: [[0, 0.5], [1, 1.5]], headTurn: [[0, -1], [1, 1]], localTime: 0.7 },
    'malformed keys': { x: [0.2, 0.4], y: [[]], scale: [['a', 'b']], localTime: 0.5 },
    'hand overrides': { leftHand: { x: 0.1, y: 0.1 }, rightHand: { x: 2000, y: -500 } },
    'lookAt id': { lookAt: 'card' }, 'lookAt viewer': { lookAt: 'viewer' }, 'lookAt point': { lookAt: { x: 0.9, y: 0.1 } },
    'label and mouth': { label: 'Ada', mouth: 0.7, showPointerRay: true, pointAt: { x: 1000, y: 100 } },
    'body extremes': { bodyWidth: 9, bodyTurn: -9, walkAmount: 3, cadence: 0, vx: 1e9 }
  };
  for (const style of styles) for (const [label, o] of Object.entries(odd)) draw(Object.assign({ style, time: 0.9, words }, o), `${style}: ${label}`);
  for (const style of styles.slice(1)) for (const emotion of emotions) for (const handPose of hands) {
    draw({ style, emotion, handPose, leftHandPose: handPose, facing: -1, headTurn: -0.7, time: 0.5, words }, `${style}/${emotion}/${handPose}`);
  }
  check('character tolerates a missing opts object', (() => { const c = new MockCtx(); try { SWDraw.character(c); return c.depth === 0; } catch (e) { return false; } })());

  // Pose and pointing changes crossfade: no frame-to-frame fingertip snap.
  const maxJump = o => {
    let prev = null, jump = 0;
    for (let f = 0; f <= 180; f++) {
      const t = f / 60;
      const r = SWDraw.character(new MockCtx(), Object.assign({}, env, { time: t, localTime: t, x: 0.3, y: 0.6 }, o));
      if (prev) jump = Math.max(jump, Math.hypot(r.fingertip.x - prev.x, r.fingertip.y - prev.y));
      prev = r.fingertip;
    }
    return jump;
  };
  for (const style of styles) {
    const keyed = maxJump({ style, pose: [[0, 'present'], [1, 'wave'], [2, 'point']] });
    check(`${style}: pose keyframes crossfade without a snap`, keyed < 16, keyed.toFixed(1));
  }
  const ramp = maxJump({ pointAt: 'card', pointAmount: [[0, 0], [2, 1]] });
  check('pointAmount ramps the hand without a snap', ramp < 16, ramp.toFixed(1));
  const snap = SWDraw.character(new MockCtx(), Object.assign({}, env, { pose: [[0, 'present'], [1, 'wave']], localTime: 0.99 }));
  const after = SWDraw.character(new MockCtx(), Object.assign({}, env, { pose: [[0, 'present'], [1, 'wave']], localTime: 2 }));
  // Stylised pointing docks the fingertip just outside the target card.
  for (const style of styles.slice(1)) {
    const r = SWDraw.character(new MockCtx(), Object.assign({}, env, { style, x: 430, y: 700, scale: 1.3, pointAt: 'card', time: 1 }));
    const b = boxes[0], dx = Math.max(b.x - r.fingertip.x, 0, r.fingertip.x - (b.x + b.width)), dy = Math.max(b.y - r.fingertip.y, 0, r.fingertip.y - (b.y + b.height));
    const gap = Math.hypot(dx, dy);
    check(`${style}: fingertip docks beside the card`, gap > 10 && gap < 45, gap.toFixed(1));
  }
  // A cast member's look comes from the project's cast; the call wins.
  const ada = JSON.parse(readFileSync(join(dir, '..', '..', '..', 'examples', 'cast', 'ada.json'), 'utf8'));
  const castTable = { ada, kaan: { style: 'cartoon', shirtColor: '#F59E0B' } };
  const viaCast = SWDraw.character(new MockCtx(), Object.assign({}, env, { cast: 'kaan', castTable, time: 1 }));
  check('cast member supplies the style', viaCast.style === 'cartoon', viaCast.style);
  const override = SWDraw.character(new MockCtx(), Object.assign({}, env, { cast: 'kaan', castTable, style: 'geo', time: 1 }));
  check('call options override the cast member', override.style === 'geo', override.style);
  const unknown = SWDraw.character(new MockCtx(), Object.assign({}, env, { cast: 'nobody', castTable, time: 1 }));
  check('an unknown cast name falls back to the default kit', unknown.style === 'flat' && Number.isFinite(unknown.fingertip.x), unknown.style);
  // Illustrated parts: every pose, hand shape and viseme draws finite geometry.
  for (const pose of poses) for (const handPose of [undefined, ...hands]) {
    draw({ cast: 'ada', castTable, pose, handPose, time: 0.9, words, pointAt: pose === 'point' ? 'card' : null }, `ada/${pose}/${handPose}`);
  }
  draw({ cast: 'ada', castTable, emotion: 'sad', time: 3.7 }, 'ada blinking and sad');
  const tipAda = SWDraw.character(new MockCtx(), Object.assign({}, env, { cast: 'ada', castTable, x: 430, y: 700, scale: 1.3, pointAt: 'card', time: 1 }));
  const bA = boxes[0], gA = Math.hypot(Math.max(bA.x - tipAda.fingertip.x, 0, tipAda.fingertip.x - (bA.x + bA.width)), Math.max(bA.y - tipAda.fingertip.y, 0, tipAda.fingertip.y - (bA.y + bA.height)));
  check('illustrated hand docks beside the card', gA > 10 && gA < 45, gA.toFixed(1));
  const bare = { relaxed: { pivot: [0, 0], d: 'M0 0 H10' } };
  draw({ style: 'flat', parts: { hands: bare, head: { d: 'M0 0 H1', pivot: [0, 0], tip: [0, 0] }, torso: {} }, time: 1 }, 'degenerate parts');
  check('the dominant pose is reported', snap.pose === 'present' && after.pose === 'wave', `${snap.pose} ${after.pose}`);

  // A keyframed x walks the figure and turns it toward the motion.
  const fwd = SWDraw.character(new MockCtx(), Object.assign({}, env, { x: [[0, 0.1], [2, 0.8]], localTime: 1 }));
  const back = SWDraw.character(new MockCtx(), Object.assign({}, env, { x: [[0, 0.8], [2, 0.1]], localTime: 1 }));
  const still = SWDraw.character(new MockCtx(), Object.assign({}, env, { x: [[0, 0.5], [2, 0.5]], localTime: 1 }));
  check('keyframed x faces the direction of travel', fwd.facing === 1 && back.facing === -1 && still.facing === 1, `${fwd.facing} ${back.facing} ${still.facing}`);
  check('explicit facing wins over travel', SWDraw.character(new MockCtx(), Object.assign({}, env, { x: [[0, 0.8], [2, 0.1]], localTime: 1, facing: 1 })).facing === 1);
}

// Conversations: a character lip-syncs only its own words; speakerAt says
// who talks, holding briefly past a word's end.
{
  const w = [{ text: 'Merhaba', start: 0, end: 0.5, speaker: 'ada' }, { text: 'Selam', start: 1, end: 1.5, speaker: 'kaan' }];
  check('speakerAt finds the talker', SWDraw.speakerAt(w, 0.2) === 'ada' && SWDraw.speakerAt(w, 1.2) === 'kaan');
  check('speakerAt holds 0.3 s, then nobody', SWDraw.speakerAt(w, 0.7) === 'ada' && SWDraw.speakerAt(w, 0.9) === null && SWDraw.speakerAt(w, -1) === null);
  const mouthAt = (cast, t) => {
    let open = 0;
    const ctx2 = new MockCtx();
    SWDraw.character(ctx2, { style: 'flat', cast, castTable: { ada: {}, kaan: {} }, words: w, time: t });
    return SWDraw.viseme(w.filter(x => x.speaker === cast), t).open + open;
  };
  check('the listener stays quiet while the other speaks', mouthAt('kaan', 0.25) === 0 && mouthAt('ada', 0.25) > 0);
}

// Kits and conversations: a one-line cast member draws in every look; the
// plan reads gestures and the edit from the speakers; the studio draws any
// seat count in either orientation.
{
  const kit = SWDraw.kits.editorial;
  check('the editorial kit offers hair and beards', kit.hair.includes('long') && kit.beard.includes('full'), JSON.stringify(kit));
  const before = bad.length;
  for (const hair of kit.hair) for (const beard of ['none', 'full']) for (const pose of ['idle', 'explain', 'wave', 'point', 'think', 'hold', 'celebrate']) {
    const c = new MockCtx();
    try {
      const r = SWDraw.character(c, { kit: 'editorial', hair, beard, pose, time: 1.1, pointAt: pose === 'point' ? { x: 900, y: 200 } : null, W: 1080, H: 1920 });
      if (c.depth !== 0 || !(r && r.style === 'flat' && Number.isFinite(r.fingertip.x))) check(`kit ${hair}/${beard}/${pose}`, false, `depth ${c.depth}`);
    } catch (e) { check(`kit ${hair}/${beard}/${pose} throws`, false, String(e)); }
  }
  check('the kit draws finite geometry', bad.length === before, bad.slice(before, before + 3).join('; '));

  const W2 = (speaker, text, start, end) => ({ speaker, text, start, end });
  const words = [
    W2('ada', 'Merhaba!', 0, 0.6),
    W2('kaan', 'Selam!', 0.5, 1.0),
    W2('ada', 'Bugün', 1.4, 1.8), W2('ada', 'uzun', 1.8, 2.3), W2('ada', 'bir', 2.3, 2.6), W2('ada', 'konu', 2.6, 3.2), W2('ada', 'var.', 3.2, 4.4),
    W2('kaan', 'Gerçekten', 4.6, 5.3), W2('kaan', 'öyle', 5.3, 5.9), W2('kaan', 'mi?', 5.9, 6.2),
    W2('ada', 'Aynen.', 6.4, 6.9),
    W2('kaan', 'O', 7.1, 7.4), W2('kaan', 'zaman', 7.4, 8.0), W2('kaan', 'anlatayım,', 8.0, 8.9), W2('kaan', 'dinleyin.', 8.9, 10.2)
  ];
  const plan = SWDraw.conversationPlan(words);
  check('plan: four speakers turns become lines', plan.lines.length === 6, plan.lines.length);
  check('plan: hello waves', plan.poses.kaan.some(k => k[1] === 'wave') && plan.poses.ada.some(k => k[1] === 'wave'));
  check('plan: agreement is a thumbs-up', plan.poses.ada.some(k => k[1] === 'thumbsUp'));
  check('plan: a short question looks surprised', plan.emotions.kaan.some(k => k[1] === 'surprised'));
  check('plan: long lines change gesture by clause', plan.poses.kaan.filter(k => k[1] === 'explain' || k[1] === 'present').length >= 2);
  check('plan: close-ups only on long lines', plan.shots.length === 2 && plan.shots.every(s => s.b - s.a >= 2.4), JSON.stringify(plan.shots));
  check('plan: cached per word list', SWDraw.conversationPlan(words) === plan);
  const auto = SWDraw.character(new MockCtx(), { kit: 'editorial', cast: 'kaan', castTable: { kaan: { kit: 'editorial' } }, words, time: 0.7, localTime: 0.7 });
  check('pose auto acts the plan', auto.pose === 'wave', auto.pose);

  const castTable = { ada: { kit: 'editorial', name: 'Ada' }, kaan: { kit: 'editorial', hair: 'short', name: 'Kaan' }, elif: { kit: 'editorial', hair: 'long' }, mert: { kit: 'editorial', hair: 'curly', beard: 'full' }, ece: { style: 'cartoon' }, can: {} };
  const ids = Object.keys(castTable);
  const b0 = bad.length;
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) for (let n = 0; n <= 6; n++) for (const t of [0.2, 2.5, 6.6, 9.4]) {
    const c = new MockCtx();
    try {
      SWDraw.conversation(c, { W, H, time: t, words, castTable, seats: ids.slice(0, n).map(cast => ({ cast, role: 'GUEST' })), title: 'T', subtitle: 'S', liveLabel: 'LIVE' });
      if (c.depth !== 0) check(`conversation ${W}x${H}/${n} leaves save() open`, false, c.depth);
    } catch (e) { check(`conversation ${W}x${H}/${n} throws`, false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); }
  }
  check('conversation draws finite geometry', bad.length === b0, bad.slice(b0, b0 + 3).join('; '));
  const tiles = (W, H, n) => { const c = new MockCtx(); SWDraw.conversation(c, { W, H, time: 0, words: [], castTable, seats: ids.slice(0, n).map(cast => ({ cast })) }); return c; };
  check('conversation tolerates junk seats', (() => { try { const c = new MockCtx(); SWDraw.conversation(c, { seats: [null, { cast: 5 }, {}], words: null }); return c.depth === 0; } catch (e) { return false; } })());
  tiles(1080, 1920, 4);
}

// Anatomy, as rules a figure drawing obeys, for every pose of the default
// (kit) character: bones keep their length, the elbow never folds onto
// itself, a relaxed arm hangs beside the ribcage with the elbow at the
// waist, a standing leg is straight with the foot on the ground, and a
// seated one has its knee over its ankle.
{
  const relaxedArms = { idle: ['l', 'r'], walk: [], present: ['l'], point: ['l'], wave: ['l'], thumbsup: ['l'] };
  const poses = ['idle', 'present', 'point', 'wave', 'celebrate', 'think', 'explain', 'shrug', 'thumbsUp', 'hold', 'walk'];
  const angleAt = (a, o, b) => {
    const u = [a.x - o.x, a.y - o.y], v = [b.x - o.x, b.y - o.y];
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1)))) * 180 / Math.PI;
  };
  for (const seated of [false, true]) for (const pose of poses) for (const t of [0.4, 1.7, 2.9]) {
    if (seated && pose === 'walk') continue;
    const r = SWDraw.character(new MockCtx(), { pose, seated, time: t, localTime: t, W: 1080, H: 1920 });
    const J = r.joints, tag = `${seated ? 'seated ' : ''}${pose}@${t}`;
    for (const side of ['l', 'r']) {
      const A = J.arms[side];
      const up = Math.hypot(A.elbow.x - A.shoulder.x, A.elbow.y - A.shoulder.y);
      const fore = Math.hypot(A.wrist.x - A.elbow.x, A.wrist.y - A.elbow.y);
      if (Math.abs(up - J.upper) > 0.5) check(`${tag}: ${side} upper arm keeps its length`, false, up.toFixed(1));
      if (fore > J.fore + 0.5 || fore < J.fore * 0.45) check(`${tag}: ${side} forearm length (foreshortened at most by half)`, false, fore.toFixed(1));
      const bend = angleAt(A.shoulder, A.elbow, A.wrist);
      if (bend < 25) check(`${tag}: ${side} elbow folds onto itself`, false, bend.toFixed(0) + '°');
      if ((relaxedArms[pose.toLowerCase()] || []).includes(side)) {
        const dy = A.elbow.y - A.shoulder.y;
        if (dy < J.upper * 0.85) check(`${tag}: ${side} relaxed elbow hangs to the waist`, false, dy.toFixed(1));
        if (Math.abs(A.elbow.x - J.chestX) < J.shW - 12) check(`${tag}: ${side} relaxed arm hangs beside the ribcage, not over it`, false, (A.elbow.x - J.chestX).toFixed(1));
      }
    }
    for (const L of J.legs) {
      /* Celebrating hops; walking lifts the feet. */
      if (Math.abs(L.ankle.y - J.ankleY) > 0.5 && pose !== 'walk' && pose !== 'celebrate') check(`${tag}: foot on the ground`, false, L.ankle.y.toFixed(1));
      if (seated) {
        if (Math.abs(L.knee.x - L.ankle.x) > 3 || L.knee.y >= L.ankle.y) check(`${tag}: seated knee over the ankle`, false, JSON.stringify(L));
      } else if (pose !== 'walk') {
        const hx = L.ankle.x - L.hip.x, hy = L.ankle.y - L.hip.y, hl = Math.hypot(hx, hy);
        const off = Math.abs((L.knee.x - L.hip.x) * hy - (L.knee.y - L.hip.y) * hx) / hl;
        if (off > 1.5) check(`${tag}: standing leg is straight`, false, off.toFixed(2));
      }
    }
  }
}

// Laughter is catching; listeners glance about; openings go to camera.
{
  const W2 = (speaker, text, start, end) => ({ speaker, text, start, end });
  const words = [W2('ada', 'Merhaba', 0, 0.5), W2('ada', 'herkese,', 0.5, 1.0), W2('ada', 'hoş', 1.0, 1.3), W2('ada', 'geldiniz!', 1.3, 2.8),
    W2('kaan', 'Hahaha,', 3.0, 3.8), W2('kaan', 'çok', 3.8, 4.2), W2('kaan', 'komik', 4.2, 5.0), W2('kaan', 'bu.', 5.0, 6.2)];
  const plan = SWDraw.conversationPlan(words);
  check('laughing speaker laughs', plan.emotions.kaan.some(k => k[1] === 'laugh'));
  check('laughter spreads to the listener', plan.emotions.ada.some(k => k[1] === 'laugh' && k[0] > 3));
  check('emotion tracks stay in time order', Object.values(plan.emotions).every(tr => tr.every((k, i) => i === 0 || tr[i - 1][0] <= k[0])));
  const heads = { ada: { x: 100, y: 100 }, kaan: { x: 900, y: 100 }, elif: { x: 500, y: 900 } };
  const look = (cast, t) => swAutoDirect({ cast, words, time: t, lookAt: 'speaker', seatHeads: heads }).lookAt;
  check('the opening line goes to the camera', look('ada', 1.0) === 'viewer', JSON.stringify(look('ada', 1.0)));
  check('a listener watches the speaker', JSON.stringify(look('elif', 4.5)) === JSON.stringify(heads.kaan) || JSON.stringify(look('elif', 4.5)) === JSON.stringify(heads.ada));
  let glances = 0;
  for (let t = 3.0; t < 6.2; t += 0.05) if (JSON.stringify(look('elif', t)) === JSON.stringify(heads.ada)) glances++;
  check('listeners only glance away briefly', glances < 40, glances);
}

// Stories: scenes start where they say, people walk in from off stage,
// come together for an action, and the whole stage draws in any frame and
// with junk scenes.
{
  const L = (speaker, text, start, end) => text.split(' ').map((t, i, a) => ({ id: speaker + start + i, speaker, text: t, start: start + (end - start) * i / a.length, end: start + (end - start) * (i + 1) / a.length }));
  const words = [].concat(L('narrator', 'Bir sabah parkta karşılaştılar.', 0, 3), L('ada', 'Merhaba Kaan!', 5, 6.5), L('kaan', 'Selam Ada.', 7, 8.5), L('narrator', 'Akşam oldu.', 10, 12), L('ada', 'Al bakalım.', 13, 14.5));
  const lines = SWDraw.conversationPlan(words).lines;
  const scenes = [
    { set: 'park', cast: [{ cast: 'ada', x: 0.3, enter: 'left' }, { cast: 'kaan', x: 0.7 }], actions: [{ line: 2, type: 'handshake', a: 'ada', b: 'kaan' }] },
    { startLine: 3, set: 'cafe', night: true, cast: [{ cast: 'ada', x: 0.3, exit: 'right' }, { cast: 'kaan', x: 0.7, seated: true }], actions: [{ line: 4, type: 'give', a: 'ada', b: 'kaan', prop: 'mug' }] }
  ];
  const turnWords = [{ speaker: 'n', turn: 0, text: 'Bir.', start: 0, end: 1 }, { speaker: 'n', turn: 1, text: 'İki.', start: 1.2, end: 2 }, { speaker: 'a', turn: 2, text: 'Üç.', start: 2.2, end: 3 }];
  check('story: line n is the n-th turn even when one speaker talks twice', SWDraw.conversationPlan(turnWords).lines.length === 3);
  const tl = SWDraw.storyScenes(scenes, lines, words, 16);
  check('story: two scenes, the second at its line', tl.length === 2 && tl[0].a === 0 && Math.abs(tl[1].a - (10 - 0.15)) < 1e-6 && tl[0].b === tl[1].a, JSON.stringify(tl.map(x => [x.a, x.b])));
  const W = 1920, sc = 1.0;
  const block = swStoryBlocking(scenes[0], 0, tl[0].b, W, sc, lines, words);
  const ada0 = swStoryAt(block.plans.ada, 0), adaHome = swStoryAt(block.plans.ada, 4);
  check('story: an entrance starts off stage and walks', ada0.x < 0 && swStoryAt(block.plans.ada, 0.6).walking > 0, JSON.stringify(ada0));
  const tShake = lines[2].start - 0.15;
  const pa = swStoryAt(block.plans.ada, tShake), pk = swStoryAt(block.plans.kaan, tShake);
  check('story: the pair stand together for a handshake', Math.abs(pk.x - pa.x) > 100 && Math.abs(pk.x - pa.x) < 220 && pa.walking < 0.05, `${pa.x} ${pk.x} ${pa.walking}`);
  check('story: before the action they stood where placed', Math.abs(adaHome.x - 0.3 * W) < 1, adaHome.x);
  const b2 = swStoryBlocking(scenes[1], tl[1].a, 16, W, sc, lines, words);
  check('story: an exit walks off before the scene ends', swStoryAt(b2.plans.ada, 15.95).x > W, swStoryAt(b2.plans.ada, 15.95).x);
  const castTable = { ada: { kit: 'editorial' }, kaan: { kit: 'editorial', hair: 'short', outfit: 'hoodie' } };
  const before = bad.length;
  for (const [Wd, Hd] of [[1080, 1920], [1920, 1080]]) for (let t = 0; t < 16; t += 0.37) {
    const c = new MockCtx();
    try {
      SWDraw.story(c, { W: Wd, H: Hd, time: t, words, castTable, scenes, duration: 16 });
      if (c.depth !== 0) check(`story ${Wd}x${Hd}@${t.toFixed(2)} leaves save() open`, false, c.depth);
    } catch (e) { check(`story ${Wd}x${Hd}@${t.toFixed(2)} throws`, false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); }
  }
  check('story: finite geometry throughout', bad.length === before, bad.slice(before, before + 3).join('; '));
  for (const junk of [null, [], [null], [{ set: 'moon', cast: [null, { cast: 5 }, { cast: 'ghost' }], actions: [{ type: 'dance', a: 'ada' }, { type: 'hug', a: 'ada', b: 'nobody' }] }]]) {
    const c = new MockCtx();
    try { SWDraw.story(c, { W: 1080, H: 1920, time: 1, words, castTable, scenes: junk }); if (c.depth !== 0) check('story junk leaves save() open', false, JSON.stringify(junk)); }
    catch (e) { check('story tolerates junk scenes', false, JSON.stringify(junk) + ' ' + String(e)); }
  }
  /* Dropping and picking up: the thing lands where the dropper walked and
     stays; the picker reaches only after arriving next to it. */
  {
    const dw = [].concat(L('elif', 'Geç kaldım!', 0.5, 2), L('narrator', 'Defter düştü.', 2.5, 6), L('mert', 'Bu da ne?', 7, 9));
    const dl = SWDraw.conversationPlan(dw).lines;
    const sc1 = { set: 'street', cast: [{ cast: 'elif', x: 0.3, bag: true }], moves: [{ line: 1, cast: 'elif', x: 1.15 }], actions: [{ line: 1, offset: 1.2, type: 'drop', a: 'elif', prop: 'book' }] };
    const bl = swStoryBlocking(sc1, 0, 7, 1920, 1, dl, dw);
    const dropT = dl[1].start - 0.15 + 1.2;
    const it = bl.items[0];
    check('drop: the thing falls where she walks and stays', it && it.prop === 'book' && Math.abs(it.from - dropT) < 1e-6 && it.until === Infinity && Math.abs(it.x - (swStoryAt(bl.plans.elif, dropT).x + 34)) < 1, JSON.stringify(it));
    const sc2 = { set: 'street', items: [{ prop: 'book', x: 0.5 }], cast: [{ cast: 'mert', x: 0.8, enter: 'right' }], actions: [{ line: 2, type: 'pickup', a: 'mert', prop: 'book' }] };
    const b2 = swStoryBlocking(sc2, 6.5, 12, 1920, 1, dl, dw);
    const pk = b2.solo[0];
    const there = swStoryAt(b2.plans.mert, pk.t);
    check('pickup: the reach waits for the arrival', there.walking < 0.05 && Math.abs(there.x - (960 + 30)) < 1, JSON.stringify(there));
    check('pickup: the thing leaves the floor after the reach', Math.abs(b2.items[0].until - (pk.t + 0.55)) < 1e-6);
    const stand = SWDraw.character(new MockCtx(), { time: 1 }).joints, low = SWDraw.character(new MockCtx(), { time: 1, crouch: 1 }).joints;
    check('crouch: the hips drop and the feet stay on the floor', low.hipY - stand.hipY > 50 && low.legs.every(l => Math.abs(l.ankle.y - low.ankleY) < 0.5), `${stand.hipY} ${low.hipY}`);
    check('crouch: bones keep their length', low.legs.every(l => Math.abs(Math.hypot(l.knee.x - l.hip.x, l.knee.y - l.hip.y) - low.legLen) < 0.6));
    const c = new MockCtx(), b0 = bad.length;
    SWDraw.character(c, { bag: true, crouch: 0.6, time: 1 });
    SWDraw.character(c, { bag: '#335577', prop: 'book', time: 1 });
    check('bag and book draw cleanly', c.depth === 0 && bad.length === b0, bad.slice(b0, b0 + 2).join('; '));
  }
  for (const set of SWDraw.sets) for (const night of [false, true]) {
    const c = new MockCtx(), b0 = bad.length;
    SWDraw.set(c, set, { W: 1080, H: 1920, time: 3, night, camX: 40 });
    if (c.depth !== 0 || bad.length !== b0) check(`set ${set}${night ? ' night' : ''} draws cleanly`, false, bad.slice(b0, b0 + 2).join('; '));
  }
}

// Word-stress beats: on at a word's start, off 0.4 s later, stronger when
// emphasised.
{
  const w = [{ text: 'a', start: 0, end: 0.3 }, { text: 'important', start: 1, end: 1.5 }, { text: 'NOW', start: 2, end: 2.3 }, { text: 'now', start: 3, end: 3.3 }];
  check('beat peaks mid-rise of a word', swBeat(w, 1.2) > 0.9, swBeat(w, 1.2));
  check('beat is silent between words', swBeat(w, 1.5) === 0 && swBeat(w, -1) === 0);
  check('short words beat softly', swBeat(w, 0.2) < 0.35, swBeat(w, 0.2));
  check('ALL CAPS beats harder', swBeat(w, 2.2) > swBeat(w, 3.2) * 1.4, `${swBeat(w, 2.2)} vs ${swBeat(w, 3.2)}`);
  check('beat tolerates junk', swBeat(null, 1) === 0 && swBeat([null, {}], 1) === 0);
}

// svgLayers survives malformed layers without leaking canvas state.
{
  const c = new MockCtx(), before = bad.length;
  const layers = [
    null, {}, { d: '' }, { d: 'garbage' }, { d: 'M0 0 L' }, { d: 'M0 0 A0 0 0 0 0 10 10', stroke: '#fff' },
    { d: 'M0 0 L10 10', trimStart: 0.6, trimEnd: 0.4, stroke: '#fff' },
    { d: 'M0 0 H10 V10 Z', morphTo: 'M0 0', morph: 0.5, fill: '#f00' },
    { d: 'M0 0 H10', transform: { rotate: 'x', scale: NaN, x: null }, opacity: [[0, 0], [1, 1]], stroke: '#0f0', lineWidth: NaN },
    { layers: [{ d: 'M0 0 H10', stroke: '#fff', dash: [4, 'x'] }], opacity: 0.5 },
    { d: 'M0 0 H10 V10 Z', gradient: { type: 'radial', stops: [] }, shadow: { blur: NaN } }
  ];
  try {
    SWDraw.svgLayers(c, layers, { viewBox: [0, 0, 0, 0], box: { x: 0, y: 0, width: 100, height: 100 }, W: 1080, H: 1920, localTime: 0.5 });
    SWDraw.svgLayers(c, layers, { viewBox: 'nonsense', W: 1080, H: 1920 });
    SWDraw.svgLayers(c, 'not an array', {});
    check('svgLayers balances save/restore', c.depth === 0, c.depth);
    check('svgLayers draws no non-finite geometry', bad.length === before, bad.slice(before, before + 3).join('; '));
  } catch (e) {
    check('svgLayers tolerates malformed layers', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  }
}

if (failed) {
  console.error(`${failed} drawing check(s) failed`);
  process.exit(1);
}
console.log('drawing toolkit: all checks passed');
