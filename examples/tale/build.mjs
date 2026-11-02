/*
 * Builds examples/tale: "Bilgi Ağacı" — a five-scene tale in Turkish told
 * with no proper names: a traveller reaches a walled town, is welcomed at
 * the gate, returns a child's dropped book in the market, learns in the
 * library how knowledge grows like a tree, and leaves one night.
 *
 *   cargo build --release && node examples/tale/build.mjs
 *
 * Project data only: the cast (robes, turbans, an elder, a child), the
 * lines as turns, one voice per speaker, and one `story` component whose
 * places are described from scenery parts. People turn side-on while they
 * walk or act together (view: 'auto'); speech shows in bubbles.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 47895;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_DIR = resolve('examples/tale');
mkdirSync(PROJECT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}
async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

const CAST = {
  traveller: {
    name: 'Yolcu', kit: 'editorial', hair: 'short', beard: 'full', outfit: 'robe', hat: 'turban', shoes: 'boot',
    skinColor: '#D9A27A', hairColor: '#2B1B12', jacketColor: '#7A4E2D', shirtColor: '#E9DCC0', accentColor: '#2F6B4F', hatColor: '#EFE6D2', shoeColor: '#5D4037'
  },
  master: {
    name: 'Usta', kit: 'editorial', hair: 'short', beard: 'long', outfit: 'robe', hat: 'turban', age: 'elder',
    skinColor: '#E8B48F', jacketColor: '#1F4E79', shirtColor: '#F2EBDD', accentColor: '#C9A227', hatColor: '#FFFFFF'
  },
  child: {
    name: 'Çocuk', kit: 'editorial', hair: 'curly', outfit: 'tshirt', hat: 'cap', age: 'child',
    skinColor: '#C68642', hairColor: '#1A1110', shirtColor: '#C0392B', pantsColor: '#5B3A29', hatColor: '#2E4A8B'
  }
};
const VOICES = { narrator: 'M3', traveller: 'M2', master: 'M1', child: 'F2' };
const TURNS = [
  /* 0 */ ['narrator', 'Çok eski zamanlarda, kum tepelerinin ardında, surlarla çevrili küçük bir şehir vardı.'],
  /* 1 */ ['narrator', 'Bir sabah, uzak diyarlardan gelen bir yolcu şehrin kapısına vardı.'],
  /* 2 */ ['traveller', 'Selam olsun! Uzun bir yoldan geliyorum. Burada bilgiyi seven biri var mı?'],
  /* 3 */ ['master', 'Selam sana da, yolcu. Hoş geldin. Bilgiyi seven herkese kapımız açıktır.'],
  /* 4 */ ['traveller', 'Çok teşekkür ederim. Yorgunum ama sorularım bitmiyor.'],
  /* 5 */ ['master', 'Soru soran yorulmaz. Gel, önce çarşıyı gezelim.'],
  /* 6 */ ['narrator', 'Çarşı kalabalıktı. Satıcılar bağırıyor, çocuklar koşuşuyordu.'],
  /* 7 */ ['child', 'Ustam! Ustam! Bakın, yeni kitabımı aldım!'],
  /* 8 */ ['narrator', 'Ama çocuk koşarken kitap çantasından kaydı ve yere düştü.'],
  /* 9 */ ['traveller', 'Hey küçük! Bir şey düşürdün.'],
  /* 10 */ ['traveller', 'Al bakalım, bu senin.'],
  /* 11 */ ['child', 'Aa, kitabım! Çok teşekkür ederim, amca!', -0.1],
  /* 12 */ ['master', 'Gördün mü? Bu şehirde iyilik de bilgi gibi elden ele geçer.'],
  /* 13 */ ['narrator', 'Öğleden sonra usta, yolcuyu büyük kütüphaneye götürdü.'],
  /* 14 */ ['traveller', 'Ne kadar çok kitap var! Bunları kim yazdı?'],
  /* 15 */ ['master', 'Yüzlerce yıl boyunca, merak eden insanlar. Bilgi bir ağaç gibidir.'],
  /* 16 */ ['master', 'Bir tohumla başlar. Sonra dallanır, budaklanır, her dal yeni bir soruya uzanır.'],
  /* 17 */ ['traveller', 'Peki ben bu ağaca ne katabilirim?'],
  /* 18 */ ['master', 'Sorularını. Her iyi soru, yeni bir dal demektir.'],
  /* 19 */ ['narrator', 'Günler geçti. Yolcu okudu, yazdı, sordu ve öğrendi.'],
  /* 20 */ ['narrator', 'Ve bir gece, yola devam etme vakti geldi.'],
  /* 21 */ ['traveller', 'Ustam, bana öğrettiklerinizi hiç unutmayacağım.'],
  /* 22 */ ['master', 'Unutma, öğrendiğini paylaş. Ancak o zaman ağaç büyür.'],
  /* 23 */ ['child', 'Yine gel, amca! O zamana kadar bütün kitabı okumuş olacağım!'],
  /* 24 */ ['narrator', 'Yolcu yıldızların altında yola koyuldu. Çantasında bir kitap, aklında bin soru vardı.']
];

const TOWN = (night, extra) => ({
  theme: 'sand', frame: true, night,
  pieces: [
    { part: 'wall', x: 0.5, w: 1.9, h: 0.22, layer: 'far' },
    { part: 'tower', x: 0.2, layer: 'far' }, { part: 'tower', x: 0.8, layer: 'far' },
    { part: 'dome', x: 0.38, layer: 'far' }, { part: 'minaret', x: 0.64, layer: 'far' },
    ...extra
  ]
});
const SCENES = [
  {
    set: TOWN(false, [{ part: 'palm', x: 0.08, layer: 'mid' }, { part: 'palm', x: 0.93, layer: 'mid' }, { part: 'flowers', x: 0.3, layer: 'front' }]),
    title: 'Bilgi Ağacı', camera: 'wide',
    crowd: { count: 6, walkers: 0.8, outfits: ['robe', 'dress'], hats: ['turban', 'fez', 'none'] },
    cast: [{ cast: 'traveller', x: 0.42, enter: 'left', bag: true }]
  },
  {
    startLine: 2,
    set: TOWN(false, [{ part: 'gate', x: 0.5, layer: 'mid' }, { part: 'banner', x: 0.36, layer: 'mid' }, { part: 'banner', x: 0.64, layer: 'mid' }, { part: 'cypress', x: 0.1, layer: 'mid' }]),
    cast: [{ cast: 'traveller', x: 0.3, bag: true }, { cast: 'master', x: 0.72, enter: 'right' }],
    actions: [{ line: 3, offset: 1.2, type: 'handshake', a: 'master', b: 'traveller' }],
    moves: [{ line: 5, offset: 1.5, cast: 'master', x: 1.2 }, { line: 5, offset: 1.9, cast: 'traveller', x: 1.2 }]
  },
  {
    startLine: 6, title: 'Çarşı',
    set: { theme: 'sand', frame: true, pieces: [
      { part: 'house', x: 0.12, layer: 'far' }, { part: 'house', x: 0.86, layer: 'far' }, { part: 'dome', x: 0.5, layer: 'far' },
      { part: 'stall', x: 0.3, layer: 'mid' }, { part: 'stall', x: 0.7, layer: 'mid', color: '#2F5D9B' }, { part: 'well', x: 0.52, layer: 'mid' },
      { part: 'palm', x: 0.96, layer: 'front' }] },
    crowd: { count: 9, walkers: 0.45, outfits: ['robe', 'dress', 'tshirt'], hats: ['turban', 'fez', 'cap', 'none'] },
    cast: [{ cast: 'master', x: 0.28 }, { cast: 'traveller', x: 0.42, bag: true }, { cast: 'child', x: 0.68, enter: 'right', bag: true }],
    moves: [{ line: 8, cast: 'child', x: 0.9 }],
    actions: [
      { line: 8, offset: 1.0, type: 'drop', a: 'child', prop: 'book' },
      { line: 9, type: 'pickup', a: 'traveller', prop: 'book' },
      { line: 10, type: 'give', a: 'traveller', b: 'child', prop: 'book' }
    ]
  },
  {
    startLine: 13, title: 'Kütüphane',
    set: { theme: 'stone', inside: true, frame: true, pieces: [
      { part: 'arch', x: 0.18, layer: 'far' }, { part: 'arch', x: 0.82, layer: 'far' },
      { part: 'shelf', x: 0.4, layer: 'far' }, { part: 'shelf', x: 0.6, layer: 'far' },
      { part: 'column', x: 0.05, layer: 'mid' }, { part: 'column', x: 0.95, layer: 'mid' },
      { part: 'rug', x: 0.5, layer: 'mid' }, { part: 'lamp', x: 0.5, layer: 'mid' }] },
    cast: [{ cast: 'master', x: 0.3 }, { cast: 'traveller', x: 0.7, enter: 'right' }],
    effects: [
      { type: 'rays', start: 0, x: 0.18, y: 0.2, angle: 62, spread: 24, count: 5, length: 1.2, layer: 'back' },
      { type: 'dust', start: 0, x: 0.3, y: 0.25, w: 0.6, h: 0.5, count: 50 },
      { type: 'ink', line: 15, offset: 3.2, x: 0.5, y: 0.6, size: 0.42, grow: 8, depth: 6, color: '#3B2F2A', layer: 'back' },
      { type: 'sparkle', line: 18, x: 0.5, y: 0.35, r: 0.18, count: 14, color: '#FFE6A8' }
    ]
  },
  {
    startLine: 19, title: 'Veda',
    set: TOWN(true, [{ part: 'gate', x: 0.5, layer: 'mid' }, { part: 'palm', x: 0.08, layer: 'mid' }]),
    cast: [{ cast: 'master', x: 0.45 }, { cast: 'traveller', x: 0.6, bag: true }, { cast: 'child', x: 0.2, enter: 'left' }],
    actions: [{ line: 22, offset: 1.5, type: 'hug', a: 'traveller', b: 'master' }],
    moves: [{ line: 24, offset: 0.5, cast: 'traveller', x: 1.3 }],
    effects: [{ type: 'sparkle', start: 0, x: 0.5, y: 0.12, r: 0.5, count: 30 }]
  }
];

async function main() {
  const srv = spawn('./target/release/screenwords', ['app', PROJECT_DIR, '--create', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => process.stderr.write(d));
  for (let i = 0; i < 50; i++) { try { await get('/api/summary'); break; } catch { await sleep(150); } }
  try {
    await post('/api/frame', { width: 1920, height: 1080, fps: 30 });
    for (const tr of (await get('/api/timeline')).tracks || []) {
      for (const it of tr.items || []) if (it.kind === 'component') await post('/api/edit', { tool: 'remove_component', arguments: { id: it.id } });
    }
    await post('/api/edit', { tool: 'set_project_settings', arguments: { name: 'Bilgi Ağacı', cast: CAST } });
    await post('/api/edit', { tool: 'author_transcript', arguments: { turns: TURNS.map(([speaker, text, gap]) => (gap == null ? { speaker, text } : { speaker, text, gap })), language: 'tr', replace: true } });
    const synth = await post('/api/synthesize', { lang: 'tr', voice: 'M3', voices: VOICES, bed: 'ambient' });
    console.log('speech:', synth.durationSeconds.toFixed(2) + 's');
    const words = (await get('/api/words')).words || [];
    const total = Math.ceil(Math.max(...words.map(w => w.end)) + 2);
    await post('/api/edit', {
      label: 'tale',
      edits: [
        { tool: 'add_component', arguments: { componentId: 'story', start: 0, end: total, zIndex: 5, params: { scenes: SCENES, view: 'auto', bubbles: true } } },
        { tool: 'add_component', arguments: { componentId: 'kineticWords', start: 0, end: total, zIndex: 20, position: { x: 0.5, y: 0.92 }, params: { fontFamily: "'Space Grotesk', sans-serif", speakerColors: { narrator: '#F8FAFC', traveller: '#F2C14E', master: '#8AB6D6', child: '#F28B82' } } } }
      ]
    });
    const exp = await post('/api/export', {});
    console.log('HTML:', exp.path);
    if (!process.argv.includes('--no-mp4')) {
      const mp4 = await post('/api/render-mp4', {});
      console.log('MP4:', mp4.path, `(${(mp4.bytes / 1048576).toFixed(2)} MB)`);
    }
  } finally {
    srv.kill('SIGTERM');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
