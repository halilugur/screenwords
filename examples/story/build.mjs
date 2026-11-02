/*
 * Builds examples/story: "Kayıp Defter" — a six-scene story in Turkish with
 * a narrator and three characters: a sketchbook lost on a street, found,
 * returned in a café, and told about at home that night.
 *
 *   cargo build --release && node examples/story/build.mjs
 *
 * Project data only: the cast (examples/cast), the lines as turns, one voice
 * per speaker, and one `story` component listing the scenes.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 47894;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_DIR = resolve('examples/story');
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

const VOICES = { narrator: 'M3', elif: 'F3', mert: 'M2', ada: 'F1' };
const TURNS = [
  /* 0 */ ['narrator', "İstanbul'da yağmurlu bir sabahtı. Elif her zamanki gibi işe geç kalmıştı."],
  /* 1 */ ['elif', 'Of, yine geç kaldım! Otobüsü kaçırırsam yandım!'],
  /* 2 */ ['narrator', 'Aceleyle koşarken çantasından küçük bir defter kaydı ve kaldırımın kenarına düştü.'],
  /* 3 */ ['narrator', 'Birkaç dakika sonra oradan geçen Mert, defteri yerde buldu.'],
  /* 4 */ ['mert', 'Bu da ne? Biri defterini düşürmüş.'],
  /* 5 */ ['mert', 'İçi çizimlerle dolu. Bunlar gerçekten çok güzel.'],
  /* 6 */ ['narrator', 'Ofiste Elif, defterinin kaybolduğunu ancak öğlene doğru fark etti.'],
  /* 7 */ ['elif', 'Ada, defterimi gördün mü? Bütün çizimlerim içindeydi!'],
  /* 8 */ ['ada', 'Sakin ol. En son nerede kullanmıştın?'],
  /* 9 */ ['elif', 'Sabah durağa koşarken çantam açıktı. Galiba orada düşürdüm.'],
  /* 10 */ ['ada', 'Üzülme. İyi biri bulmuştur, göreceksin.'],
  /* 11 */ ['narrator', 'Mert ise o akşam parkta defterin son sayfasında küçük bir not buldu.'],
  /* 12 */ ['mert', 'Burada bir isim yazıyor: Elif. Her cumartesi Köşe Kafe’de çizim yapıyormuş.'],
  /* 13 */ ['mert', 'Tamam o zaman. Cumartesi oraya gideceğim.'],
  /* 14 */ ['narrator', 'Cumartesi günü Köşe Kafe her zamanki gibi sıcak ve kalabalıktı.'],
  /* 15 */ ['mert', 'Affedersiniz, siz Elif misiniz?'],
  /* 16 */ ['elif', 'Evet, benim. Bir şey mi oldu?', 0.2],
  /* 17 */ ['mert', 'Sanırım bu sizin. Geçen hafta kaldırımda buldum.'],
  /* 18 */ ['elif', 'Defterim! İnanamıyorum, her yerde aradım!', -0.1],
  /* 19 */ ['mert', 'Çizimlerinize bakmadan edemedim, kusura bakmayın. Gerçekten çok yeteneklisiniz.'],
  /* 20 */ ['elif', 'Hahaha, teşekkür ederim! Oturun lütfen, size bir kahve ısmarlayayım.'],
  /* 21 */ ['mert', 'Memnuniyetle. Bu arada ben Mert.'],
  /* 22 */ ['elif', 'Memnun oldum Mert.', 0.1],
  /* 23 */ ['narrator', 'O akşam Elif, olanları Ada’ya tek tek anlattı.'],
  /* 24 */ ['ada', 'Yani defterini bulan kişi kafeye kadar mı geldi?'],
  /* 25 */ ['elif', 'Aynen! Hem de çok kibar biriydi. Gelecek hafta birlikte bir resim sergisine gideceğiz.'],
  /* 26 */ ['ada', 'Bak sen! Kayıp bir defter, yepyeni bir dostluk getirdi.'],
  /* 27 */ ['elif', 'Belki de hiçbir şey tesadüf değildir.'],
  /* 28 */ ['narrator', 'Ve böylece, kaldırıma düşen küçük bir defter iki yolu birbirine bağladı.']
];

const SCENES = [
  {
    set: 'street', title: 'Bir sabah',
    cast: [{ cast: 'elif', x: 0.38, enter: 'left', bag: true }],
    /* she runs off as the narrator tells it, and the sketchbook slips out */
    moves: [{ line: 2, cast: 'elif', x: 1.15 }],
    actions: [{ line: 2, offset: 1.6, type: 'drop', a: 'elif', prop: 'book' }]
  },
  {
    startLine: 3, set: 'street',
    items: [{ prop: 'book', x: 0.5 }],
    cast: [{ cast: 'mert', x: 0.72, enter: 'right' }],
    actions: [{ line: 3, offset: 1.8, type: 'pickup', a: 'mert', prop: 'book' }]
  },
  { startLine: 6, set: 'office', title: 'Öğlen', cast: [{ cast: 'elif', x: 0.36, bag: true }, { cast: 'ada', x: 0.66 }] },
  { startLine: 11, set: 'park', night: true, cast: [{ cast: 'mert', x: 0.5, enter: 'left', prop: 'book' }] },
  {
    startLine: 14, set: 'cafe', title: 'Cumartesi',
    cast: [{ cast: 'mert', x: 0.32, enter: 'left', prop: 'book' }, { cast: 'elif', x: 0.68, seated: true }],
    actions: [{ line: 17, type: 'give', a: 'mert', b: 'elif', prop: 'book' }, { line: 21, type: 'handshake', a: 'mert', b: 'elif' }]
  },
  {
    startLine: 23, set: 'room', night: true, title: 'O akşam',
    cast: [{ cast: 'elif', x: 0.38 }, { cast: 'ada', x: 0.64 }],
    actions: [{ line: 27, type: 'hug', a: 'elif', b: 'ada' }]
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
    const cast = Object.fromEntries(['elif', 'mert', 'ada'].map(id => [id, JSON.parse(readFileSync(resolve(`examples/cast/${id}.json`), 'utf8'))]));
    await post('/api/edit', { tool: 'set_project_settings', arguments: { name: 'Kayıp Defter', cast } });
    await post('/api/edit', { tool: 'author_transcript', arguments: { turns: TURNS.map(([speaker, text, gap]) => (gap == null ? { speaker, text } : { speaker, text, gap })), language: 'tr', replace: true } });
    const synth = await post('/api/synthesize', { lang: 'tr', voice: 'M3', voices: VOICES, bed: 'ambient' });
    console.log('speech:', synth.durationSeconds.toFixed(2) + 's');
    const words = (await get('/api/words')).words || [];
    const total = Math.ceil(Math.max(...words.map(w => w.end)) + 1.5);
    await post('/api/edit', {
      label: 'story',
      edits: [
        {
          tool: 'add_component',
          arguments: {
            componentId: 'story', start: 0, end: total, zIndex: 5,
            params: { scenes: SCENES }
          }
        },
        { tool: 'add_component', arguments: { componentId: 'kineticWords', start: 0, end: total, zIndex: 20, position: { x: 0.5, y: 0.9 }, params: { fontFamily: "'Space Grotesk', sans-serif", speakerColors: { ada: '#60A5FA', elif: '#F472B6', mert: '#A78BFA', narrator: '#F8FAFC' } } } }
      ]
    });
    const exp = await post('/api/export', {});
    console.log('HTML:', exp.path);
    const mp4 = await post('/api/render-mp4', {});
    console.log('MP4:', mp4.path, `(${(mp4.bytes / 1048576).toFixed(2)} MB)`);
  } finally {
    srv.kill('SIGTERM');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
