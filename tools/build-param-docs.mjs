#!/usr/bin/env node
/*
 * Writes what an agent needs to know about the component library, read off
 * the library itself:
 *
 *   src/assets/component-params.json   for every catalog id, the params its
 *                                      renderer actually reads
 *   src/assets/toolkit-api.json        every function of the drawing toolkit
 *                                      (`sw` in a code overlay): its
 *                                      parameters and the comment written
 *                                      above it
 *
 *   node tools/build-param-docs.mjs            # rewrite the files
 *   node tools/build-param-docs.mjs --check    # exit 1 when one is stale
 *
 * Nothing here is written by hand. Each id is drawn through the shared chain
 * (the same modules the player and the editor embed) with params that record
 * every key the renderer asks for, so the list cannot drift from the code:
 *
 *   keys      what the renderer reads from params
 *   defaults  the fallback next to a read (`ecN(p.size, 72)`, `p.width || 440`)
 *   items     the keys read from each entry of an array param
 *   draws     the one-line description from COMPONENTS.md, where it has one
 *
 * list_components {componentId} serves both (the toolkit under a
 * codeOverlay_<slug> id), and add_component / update_component warn about a
 * param the component never reads.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'assets', 'components');
const outPath = join(root, 'src', 'assets', 'component-params.json');
const toolkitPath = join(root, 'src', 'assets', 'toolkit-api.json');
const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const lib = files.map(f => readFileSync(join(dir, f), 'utf8')).join('\n');
const player = readFileSync(join(root, 'src', 'assets', 'player.html'), 'utf8');

/* The six ids the player presents through DOM overlays read their params in
   player.html; their keys come from that code. */
const DOM_IDS = ['lowerThird', 'titleCard', 'numberCounter', 'captions', 'kineticWords', 'subtitleBar'];

class DOMMatrix {
  constructor() { Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); }
  multiply() { return this; } translate() { return this; } rotate() { return this; } scale() { return this; }
  inverse() { return this; } transformPoint(p) { return p || { x: 0, y: 0 }; }
}
class Path2D { addPath() {} }
for (const op of ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'closePath'])
  Path2D.prototype[op] = function () {};

/* A canvas that accepts every call and measures text by length. */
function mockCtx() {
  const state = {
    globalAlpha: 1, lineWidth: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, lineDashOffset: 0, miterLimit: 10,
    fillStyle: '#000', strokeStyle: '#000', shadowColor: '#000', font: '10px sans-serif', textAlign: 'left',
    textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', globalCompositeOperation: 'source-over', filter: 'none',
    canvas: { width: 1080, height: 1920 }
  };
  const grad = { addColorStop() {} };
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return s => ({ width: String(s).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (k === 'getTransform') return () => new DOMMatrix();
      if (k === 'getLineDash') return () => [];
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(4 * Math.max(1, (w | 0) * (h | 0) || 1)), width: w | 0, height: h | 0 });
      if (typeof k === 'string' && k.startsWith('create')) return () => grad;
      if (k === 'isPointInPath' || k === 'isPointInStroke') return () => false;
      if (typeof k === 'symbol') return undefined;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

/* Params that remember what was read. `Object.assign({}, params, extra)` —
   how the chain copies params before drawing — keeps the recorder. */
const REC = Symbol('rec');
function recorder(store, seen, items) {
  return new Proxy(store, {
    get(t, k) {
      if (k === REC) return { store: t, seen, items };
      if (typeof k !== 'string') return t[k];
      seen.add(k);
      const v = t[k];
      if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object') {
        let set = items.get(k);
        if (!set) { set = new Set(); items.set(k, set); }
        return v.map(entry => new Proxy(entry, { get(e, ek) { if (typeof ek === 'string') set.add(ek); return e[ek]; } }));
      }
      return v;
    }
  });
}

const host = `const T = { accent: '#38BDF8', accent2: '#F59E0B', accentInk: '#04121F', ink: '#F8FAFC', paper: '#0B1220', bg: {} };
function getImage() { return null; }
function initialsOf(v) { return String(v || '').slice(0, 2).toUpperCase(); }
function hash01(n) { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); }
function pointOf(v, fx, fy) { return v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : { x: fx, y: fy }; }
`;
const page = vm.createContext({
  console: { log() {}, error() {}, warn() {} }, Math, Map, Set, Array, Object, String, Number, JSON, Symbol, Proxy,
  isFinite, isNaN, parseFloat, parseInt, Path2D, DOMMatrix, Uint8ClampedArray, __REC: REC, __recorder: recorder
});
vm.runInContext(host + lib + `
;{
  const assign = Object.assign;
  Object.assign = function (target, ...sources) {
    const from = sources.find(s => s && s[__REC]);
    if (!from || Object.keys(target).length) return assign(target, ...sources);
    const r = from[__REC];
    const store = assign({}, ...sources.map(s => (s && s[__REC] ? s[__REC].store : s)));
    return __recorder(store, r.seen, r.items);
  };
}
globalThis.__page = {
  ids: Array.from(new Set([].concat(RENDERED_IDS, EXTRA_COMPONENT_IDS, SW_SCENE_IDS))),
  toolkit: SWDraw,
  draw: drawSharedComponents, scene: sharedSceneOverride, transforms: sharedSceneTransforms,
  post: typeof sharedPostFX === 'function' ? sharedPostFX : null,
  background: typeof sharedBackground === 'function' ? sharedBackground : null
};`, page);
const { ids, draw, scene, transforms, post, background, toolkit } = page.__page;

const words = [{ id: 'w1', text: 'hello', start: 0, end: 1 }, { id: 'w2', text: 'world', start: 1, end: 2 }];
/* Typical values, so branches that need copy or data are taken too. */
const typical = () => ({
  text: 'Hello world again', title: 'Title', subtitle: 'Sub', label: 'Label', value: 0.5,
  items: [{ label: 'a', value: 3 }, { label: 'b', value: 7 }, { label: 'c', value: 5 }],
  rows: [{ label: 'a', value: 3 }, { label: 'b', value: 7 }]
});

function readsOf(id) {
  const seen = new Set(), items = new Map();
  for (const store of [{}, typical()]) for (const t of [0, 0.05, 0.6, 1.5, 2.95]) {
    const params = recorder(store, seen, items);
    const comps = [{ id: 'c1', componentId: id, start: 0, end: 3, params }];
    const attempt = f => { try { f(); } catch { /* a key read before the throw still counts */ } };
    attempt(() => transforms(mockCtx(), comps, 1080, 1920, t));
    attempt(() => { const s = scene(comps, t); if (s && background) background(mockCtx(), 1080, 1920, t, s, []); });
    attempt(() => draw(mockCtx(), 1080, 1920, t, comps, { words, cast: {} }));
    if (post) attempt(() => post(mockCtx(), 1080, 1920, t, comps, { width: 1080, height: 1920 }));
  }
  return { seen, items };
}

/* The renderer's own text for an id: its branch in the chain. */
function branchOf(id) {
  const marks = [`id === '${id}'`, `componentId === '${id}'`];
  let out = '';
  for (const mark of marks) {
    let at = lib.indexOf(mark);
    while (at >= 0) {
      const rest = lib.slice(at + mark.length, at + mark.length + 9000);
      const next = rest.search(/else if \((?:id|c\.componentId) === '/);
      out += rest.slice(0, next >= 0 ? next : 2500) + '\n';
      at = lib.indexOf(mark, at + mark.length);
    }
  }
  return out;
}
/* The six DOM-presented ids read their params in player.html through one
   variable each (subtitleBar reads none): those reads are their keys. */
const DOM_VARS = { titleCard: 'tp', numberCounter: 'cp', lowerThird: 'lp', kineticWords: 'kinP', captions: 'kinP' };
function domReadsOf(id) {
  const v = DOM_VARS[id];
  if (!v) return { keys: [], text: '' };
  const keys = new Set();
  let text = '';
  for (const m of player.matchAll(new RegExp('\\b' + v + '\\.([A-Za-z_]\\w*)', 'g'))) keys.add(m[1]);
  for (const m of player.matchAll(new RegExp('[^\\n]*\\b' + v + '\\.[^\\n]*', 'g'))) text += m[0].replace(new RegExp('\\b' + v + '\\.', 'g'), 'p.') + '\n';
  return { keys: [...keys], text };
}

const literal = raw => {
  const s = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  const q = s.match(/^'([^']*)'$/) || s.match(/^"([^"]*)"$/);
  return q ? q[1] : undefined;
};
function defaultsIn(text) {
  const found = new Map();
  const note = (key, raw) => {
    const v = literal(raw);
    if (v === undefined) return;
    if (!found.has(key)) found.set(key, new Set());
    found.get(key).add(JSON.stringify(v));
  };
  for (const m of text.matchAll(/\b(?:ecN|ecClamp01|p3N)\(\s*(?:p|pp|bp|rawP)\.([A-Za-z_]\w*)\s*,\s*([^,()]+?)\s*[,)]/g)) note(m[1], m[2]);
  for (const m of text.matchAll(/\b(?:p|pp|bp|rawP)\.([A-Za-z_]\w*)\s*(?:\|\||\?\?)\s*(-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|true|false)/g)) note(m[1], m[2]);
  return found;
}
const libDefaults = defaultsIn(lib);
const one = set => (set && set.size === 1 ? JSON.parse([...set][0]) : undefined);

const draws = new Map();
for (const m of readFileSync(join(root, 'COMPONENTS.md'), 'utf8').matchAll(/^\|\s*`([A-Za-z0-9_]+)`\s*\|\s*([^|]+?)\s*\|\s*$/gm)) draws.set(m[1], m[2]);

/* Keys every component takes from the shared chain, documented once. */
const SHARED = new Set(['position', 'animate', 'zIndex', 'code', 'scene', 'svg', 'svgLayers']);
/* Values the chain hands a renderer through params, not document params. */
const INTERNAL = new Set(['W', 'H', 'time', 'localTime', 'words', 'castTable', 'cast', 'then', 'toJSON', 'constructor', 'length']);
const ORDER = ['text', 'title', 'subtitle', 'label', 'value', 'items', 'color', 'accentColor', 'background', 'size', 'textScale', 'width', 'height', 'radius', 'style'];
const rank = k => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i; };

const doc = {};
for (const id of [...ids].sort()) {
  const { seen, items } = readsOf(id);
  const dom = domReadsOf(id);
  /* What the DOM overlay reads is what shows; the canvas fallback of these
     ids is not what the player presents. */
  if (DOM_IDS.includes(id)) { seen.clear(); items.clear(); }
  for (const k of dom.keys) seen.add(k);
  const own = branchOf(id) + dom.text;
  const ownDefaults = defaultsIn(own);
  const keys = [...seen].filter(k => !SHARED.has(k) && !INTERNAL.has(k) && !k.startsWith('_')).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const entry = { keys };
  const defaults = {};
  for (const k of keys) {
    const v = one(ownDefaults.get(k)) ?? one(libDefaults.get(k));
    if (v !== undefined && v !== '') defaults[k] = v;
  }
  if (Object.keys(defaults).length) entry.defaults = defaults;
  const sub = {};
  for (const [k, set] of items) if (set.size) sub[k] = [...set].sort();
  if (Object.keys(sub).length) entry.items = sub;
  if (draws.has(id)) entry.draws = draws.get(id);
  doc[id] = entry;
}

/* The toolkit, as the code declares it: `name(parameters)` and, where the
   source has one, the comment directly above the function. */
function describeFunction(fn) {
  const src = fn.toString();
  const head = src.match(/^(?:async\s+)?(?:function\s*[\w$]*\s*|[\w$]+\s*)?\(([^)]*)\)/) || src.match(/^([\w$]+)\s*=>/);
  const at = lib.indexOf(src);
  let doc = '';
  if (at > 0) {
    /* step back over `name: `, `SWDraw.name = ` or `function name` to the
       comment, if any */
    const before = lib.slice(Math.max(0, at - 1200), at).replace(/(?:[\w$]+\s*:\s*|[\w$.]+\s*=\s*|function\s+[\w$]+\s*)$/, '').trimEnd();
    if (before.endsWith('*/')) doc = before.slice(before.lastIndexOf('/*') + 2, -2).replace(/\s*\n\s*\*?\s*/g, ' ').trim();
  }
  return { params: head ? head[1].replace(/\s+/g, ' ').trim() : '', doc };
}
const api = {};
(function walk(obj, prefix) {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'function') api[prefix + key] = describeFunction(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && !prefix) walk(v, key + '.');
  }
})(toolkit, '');
const undescribed = Object.keys(api).filter(name => !api[name].doc);
if (undescribed.length) {
  console.error('toolkit functions with no comment above them: ' + undescribed.join(', '));
  process.exit(1);
}
const apiText = '{\n' + Object.keys(api).sort().map(name => {
  return `${JSON.stringify(name)}: ${JSON.stringify({ call: `${name}(${api[name].params})`, doc: api[name].doc })}`;
}).join(',\n') + '\n}\n';

const text = '{\n' + Object.keys(doc).map(id => `${JSON.stringify(id)}: ${JSON.stringify(doc[id])}`).join(',\n') + '\n}\n';
const outputs = [[outPath, text], [toolkitPath, apiText]];
if (process.argv.includes('--check')) {
  for (const [path, want] of outputs) {
    let current = '';
    try { current = readFileSync(path, 'utf8'); } catch { /* missing counts as stale */ }
    if (current !== want) {
      console.error(`${path} is stale: run \`node tools/build-param-docs.mjs\``);
      process.exit(1);
    }
  }
  console.log(`component params: ${Object.keys(doc).length} ids, toolkit: ${Object.keys(api).length} functions, up to date`);
} else {
  for (const [path, want] of outputs) writeFileSync(path, want);
  const empty = Object.keys(doc).filter(id => !doc[id].keys.length);
  console.log(`wrote ${Object.keys(doc).length} ids (${empty.length} read no params of their own) and ${Object.keys(api).length} toolkit functions`);
}
