/* Third pack dispatch: one entry point for all 300 ids. */
function drawPack3(ctx, W, H, el, prog, id, p, GA, col, acc) {
  if (EC3_TRANSFORM_IDS.indexOf(id) >= 0) return;
  if (EC3_TITLE_IDS.indexOf(id) >= 0) return p3Title(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_CAPTION_IDS.indexOf(id) >= 0) return p3Caption(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_SHAPE_IDS.indexOf(id) >= 0) return p3Shape(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_CHART_IDS.indexOf(id) >= 0) return p3Chart(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_UI_IDS.indexOf(id) >= 0) return p3Ui(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_MOTION_IDS.indexOf(id) >= 0) return p3Motion(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_BACKGROUND_IDS.indexOf(id) >= 0) return p3Background(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_EFFECT_IDS.indexOf(id) >= 0) return p3Effect(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_TRANSITION_IDS.indexOf(id) >= 0) return p3Transition(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_LOTTIE_IDS.indexOf(id) >= 0) return p3Lottie(ctx, W, H, el, prog, id, p, GA, col, acc);
  if (EC3_DATA_IDS.indexOf(id) >= 0) return p3Data(ctx, W, H, el, prog, id, p, GA, col, acc);
}
