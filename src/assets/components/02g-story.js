/* ==========================================================================
   Stories: the `story` component stages the project's cast on illustrated
   sets, scene by scene, and directs them from the transcript — an agent
   writes the scenes as data, never per-scene drawing code.

   params.scenes: [{
     start | startLine | startWord   when the scene begins (seconds, the
                                     index of a spoken line, or a word id);
                                     the first scene begins at 0
     set, night?, colors?            an illustrated place (SWDraw.sets)
     cast: [{ cast, x?, enter?, exit?, seated?, prop?, facing?, scale? }]
                                     x 0..1 across the frame; enter / exit
                                     'left' | 'right' walk in / out
     moves?:   [{ line | at, cast, x }]          walk across the set
     actions?: [{ line | at, type, a, b, prop? }] handshake | give | hug
     title?                          a card shown as the scene opens
     camera?                         'auto' (eases toward whoever speaks)
                                     | 'wide'
     view?                           'front' (default) | 'side' (profile) |
                                     'auto' (profile while walking or
                                     acting together); also per cast
                                     member and on the story params
   }]
   A speaker with no character in the scene is a narrator: heard and
   captioned, never drawn. Characters act their own lines (pose 'auto'),
   look at whoever speaks and face the person they talk to.
   ========================================================================== */

/* The time a scene or action starts: seconds, a line index or a word id. */
function swStoryTime(spec, lines, words, fallback) {
  const base = swStoryTimeBase(spec, lines, words, fallback);
  /* offset: seconds after the line or word it names */
  return spec && typeof spec === 'object' && isFinite(base) ? base + ecN(spec.offset, 0) : base;
}
function swStoryTimeBase(spec, lines, words, fallback) {
  if (!spec || typeof spec !== 'object') return fallback;
  if (typeof spec.start === 'number' && isFinite(spec.start)) return spec.start;
  if (typeof spec.at === 'number' && isFinite(spec.at)) return spec.at;
  const li = typeof spec.startLine === 'number' ? spec.startLine : typeof spec.line === 'number' ? spec.line : null;
  if (li != null && lines[Math.max(0, Math.min(lines.length - 1, Math.floor(li)))]) return lines[Math.max(0, Math.min(lines.length - 1, Math.floor(li)))].start - 0.15;
  const wid = spec.startWord || spec.word;
  if (wid != null) {
    const w = (words || []).find(x => x && x.id === wid);
    if (w) return ecN(w.start, fallback);
  }
  return fallback;
}

/* The scene timeline: [{scene, a, b}] in order, the first from 0. */
function swStoryScenes(scenes, lines, words, end) {
  const list = (Array.isArray(scenes) ? scenes : []).filter(s => s && typeof s === 'object');
  const timed = list.map((s, i) => ({ scene: s, a: i === 0 ? 0 : swStoryTime(s, lines, words, NaN), i }))
    .filter(x => isFinite(x.a)).sort((p, q) => p.a - q.a);
  timed.forEach((x, k) => { x.b = k + 1 < timed.length ? timed[k + 1].a : end; });
  return timed;
}

/* A hand-over and a handshake happen at a comfortable arm's length: each
   arm reaches out toward the other with the elbow open (past about 105°;
   reaching down to a child, the upper arm hangs and the forearm offers),
   sloping down from the shoulder (`slope` radians below level), and
   the hands meet between the two — not folded at the elbow next to the
   body. In figure units the rig's
   shoulder stands `out` from the centre line and `up` above the feet, and
   the arm is `arm` long (the flat rig of 02c-toon; the draw checks hold
   these to it). */
const SW_SHOULDER = { out: 26, up: 227, arm: 100 };
const SW_REACH_SLOPE = { give: 0.6, handshake: 0.8 };
/* ka, kb: the two people's sizes (px per figure unit). How far apart their
   centres stand, how far each hand reaches out from its own centre, and the
   hands' height above the floor. */
function swHandsMeet(ka, kb, slope) {
  const r = SW_SHOULDER.arm * 0.95;
  /* nearer the taller one's natural height: a grown-up reaches down to a
     child more than the child reaches up */
  const height = (ka * ka + kb * kb) / (ka + kb) * (SW_SHOULDER.up - r * Math.sin(slope));
  const reach = k => k * (SW_SHOULDER.out + r * Math.cos(Math.asin(ecClamp((SW_SHOULDER.up - height / k) / r, 0.15, 0.95))));
  const a = reach(ka), b = reach(kb);
  return { apart: a + b, a, b, height };
}
/* A person's size in px per figure unit: the story's scale, the member's
   own, and a child's smaller body. */
function swStorySize(s, member, look) {
  return s * ecN(member && member.scale, 1) * ecN(swAge(Object.assign({}, look, member)).heightScale, 1);
}

/* Where each cast member stands at time t (px) and whether they walk:
   entrances, moves, exits and the approaches actions need, each a walk at a
   steady pace. Returns { x, walking, vx } per cast id. */
function swStoryBlocking(sc, a, b, W, s, lines, words, view, castTable) {
  const pace = 260 * s;
  const people = (sc.cast || []).filter(m => m && typeof m.cast === 'string');
  const plans = {};
  people.forEach((m, i) => {
    const x0 = ecN(m.x, (i + 1) / (people.length + 1)) * W;
    const off = m.enter === 'left' ? -0.12 * W : m.enter === 'right' ? 1.12 * W : null;
    const legs = [];
    let at = a, x = off == null ? x0 : off;
    if (off != null) { legs.push({ t0: a + 0.2, x0: off, x1: x0, t1: a + 0.2 + Math.abs(x0 - off) / pace }); x = x0; at = a + 0.2 + Math.abs(x0 - off) / pace; }
    plans[m.cast] = { legs, home: x0, start: off == null ? x0 : off, at };
  });
  const walkTo = (id, t, x1) => {
    const P = plans[id];
    if (!P) return;
    const prev = P.legs.length ? P.legs[P.legs.length - 1].x1 : P.start;
    const t0 = Math.max(t, P.legs.length ? P.legs[P.legs.length - 1].t1 || 0 : 0);
    if (Math.abs(x1 - prev) < 2) return;
    P.legs.push({ t0, x0: prev, x1, t1: t0 + Math.abs(x1 - prev) / pace });
  };
  /* Every walk is scheduled in story order — moves, pickups and the
     approach before an action alike — since each starts from wherever its
     walker stands by then. (Scheduled by kind, an exit written for a later
     line was booked first and pushed an earlier handshake's approach after
     it: the two greeted each other from across the set.) Ties keep the
     order below: moves, then drops and pickups, then actions. */
  const events = [];
  for (const mv of (Array.isArray(sc.moves) ? sc.moves : [])) {
    if (!mv || typeof mv.cast !== 'string') continue;
    events.push({ t: swStoryTime(mv, lines, words, a), k: 0, run: () => walkTo(mv.cast, swStoryTime(mv, lines, words, a), ecN(mv.x, 0.5) * W) });
  }
  /* Things on the floor: declared with the scene (items), dropped (they
     fall from the dropper's bag where they walk) and picked up (the picker
     walks over and the thing leaves the floor). */
  const items = (Array.isArray(sc.items) ? sc.items : []).filter(it => it && typeof it.prop === 'string')
    .map(it => ({ prop: it.prop, x: ecN(it.x, 0.5) * W, from: -Infinity, until: Infinity, fall: null }));
  const solo = swStoryActions(sc, lines, words, a).filter(act => act.type === 'drop' || act.type === 'pickup').sort((p, q) => p.t - q.t);
  for (const act of solo) events.push({ t: act.t, k: 1, run: () => {
    const P = plans[act.a];
    if (!P) return;
    if (act.type === 'drop') {
      const at = swStoryAt(P, act.t), dir = Math.sign(at.vx) || 1;
      items.push({ prop: act.prop, x: at.x + dir * 34 * s, from: act.t, until: Infinity, fall: { x0: at.x + dir * 34 * s, dir } });
    } else {
      const here = swStoryAt(P, act.t - 0.6).x;
      const it = items.filter(x => x.prop === act.prop && x.from <= act.t && x.until > act.t)
        .sort((p, q) => Math.abs(p.x - here) - Math.abs(q.x - here))[0];
      if (!it) return;
      act.x = it.x;
      const side = it.x >= here ? 1 : -1, stand = it.x - side * 30 * s;
      walkTo(act.a, act.t - 0.35 - Math.abs(stand - (P.legs.length ? P.legs[P.legs.length - 1].x1 : P.start)) / pace, stand);
      /* the reach waits until they have arrived */
      const last = P.legs[P.legs.length - 1];
      if (last) act.t = Math.max(act.t, last.t1 + 0.4);
      it.until = act.t + 0.55;
    }
  } });
  /* Actions bring the two together a moment before they happen. */
  for (const act of swStoryActions(sc, lines, words, a)) events.push({ t: act.t, k: 2, run: () => {
    if (act.type === 'drop' || act.type === 'pickup') return;
    const PA = plans[act.a], PB = plans[act.b];
    if (!PA || !PB) return;
    const xa = PA.legs.length ? PA.legs[PA.legs.length - 1].x1 : PA.start;
    const xb = PB.legs.length ? PB.legs[PB.legs.length - 1].x1 : PB.start;
    /* in profile two people embrace face to face, a little closer */
    const prof = id => { const mm = people.find(m => m.cast === id) || {}; return /^(side|auto)$/.test(String(mm.view || sc.view || view || '')); };
    /* In profile the pair face each other. A handshake or a hand-over is
       done at a full arm's length, so the faces stay well apart (closer,
       two faces in profile read as a kiss). An embrace closes right in:
       the one in front then hides the other's face behind their head. */
    const both = prof(act.a) && prof(act.b);
    const size = id => swStorySize(s, people.find(m => m.cast === id), castTable && castTable[id]);
    const gap = act.type === 'hug' ? (both ? 10 * s : (size(act.a) + size(act.b)) * 14.5) : swHandsMeet(size(act.a), size(act.b), SW_REACH_SLOPE[act.type] || 0.7).apart / 2;
    const side = xa <= xb ? 1 : -1;
    /* A seated person stays put and the other comes to them — except for a
       hug, where the one sitting gets up and goes to the other. */
    const hug = act.type === 'hug';
    const seatA = !hug && people.find(m => m.cast === act.a && m.seated), seatB = !hug && people.find(m => m.cast === act.b && m.seated);
    const upA = hug && people.find(m => m.cast === act.a && m.seated), upB = hug && people.find(m => m.cast === act.b && m.seated);
    const mid = seatB && !seatA ? xb - side * gap : seatA && !seatB ? xa + side * gap
      : upB && !upA ? xa + side * gap : upA && !upB ? xb - side * gap : (xa + xb) / 2;
    const ta = seatA ? xa : mid - side * gap, tb = seatB ? xb : mid + side * gap;
    const lead = Math.max(Math.abs(ta - xa), Math.abs(tb - xb)) / pace;
    walkTo(act.a, act.t - lead - 0.4, ta);
    walkTo(act.b, act.t - lead - 0.4, tb);
    /* after a hug each steps back to a talking distance */
    if (hug) {
      walkTo(act.a, act.t + 2.25, ta - side * 36 * s);
      walkTo(act.b, act.t + 2.25, tb + side * 36 * s);
    }
  } });
  events.map((e, i) => Object.assign(e, { i })).sort((p, q) => p.t - q.t || p.k - q.k || p.i - q.i).forEach(e => e.run());
  for (const m of people) {
    if (m.exit === 'left' || m.exit === 'right') {
      const P = plans[m.cast];
      const prev = P.legs.length ? P.legs[P.legs.length - 1].x1 : P.start;
      const x1 = m.exit === 'left' ? -0.12 * W : 1.12 * W;
      walkTo(m.cast, b - 0.3 - Math.abs(x1 - prev) / pace, x1);
    }
  }
  for (const id in plans) for (const L of plans[id].legs) L.t1 = L.t0 + Math.abs(L.x1 - L.x0) / pace;
  return { plans, pace, items, solo };
}
function swStoryAt(P, t) {
  let x = P.start, walking = 0, vx = 0;
  for (const L of P.legs) {
    if (t >= L.t1) { x = L.x1; continue; }
    if (t >= L.t0) {
      const q = (t - L.t0) / Math.max(1e-3, L.t1 - L.t0);
      x = L.x0 + (L.x1 - L.x0) * q;
      vx = (L.x1 - L.x0) / Math.max(1e-3, L.t1 - L.t0);
      /* ease the gait in and out over a quarter second */
      walking = Math.min(1, (t - L.t0) / 0.25, (L.t1 - t) / 0.25 + 0.2);
    }
    break;
  }
  return { x, walking: ecClamp(walking, 0, 1), vx };
}

function swStoryActions(sc, lines, words, a) {
  return (Array.isArray(sc.actions) ? sc.actions : [])
    .filter(x => x && typeof x.a === 'string' && ((typeof x.b === 'string' && /^(handshake|give|hug)$/.test(String(x.type))) || /^(drop|pickup)$/.test(String(x.type))))
    .map(x => ({ type: x.type, a: x.a, b: x.b, prop: x.prop || (/^(drop|pickup)$/.test(String(x.type)) ? 'book' : 'phone'), t: swStoryTime(x, lines, words, a + 1) }));
}

/* Something lying on the floor, or tumbling down to it (rot != 0). */
function swStoryFloorThing(ctx, prop, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  if (!rot) { ctx.beginPath(); ctx.ellipse(0, 2 * s, 20 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.rotate(rot || 0);
  if (prop === 'book') {
    if (rot) {
      /* closed, tumbling */
      ctx.fillStyle = '#F1E9DA'; ctx.fillRect(-9 * s, -12 * s, 19 * s, 24 * s);
      ctx.fillStyle = '#8E3B3B'; ctx.beginPath(); ctx.roundRect(-10 * s, -13 * s, 19 * s, 26 * s, 2 * s); ctx.fill();
    } else {
      /* lying flat: a cover seen at a low angle, pages along the edge */
      ctx.fillStyle = '#F1E9DA';
      ctx.beginPath(); ctx.moveTo(-17 * s, -2 * s); ctx.lineTo(15 * s, -2 * s); ctx.lineTo(19 * s, 1 * s); ctx.lineTo(-13 * s, 1 * s); ctx.fill();
      ctx.fillStyle = '#8E3B3B';
      ctx.beginPath(); ctx.moveTo(-18 * s, -7 * s); ctx.lineTo(14 * s, -7 * s); ctx.lineTo(18 * s, -2 * s); ctx.lineTo(-14 * s, -2 * s); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-8 * s, -6 * s, 10 * s, 2 * s);
    }
  } else if (prop === 'phone') {
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.roundRect(-9 * s, -3 * s, 18 * s, 4 * s, 1.5 * s); ctx.fill();
  } else if (prop === 'mug') {
    ctx.fillStyle = '#E76F51'; ctx.beginPath(); ctx.roundRect(-7 * s, -16 * s, 14 * s, 16 * s, 3 * s); ctx.fill();
  } else {
    ctx.fillStyle = '#6B7280'; ctx.beginPath(); ctx.roundRect(-10 * s, -6 * s, 20 * s, 6 * s, 2 * s); ctx.fill();
  }
  ctx.restore();
}

/* Effects of a scene: [{ type: rays | glow | dust | sparkle | ink, start |
   line | at (+ offset), duration | end, layer: 'back' | 'front', x, y and
   sizes as 0..1 of the frame or px, the effect's own params }], each
   fading in and out over 0.4 s. */
function swStoryEffects(ctx, list, layer, time, a, b, lines, words, W, H) {
  const U = Math.min(W, H);
  const fx = v => (Math.abs(v) <= 1.5 ? v * W : v), fy = v => (Math.abs(v) <= 1.5 ? v * H : v), fu = v => (Math.abs(v) <= 1.5 ? v * U : v);
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || !SWDraw.fx[e.type] || (e.layer === 'back') !== (layer === 'back')) continue;
    const start = swStoryTime(e, lines, words, a);
    const end = typeof e.end === 'number' ? e.end : start + ecN(e.duration, b - start);
    if (!(time >= start && time <= end)) continue;
    const q = Math.min(ecClamp((time - start) / 0.4, 0, 1), ecClamp((end - time) / 0.4, 0, 1));
    const o = Object.assign({}, e, { time: time - start });
    o.x = fx(ecN(e.x, 0.5)); o.y = fy(ecN(e.y, 0.3));
    for (const key of ['r', 'size', 'length', 'w', 'h']) if (typeof e[key] === 'number') o[key] = fu(e[key]);
    if (e.type === 'ink') o.progress = ecClamp((time - start) / Math.max(0.1, ecN(e.grow, 3)), 0, 1);
    if (e.type === 'dust' && typeof e.w === 'number') o.x -= o.w / 2;
    ctx.save();
    ctx.globalAlpha *= q;
    SWDraw.fx[e.type](ctx, o);
    ctx.restore();
  }
}

/* Extras: people who fill a scene without lines — some standing about,
   some walking through — each with a look drawn from a seed, a little
   behind and smaller than the cast. crowd: { count, walkers (0..1 of
   them), outfits, hats, colors, scale, seed }. Women wear dresses (a
   headscarf is theirs alone); outfits and hats are the men's. */
const SW_CROWD_SKIN = ['#F2C4A2', '#E8B48F', '#D9A27A', '#C68642', '#A86B45', '#8D5A3B', '#6B4226'];
const SW_CROWD_HAIR = ['#1A1110', '#2B2233', '#3B2416', '#5A3A22', '#7A3B1E', '#C8C6C2'];
const SW_CROWD_CLOTH = ['#2E4A8B', '#2F6B4F', '#7A2E2E', '#5B3A29', '#8E6E3B', '#4B4E7A', '#7A6A4F', '#2A6F77', '#8E3B5A', '#B5653A'];
function swStoryCrowd(ctx, crowd, people, time, W, H, floorY, s, words, heads, speaking, view) {
  if (!crowd || typeof crowd !== 'object') return;
  const n = Math.max(0, Math.min(24, Math.round(ecN(crowd.count, 6))));
  const rnd = swFxRand(ecN(crowd.seed, 17));
  const outfits = Array.isArray(crowd.outfits) && crowd.outfits.length ? crowd.outfits : ['tshirt', 'hoodie', 'blazer', 'dress'];
  const hats = Array.isArray(crowd.hats) && crowd.hats.length ? crowd.hats : ['none'];
  const cloth = Array.isArray(crowd.colors) && crowd.colors.length ? crowd.colors : SW_CROWD_CLOTH;
  const walkers = ecClamp(ecN(crowd.walkers, 0.3), 0, 1);
  /* Perspective: an extra further back stands higher up the floor and is
     smaller, by how far their feet are from the horizon — never just
     smaller on the cast's own line, which reads as tiny people. */
  const ks = s * ecN(crowd.scale, 1), depth = Math.min(W, H) * ecClamp(ecN(crowd.depth, 0.1), 0, 0.3);
  const horizon = Math.min(floorY - Math.min(W, H) * 0.2, H * 0.42);
  const list = [];
  for (let i = 0; i < n; i++) {
    const picked = outfits[Math.floor(rnd() * outfits.length)];
    const female = picked === 'dress' || rnd() < 0.4;
    const menWear = outfits.filter(o => o !== 'dress');
    const outfit = female ? 'dress' : picked !== 'dress' ? picked : (menWear[Math.floor(rnd() * menWear.length)] || 'tshirt');
    const look = {
      kit: 'editorial', outfit,
      hair: female ? ['long', 'bun', 'bob', 'hijab'][Math.floor(rnd() * 4)] : ['short', 'curly', 'bald'][Math.floor(rnd() * 3)],
      beard: !female && rnd() < 0.45 ? (rnd() < 0.3 ? 'long' : 'full') : 'none',
      hat: female ? 'none' : String(hats[Math.floor(rnd() * hats.length)]),
      skinColor: SW_CROWD_SKIN[Math.floor(rnd() * SW_CROWD_SKIN.length)],
      hairColor: SW_CROWD_HAIR[Math.floor(rnd() * SW_CROWD_HAIR.length)],
      jacketColor: cloth[Math.floor(rnd() * cloth.length)], shirtColor: cloth[Math.floor(rnd() * cloth.length)],
      accentColor: cloth[Math.floor(rnd() * cloth.length)], hatColor: rnd() < 0.6 ? '#F3EEE2' : cloth[Math.floor(rnd() * cloth.length)],
      age: rnd() < 0.15 ? 'elder' : rnd() < 0.1 ? 'child' : 'adult'
    };
    /* a fez is felt red, never the turban's white; a headscarf is cloth */
    if (look.hat === 'fez') look.hatColor = ['#9E1B1B', '#B3261E', '#7F1D1D'][Math.floor(rnd() * 3)];
    if (look.hair === 'hijab') look.hairColor = cloth[Math.floor(rnd() * cloth.length)];
    const walking = rnd() < walkers;
    const x0 = (i + 0.5 + (rnd() - 0.5) * 0.6) / n * W, dir = rnd() < 0.5 ? -1 : 1, pace = (200 + rnd() * 80) * ks;
    const span = W * 1.3;
    let x = walking ? ((x0 + dir * pace * time) % span + span) % span - W * 0.15 : x0;
    /* those standing about keep clear of where the cast stand */
    if (!walking) people.forEach((m, k) => {
      const hx = ecN(m.x, (k + 1) / (people.length + 1)) * W, room = 120 * ks;
      if (Math.abs(x - hx) < room) x = hx + (x >= hx ? 1 : -1) * room;
    });
    list.push({ look, walking, x, dir, pace, row: rnd() });
  }
  list.sort((p, q) => p.row - q.row);
  /* a little paler than the cast, so the eye finds the story first — by
     mixing their colours toward a grey, not with ctx.filter, which costs a
     GPU filter pass per figure */
  const pale = c => (typeof c === 'string' && c[0] === '#' ? swMix(c, '#A7A39A', 0.22) : c);
  for (const e of list) for (const k of ['skinColor', 'hairColor', 'jacketColor', 'shirtColor', 'accentColor', 'hatColor']) e.look[k] = pale(e.look[k]);
  ctx.save();
  for (const e of list) {
    const yFeet = floorY - depth * (0.3 + 0.7 * (1 - e.row)), k = ks * (yFeet - horizon) / (floorY - horizon);
    SWDraw.character(ctx, Object.assign({}, e.look, {
      W, H, time, localTime: time, x: e.x, y: yFeet - 170 * k, scale: k,
      facing: e.walking ? e.dir : (speaking && heads[speaking] ? (heads[speaking].x >= e.x ? 1 : -1) : (e.x < W / 2 ? 1 : -1)),
      turn: e.walking ? 0.7 : (speaking && heads[speaking] ? 0.5 : 0.15),
      walkAmount: e.walking ? 1 : 0, vx: e.walking ? e.dir * e.pace : 0,
      pose: e.walking ? 'walk' : ['idle', 'idle', 'hold', 'think'][Math.floor(e.row * 4)],
      lookAt: !e.walking && speaking && heads[speaking] ? heads[speaking] : undefined,
      speaking: false, gestures: false,
      view: view === 'side' || (view === 'auto' && e.walking) ? 'side' : undefined
    }));
  }
  ctx.restore();
}

/* A small round café table with a cup, standing on the floor at x. */
function swStoryTable(ctx, x, floorY, s, night) {
  const top = floorY - 128 * s;
  ctx.save();
  ctx.fillStyle = night ? '#2B1B14' : '#4E342E';
  ctx.fillRect(x - 5 * s, top, 10 * s, floorY - top - 6 * s);
  ctx.beginPath(); ctx.ellipse(x, floorY - 4 * s, 34 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = night ? '#4A3328' : '#8D6E63';
  ctx.beginPath(); ctx.roundRect(x - 62 * s, top - 7 * s, 124 * s, 14 * s, 7 * s); ctx.fill();
  ctx.fillStyle = night ? '#5D4037' : '#A1887F';
  ctx.beginPath(); ctx.roundRect(x - 62 * s, top - 7 * s, 124 * s, 5 * s, 3 * s); ctx.fill();
  /* a cup and saucer */
  ctx.fillStyle = '#F5F5F4';
  ctx.beginPath(); ctx.ellipse(x + 18 * s, top - 8 * s, 14 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(x + 10 * s, top - 22 * s, 16 * s, 14 * s, 3 * s); ctx.fill();
  ctx.strokeStyle = '#F5F5F4'; ctx.lineWidth = 2.4 * s;
  ctx.beginPath(); ctx.arc(x + 28 * s, top - 15 * s, 4 * s, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.restore();
}

/* Draw the story at time t. opts: W, H, time, words, castTable, scenes,
   theme, fontFamily, camera. */
function swStory(ctx, opts) {
  const W = ecN(opts.W, 1080), H = ecN(opts.H, 1920), time = ecN(opts.time, 0);
  const words = Array.isArray(opts.words) ? opts.words : [];
  const castTable = opts.castTable || {};
  const plan = swConversationPlan(words) || { lines: [] };
  const lines = plan.lines;
  const end = Math.max(ecN(opts.duration, 0), words.reduce((m, w) => Math.max(m, ecN(w && w.end, 0)), 0) + 1.5);
  const timeline = swStoryScenes(opts.scenes, lines, words, end);
  const cur = timeline.find(x => time >= x.a && time < x.b) || timeline[timeline.length - 1];
  if (!cur) return;
  const sc = cur.scene, a = cur.a, b = cur.b;
  const U = Math.min(W, H), portrait = H >= W;
  const s = (portrait ? U / 520 : U / 640) * ecN(sc.scale, 1);
  const font = opts.fontFamily || '"Space Grotesk", sans-serif';
  const floorY = SWDraw.setFloor(sc.set, H);
  const { plans, items, solo } = swStoryBlocking(sc, a, b, W, s, lines, words, opts.view, castTable);
  const actions = swStoryActions(sc, lines, words, a);
  const people = (sc.cast || []).filter(m => m && typeof m.cast === 'string');
  const pos = {};
  for (const m of people) pos[m.cast] = swStoryAt(plans[m.cast], time);
  const speaking = SWDraw.speakerAt(words, time);
  const sitDropOf = (mm, cid) => (mm.seated && Math.abs(pos[cid].x - plans[cid].home) < 2 && pos[cid].walking < 0.05 ? SWDraw.seatDrop((castTable[cid] && castTable[cid].style) || 'flat') * swStorySize(s, mm, castTable[cid]) : 0);
  const heads = {};
  for (const m of people) {
    const k = swStorySize(s, m, castTable[m.cast]);
    heads[m.cast] = { x: pos[m.cast].x, y: floorY - 275 * k + sitDropOf(m, m.cast) };
  }

  /* Camera: shots with a purpose. Wide while the scene opens, while
     anyone walks, for the narrator and for short reactions; a close shot
     on the face of a character speaking a line of 3 s or more; a two-shot
     framing both people through an action. Moves ease between shots and
     the frame never leaves the set. */
  const ease = q => { q = ecClamp(q, 0, 1); return q * q * (3 - 2 * q); };
  const wide = { z: 1, x: W / 2, y: H / 2 };
  /* A face's height at time t: lower while its owner sits at home. */
  const headY = (m, k, cid, t) => {
    const P = swStoryAt(plans[cid], t);
    return floorY - 268 * k + (m.seated && Math.abs(P.x - plans[cid].home) < 2 && P.walking < 0.05 ? SWDraw.seatDrop('flat') * k : 0);
  };
  const shotAt = t => {
    if ((sc.camera || opts.camera) === 'wide') return wide;
    /* Inserts: something falling, and someone picking it up, get a close
       look at the floor — the moment the story turns on. */
    for (const act of solo) {
      if (act.type === 'drop') {
        const it = items.find(x => x.fall && x.from === act.t);
        if (it && t >= act.t - 0.25 && t <= act.t + 1.6) return { z: portrait ? 1.5 : 1.75, x: it.x, y: floorY - 70 * s };
      } else if (act.type === 'pickup' && act.x != null && t >= act.t - 0.45 && t <= act.t + 1.2) {
        return { z: portrait ? 1.35 : 1.5, x: act.x, y: floorY - 110 * s };
      }
    }
    if (t < a + 2.2 || t > b - 0.6) return wide;
    for (const id in plans) if (swStoryAt(plans[id], t).walking > 0.05) return wide;
    for (const act of actions) {
      if (t < act.t - 0.6 || t > act.t + 2.4 || !plans[act.a] || !plans[act.b]) continue;
      const xa = swStoryAt(plans[act.a], act.t).x, xb = swStoryAt(plans[act.b], act.t).x;
      return { z: portrait ? 1.22 : 1.32, x: (xa + xb) / 2, y: floorY - 190 * s };
    }
    const line = lines.find(l => t >= l.start + 0.35 && t <= l.end + 0.25);
    if (!line || line.end - line.start < 3 || !plans[line.id]) return wide;
    const m = people.find(x => x.cast === line.id) || {}, k = s * ecN(m.scale, 1);
    return { z: portrait ? 1.25 : 1.38, x: swStoryAt(plans[line.id], t).x, y: headY(m, k, line.id, t) + 40 * k };
  };
  const smoothCam = key => SWDraw.follow(t => shotAt(t)[key], time, { freq: 0.9, damping: 1, window: 2.4, steps: 48 });
  const zoom = Math.max(1, smoothCam('z'));
  let fx = smoothCam('x'), fy = smoothCam('y');
  ctx.save();
  if (zoom > 1.001) {
    fx = ecClamp(fx, W / (2 * zoom), W - W / (2 * zoom));
    fy = ecClamp(fy, H / (2 * zoom), H - H / (2 * zoom));
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx, -fy);
  }
  const camX = 0;
  SWDraw.set(ctx, sc.set, { W, H, time, night: !!sc.night, colors: sc.colors, layer: 'back', camX });

  /* Which way someone sitting faces: toward the others. */
  const facingHome = id => {
    const others = people.filter(o => o.cast !== id);
    const cx = others.length ? others.reduce((acc, o) => acc + plans[o.cast].home, 0) / others.length : W / 2;
    return cx >= plans[id].home ? 1 : -1;
  };
  /* People, back to front by x — except during a front side hug, where the
     shoulder-hugger (taller partner, or left if same size) stays behind so
     their sleeve wraps behind the shorter partner's neck while the shorter
     partner hugs across the waist in front. */
  const hugShoulder = new Set();
  for (const act of actions) {
    if (act.type !== 'hug') continue;
    const dt = time - act.t;
    if (dt < -1.8 || dt > 3.6) continue;
    const ma = people.find(m => m.cast === act.a) || {}, mb = people.find(m => m.cast === act.b) || {};
    const prof = mm => /^(side|auto)$/.test(String(mm.view || sc.view || opts.view || ''));
    if (prof(ma) && prof(mb)) continue;
    if (!pos[act.a] || !pos[act.b]) continue;
    const sa = swStorySize(s, ma, castTable[act.a]), sb = swStorySize(s, mb, castTable[act.b]);
    const pick = Math.abs(sa - sb) > 0.08 * s ? (sa > sb ? act.a : act.b) : (pos[act.a].x < pos[act.b].x || (pos[act.a].x === pos[act.b].x && act.a < act.b) ? act.a : act.b);
    hugShoulder.add(pick);
  }
  const order = people.slice().sort((p, q) => {
    const pb = hugShoulder.has(p.cast), qb = hugShoulder.has(q.cast);
    if (pb !== qb) return pb ? -1 : 1;
    return pos[p.cast].x - pos[q.cast].x;
  });
  swStoryEffects(ctx, sc.effects, 'back', time, a, b, lines, words, W, H);
  swStoryCrowd(ctx, sc.crowd, people, time, W, H, floorY, s, words, heads, speaking, String((sc.crowd && sc.crowd.view) || sc.view || opts.view || "").toLowerCase());
  const hugHands = [];
  /* Things on the floor, and things falling to it. */
  for (const it of items) {
    if (time < it.from || time >= it.until) continue;
    const k = s;
    if (it.fall && time < it.from + 0.62) {
      const dt = time - it.from;
      if (dt < 0.45) {
        const q = dt / 0.45;
        swStoryFloorThing(ctx, it.prop, it.fall.x0 + it.fall.dir * 10 * k * q, floorY - 150 * k + (150 - 6) * k * q * q, k, it.fall.dir * q * 2.4);
      } else {
        const bounce = Math.sin((dt - 0.45) / 0.17 * Math.PI) * 6 * k;
        swStoryFloorThing(ctx, it.prop, it.x + it.fall.dir * 10 * k, floorY - 4 * k - bounce, k, 0);
      }
    } else {
      /* the last moment of a pick-up lifts it into the reaching hand */
      const lift = isFinite(it.until) ? ease((time - (it.until - 0.35)) / 0.35) : 0;
      swStoryFloorThing(ctx, it.prop, it.x + (it.fall ? it.fall.dir * 10 * k : 0), floorY - 4 * k - 34 * k * lift, k, 0);
    }
  }
  /* A table whose sitter has got up stands behind everyone. */
  for (const m of people) {
    const ms = s * ecN(m.scale, 1), P = pos[m.cast];
    if (m.seated && (m.table === true || (m.table !== false && sc.set === 'cafe')) && !(Math.abs(P.x - plans[m.cast].home) < 2 && P.walking < 0.05)) {
      swStoryTable(ctx, plans[m.cast].home + (m.facing ? m.facing : facingHome(m.cast)) * 34 * ms, floorY, ms, sc.night);
    }
  }
  /* How far each person's body turns toward whoever they talk with or act
     with: square-ish to the room while nobody in the scene talks, turned
     squarely toward the speaker/listener during dialogue (even across brief
     pauses between lines), while walking, or while acting together (less
     in a side hug). Signed turns follow through 0 so switching sides in a
     group eases instead of snapping. */
  const inScene = new Set(people.map(m => m.cast));
  const talkAt = (cid, t) => {
    const sp = SWDraw.speakerAt(words, t);
    if (sp && inScene.has(sp)) return sp;
    let prev = null, next = null;
    for (const l of lines) {
      if (l.end <= t) prev = l;
      else if (l.start >= t && !next) { next = l; break; }
    }
    if (prev && next && inScene.has(prev.id) && inScene.has(next.id) && next.start - prev.end <= 1.2) {
      return prev.id === cid ? next.id : prev.id;
    }
    return null;
  };
  const speakerTarget = (cid, t) => {
    const others = people.filter(o => o.cast !== cid).map(o => o.cast);
    if (!others.length) return W / 2;
    if (others.length === 1) return swStoryAt(plans[others[0]], t).x;
    const li = lines.findIndex(l => l.id === cid && t >= l.start - 0.2 && t <= l.end + 0.3);
    const prev = li > 0 ? lines[li - 1].id : null;
    const ring = prev && others.includes(prev) ? [prev].concat(others.filter(k => k !== prev)) : others;
    const k = li >= 0 ? Math.floor((t - lines[li].start) / 2.6) : 0;
    const targetId = ring[(k + ring.length) % ring.length];
    return swStoryAt(plans[targetId], t).x;
  };
  const dirAt = (m, cid, t) => {
    if (m.facing) return ecN(m.facing, 1) >= 0 ? 1 : -1;
    const at = swStoryAt(plans[cid], t);
    if (Math.abs(at.vx) > 20) return Math.sign(at.vx);
    for (const act of solo) {
      if (act.a === cid && act.type === 'pickup' && act.x != null && t - act.t > -0.35 && t - act.t < 1.1) return act.x >= at.x ? 1 : -1;
    }
    for (const act of actions) {
      const dt = t - act.t;
      if (dt < -0.5 || dt > 2.4) continue;
      const partner = act.a === cid ? act.b : act.b === cid ? act.a : null;
      if (partner && plans[partner]) return swStoryAt(plans[partner], t).x >= at.x ? 1 : -1;
    }
    const sp = talkAt(cid, t);
    if (sp && sp !== cid && plans[sp]) return swStoryAt(plans[sp], t).x >= at.x ? 1 : -1;
    if (sp === cid) return speakerTarget(cid, t) >= at.x ? 1 : -1;
    const others = people.filter(o => o.cast !== cid);
    const tx = others.length ? others.reduce((acc, o) => acc + swStoryAt(plans[o.cast], t).x, 0) / others.length : W / 2;
    return tx >= at.x ? 1 : -1;
  };
  const turnTarget = (cid, t) => {
    for (const act of actions) {
      if ((act.a === cid || act.b === cid) && t - act.t > -0.6 && t - act.t < 2.4) return act.type === 'hug' ? 0.06 : 0.7;
    }
    for (const act of solo) {
      if (act.a === cid && act.type === 'pickup' && t - act.t > -0.35 && t - act.t < 1.1) return 0.65;
    }
    if (swStoryAt(plans[cid], t).walking > 0.05) return 0.7;
    return talkAt(cid, t) && people.length > 1 ? 0.65 : 0.1;
  };
  const turnOf = (m, cid, seated) => SWDraw.follow(
    t => dirAt(m, cid, t) * Math.min(seated ? 0.55 : 0.7, turnTarget(cid, t)),
    time, { freq: 1.0, damping: 1, window: 1.6, steps: 40 }
  );
  for (const m of order) {
    const p = pos[m.cast], id = m.cast, ms = s * ecN(m.scale, 1);
    const seatedNow = !!m.seated && Math.abs(p.x - plans[id].home) < 2 && p.walking < 0.05;
    const st = turnOf(m, id, seatedNow);
    let facing = ecN(m.facing, 0);
    if (Math.abs(p.vx) > 20) facing = Math.sign(p.vx);
    else if (!facing) facing = st >= 0 ? 1 : -1;
    else facing = facing >= 0 ? 1 : -1;
    const o = {
      cast: id, castTable, words, W, H, time, localTime: time,
      x: p.x, y: floorY - 170 * ms, scale: ms, facing,
      walkAmount: p.walking, vx: p.vx, seated: seatedNow,
      prop: m.prop, pose: p.walking > 0.05 ? 'walk' : 'auto',
      lookAt: 'speaker', seatHeads: heads, addressViewer: people.length <= 1
    };
    o.turn = ecClamp(Math.abs(st), 0, 0.7);
    let hugging = false;
    o.bag = m.bag;
    /* Profile view: always, or ('auto') while walking, picking something
       up or acting with someone. */
    const viewOf = mm => String(mm.view || sc.view || opts.view || 'front').toLowerCase();
    const busy = cid => actions.some(x => (x.a === cid || x.b === cid) && time - x.t > -0.5 && time - x.t < 2.4)
      || solo.some(x => x.a === cid && x.type === 'pickup' && time - x.t > -0.35 && time - x.t < 1.1);
    const sideFor = (mm, cid) => { const v = viewOf(mm); return v === 'side' || (v === 'auto' && (pos[cid].walking > 0.05 || busy(cid))); };
    const side = sideFor(m, id);
    if (side) o.view = 'side';
    /* Picking something up: crouch, reach the floor, rise holding it. */
    for (const act of solo) {
      if (act.a !== id || act.type !== 'pickup' || act.x == null) continue;
      const dt = time - act.t;
      if (dt >= 0.5) o.prop = act.prop;
      if (dt < -0.35 || dt > 1.1) continue;
      const q = p.walking > 0.05 ? 0 : ease((dt + 0.35) / 0.4) * ease((1.1 - dt) / 0.45);
      o.crouch = q;
      o.pose = 'idle';
      o.facing = act.x >= p.x ? 1 : -1;
      o.rightHand = { x: p.x + (act.x - p.x) * q + (1 - q) * o.facing * 20 * ms, y: floorY - 120 * ms + (114 * ms) * q * (dt < 0.5 ? 1 : 0.6) };
      o.rightHandPose = 'hold';
      o.lookAt = { x: act.x, y: floorY };
    }
    /* Interactions in progress, as two-person poses. Heights are in the
       figure's frame: the hip at floor - 140·s, the waist at floor - 166·s,
       the shoulders at floor - 227·s. */
    for (const act of actions) {
      const dt = time - act.t;
      if (dt < -0.5 || dt > 2.4) continue;
      const partner = act.a === id ? act.b : act.b === id ? act.a : null;
      if (!partner || !pos[partner]) continue;
      /* reach only once the two stand together, never mid-stride */
      const q = (p.walking > 0.05 || pos[partner].walking > 0.05) ? 0
        : act.type === 'hug' ? ease((dt + 0.3) / 0.4) * ease((2.2 - dt) / 0.4)
        : ease((dt + 0.3) / 0.45) * ease((2.4 - dt) / 0.45);
      const px = pos[partner].x, toward = px >= p.x ? 1 : -1;
      const pm = people.find(x => x.cast === partner) || {}, pk = s * ecN(pm.scale, 1);
      const sitDrop = (mm, k, cid) => (mm.seated && pos[cid].walking < 0.05 ? SWDraw.seatDrop('flat') * k : 0);
      const myDrop = sitDrop(m, ms, id), theirDrop = sitDrop(pm, pk, partner);
      const mySize = swStorySize(s, m, castTable[id]), pkSize = swStorySize(s, pm, castTable[partner]);
      o.facing = toward;
      o.pose = 'idle';
      o.lookAt = { x: px, y: floorY - 275 * pkSize + sitDrop(pm, pkSize, partner) };
      const lerp = (u, v) => u + (v - u) * q;
      if (act.type === 'handshake' || act.type === 'give') {
        /* The two hands meet at arm's length between them (swHandsMeet), at
           the point their reaches share: a handshake low and pumping
           twice, a hand-over a little higher, the giver holding the thing
           out and the receiver opening a palm under it. */
        const ka = swStorySize(s, act.a === id ? m : pm, castTable[act.a]), kb = swStorySize(s, act.b === id ? m : pm, castTable[act.b]);
        const meet = swHandsMeet(ka, kb, SW_REACH_SLOPE[act.type]);
        const xa = act.a === id ? p.x : px, xb = act.a === id ? px : p.x;
        const meetX = xa + (xb - xa) * meet.a / meet.apart, meetY = floorY - meet.height + (myDrop + theirDrop) / 2;
        const rest = { x: p.x + toward * 20 * ms, y: floorY - 120 * ms + myDrop };
        const giver = act.a === id;
        const shake = act.type === 'handshake';
        const pump = shake && dt > 0 && dt < 1.3 ? Math.sin(dt * Math.PI * 2 / 0.65) * 5 * ms : 0;
        const hold = shake ? 0 : (giver ? -6 : 4) * ms;
        o.rightHand = { x: lerp(rest.x, meetX), y: lerp(rest.y, meetY + pump + hold) };
        o.rightHandPose = shake || giver ? 'hold' : 'open';
        if (shake) o.emotion = 'happy';
      } else if (act.type === 'hug' && side && sideFor(pm, partner)) {
        /* An embrace in profile: chest to chest, so close that the one in
           front (drawn last) hides the other's face behind their head —
           their chin over the other's shoulder, eyes closed. The faces never
           meet in view. Each wraps the near arm round the other's back, one
           high and one low, the hands shown on the backs (laid on after). */
        const high = pos[id].x < pos[partner].x || (pos[id].x === pos[partner].x && id < partner);
        const back = { x: px + toward * 14 * pk, y: floorY - (high ? 214 : 172) * pk };
        const rest = { x: p.x + toward * 20 * ms, y: floorY - 120 * ms };
        o.rightHand = { x: lerp(rest.x, back.x), y: lerp(rest.y, back.y) };
        o.rightHandPose = 'relaxed';
        if (q > 0.2) hugHands.push({ x: back.x, y: back.y, angle: Math.PI / 2 - toward * 0.6, s: ms, skin: (castTable[id] && castTable[id].skinColor) || '#F2C4A2', q });
        o.headTilt = (high ? -0.2 : 0.3) * q;
        o.seated = false;
        o.prop = null;
        hugging = true;
        o.emotion = q > 0.5 ? 'content' : 'happy';
      } else if (act.type === 'hug') {
        /* A side hug — shoulder to shoulder, heads leaning together, eyes
           closed: the taller partner (or left when matched) reaches a visible
           arm behind the other's neck onto their far shoulder (with the hand
           draped over the shoulder cap), while the partner wraps their inner
           arm openly across the waist in front. Both arms stay drawn. */
        const shoulderRole = hugShoulder.has(id);
        const dropOfPartner = sitDrop(pm, pkSize, partner);
        const mySizeDrop = sitDrop(m, mySize, id);
        const mySkin = (castTable[id] && castTable[id].skinColor) || '#F2C4A2';
        const restX = p.x + toward * 20 * mySize, restY = floorY - 126 * mySize + mySizeDrop;
        const restEx = p.x + toward * 24 * mySize, restEy = floorY - 174 * mySize + mySizeDrop;
        o.rightArmShorten = true;
        if (shoulderRole) {
          const sx = px + toward * 20 * pkSize, sy = floorY - 218 * pkSize + dropOfPartner;
          const hx = lerp(restX, sx), hy = lerp(restY, sy);
          o.rightHand = { x: hx, y: hy };
          o.rightElbow = { x: lerp(restEx, px - toward * 4 * pkSize), y: lerp(restEy, sy + 6 * s) };
          o.rightHandPose = q > 0.45 ? 'none' : 'relaxed';
          if (q > 0.45) hugHands.push({ x: hx, y: hy, angle: Math.PI / 2 - toward * 0.45, ts: -toward, s: mySize, skin: mySkin, q: (q - 0.45) / 0.55 });
        } else {
          o.rightArmFront = true;
          const waistY = floorY - Math.min(148 * pkSize, 186 * mySize) + dropOfPartner;
          o.rightHand = { x: lerp(restX, px - toward * 20 * pkSize), y: lerp(restY, waistY + 2 * mySize) };
          o.rightElbow = { x: lerp(restEx, p.x + toward * 21 * mySize), y: lerp(restEy, waistY - 4 * mySize) };
          o.rightHandPose = 'relaxed';
        }
        o.headTilt = 0.7 * q;
        /* Nobody hugs from a chair, or with a phone in hand. */
        o.seated = false;
        o.prop = null;
        hugging = true;
        o.emotion = q > 0.5 ? 'content' : 'happy';
        o.lookAt = undefined;
        o.headTurn = 0.6;
      }
    }
    /* A given thing is in the giver's hand until the hand-over, then in the
       receiver's. */
    for (const act of actions) {
      if (hugging || act.type !== 'give' || (act.a !== id && act.b !== id)) continue;
      const has = act.a === id ? time < act.t + 0.9 : time >= act.t + 0.9;
      o.prop = has ? act.prop : (o.prop === act.prop ? null : o.prop);
    }
    SWDraw.character(ctx, o);
    /* Someone seated sits at a small table, which says "sitting" from the
       front far better than legs do. */
    if (o.seated && (m.table === true || (m.table !== false && sc.set === 'cafe'))) swStoryTable(ctx, plans[id].home + (m.facing ? m.facing : facingHome(id)) * 34 * ms, floorY, ms, sc.night);
  }
  /* Resting shoulder hand from a side hug, laid over the partner's far shoulder. */
  for (const h of hugHands) {
    ctx.save();
    ctx.globalAlpha *= ecClamp(h.q, 0, 1);
    ctx.translate(h.x, h.y);
    ctx.rotate(h.angle);
    swToonHand(ctx, 'relaxed', 12 * h.s, h.skin, swShade(h.skin, -0.16), 'flat', h.ts || 1);
    ctx.restore();
  }
  SWDraw.set(ctx, sc.set, { W, H, time, night: !!sc.night, colors: sc.colors, layer: 'front', camX });
  swStoryEffects(ctx, sc.effects, 'front', time, a, b, lines, words, W, H);
  ctx.restore();

  /* Speech bubbles (bubbles: true on the scene or the story): the line
     being spoken, sentence by sentence, over the speaker's head with their
     name — drawn in screen space so it stays readable in close shots. */
  if (sc.bubbles || (opts.bubbles && sc.bubbles !== false)) {
    const line = lines.find(l => time >= l.start - 0.1 && time <= l.end + 0.5 && plans[l.id]);
    if (line) {
      const m = people.find(x => x.cast === line.id) || {}, k = s * ecN(m.scale, 1);
      const P = swStoryAt(plans[line.id], time);
      const seatedNow = m.seated && Math.abs(P.x - plans[line.id].home) < 2 && P.walking < 0.05;
      const toScreen = (x, y) => (zoom > 1.001 ? { x: W / 2 + (x - fx) * zoom, y: H / 2 + (y - fy) * zoom } : { x, y });
      const head = toScreen(P.x, floorY - 312 * k + (seatedNow ? SWDraw.seatDrop('flat') * k : 0));
      /* the sentence under the playhead */
      const sentences = [];
      let cur = [];
      for (const w of line.words) { cur.push(w); if (/[.!?…]$/.test(String(w.text || ''))) { sentences.push(cur); cur = []; } }
      if (cur.length) sentences.push(cur);
      const sent = sentences.find(sn => time <= sn[sn.length - 1].end + 0.35) || sentences[sentences.length - 1];
      const text = sent.map(w => String(w.text || '')).join(' ');
      const member = castTable[line.id] || {};
      const name = String(member.name || line.id);
      const fs = Math.round(U * 0.026), nfs = Math.round(U * 0.02);
      ctx.save();
      ctx.font = '500 ' + fs + 'px ' + font;
      const maxW = Math.min(W * 0.42, U * 0.62);
      const wordsOf = text.split(' '), rows = [];
      let row = '';
      for (const w of wordsOf) {
        const tryRow = row ? row + ' ' + w : w;
        if (ctx.measureText(tryRow).width > maxW && row) { rows.push(row); row = w; } else row = tryRow;
      }
      if (row) rows.push(row);
      const pad = U * 0.022, lh = fs * 1.3;
      const bw = Math.max(...rows.map(r => ctx.measureText(r).width)) + pad * 2;
      const bh = nfs * 1.5 + rows.length * lh + pad * 1.4;
      const bx = ecClamp(head.x - bw / 2, U * 0.02, W - bw - U * 0.02);
      const by = ecClamp(head.y - bh - U * 0.04, U * 0.02, H - bh - U * 0.02);
      const q = Math.min(ease((time - line.start + 0.1) / 0.2), ease((line.end + 0.5 - time) / 0.2));
      ctx.globalAlpha *= q;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.roundRect(bx + 3, by + 4, bw, bh, U * 0.016); ctx.fill();
      ctx.fillStyle = '#FBF7EE';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, U * 0.016); ctx.fill();
      /* the tail points at the speaker */
      const tx = ecClamp(head.x, bx + U * 0.03, bx + bw - U * 0.03);
      ctx.beginPath(); ctx.moveTo(tx - U * 0.014, by + bh - 1); ctx.lineTo(tx + U * 0.014, by + bh - 1); ctx.lineTo(tx + (head.x - tx) * 0.3, by + bh + U * 0.022); ctx.fill();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = member.accentColor || member.jacketColor || '#B45309';
      ctx.font = '700 ' + nfs + 'px ' + font;
      ctx.fillText(name, bx + pad, by + pad * 0.6 + nfs);
      ctx.fillStyle = '#1F2937';
      ctx.font = '500 ' + fs + 'px ' + font;
      rows.forEach((r, i) => ctx.fillText(r, bx + pad, by + pad * 0.6 + nfs * 1.5 + (i + 1) * lh - fs * 0.25));
      ctx.restore();
    }
  }

  /* Scene card */
  if (sc.title) {
    const q = Math.min(ease((time - a - 0.3) / 0.4), ease((a + 3 - time) / 0.4));
    if (q > 0.001) {
      ctx.save();
      ctx.globalAlpha *= q;
      ctx.font = '700 ' + Math.round(U * 0.032) + 'px ' + font;
      const tw = ctx.measureText(String(sc.title)).width + U * 0.08;
      const ty = H * (portrait ? 0.1 : 0.08) - (1 - q) * 20;
      ctx.fillStyle = 'rgba(2,6,23,0.72)';
      ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, ty, tw, U * 0.07, U * 0.035); ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.fillText(String(sc.title), W / 2, ty + U * 0.047);
      ctx.restore();
    }
  }
  /* Between scenes: a short dip to black. */
  const edge = Math.min(time - a, b - time);
  if (timeline.length > 1 && edge < 0.3) {
    const first = cur === timeline[0], last = cur === timeline[timeline.length - 1];
    const fadeIn = time - a < 0.3 && !first, fadeOut = b - time < 0.3 && !last;
    if (fadeIn || fadeOut) {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.globalAlpha *= 1 - ecClamp(edge / 0.3, 0, 1);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  return { camera: { zoom, x: zoom > 1.001 ? fx : W / 2, y: zoom > 1.001 ? fy : H / 2 } };
}
SWDraw.story = swStory;
/* The actions a scene plays between two of its people (`a` and `b`); a
   scene's `drop` and `pickup` are one person's and take an item. */
SWDraw.storyActions = ['handshake', 'give', 'hug'];
SWDraw.storyScenes = swStoryScenes;
