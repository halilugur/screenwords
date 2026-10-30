/* Third pack: whole-stage camera transforms (25). */
function sharedPack3Transforms(ctx, comps, W, H, time) {
  comps = comps || [];
  const hit = id => comps.find(c => c.componentId === id && time >= c.start && time <= c.end);
  const apply = (c, fn) => {
    if (!c) return;
    const pr = Math.min(1, Math.max(0, (time - c.start) / Math.max(0.01, c.end - c.start)));
    fn(c.params || {}, pr);
  };
  const center = fn => { ctx.translate(W / 2, H / 2); fn(); ctx.translate(-W / 2, -H / 2); };

  apply(hit('cameraBreathe'), (p, pr) => {
    const s = 1 + Math.sin(pr * Math.PI * 2) * ecN(p.amount, 0.012);
    center(() => ctx.scale(s, s));
  });
  apply(hit('cameraDrift'), (p, pr) => {
    const amp = ecN(p.amount, 0.02) * W;
    ctx.translate(Math.sin(pr * Math.PI * 2) * amp, Math.cos(pr * Math.PI * 2) * amp * 0.6);
  });
  apply(hit('cameraFloat'), (p, pr) => {
    const amp = ecN(p.amount, 0.015) * W;
    ctx.translate(Math.sin(time * 0.9) * amp, Math.cos(time * 0.7) * amp * 0.7);
  });
  apply(hit('cameraKick'), (p, pr) => {
    const k = Math.max(0, 1 - pr * 3);
    ctx.translate((ecHash(Math.floor(time * 30)) - 0.5) * 40 * k,
      (ecHash(Math.floor(time * 30) + 9) - 0.5) * 40 * k);
  });
  apply(hit('cameraOrbitTilt'), (p, pr) => {
    const amp = ecN(p.amount, 0.03) * W;
    center(() => ctx.rotate(Math.sin(pr * Math.PI * 2) * 0.03));
    ctx.translate(Math.cos(pr * Math.PI * 2) * amp, 0);
  });
  apply(hit('cameraPanLeft'), (p, pr) => {
    ctx.translate(ecN(p.amount, 0.08) * W * pr, 0);
  });
  apply(hit('cameraPanRight'), (p, pr) => {
    ctx.translate(-ecN(p.amount, 0.08) * W * pr, 0);
  });
  apply(hit('cameraPushIn'), (p, pr) => {
    const s = 1 + (ecN(p.amount, 0.16)) * pr;
    center(() => ctx.scale(s, s));
  });
  apply(hit('cameraRoll'), (p, pr) => {
    center(() => ctx.rotate((ecN(p.angle, 6) * Math.PI / 180) * pr));
  });
  apply(hit('cameraShakeSoft'), (p, pr) => {
    const amp = ecN(p.amount, 8);
    ctx.translate(Math.sin(time * 41) * amp, Math.cos(time * 37) * amp * 0.7);
  });
  apply(hit('cameraSway'), (p, pr) => {
    const amp = ecN(p.amount, 0.02) * W;
    ctx.translate(Math.sin(time * 0.7) * amp, 0);
  });
  apply(hit('cameraTilt'), (p, pr) => {
    const a = ecN(p.angle, 4) * Math.PI / 180;
    center(() => ctx.rotate(a * Math.sin(pr * Math.PI)));
  });
  apply(hit('cameraWobble'), (p, pr) => {
    const a = ecN(p.angle, 3) * Math.PI / 180 * Math.sin(time * 1.7);
    center(() => ctx.rotate(a));
    const amp = ecN(p.amount, 0.004) * W;
    ctx.translate(Math.sin(time * 1.3) * amp, Math.cos(time * 1.1) * amp);
  });
  apply(hit('cameraZoomOut'), (p, pr) => {
    const s = 1 + ecN(p.amount, 0.12) * (1 - pr);
    center(() => ctx.scale(s, s));
  });
  apply(hit('dutchSway'), (p, pr) => {
    const a = ecN(p.angle, 5) * Math.PI / 180;
    center(() => ctx.rotate(a * Math.sin(time * 0.9)));
  });
  apply(hit('focusPull'), (p, pr) => {
    const s = 1 + ecN(p.amount, 0.015) * Math.sin(pr * Math.PI);
    center(() => ctx.scale(s / (1 + s * 0.002), s));
  });
  apply(hit('parallaxPan'), (p, pr) => {
    const amp = ecN(p.amount, 0.03) * W;
    ctx.translate(Math.sin(time * 0.5) * amp, Math.cos(time * 0.4) * amp * 0.4);
  });
  apply(hit('perspectiveTilt'), (p, pr) => {
    const v = ecN(p.amount, 0.05) * Math.sin(pr * Math.PI);
    center(() => ctx.transform(1 + v, 0, 0, 1 - v * 0.5, 0, 0));
  });
  apply(hit('shakeHandheld'), (p, pr) => {
    const amp = ecN(p.amount, 10);
    ctx.translate(Math.sin(time * 61) * amp + Math.sin(time * 23) * amp * 0.4,
      Math.cos(time * 53) * amp * 0.8);
  });
  apply(hit('tiltOrbit'), (p, pr) => {
    const amp = ecN(p.amount, 0.02) * W;
    center(() => ctx.rotate(Math.sin(pr * Math.PI * 2) * 0.025));
    ctx.translate(Math.cos(pr * Math.PI * 2) * amp, Math.sin(pr * Math.PI * 2) * amp * 0.4);
  });
  apply(hit('zoomBreath'), (p, pr) => {
    const s = 1 + Math.sin(time * 1.6) * ecN(p.amount, 0.02);
    center(() => ctx.scale(s, s));
  });
  apply(hit('zoomInSlow'), (p, pr) => {
    const s = 1 + ecN(p.amount, 0.22) * icEase(pr);
    center(() => ctx.scale(s, s));
  });
  apply(hit('zoomOutSlow'), (p, pr) => {
    const s = 1 + ecN(p.amount, 0.22) * (1 - icEase(pr));
    center(() => ctx.scale(s, s));
  });
  apply(hit('rotateStage'), (p, pr) => {
    center(() => ctx.rotate((ecN(p.angle, 8) * Math.PI / 180) * pr));
  });
  apply(hit('stabilizeFloat'), (p, pr) => {
    const amp = ecN(p.amount, 0.006) * W;
    ctx.translate(Math.sin(time * 0.6) * amp, Math.cos(time * 0.5) * amp * 0.5);
  });
}
