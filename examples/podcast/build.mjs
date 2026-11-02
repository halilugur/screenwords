/*
 * Builds examples/podcast: a four-speaker round table in Turkish.
 *
 *   cargo build --release && node examples/podcast/build.mjs
 *
 * All of it is project data — the engine does the directing:
 *   1. the cast: four one-line kit characters (examples/cast/*.json) in
 *      settings.cast;
 *   2. the conversation as turns, each speaker voiced by a Supertonic voice;
 *   3. one `conversation` component (seats, title) and captions.
 * Gestures, listening, looks and the edit all come from the speakers.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 47893;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_DIR = resolve('examples/podcast');
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

const SEATS = [
  { cast: 'ada', role: 'SUNUCU', voice: 'F1', color: '#38BDF8' },
  { cast: 'kaan', role: 'KONUK', bio: 'Video kurgucusu', voice: 'M1', color: '#10B981' },
  { cast: 'elif', role: 'KONUK', bio: 'Ses tasarımcısı', voice: 'F3', color: '#EC4899' },
  { cast: 'mert', role: 'KONUK', bio: 'Animatör', voice: 'M2', color: '#A78BFA' }
];

/* [speaker, text, gap?]: gap is the pause before the line in seconds;
   negative jumps in over the end of the previous one, the way people react
   ("Aynen."), greet and say goodbye together. Without it the voice track
   takes a natural pause. */
const TURNS = [
  ['ada', "Herkese merhaba, Ekran Sohbetleri'ne hoş geldiniz! Bugün tek bir konuğum yok, tam üç konuğum var. Kaan, Elif, Mert, hoş geldiniz."],
  ['kaan', 'Hoş bulduk!', 0.1],
  ['elif', 'Merhaba!', -0.35],
  ['mert', 'Selamlar.', -0.3],
  ['ada', 'Konumuz yapay zekâyla video üretmek. Kaan, sen bu işe nasıl başladın?'],
  ['kaan', 'Aslında tamamen tesadüf. Bir sunum için kısa bir video lazımdı, kurgu programını açtım ve tam üç gün kaybettim.'],
  ['elif', 'Üç gün mü?', -0.25],
  ['kaan', 'Üç gün, evet! Altyazıları tek tek elle hizaladım.', 0.12],
  ['mert', 'Hahaha, o acıyı çok iyi bilirim.', -0.3],
  ['elif', 'Şimdi ise metni yazıyorsun, seslendirme birkaç dakikada hazır. Hem de tamamen kendi bilgisayarında, buluta hiç gitmeden.'],
  ['ada', 'Mert, sence asıl fark nerede?'],
  ['mert', 'Bence zamanlamada. Her kelime milisaniyesine kadar sesle eşleşiyor. Yani altyazı, animasyon, hatta ağız hareketleri konuşmayla birlikte akıyor.'],
  ['kaan', 'Aynen.', -0.45],
  ['elif', 'Bir de şu var: dört kişi konuşunca herkes kendi sesiyle konuşuyor. Tıpkı şu an duyduğunuz gibi.'],
  ['ada', 'Doğru, bu bölüm bile öyle hazırlandı.', 0.15],
  ['mert', 'Gerçekten mi?', -0.2],
  ['ada', 'Gerçekten! Peki sizce bir sonraki adım ne olacak?'],
  ['elif', 'Bence karakterler daha da canlanacak. Jestler, bakışlar, duygular.'],
  ['kaan', 'Ben de herkesin kendi hikâyesini kolayca anlatabilmesini istiyorum.'],
  ['mert', 'Kesinlikle. Fikir sizden, gerisi motordan.'],
  ['ada', 'Çok güzel bir kapanış oldu. Dinlediğiniz için teşekkürler, bir sonraki bölümde görüşmek üzere!'],
  ['elif', 'Görüşmek üzere!', -0.3],
  ['kaan', 'Hoşça kalın!', -0.45],
  ['mert', 'Bay bay!', -0.4]
];

async function main() {
  const srv = spawn('./target/release/screenwords', ['app', PROJECT_DIR, '--create', '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stderr.on('data', d => process.stderr.write(d));
  for (let i = 0; i < 50; i++) {
    try { await get('/api/summary'); break; } catch { await sleep(150); }
  }
  try {
    await post('/api/frame', { width: 1080, height: 1920, fps: 30 });
    /* A rebuild starts from an empty timeline. */
    for (const tr of (await get('/api/timeline')).tracks || []) {
      for (const it of tr.items || []) {
        if (it.kind === 'component') await post('/api/edit', { tool: 'remove_component', arguments: { id: it.id } });
      }
    }
    const cast = Object.fromEntries(SEATS.map(s => [s.cast, JSON.parse(readFileSync(resolve(`examples/cast/${s.cast}.json`), 'utf8'))]));
    await post('/api/edit', { tool: 'set_project_settings', arguments: { name: 'Ekran Sohbetleri · Bölüm 1', cast } });
    await post('/api/theme', { preset: 'midnight', paper: '#050814', ink: '#F8FAFC', accent: '#38BDF8', accent2: '#F59E0B' });

    console.log('1. Writing the conversation and voicing four speakers...');
    await post('/api/edit', {
      tool: 'author_transcript',
      arguments: { turns: TURNS.map(([speaker, text, gap]) => (gap == null ? { speaker, text } : { speaker, text, gap })), language: 'tr', replace: true }
    });
    const synth = await post('/api/synthesize', { lang: 'tr', voice: 'F1', voices: Object.fromEntries(SEATS.map(s => [s.cast, s.voice])), bed: 'ambient' });
    console.log('   speech:', synth.durationSeconds.toFixed(2) + 's');
    const words = (await get('/api/words')).words || [];
    const total = Math.ceil(Math.max(...words.map(w => w.end)) + 1.2);

    console.log('2. Placing the studio...');
    await post('/api/edit', {
      label: 'podcast studio',
      edits: [
        { tool: 'add_component', arguments: { componentId: 'auroraBackground', start: 0, end: total, params: { color: '#1E3A8A', secondaryColor: '#4C1D95' } } },
        {
          tool: 'add_component',
          arguments: {
            componentId: 'conversation', start: 0, end: total, zIndex: 10,
            params: {
              seats: SEATS.map(({ cast, role, bio, color }) => ({ cast, role, bio, color })),
              title: 'EKRAN SOHBETLERİ',
              subtitle: 'Bölüm 1 · Yapay zekâ ile video üretimi',
              liveLabel: 'CANLI'
            }
          }
        },
        {
          tool: 'add_component',
          arguments: {
            componentId: 'kineticWords', start: 0, end: total, zIndex: 20,
            position: { x: 0.5, y: 0.86 },
            params: {
              fontFamily: "'Space Grotesk', sans-serif",
              activeColor: '#38BDF8', emphasisColor: '#F59E0B',
              speakerColors: Object.fromEntries(SEATS.map(s => [s.cast, s.color])),
              emphasis: ['yapay', 'zekâyla', 'milisaniyesine', 'buluta', 'kesinlikle']
            }
          }
        }
      ]
    });

    console.log('3. Exporting...');
    const exp = await post('/api/export', {});
    console.log('   HTML:', exp.path);
    const mp4 = await post('/api/render-mp4', {});
    console.log('   MP4:', mp4.path, `(${(mp4.bytes / 1048576).toFixed(2)} MB)`);
  } finally {
    srv.kill('SIGTERM');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
