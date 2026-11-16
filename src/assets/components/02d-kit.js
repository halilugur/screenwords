/* ==========================================================================
   Character kits: ready-made illustrated characters, so a cast member is one
   line — { kit: 'editorial', hair: 'long', beard: 'full', skinColor, ... } —
   instead of hand-drawn parts. A kit is the SVG parts SWDraw.character takes
   (see 02c-toon.js), drawn once with care for anatomy: shoulders wider than
   the ribcage, arms hanging beside it, elbows at the waist, hands that face
   the viewer. Colours come from the member's palette through $tokens.
   ========================================================================== */

/* The editorial body: a blazer over a shirt, trousers, sneakers, mitten-free
   hands for every pose, and a face of dot eyes, brows and visemes. */
const SW_KIT_EDITORIAL = {"head":{"pivot":[0,33],"tip":[0,-33],"eyesAt":[1,-2],"browsAt":[1,-2],"mouthAt":[2,17],"layers":[{"d":"M-29 -1 C-34 -4 -36 6 -31 10 C-30 11 -28 11 -27 10 Z","fill":"$skinShade"},{"d":"M29 -1 C34 -4 36 6 31 10 C30 11 28 11 27 10 Z","fill":"$skinShade"},{"d":"M-29 -4 C-29 -24 -17 -34 0 -34 C17 -34 29 -24 29 -4 C29 14 20 29 5 33 C2 33.8 -2 33.8 -5 33 C-20 29 -29 14 -29 -4 Z","fill":"$skin"},{"d":"M15 -30 C26 -22 30 -6 27 10 C24 23 15 30 6 33 C16 23 21 10 20 -5 C19.5 -15 18 -23 15 -30 Z","fill":"$skinShade","opacity":0.55},{"d":"M4 4 C6.5 8 6 10.5 2.5 11","stroke":"$skinShade","lineWidth":2,"lineCap":"round"}]},"eyes":{"gaze":2,"open":{"pivot":[0,0],"layers":[{"d":"M-14 0 a3.1 3.9 0 1 0 6.2 0 a3.1 3.9 0 1 0 -6.2 0 Z","fill":"$ink"},{"d":"M8 0 a3.1 3.9 0 1 0 6.2 0 a3.1 3.9 0 1 0 -6.2 0 Z","fill":"$ink"},{"d":"M-12.4 -1.8 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 Z","fill":"#FFFFFF","opacity":0.9},{"d":"M9.6 -1.8 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 Z","fill":"#FFFFFF","opacity":0.9}]},"closed":{"pivot":[0,0],"layers":[{"d":"M-14.5 0.5 Q-11 3 -7.5 0.5 M7.5 0.5 Q11 3 14.5 0.5","stroke":"$ink","lineWidth":2.2,"lineCap":"round"}]},"squint":{"pivot":[0,0],"layers":[{"d":"M-14.5 1.5 Q-11 -2.5 -7.5 1.5 M7.5 1.5 Q11 -2.5 14.5 1.5","stroke":"$ink","lineWidth":2.4,"lineCap":"round"}]}},"brows":{"pivot":[0,0],"lift":3,"layers":[{"d":"M-16 -10 Q-11.5 -13.5 -6.5 -11.5 M6.5 -11.5 Q11.5 -13.5 16 -10","stroke":"$hair","lineWidth":2.6,"lineCap":"round"}]},"mouth":{"rest":{"pivot":[0,0],"layers":[{"d":"M-6 0 Q0 3 6 0","stroke":"$ink","lineWidth":2.2,"lineCap":"round"}]},"smile":{"pivot":[0,0],"layers":[{"d":"M-8 -1.5 Q0 6.5 8 -1.5","stroke":"$ink","lineWidth":2.3,"lineCap":"round"}]},"sad":{"pivot":[0,0],"layers":[{"d":"M-6 2.5 Q0 -2 6 2.5","stroke":"$ink","lineWidth":2.2,"lineCap":"round"}]},"A":{"pivot":[0,0],"layers":[{"d":"M-7.5 -1 Q0 0.5 7.5 -1 Q6.5 10 0 10 Q-6.5 10 -7.5 -1 Z","fill":"#5B1E2B"},{"d":"M-6.5 -0.6 L6.5 -0.6 L6 2 L-6 2 Z","fill":"#FFFFFF"},{"d":"M-4 8 Q0 5 4 8 Q2 10 0 10 Q-2 10 -4 8 Z","fill":"#E86A7E"}]},"E":{"pivot":[0,0],"layers":[{"d":"M-8.5 -1 Q0 0.5 8.5 -1 Q7 6 0 6 Q-7 6 -8.5 -1 Z","fill":"#5B1E2B"},{"d":"M-7.5 -0.6 L7.5 -0.6 L7 2 L-7 2 Z","fill":"#FFFFFF"}]},"O":{"pivot":[0,0],"layers":[{"d":"M-4.5 3 a4.5 5.5 0 1 0 9 0 a4.5 5.5 0 1 0 -9 0 Z","fill":"#5B1E2B"}]},"U":{"pivot":[0,0],"layers":[{"d":"M-3.2 2 a3.2 3.6 0 1 0 6.4 0 a3.2 3.6 0 1 0 -6.4 0 Z","fill":"#5B1E2B"}]},"M":{"pivot":[0,0],"layers":[{"d":"M-6.5 0.8 L6.5 0.8","stroke":"$ink","lineWidth":2.6,"lineCap":"round"}]},"F":{"pivot":[0,0],"layers":[{"d":"M-6.5 0 Q0 1.5 6.5 0 Q4.5 4.5 0 4.5 Q-4.5 4.5 -6.5 0 Z","fill":"#5B1E2B"},{"d":"M-5.5 0.2 L5.5 0.2 L5 2.2 L-5 2.2 Z","fill":"#FFFFFF"}]},"S":{"pivot":[0,0],"layers":[{"d":"M-7.5 -0.5 Q0 1 7.5 -0.5 Q5.5 4 0 4 Q-5.5 4 -7.5 -0.5 Z","fill":"#5B1E2B"},{"d":"M-6.5 -0.2 L6.5 -0.2 L6 1.6 L-6 1.6 Z","fill":"#FFFFFF"}]},"L":{"pivot":[0,0],"layers":[{"d":"M-6.5 -1 Q0 0.5 6.5 -1 Q5.5 7 0 7 Q-5.5 7 -6.5 -1 Z","fill":"#5B1E2B"},{"d":"M-3.5 1.5 Q0 -0.5 3.5 1.5 Q3 5 0 5 Q-3 5 -3.5 1.5 Z","fill":"#E86A7E"}]}},"neck":{"pivot":[0,0],"tip":[0,-20],"stretch":true,"layers":[{"d":"M-6.5 2 L6.5 2 L6 -22 L-6 -22 Z","fill":"$skinShade"}]},"torso":{"pivot":[0,0],"tip":[0,94],"layers":[{"d":"M-21 80 L21 80 Q23 96 21 104 L-21 104 Q-23 96 -21 80 Z","fill":"$pants"},{"d":"M-31 10 Q-31 0 -19 0 L19 0 Q31 0 31 10 Q31 19 24 23 Q23 56 22 92 Q21 99 14 99 L-14 99 Q-21 99 -22 92 Q-23 56 -24 23 Q-31 19 -31 10 Z","fill":"$jacket"},{"d":"M-9 -1 L9 -1 L5 99 L-5 99 Z","fill":"$shirt"},{"d":"M-9 -1 L-3 9 L0 3 L3 9 L9 -1 Z","fill":"$shirtDark","opacity":0.45},{"d":"M-9 -1 L-17 5 L-12 20 L-5 50 Z","fill":"$jacketDark"},{"d":"M9 -1 L17 5 L12 20 L5 50 Z","fill":"$jacketDark"},{"d":"M17 23 Q23 26 23.5 40 Q23 66 22 92 Q21 97 17 99 Q21 60 17 23 Z","fill":"#020617","opacity":0.16},{"d":"M-24 66 L-12 66","stroke":"$jacketDark","lineWidth":2,"lineCap":"round"},{"d":"M-3 62 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0 Z","fill":"$jacketDark"}]},"upperArm":{"pivot":[0,0],"tip":[0,52],"layers":[{"d":"M-9 -1 Q-9.5 26 -7.5 52 L7.5 52 Q9.5 26 9 -1 Q0 -9 -9 -1 Z","fill":"$jacket"},{"d":"M-7.5 52 a7.5 7.5 0 1 0 15 0 a7.5 7.5 0 1 0 -15 0 Z","fill":"$jacket"},{"d":"M5 2 Q8 26 6 50 L7.5 52 Q9.5 26 9 -1 Z","fill":"#020617","opacity":0.14},{"d":"M-9 -1 Q-9.5 26 -7.5 52 M9 -1 Q9.5 26 7.5 52 M-7.5 52 A7.5 7.5 0 0 0 7.5 52","stroke":"$jacketDark","lineWidth":1.7,"lineCap":"round"}]},"forearm":{"pivot":[0,0],"tip":[0,48],"layers":[{"d":"M-4.6 36 L4.6 36 L4.4 50 L-4.4 50 Z","fill":"$skin"},{"d":"M-7.5 -3 Q-7.2 20 -6.6 40 L6.6 40 Q7.2 20 7.5 -3 Z","fill":"$jacket"},{"d":"M-7.5 -3 Q-7.2 20 -6.6 40 M7.5 -3 Q7.2 20 6.6 40","stroke":"$jacketDark","lineWidth":1.7,"lineCap":"round"},{"d":"M-6.8 37 L6.8 37 L6.6 41.5 L-6.6 41.5 Z","fill":"$shirt"},{"d":"M-5 14 Q0 17 5 14","stroke":"$jacketDark","lineWidth":1.4,"lineCap":"round","opacity":0.8}]},"thigh":{"pivot":[0,0],"tip":[0,66],"layers":[{"d":"M-10.5 -4 L10.5 -4 Q11 30 9 66 L-9 66 Q-11 30 -10.5 -4 Z","fill":"$pants"},{"d":"M-9 66 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 Z","fill":"$pants"}]},"shin":{"pivot":[0,0],"tip":[0,66],"layers":[{"d":"M-9 0 L9 0 Q8.5 34 7.5 66 L-7.5 66 Q-8.5 34 -9 0 Z","fill":"$pants"},{"d":"M3 6 Q5 34 4.5 64","stroke":"$pantsDark","lineWidth":1.4,"opacity":0.7}]},"foot":{"pivot":[0,0],"tip":[20,0],"layers":[{"d":"M-8 -6 Q-2 -9.5 6 -6.5 Q20 -3 22.5 3 Q23.5 8.5 17 8.5 L-9.5 8.5 Q-11.5 0 -8 -6 Z","fill":"$shoe"},{"d":"M-10 5.6 L21.5 5.6 Q23.5 6 23 8.5 L-9.5 8.5 Z","fill":"#020617","opacity":0.22},{"d":"M0 -4.5 L7 -3","stroke":"$accent","lineWidth":1.6,"lineCap":"round"}]},"hands":{"relaxed":{"pivot":[0,0],"tip":[33,0],"layers":[{"d":"M-1 -6 C7 -7.8 15 -7.8 20 -6.6 C26.5 -5 27.5 3.5 23 6.5 C19.5 8.5 13.5 8.3 9.5 7.8 L5.5 7.2 C2.5 9.5 -1 8.5 -1 6 Z","fill":"$skin"},{"d":"M3 5 C6.5 7 11 9 13 11 C14.5 12.8 12.3 14.8 10.3 13.6 C7 12 3 10.2 1 8.2 Z","fill":"$skin"},{"d":"M20 -2.5 Q23.5 -2 24.5 -0.5 M19.5 1.8 Q23 2.3 23.8 3.8","stroke":"$skinShade","lineWidth":0.9,"lineCap":"round"}]},"hold":{"pivot":[0,0],"tip":[33,0],"layers":[{"d":"M-1 -6 C7 -7.8 15 -7.8 19 -6.6 C25 -5 26 3.5 22 6.5 C18.5 8.5 13.5 8.3 9.5 7.8 L5.5 7.2 C2.5 9.5 -1 8.5 -1 6 Z","fill":"$skin"},{"d":"M3 5 C6.5 7 10 8.5 12.5 9.5 C14.2 10.6 12.6 12.8 10.6 12 C7 11 3 10 1 8.2 Z","fill":"$skin"},{"d":"M19 -2.5 Q22.5 -2 23.5 -0.5 M18.5 1.8 Q22 2.3 22.8 3.8","stroke":"$skinShade","lineWidth":0.9,"lineCap":"round"}]},"point":{"pivot":[0,0],"tip":[33,0],"layers":[{"d":"M-1 -6 C6 -7.8 13 -7.8 17 -5.5 C21.5 -2.5 21.5 6 17 8.6 C12 10.2 6 9.6 1.5 8 L-1 6 Z","fill":"$skin"},{"d":"M14 -3 L30.5 -2.4 C33.8 -2.2 33.8 2.2 30.5 2.4 L14 3 Z","fill":"$skin"},{"d":"M4 6 C8 8 12 8 14 6.5 C15.8 7.6 14.2 10.2 11.2 10.8 C7.2 11.2 3 10.2 1 8.2 Z","fill":"$skin"},{"d":"M17 4.5 Q19.5 5.2 19.8 7.2","stroke":"$skinShade","lineWidth":0.9,"lineCap":"round"}]},"open":{"pivot":[0,0],"tip":[33,0],"layers":[{"d":"M-1 -6.5 C5 -8 11 -8.6 16 -8.2 L16.5 8.2 C11 8.6 5 8 -1 6.5 Z","fill":"$skin"},{"d":"M15 -8.4 L27 -9.4 C29.6 -9.6 29.8 -5.8 27.2 -5.6 L15 -5 Z","fill":"$skin"},{"d":"M15.5 -4.3 L29.5 -4.4 C32.2 -4.4 32.2 -0.6 29.5 -0.6 L15.5 -0.8 Z","fill":"$skin"},{"d":"M15.5 0 L28.5 0.6 C31.2 0.8 31 4.6 28.3 4.4 L15.5 3.6 Z","fill":"$skin"},{"d":"M15.5 4.4 L25 6 C27.4 6.4 27 9.8 24.6 9.4 L15.5 8 Z","fill":"$skin"},{"d":"M5 5 C8 8 10.5 12 11.5 15 C12.4 17.6 9.8 18.6 8.8 16.6 C7.2 13.6 4 10.2 1 8 Z","fill":"$skin"}]},"wave":{"pivot":[0,0],"tip":[33,0],"layers":[{"d":"M-1 -6.5 C5 -8 11 -8.6 16 -8.2 L16.5 8.2 C11 8.6 5 8 -1 6.5 Z","fill":"$skin"},{"d":"M15 -8 L25.5 -12.4 C28 -13.4 29.2 -9.8 26.8 -8.8 L15.5 -4.6 Z","fill":"$skin"},{"d":"M15.5 -4.3 L29.5 -5.4 C32.2 -5.6 32.4 -1.8 29.7 -1.6 L15.5 -0.8 Z","fill":"$skin"},{"d":"M15.5 0 L28.5 2 C31.2 2.4 30.6 6.2 27.9 5.8 L15.5 3.6 Z","fill":"$skin"},{"d":"M15.5 4.4 L24 8.6 C26.2 9.8 24.8 12.9 22.6 11.8 L15.5 8 Z","fill":"$skin"},{"d":"M5 5 C8 8 10.5 12 11.5 15 C12.4 17.6 9.8 18.6 8.8 16.6 C7.2 13.6 4 10.2 1 8 Z","fill":"$skin"}]},"fist":{"pivot":[0,0],"tip":[33,0],"layers":[{"d":"M-1 -6.5 C6 -8.2 13 -8.2 18 -6.2 C23.5 -4 23.5 6.2 18 8.2 C12 9.8 6 9.2 -1 6.5 Z","fill":"$skin"},{"d":"M6 2 C10 0 15 0 17.5 1.6 C18 3.8 14 4.8 10 4.8 C8 4.8 6.4 3.6 6 2 Z","fill":"$skin","stroke":"$skinShade","lineWidth":0.8},{"d":"M19 -4 Q21.5 -3 21.8 -1.2 M19.4 -0.4 Q21.8 0.4 21.9 2","stroke":"$skinShade","lineWidth":0.9,"lineCap":"round"}]},"thumbsup":{"pivot":[0,0],"tip":[33,0],"layers":[{"d":"M-1 -6.5 C6 -8.2 13 -8.2 18 -6.2 C23.5 -4 23.5 6.2 18 8.2 C12 9.8 6 9.2 -1 6.5 Z","fill":"$skin"},{"d":"M4 6 C5 10 5 15 6 19.5 C6.6 22.2 10.4 22.2 10.8 19.5 C11 14.5 10.5 10 9.5 6 Z","fill":"$skin"},{"d":"M19 -4 Q21.5 -3 21.8 -1.2 M19.4 -0.4 Q21.8 0.4 21.9 2 M19.2 3 Q21.4 3.8 21.4 5.4","stroke":"$skinShade","lineWidth":0.9,"lineCap":"round"}]}}};
/* Cheek blush, on unless blush: false. */
const SW_KIT_BLUSH = [{"d":"M-20 9 a5.5 3.2 0 1 0 11 0 a5.5 3.2 0 1 0 -11 0 Z","fill":"#F06C82","opacity":0.28},{"d":"M11 9 a5.5 3.2 0 1 0 11 0 a5.5 3.2 0 1 0 -11 0 Z","fill":"#F06C82","opacity":0.28}];
/* Hair as back (behind the head) and front (over it) layers in head space. */
const SW_KIT_HAIR = {"bob":{"back":[{"d":"M-35 -6 C-37 -33 -19 -46 1 -45 C24 -44 38 -31 35 -6 C34 8 36 20 33 29 C28 34 20 33 17 27 L-18 27 C-22 33 -31 34 -36 29 C-38 19 -34 8 -35 -6 Z","fill":"$hair"}],"front":[{"d":"M-32 -4 C-34 -31 -15 -43 3 -41 C23 -40 34 -28 32 -6 C27 -14 19 -21 9 -24 C2 -17 -10 -13 -23 -13 C-27 -11 -30 -8 -32 -4 Z","fill":"$hair"},{"d":"M-15 -35 C-5 -39 9 -38 18 -33","stroke":"$hairLight","lineWidth":3,"lineCap":"round","opacity":0.6}]},"short":{"back":null,"front":[{"d":"M-30 -2 C-32 -28 -16 -40 2 -39 C21 -38 32 -27 30 -4 C28 -13 23 -19 16 -22 C8 -25 -4 -25 -13 -21 C-21 -17 -26 -10 -30 -2 Z","fill":"$hair"},{"d":"M-30 -4 L-28.5 8 L-26 8 L-27 -4 Z M30 -4 L28.5 8 L26 8 L27 -4 Z","fill":"$hair"},{"d":"M-12 -33 C-2 -36 10 -35 18 -30","stroke":"$hairLight","lineWidth":2.6,"lineCap":"round","opacity":0.5}]},"long":{"back":[{"d":"M-35 -6 C-37 -33 -19 -46 1 -45 C24 -44 38 -31 35 -6 C35 20 39 48 33 62 C26 66 18 64 14 58 L-14 58 C-18 64 -27 66 -34 62 C-39 48 -35 20 -35 -6 Z","fill":"$hair"},{"d":"M-28 20 C-30 36 -28 50 -30 58 M28 20 C30 36 28 50 30 58","stroke":"$hairLight","lineWidth":2,"lineCap":"round","opacity":0.45}],"front":[{"d":"M-32 -2 C-34 -30 -16 -43 2 -42 C22 -41 34 -28 32 -4 C28 -20 17 -31 3 -33 C-11 -31 -24 -21 -32 -2 Z","fill":"$hair"},{"d":"M3 -33 C2 -37 2 -40 3 -42","stroke":"$skinShade","lineWidth":1.4,"opacity":0.6},{"d":"M-20 -34 C-10 -39 12 -39 22 -33","stroke":"$hairLight","lineWidth":2.6,"lineCap":"round","opacity":0.5}]},"curly":{"back":[{"d":"M-36 -6 C-40 -42 40 -42 36 -6 C36 4 31 8 28 2 L-28 2 C-31 8 -36 4 -36 -6 Z","fill":"$hair"}],"front":[{"d":"M-30 -4 C-30 -22 -16 -30 0 -30 C16 -30 30 -22 30 -4 C24 -14 12 -19 0 -19 C-12 -19 -24 -14 -30 -4 Z","fill":"$hair"},{"d":"M-35 -10 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 Z M-33 -22 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 Z M-23.5 -31 a9.5 9.5 0 1 0 19.0 0 a9.5 9.5 0 1 0 -19.0 0 Z M-11 -35 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 Z M2.5 -32 a9.5 9.5 0 1 0 19.0 0 a9.5 9.5 0 1 0 -19.0 0 Z M14 -23 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 Z M20 -11 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 Z M-14 -24 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 Z M0 -25 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 Z","fill":"$hair"}]},"bun":{"back":[{"d":"M-11 -46 a11 10 0 1 0 22 0 a11 10 0 1 0 -22 0 Z","fill":"$hair"}],"front":[{"d":"M-31 -2 C-33 -30 -15 -42 2 -41 C21 -40 33 -29 31 -4 C27 -18 17 -27 3 -29 C-11 -27 -24 -18 -31 -2 Z","fill":"$hair"},{"d":"M-14 -35 C-4 -39 10 -38 18 -33","stroke":"$hairLight","lineWidth":2.6,"lineCap":"round","opacity":0.5}]},"bald":{"back":null,"front":null}};
const SW_KIT_BEARDS = { long: {"d":"M-27 4 C-28 28 -17 58 0 66 C17 58 28 28 27 4 C24 12 18 15 12 14 C6 13 3 11 0 11 C-3 11 -6 13 -12 14 C-18 15 -24 12 -27 4 Z M-8 30 Q-6 46 -4 56 M6 32 Q6 46 4 58","fill":"$hair"}, full: {"d":"M-27 4 C-26 20 -15 31 0 34 C15 31 26 20 27 4 C24 12 18 15 12 14 C6 13 3 11 0 11 C-3 11 -6 13 -12 14 C-18 15 -24 12 -27 4 Z","fill":"$hair"} };

/* A headscarf: draped behind the shoulders and framing the face (the face
   opening is cut with evenodd), worn in the member's hairColor. */
SW_KIT_HAIR.hijab = {
  back: [{ d: 'M-39 -6 C-41 -52 41 -52 39 -6 C39 22 38 42 31 52 L-31 52 C-38 42 -39 22 -39 -6 Z', fill: '$hair' }],
  front: [
    { d: 'M-37 -4 C-39 -50 39 -50 37 -4 C37 16 33 32 22 40 L-22 40 C-33 32 -37 16 -37 -4 Z M-25 -8 C-25 -26 25 -26 25 -8 C25 10 17 26 0 29 C-17 26 -25 10 -25 -8 Z', fill: '$hair', fillRule: 'evenodd' },
    { d: 'M-25 -8 C-25 -26 25 -26 25 -8', stroke: '$hairLight', lineWidth: 2, opacity: 0.5 },
    { d: 'M14 30 Q24 38 20 50', stroke: '$hairLight', lineWidth: 1.6, opacity: 0.45 }
  ]
};

/* Outfits: the blazer is the body above; the hoodie and the T-shirt are
   cut from the same silhouette and worn in the member's shirtColor. */
const SW_KIT_BODY = 'M-31 10 Q-31 0 -19 0 L19 0 Q31 0 31 10 Q31 19 24 23 Q23 56 22 92 Q21 99 14 99 L-14 99 Q-21 99 -22 92 Q-23 56 -24 23 Q-31 19 -31 10 Z';
const SW_KIT_PANTS = { d: 'M-21 80 L21 80 Q23 96 21 104 L-21 104 Q-23 96 -21 80 Z', fill: '$pants' };
const SW_KIT_SIDE = { d: 'M17 23 Q23 26 23.5 40 Q23 66 22 92 Q21 97 17 99 Q21 60 17 23 Z', fill: '#020617', opacity: 0.16 };
const SW_KIT_OUTFITS = {
  hoodie: {
    torso: [SW_KIT_PANTS, { d: SW_KIT_BODY, fill: '$shirt' }, SW_KIT_SIDE,
      { d: 'M-18 -1 Q-21 -11 -8 -13 L8 -13 Q21 -11 18 -1 Q9 7 0 7 Q-9 7 -18 -1 Z', fill: '$shirtDark' },
      { d: 'M-5 6 L-6 30 M5 6 L6 30', stroke: '#F8FAFC', lineWidth: 1.5, opacity: 0.8 },
      { d: 'M-16 62 L16 62 L20 82 L-20 82 Z', fill: '$shirtDark', opacity: 0.55 },
      { d: 'M-21 92 L21 92', stroke: '$shirtDark', lineWidth: 3 }],
    upperArm: [
      { d: 'M-9 -1 Q-9.5 26 -7.5 52 L7.5 52 Q9.5 26 9 -1 Q0 -9 -9 -1 Z', fill: '$shirt' },
      { d: 'M-7.5 52 a7.5 7.5 0 1 0 15 0 a7.5 7.5 0 1 0 -15 0 Z', fill: '$shirt' },
      { d: 'M5 2 Q8 26 6 50 L7.5 52 Q9.5 26 9 -1 Z', fill: '#020617', opacity: 0.14 },
      { d: 'M-9 -1 Q-9.5 26 -7.5 52 M9 -1 Q9.5 26 7.5 52 M-7.5 52 A7.5 7.5 0 0 0 7.5 52', stroke: '$shirtDark', lineWidth: 1.7 }],
    forearm: [
      { d: 'M-4.6 38 L4.6 38 L4.4 50 L-4.4 50 Z', fill: '$skin' },
      { d: 'M-7.5 -3 Q-7.2 20 -6.6 39 L6.6 39 Q7.2 20 7.5 -3 Z', fill: '$shirt' },
      { d: 'M-7.5 -3 Q-7.2 20 -6.6 39 M7.5 -3 Q7.2 20 6.6 39', stroke: '$shirtDark', lineWidth: 1.7 },
      { d: 'M-6.4 36 L6.4 36 L6 42 L-6 42 Z', fill: '$shirtDark' }]
  },
  tshirt: {
    torso: [SW_KIT_PANTS, { d: SW_KIT_BODY, fill: '$shirt' }, SW_KIT_SIDE,
      { d: 'M-10 -1 Q0 11 10 -1 Z', fill: '$skinShade' },
      { d: 'M-10 -1 Q0 11 10 -1', stroke: '$shirtDark', lineWidth: 2.4 },
      { d: 'M-22 96 L22 96', stroke: '$shirtDark', lineWidth: 1.6, opacity: 0.7 }],
    upperArm: [
      { d: 'M-7 -1 Q-7.6 26 -6 52 L6 52 Q7.6 26 7 -1 Z', fill: '$skin' },
      { d: 'M-6 52 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 Z', fill: '$skin' },
      { d: 'M-7 -1 Q-7.6 26 -6 52 M7 -1 Q7.6 26 6 52', stroke: '$skinShade', lineWidth: 1.2, opacity: 0.8 },
      { d: 'M-9.8 -1 Q-10.4 11 -9.8 23 L9.8 23 Q10.4 11 9.8 -1 Q0 -9 -9.8 -1 Z', fill: '$shirt' },
      { d: 'M-9.8 -1 Q-10.4 11 -9.8 23 L9.8 23 Q10.4 11 9.8 -1', stroke: '$shirtDark', lineWidth: 1.7 }],
    forearm: [
      { d: 'M-6 -3 Q-5.8 20 -4.6 50 L4.6 50 Q5.8 20 6 -3 Z', fill: '$skin' },
      { d: 'M-6 -3 Q-5.8 20 -4.6 50 M6 -3 Q5.8 20 4.6 50', stroke: '$skinShade', lineWidth: 1.2, opacity: 0.8 }]
  }
};
/* Long garments, worn over the legs (the torso part runs past the hip to
   just above the ankles): a robe open over an inner garment with a sash
   and bell sleeves (in jacketColor over shirtColor, sash in accentColor),
   and a long dress fitted to the waist with a flared skirt (shirtColor). */
const SW_KIT_ROBE_SLEEVES = {
  upperArm: [
    { d: 'M-10.5 -1 Q-11.5 26 -9.5 52 L9.5 52 Q11.5 26 10.5 -1 Q0 -8.5 -10.5 -1 Z', fill: '$jacket' },
    { d: 'M-9.5 52 a9.5 9.5 0 1 0 19 0 a9.5 9.5 0 1 0 -19 0 Z', fill: '$jacket' },
    { d: 'M-10.5 -1 Q-11.5 26 -9.5 52 M10.5 -1 Q11.5 26 9.5 52', stroke: '$jacketDark', lineWidth: 1.7 }],
  forearm: [
    { d: 'M-4.6 38 L4.6 38 L4.4 50 L-4.4 50 Z', fill: '$skin' },
    { d: 'M-9 -3 Q-11 20 -15 41 L15 41 Q11 20 9 -3 Z', fill: '$jacket' },
    { d: 'M-9 -3 Q-11 20 -15 41 M9 -3 Q11 20 15 41', stroke: '$jacketDark', lineWidth: 1.7 },
    { d: 'M-15 37 L15 37 L15 42 L-15 42 Z', fill: '$accent' }]
};
SW_KIT_OUTFITS.robe = {
  torso: [
    { d: 'M-31 10 Q-31 0 -19 0 L19 0 Q31 0 31 10 Q31 19 26 24 Q30 120 38 212 L-38 212 Q-30 120 -26 24 Q-31 19 -31 10 Z', fill: '$jacket' },
    { d: 'M-7 0 L7 0 L10 212 L-10 212 Z', fill: '$shirt' },
    { d: 'M-7 0 L10 212 M7 0 L-10 212', stroke: '$jacketDark', lineWidth: 1.6, opacity: 0.6 },
    { d: 'M20 26 Q27 110 36 210 L28 210 Q22 110 18 30 Z', fill: '#020617', opacity: 0.14 },
    { d: 'M-27 66 L27 66 L27.6 78 L-27.6 78 Z', fill: '$accent' },
    { d: 'M12 78 L19 112 L9 112 Z', fill: '$accent' },
    { d: 'M-38 204 L38 204 L38 212 L-38 212 Z', fill: '$jacketDark' },
    { d: 'M-10 0 L0 15 L10 0', stroke: '$jacketDark', lineWidth: 2.2 }],
  upperArm: SW_KIT_ROBE_SLEEVES.upperArm,
  forearm: SW_KIT_ROBE_SLEEVES.forearm
};
SW_KIT_OUTFITS.dress = {
  torso: [
    { d: 'M-30 10 Q-30 0 -18 0 L18 0 Q30 0 30 10 Q30 19 24 24 Q22 60 21 74 Q34 140 44 200 L-44 200 Q-34 140 -21 74 Q-22 60 -24 24 Q-30 19 -30 10 Z', fill: '$shirt' },
    { d: 'M-10 -1 Q0 12 10 -1 Z', fill: '$skinShade' },
    { d: 'M-21.5 70 L21.5 70 L21.5 78 L-21.5 78 Z', fill: '$shirtDark' },
    { d: 'M-10 90 Q-16 140 -22 196 M8 90 Q12 140 16 196 M24 100 Q32 150 38 196', stroke: '$shirtDark', lineWidth: 1.6, opacity: 0.55 },
    { d: 'M18 26 Q22 60 21 74 Q30 140 40 198 L33 198 Q24 140 17 76 Q18 50 15 30 Z', fill: '#020617', opacity: 0.12 }],
  upperArm: SW_KIT_OUTFITS.hoodie.upperArm,
  forearm: SW_KIT_OUTFITS.hoodie.forearm
};
const SW_KIT_OUTFIT_OF = { blazer: 'blazer', jacket: 'blazer', suit: 'blazer', hoodie: 'hoodie', tshirt: 'tshirt', 't-shirt': 'tshirt', tee: 'tshirt', robe: 'robe', kaftan: 'robe', caftan: 'robe', dress: 'dress', gown: 'dress' };

/* Footwear other than the sneaker, in foot space (ankle → toe along +x):
   a leather boot and a slipper with a curled toe, in $leather. */
const SW_KIT_SHOES = {
  boot: [
    { d: 'M-8 -22 L6 -22 L7 -4 Q20 -3 23 3 Q24 8.5 17 8.5 L-9.5 8.5 Q-11 -6 -8 -22 Z', fill: '$leather' },
    { d: 'M-10 5.6 L22.5 5.6 Q24 6 23.5 8.5 L-9.5 8.5 Z', fill: '#020617', opacity: 0.3 },
    { d: 'M-8 -16 L6 -16', stroke: '$leatherDark', lineWidth: 1.6 }],
  slipper: [
    { d: 'M-8 -4 Q2 -8 12 -4 Q22 -2 27 -6 Q28 0 22 6 Q18 8.5 12 8.5 L-9 8.5 Q-11 2 -8 -4 Z', fill: '$leather' },
    { d: 'M-9 5.8 L20 5.8 Q16 8.5 12 8.5 L-9 8.5 Z', fill: '#020617', opacity: 0.25 }]
};

/* Headwear, in head space over the hair (hatColor): a wrapped turban with
   a jewel, a fez with a tassel, a skullcap. */
const SW_KIT_HATS = {
  turban: [
    { d: 'M-34 -12 C-38 -40 -24 -66 0 -66 C24 -66 38 -40 34 -12 C24 -19 12 -22 0 -22 C-12 -22 -24 -19 -34 -12 Z', fill: '$hat' },
    { d: 'M14 -60 C28 -52 36 -36 34 -12 C30 -15 26 -17 22 -18 C26 -32 22 -48 14 -60 Z', fill: '$hatDark', opacity: 0.55 },
    { d: 'M-32 -24 C-16 -34 16 -36 32 -24 M-30 -38 C-14 -48 14 -50 30 -38 M-22 -52 C-8 -58 10 -58 22 -52', stroke: '$hatDark', lineWidth: 2, lineCap: 'round' },
    { d: 'M2 -31 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 Z', fill: '$accent' }],
  fez: [
    { d: 'M-27 -16 L-21 -56 L21 -56 L27 -16 C14 -21 -14 -21 -27 -16 Z', fill: '$hat' },
    { d: 'M-27 -16 L-26 -23 C-14 -28 14 -28 26 -23 L27 -16 C14 -21 -14 -21 -27 -16 Z', fill: '$hatDark' },
    { d: 'M0 -56 Q16 -54 18 -38', stroke: '$ink', lineWidth: 2, lineCap: 'round' },
    { d: 'M15 -40 L21 -40 L19 -29 L16 -29 Z', fill: '$ink' }],
  cap: [
    { d: 'M-33 -15 C-35 -54 35 -54 33 -15 C20 -21 -20 -21 -33 -15 Z', fill: '$hat' },
    { d: 'M-33 -15 C-20 -21 20 -21 33 -15 L33 -11 C20 -17 -20 -17 -33 -11 Z', fill: '$hatDark' },
    { d: 'M-21 -27 h3 M-8 -31 h3 M5 -31 h3 M18 -27 h3', stroke: '$hatDark', lineWidth: 2.2, lineCap: 'round' }]
};

/* Under a fez or a cap only the hair below the rim shows: hair layers are
   cut to the region under the hat's lower edge, which past its sides
   rounds down along the skull, so nothing sticks out above or around it
   (the narrow fez also keeps the forehead clear under its arched rim). */
const SW_KIT_HAT_RIM = {
  fez: 'M-120 24 L-40 16 C-34 8 -30 -10 -27 -16 C-14 -13 14 -13 27 -16 C30 -10 34 8 40 16 L120 24 L120 160 L-120 160 Z',
  cap: 'M-120 8 L-41 6 C-39 -2 -37 -8 -33 -11 C-20 -17 20 -17 33 -11 C37 -8 39 -2 41 6 L120 8 L120 160 L-120 160 Z'
};

/* Glasses, drawn at the head's eye anchor. */
const SW_KIT_GLASSES = {
  pivot: [0, 0],
  layers: [
    { d: 'M-17.5 -5 H-5 Q-3.5 -5 -3.5 -3.5 V2.5 Q-3.5 5 -6 5 H-16 Q-18.5 5 -18.5 2.5 V-3.5 Q-18.5 -5 -17.5 -5 Z M5 -5 H17.5 Q18.5 -5 18.5 -3.5 V2.5 Q18.5 5 16 5 H6 Q3.5 5 3.5 2.5 V-3.5 Q3.5 -5 5 -5 Z', fill: 'rgba(255,255,255,0.10)', stroke: '$ink', lineWidth: 1.7 },
    { d: 'M-3.5 -1.5 Q0 -3.5 3.5 -1.5 M-18.5 -2 L-28 -4 M18.5 -2 L28 -4', stroke: '$ink', lineWidth: 1.6 }
  ]
};

const swKitCache = new Map();
/* The parts of a kit member: the body in its outfit, the chosen hair,
   beard, glasses and blush. */
function swKitParts(opts) {
  const hair = SW_KIT_HAIR[String(opts.hair || opts.hairStyle || 'bob').toLowerCase()] ? String(opts.hair || opts.hairStyle || 'bob').toLowerCase() : 'bob';
  const beard = SW_KIT_BEARDS[String(opts.beard || '').toLowerCase()] ? String(opts.beard).toLowerCase() : '';
  const blush = opts.blush !== false && !beard;
  const outfit = SW_KIT_OUTFIT_OF[String(opts.outfit || 'blazer').toLowerCase()] || 'blazer';
  const glasses = !!opts.glasses;
  const hat = SW_KIT_HATS[String(opts.hat || '').toLowerCase()] ? String(opts.hat).toLowerCase() : '';
  /* long garments default to slippers, everything else to sneakers */
  const shoesAsked = String(opts.shoes || '').toLowerCase();
  const shoes = SW_KIT_SHOES[shoesAsked] ? shoesAsked : shoesAsked === 'sneaker' ? '' : (outfit === 'robe' || outfit === 'dress') ? 'slipper' : '';
  const key = [hair, beard, blush, outfit, glasses, hat, shoes].join('|');
  if (swKitCache.has(key)) return swKitCache.get(key);
  const parts = Object.assign({}, SW_KIT_EDITORIAL);
  if (outfit !== 'blazer') {
    const O = SW_KIT_OUTFITS[outfit];
    parts.torso = Object.assign({}, SW_KIT_EDITORIAL.torso, { layers: O.torso });
    parts.upperArm = Object.assign({}, SW_KIT_EDITORIAL.upperArm, { layers: O.upperArm });
    parts.forearm = Object.assign({}, SW_KIT_EDITORIAL.forearm, { layers: O.forearm });
  }
  /* How the torso turns (swTurnedTorso): its silhouette is the first layer
     that is not the waistband; front details come round while wrap-around
     bands (belts, hems, sashes) stay full width. */
  const TORSO_TURN_FACTORS = {
    blazer: [1, 1, 1, 1, 0.25, 1, 1],
    hoodie: [0.25, 0.7, 1, 0.85, 0],
    tshirt: [0.25, 1, 1, 0],
    robe: [1, 1, 0.25, 0, 0.5, 0, 1],
    dress: [1, 0, 0.35, 0.25]
  };
  parts.torso = Object.assign({}, parts.torso, { turn: { body: parts.torso.layers.findIndex(L => L.fill !== '$pants'), factors: TORSO_TURN_FACTORS[outfit] } });
  if (glasses) parts.glasses = SW_KIT_GLASSES;
  if (hat) parts.headwear = { pivot: [0, 33], tip: [0, -33], layers: SW_KIT_HATS[hat] };
  if (shoes) parts.foot = Object.assign({}, SW_KIT_EDITORIAL.foot, { layers: SW_KIT_SHOES[shoes] });
  const head = Object.assign({}, SW_KIT_EDITORIAL.head);
  head.layers = SW_KIT_EDITORIAL.head.layers.slice(0, 4).concat(blush ? SW_KIT_BLUSH : [], SW_KIT_EDITORIAL.head.layers.slice(4), beard ? [SW_KIT_BEARDS[beard]] : []);
  /* How the head turns (swTurnedHead): the ears are its first two layers,
     near (-x) then far (+x), 29 out; the head's shape and shade move less,
     a beard stays with the mouth, and the face is everything from blush/nose on. */
  head.turn = { ears: [0, 1], shape: [2, 3], beard: beard ? head.layers.length - 1 : -1, face: 4, earX: 29 };
  parts.head = head;
  const H = SW_KIT_HAIR[hair];
  const rim = hair !== 'hijab' && SW_KIT_HAT_RIM[hat];
  const under = L => rim ? [{ clip: rim, layers: L }] : L;
  if (H.back) parts.hairBack = { pivot: [0, 33], tip: [0, -33], layers: under(H.back) };
  if (H.front) parts.hairFront = { pivot: [0, 33], tip: [0, -33], layers: under(H.front) };
  swKitCache.set(key, parts);
  return parts;
}
SWDraw.kits = { editorial: { hair: Object.keys(SW_KIT_HAIR), beard: ['none'].concat(Object.keys(SW_KIT_BEARDS)), outfit: ['blazer', 'hoodie', 'tshirt', 'robe', 'dress'], shoes: ['sneaker', 'boot', 'slipper'], hat: ['none'].concat(Object.keys(SW_KIT_HATS)), age: ['child', 'adult', 'elder'], glasses: [false, true] } };
