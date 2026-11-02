# Component catalog

`list_components` reports **602** built-in ids: the original 68 plus 532
procedural components (100 in the first pack, 132 in the second, 300 in the
third — twelve families of twenty-five, added 2026-10-30) and the
`conversation` and `story` scenes (below). Every id has a
renderer, so anything `add_component` accepts paints a picture in both the
exported player and the editor stage.

## One library, injected into both pages

Every component renderer lives in **`src/assets/components/`** — an ordered set
of modules (`00-registry.js` … `19-base.js`) that `render.rs` assembles with
`concat!` into one script: the scene background, the legacy 68 branches, all
three procedural packs, the scene/camera transforms, the post pass, and canvas
fallbacks for the six DOM-presented ids.
`player.html` and `editor.html` carry no component drawing code of their own;
they contain a single marker:

```html
/* @@COMPONENTS@@ */
```

`render::render_html_in` (export/preview) and the editor's `/` route
(`ui::page_html`) replace that marker with the library at serving time. The
player and editor therefore cannot drift: there is one implementation, and
`cargo test` fails if a page grows a private renderer or a registry id goes
missing.

The player and editor still present six ids through their own styled DOM
overlays (`lowerThird`, `titleCard`, `numberCounter`, `captions`,
`kineticWords`, `subtitleBar`). Both pages skip those ids in the canvas chain;
the library carries canvas fallbacks for any renderer that has no DOM layer.

## Shared params

| Param | Type | Meaning |
| --- | --- | --- |
| `position` | `{x, y}` | 0–1 of frame width/height. Defaults: titles `(0.5, 0.16)`, captions `(0.5, 0.8)`, else centre. |
| `color` | hex | Primary colour (theme accent by default). On backgrounds this is the pattern colour. |
| `accentColor` | hex | Secondary colour (theme accent2 by default). |
| `background` | hex | Base colour for background components (theme paper by default). |
| `text` / `title` | string | Main copy. Typography with no copy paints layout bars. |
| `subtitle` / `label` | string | Secondary copy, axis label, or readout. |
| `size` | number | Text size in the 1080-wide drawing space. |
| `radius` | number | Shape/ring radius. |
| `width`, `height` | number | Explicit frame for charts and bars. |
| `value` | number | 0–1 for gauges/progress; 0–5 for `ratingStars`. |
| `items` | array | `[{label, value, color}]` for charts. |
| `animate` | object | `{in, out, duration}` — applied by the shared chain to every id. |

## Title (34)

Original: `lowerThird`, `titleCard`, `quoteBox`, `statBadge`, `chapterCard`,
`typewriter`, `textReveal`, `splitTitle`, `outlineTitle`, `gradientTitle`,
`kickerTitle`, `stampTitle`, `verticalTitle`, `underlinerTitle`,
`popWordsTitle`, `ribbonTitle`, `glowTitle`, `shadowTitle`, `badgeTitle`,
`tickerTitle`.

| Id | Draws |
| --- | --- |
| `echoTitle` | Layered echo copies behind the headline |
| `neonSign` | Flickering neon tube outline |
| `magazineTitle` | Headline with issue label and rule |
| `verticalStack` | Three staggered lines, alternating alignment |
| `typeOnTitle` | Characters typed with a caret |
| `glitchTitle` | RGB-offset glitch headline |
| `sliceTitle` | Horizontal slices displaced independently |
| `curveTitle` | Characters set along a sine curve |
| `marqueeBand` | Colour band with a scrolling marquee |
| `spotlightTitle` | Dim frame with a light cone on the headline |
| `countUpTitle` | Counting number plus label |
| `multilineTitle` | Wrapped multi-line headline |
| `quoteTitle` | Quote mark with wrapped body copy |
| `labelStack` | Three labelled rows with rules |

## Caption (19)

Original: `captions`, `kineticWords`, `subtitleBar`, `captionPill`,
`wordByWord`, `highlightSweep`, `bubbleCaption`, `underlineWords`,
`karaokeCaption`.

| Id | Draws |
| --- | --- |
| `captionBox` | Bordered caption box |
| `captionBounce` | Words bounce in one by one |
| `captionSplit` | Alternating two-colour words |
| `captionGradient` | Gradient-filled caption |
| `captionNeon` | Glowing neon caption |
| `captionHandwrite` | Scribbled underline under the caption |
| `captionTicker` | Two counter-scrolling rows |
| `captionTimed` | Caption with progress dots |
| `captionArrow` | Caption under a pointer arrow |
| `captionBracket` | Bracketed caption |

## Shapes (26)

`circleShape`, `numberCounter`-adjacent primitives: `ringSpinner`,
`concentricRings`, `triangleBurst`, `hexGrid`, `diamondShape`, `starburst`,
`dottedLine`, `bezierArc`, `spiralShape`, `waveRibbon`, `capsuleBar`,
`blobShape`, plus:

| Id | Draws |
| --- | --- |
| `squareOutline` | Rotating square outline |
| `roundedSquare` | Rounded square with corner dots |
| `crossShape` | Rotating plus |
| `plusGrid` | Grid of pulsing pluses |
| `lineGrid` | Two-axis line grid with drift |
| `arcRings` | Four offset arcs |
| `dashedCircle` | Rotating dashed circle |
| `polygonShape` | N-gon (`sides`, default 6) |
| `pentagonShape` | Pentagon |
| `octagonShape` | Octagon |
| `zigzagLine` | Drawing zigzag |
| `ladderShape` | Rails and rungs |
| `fanShape` | Fan of rays from a pivot |
| `crescentShape` | Rotating crescent |

## Graphic primitives (25)

The original general-purpose graphic ids, all still available:

| Id | Draws |
| --- | --- |
| `numberCounter` | Counting number with label |
| `calloutBox` | Labelled callout plate |
| `arrowPointer` | Pointer arrow |
| `flowConnector` | Curved connector between points |
| `linkNodes` | Connector with labelled nodes |
| `clickHighlight` | Click rings and cursor |
| `highlightMarker` | Marker stroke over a point |
| `iconPop` | Popping icon disc |
| `brandLogo` | Logo plate or initials monogram |
| `progressBar` | Linear progress |
| `spotlight` | Radial spotlight |
| `circleShape` | Pulse / sonar / orbit rings |
| `imageOverlay` | Image with frame and credit |
| `shapeBadge` | Badge plate |
| `dividerLine` | Glowing rule |
| `gaugeMeter` | Gauge dial |
| `badgePill` | Pill badge |
| `neonPulse` | Neon outline pulse |
| `dataBars` | Vertical bars |
| `waveform` | Audio waveform |
| `countdownRing` | Countdown ring |
| `terminalPanel` | Terminal window |
| `progressRing` | Circular progress |
| `cornerFrame` | Corner framing marks |
| `marqueeTicker` | Scrolling ticker |

## Charts and data (30)

Original: `pieChart`, `donutChart`, `lineChart`, `areaChart`, `radarChart`,
`heatmapGrid`, `scatterPlot`, `stackedBars`, `funnelChart`, `ganttBars`,
`gaugeArc`, `segmentedProgress`, `sparkline`, `bubbleChart`, `scoreMeter`,
`comparisonBars`.

| Id | Draws |
| --- | --- |
| `waterfallChart` | Up/down waterfall bars |
| `histogramChart` | Bell-shaped histogram |
| `boxPlot` | Three box-and-whisker plots |
| `candlestickChart` | Eight candlesticks |
| `treemapGrid` | Nested treemap tiles |
| `sankeyFlow` | Nodes joined by curved flows |
| `chordDiagram` | Chords across a ring |
| `bulletChart` | Bar with target marker |
| `dumbbellChart` | Paired dots per row |
| `slopeChart` | Two columns joined by slopes |
| `waffleChart` | Ten-column waffle (`value`) |
| `radialBarChart` | Three concentric arcs |
| `progressStack` | Three-segment stacked bar |
| `latencyBars` | Horizontal bars with threshold |

## UI mockups and icons (30)

Original: `phoneMockup`, `browserWindow`, `chatBubbleLeft`, `chatBubbleRight`,
`notificationToast`, `cursorClick`, `keyboardKey`, `searchField`,
`toggleSwitch`, `checkboxTick`, `sliderControl`, `avatarStack`, `ratingStars`,
`tooltipBox`.

| Id | Draws |
| --- | --- |
| `mobileTabBar` | Four-tab bottom bar |
| `listRows` | Four list rows with avatars |
| `profileCard` | Avatar card with follow button |
| `pricingCard` | Price card with features |
| `calendarStrip` | Seven-day strip |
| `clockFace` | Clock with moving hands |
| `batteryMeter` | Battery with fill |
| `signalBars` | Four signal bars |
| `wifiIcon` | Wi-fi arcs |
| `playButton` | Play circle |
| `badgeCheck` | Octagonal badge with drawn tick |
| `bellIcon` | Swinging bell |
| `menuIcon` | Three menu rules |
| `shareIcon` | Share nodes |
| `downloadBar` | Download progress with arrow |
| `stepperDots` | Five-step stepper |

## Motion graphics (26)

Original: `bounceBall`, `pendulumSwing`, `orbitDots`, `rippleWaves`,
`pulseGrid`, `equalizerBars`, `particleTrail`, `rotatingGear`, `springCoil`,
`chevronFlow`.

| Id | Draws |
| --- | --- |
| `spinningCube` | Projected wireframe cube |
| `waveDots` | Dots on a travelling wave |
| `orbitTrail` | Orbiting dot trail |
| `bouncingArrows` | Arrows bouncing across |
| `rotatingTriangles` | Five orbiting triangles |
| `flowingWaveLines` | Six phase-shifted wave lines |
| `spiralDots` | Dots along a spiral |
| `heartbeatLine` | Scrolling ECG trace |
| `radarSweep` | Radar tracks and sweep |
| `sonarBlips` | Ripples and blips |
| `clockHands` | Two hands at different speeds |
| `gyroscope` | Three rotating ellipses |
| `cometTrail` | Comet with a tapering tail |
| `pulseRings` | Emitted rings |
| `pendulumBalls` | Five balls in a wave |
| `vortexSpiral` | Four rotating spiral arms |

## Photo backgrounds (`find_background`)

For a real photograph instead of a procedural clip, call the MCP tool
`find_background`:

```json
{"query": "rainy Tokyo street at night", "provider": "unsplash",
 "grade": "cool", "start": 0, "duration": 12}
```

- `provider`: `unsplash` (default) or `pexels`. The query is searched with
  `UNSPLASH_ACCESS_KEY` or `PEXELS_API_KEY` in the server's environment.
- `url`: any direct image URL; `file`: a local image path. Either works
  without an API key.
- `grade`: `dark` (default), `warm`, `cool`, `violet`, `green`, `light`,
  `none`.
- `motion`: `kenburns` (default), `zoomin`, `zoomout`, `panleft`, `panright`,
  `drift`, `parallax`, `ripple`, `pulse`.
- `atmosphere`: `sheen` (default), `rain`, `snow`, `dust`, `embers`, `bokeh`,
  `rays`, `fog`, `none` — a moving layer over the photo.
- `intensity`: 0–1.5, default 0.7.
- Motion and atmosphere are inferred from the query when omitted (rain →
  rain, snow → snow, fire → embers, city/night → bokeh, forest/light → rays,
  desert → dust; driving/road → `panleft`, ocean → `drift`, water → `ripple`,
  studio/product → `parallax`).
- The image is embedded as a data URI on a full-frame background component
  (Scenes track), cover-fitted, animated by the camera preset, graded, given
  the atmosphere layer, then the same caption frame as the procedural themes.

Licensing: the Unsplash License and the Pexels License both allow commercial
use without attribution (credit is appreciated and returned in the tool
result). Unsplash+ paid photos are not returned by the free API. Do not use
search-engine image results.

The download runs in-process over HTTPS using `rustls` + `webpki-roots`
(the two dependencies added for this feature); no external binary is used.

The renderer also accepts a photo directly on any background component:
`params.image` (a data URI or a URL) plus `params.grade`. The procedural
theme in `params.style` shows until the image decodes and whenever no image
is set.

## Background themes (32)

The scene backdrop is not a fixed gradient: pick a theme with `params.style`
on any background component (`ambientBackground`, `gradientBackground`,
`meshBackground`, ...) or on scene params. Unknown styles fall back to
`gradientWaves`; legacy names (`studio`, `stars`, `grid`, `waves`, `dots`,
`bokeh`, `contours`, `beams`, ...) alias to the nearest theme.

Each theme is an art-directed procedural clip with continuous, loopable
motion, built for Shorts-style backdrops. Light themes carry ink scrims top
and bottom so white captions stay readable.

| Theme | Clip |
| --- | --- |
| `neonDrive` | Night road, light trails toward the camera |
| `rainWindow` | Rain on a cafe window over blurred bokeh |
| `mountainRoad` | Aerial ridges and a winding road with headlights |
| `beachSunset` | Sun on the horizon, moving surf lines |
| `cloudTimelapse` | Fast soft cloud layers |
| `subwayTunnel` | Receding tunnel rings and passing lights |
| `tokyoRain` | Neon sign blocks, rain, wet reflections |
| `powderSki` | Light powder slope, carve line, spray |
| `bonfireNight` | Forest silhouette, flames, rising embers |
| `driftTrack` | Skid arcs and drifting smoke |
| `sandStrata` | Layered sand and a slicing wire |
| `soapRibbons` | Pastel soap ribbons peeling |
| `pressureWash` | Dirty wall cleaned by a sweeping jet |
| `marbleRun` | Winding double rail with a rolling marble |
| `slimeGloss` | Glossy blobs merging |
| `resinPour` | Pour stream, pool and ripples |
| `pressSquash` | Hydraulic plates squashing a block |
| `tattooLine` | Fine line work drawing itself |
| `vinylSpin` | Record grooves, rotating highlight |
| `liquidMetal` | Chrome orbs with specular arcs |
| `geoLoop` | Rotating abstract wireframe |
| `keyboardRGB` | Key grid with an RGB colour wave |
| `candleScroll` | Candlesticks scrolling over a grid |
| `watchGears` | Macro gears rotating |
| `hudScan` | Perspective HUD grid with a scan band |
| `archWire` | Architectural wireframe drawing itself |
| `penStroke` | Calligraphic ink stroke on paper |
| `liquidParticles` | Glowing particles in dark liquid |
| `officeLight` | Window light shifting from day to night |
| `gradientWaves` | Smooth layered colour waves (default) |
| `cityBokeh` | Blurred city bokeh drifting |
| `codeStream` | Falling green code streams |

## Backgrounds (30)

Original: `ambientBackground`, `gradientBackground`, `meshBackground`,
`gridBackground`, `particlesBackground`, `gridWarp`, `starfieldWarp`,
`bokehDrift`, `auroraBackground`, `grainBackground`, `radialGlowBackground`,
`checkerboardBackground`, `halftoneBackground`, `topographicBackground`,
`silkBackground`, `horizonBackground`, `prismBackground`,
`dotMatrixBackground`.

| Id | Draws |
| --- | --- |
| `cityLightsBackground` | Skyline with lit windows |
| `underwaterBackground` | Deep-water gradient, caustics, bubbles |
| `lavaLampBackground` | Rising glowing blobs |
| `nebulaBackground` | Layered nebula clouds |
| `plaidBackground` | Crosshatched plaid |
| `circuitBoardBackground` | Traces and pads |
| `paperTextureBackground` | Fibres, specks, creases |
| `marbleBackground` | Veined marble |
| `foamBackground` | Rising foam bubbles |
| `hexTunnelBackground` | Nested hex tunnel |
| `vortexBackground` | Spiral vortex |
| `confettiWallBackground` | Falling confetti wall |

## Effects (28)

Original: `maskBlur`, `vignetteDim`, `glowPulse`, `confettiBurst`,
`spotlightFollow`, `scanLines`, `filmGrain`, `chromaticAberration`,
`lightLeak`, `vignettePulse`, `bloomHalo`, `colorWash`, `duotoneStripes`,
`glitchBars`, `focusRings`, `speedLines`.

| Id | Draws |
| --- | --- |
| `rainEffect` | Slanted rain |
| `snowEffect` | Drifting snow |
| `dustMotes` | Floating dust |
| `fogLayer` | Horizontal fog banks |
| `bokehBurst` | Soft bokeh circles |
| `lensFlare` | Flare streak and ghosts |
| `prismSplit` | Red/cyan edge split |
| `neonEdge` | Glowing frame |
| `scanSweep` | Moving scan line |
| `bloomRays` | Radial light rays |
| `retroTv` | Scanlines, noise, vignette |
| `shadowVignette` | Heavy corner falloff |

## Transitions (27)

Original: `transitionCrossfade`, `transitionDipToColor`, `transitionSlide`,
`transitionWipe`, `transitionZoomBlur`, `transitionWhipPan`,
`transitionGlitch`, `transitionPush`, `transitionIris`,
`transitionBarnDoors`, `transitionPixelate`, `transitionCircleReveal`,
`transitionSwipeUp`, `transitionBlinds`, `transitionBlurWipe`.

Transitions peak at the midpoint of their window and clear at the edges.

| Id | Draws |
| --- | --- |
| `transitionFold` | Panels collapsing in folds |
| `transitionFlip` | Top/bottom halves closing |
| `transitionSpin` | Rotating plate closing |
| `transitionMosaic` | Tiles filling by distance |
| `transitionClockWipe` | Clock-hand sector wipe |
| `transitionDiagonalWipe` | Diagonal panel wipe |
| `transitionSplitWipe` | Two panels closing from the sides |
| `transitionZoomIn` | Expanding cover rectangle |
| `transitionZoomOut` | Closing aperture with ring |
| `transitionShutter` | Six shutter blades |
| `transitionWaterRipple` | Expanding ripple rings |
| `transitionLumaFade` | Stepped brightness bands |

## Transforms (11)

`punchIn`, `splitScreen`, `pictureInPicture`, `textBehindSubject`,
`cameraPan`, and the camera-space ids applied by `sharedSceneTransforms`:

| Id | Moves the stage |
| --- | --- |
| `cameraShake` | Fast jitter (`strength`) |
| `dutchAngle` | Rotates (`angle`, degrees) |
| `zoomEase` | Eases to `scale` (`reverse` for out) |
| `handheldSway` | Slow sine drift (`strength`) |
| `orbitCamera` | Circular drift (`radius`) |
| `tiltShift` | Squash/stretch (`amount`) |

## Lottie-style (14)

`lottieLowerThird`, `lottieSectionTitle`, `lottieChapterCard`,
`lottieSubscribe`, `lottieSocialHandle`, `lottieEmphasisBurst`,
`lottieCountdown`, `lottieLogoReveal`, plus:

| Id | Draws |
| --- | --- |
| `lottieArrowFlow` | Arrows flowing along a curve |
| `lottiePulseRings` | Pulsing ring stack |
| `lottieBarReveal` | Staggered bar reveal |
| `lottieConfetti` | Falling confetti |
| `lottieCheckmark` | Circle with a drawn tick |
| `lottieTextPop` | Word popping in |

## Code overlays and the drawing toolkit (`sw`)

A `codeOverlay_<slug>` component draws whatever its params describe. Three
declarative params need no code, and `params.code` is a JS function body
called every frame as `(ctx, W, H, time, localTime, params, words, sw)`:

- `params.svgLayers` — SVG path layers fitted into `params.box` (px or 0..1
  of the stage) through `params.viewBox` / `params.preserveAspectRatio`.
  Each layer takes `d`, `fill`, `stroke`, `lineWidth`, `gradient`,
  `strokeGradient`, `shadow`, `dash`, `opacity`, `blend`, `fillRule`,
  `nonScalingStroke`, `transform {x, y, rotate, scale, scaleX, scaleY,
  origin}`, `trimStart` / `trimEnd` (draw-on), `morphTo` + `morph`, and nested
  `layers`.
- `params.scene` — a node list for `sw.drawScene` (shapes, text, `character`,
  `hand`, `svglayers` groups).
- `params.svg` — one path drawn on with `trimProgress`.

Any numeric value above, and in the character options below, may be
keyframed as `[[t, v], ...]` on the component's local time (eased in-out).

`sw` is `SWDraw` plus the frame: `W`, `H`, `time`, `localTime`, `prog`,
`enter`, `words`, `theme`, `safe` (the safe area), `boxes` (live boxes of the
other visible components) and `boxOf(id)` (a component id or componentId →
`{x, y, width, height, cx, cy, w, h}`). Its `character`, `svgLayers` and
`drawScene` fill in the stage size, time, words and boxes themselves.

### `sw.character(ctx, opts)`

A vector presenter: anatomical limbs, a 3/4 head, articulated hands, visemes
from the spoken words and spring follow-through on hair and coat. It returns
`{facing, fingertip, nearHand, head, aim, box, pose}` in stage pixels, so
callouts can attach to it.

| option | values |
|---|---|
| `x`, `y`, `scale` | px or 0..1 of the stage (feet at `y + 170·scale`) |
| `pose` | `present` `idle` `point` `wave` `celebrate` `think` `explain` `shrug` `thumbsUp` `hold` `walk`, or `[[t, pose], ...]` |
| `poseBlend` | crossfade seconds from each pose / emotion stop (0.45) |
| `emotion` | `neutral` `happy` `excited` `thinking` `surprised` `focused` `sad` `confident`, or `[[t, emotion], ...]` |
| `pointAt` | `{x, y}`, a box, or a component id; the fingertip docks `pointGap` px (26) outside the box |
| `pointAmount` | 0..1 blend into the pointing arm (keyframe it to raise the arm) |
| `lookAt` | `{x, y}`, a component id, or `'viewer'` |
| `headTurn`, `headTilt`, `gaze {x, y}` | −1..1 |
| `walkAmount`, `cadence`, `vx` | walk cycle mix, steps/s, horizontal speed for drag |
| `facing` | 1 / −1; without it the figure faces its `pointAt`, else the way a keyframed `x` travels |
| `hairStyle` | `modern` `short` `buzz` `curly` `bun` `wavy` `long` `bald` |
| `outfit` | `jacket` `suit` `tshirt` `hoodie` |
| `handPose`, `leftHandPose`, `rightHandPose` | `open` `wave` `relaxed` `point` `fist` `thumbsUp` `hold` |
| `leftHand`, `rightHand` | `{x, y}` wrist targets (IK) |
| colours | `skinColor` `hairColor` `eyeColor` `shirtColor` `jacketColor` `pantsColor` `shoeColor` `accentColor` |
| other | `glasses`, `bodyWidth`, `bodyTurn`, `label`, `mouth` (0..1 fixed), `speaking: false`, `gestures: false` (no word-stress beats), `showPointerRay` |
| `style` | `flat` (editorial illustration), `cartoon` (big head, big eyes), `geo` (minimal shapes); without it the detailed anatomical rig |
| `cast` | the name of a project cast member (below); the call's own options win over the member's |
| `parts`, `rig` | illustrated SVG parts and the skeleton proportions they fit (below) |

### Characters in one line: kits

A character does not need drawing, and it is the default: with no `style`
`sw.character` draws the editorial kit (`style: 'detailed'` keeps the older
anatomical rig). `kit: 'editorial'` gives a finished,
anatomically checked illustration (blazer, shirt, trousers, sneakers; dot
eyes, brows, visemes, hands for every pose) that takes the member's palette:

```json
{ "name": "Elif", "kit": "editorial", "hair": "long", "skinColor": "#F2C4A2",
  "hairColor": "#7A3B1E", "jacketColor": "#EC4899", "shirtColor": "#FDF2F8" }
```

`hair` is `bob`, `short`, `long`, `curly`, `bun`, `hijab` (a headscarf in
the hairColor) or `bald`; `beard: 'full'` adds a beard; `glasses: true`;
`outfit` is `blazer` (jacketColor over shirtColor), `hoodie` or `tshirt`
(both in shirtColor); `blush: false` drops the cheek blush (a beard drops it
too). Any character can also sit (`seated: true`, on a chair unless
`chair: false`) and hold a `prop`: `mug`, `phone` or `tablet`.
Other colours: `skinColor`, `hairColor`, `eyeColor`, `pantsColor`,
`shoeColor`, `accentColor`. `SWDraw.kits` lists what a kit offers.
[`examples/cast/`](examples/cast/) holds four such members.

### The project's cast

Characters are decided once per project, not per scene. `set_project_settings
{ cast: { ada: {...}, kaan: {...} } }` stores them in `settings.cast` (a
member set to `null` leaves; names are 1-40 letters, digits, `_` or `-`), and
every scene draws them with `sw.character(ctx, { cast: 'ada', pose: 'point' })`
or a `{ type: 'character', cast: 'ada' }` scene node. A member is any set of
the options above: `style`, colours, `hairStyle`, `outfit`, `glasses`…

A member can also bring its own art as `parts`, so a real illustrator's
drawing becomes the character and the engine only animates it. Each part is
an SVG drawing in its own coordinates — `{ layers | d + fill, pivot: [x, y],
tip: [x, y] }` — placed so `pivot → tip` lies on its bone (`stretch: true`
scales along the bone only). Colours written as `$skin`, `$skinShade`,
`$hair`, `$hairLight`, `$shirt`, `$shirtDark`, `$jacket`, `$jacketDark`,
`$pants`, `$pantsDark`, `$shoe`, `$accent`, `$ink`, `$eye` take the member's
palette. The parts are `torso` (chest → hip), `neck`, `head` (neck → crown,
with `eyesAt`, `browsAt`, `mouthAt` anchors), `hairBack`, `hairFront`,
`upperArm`, `forearm`, `thigh`, `shin`, `foot`, `hands.{open, wave, relaxed,
point, fist, thumbsup, hold}` (wrist → index fingertip, thumb on +y),
`eyes.{open, closed, squint}` (shifted by the gaze), `brows` (lifted by the
emotion) and `mouth.{rest, smile, sad, A, E, O, U, M, F, S, L}` (the viseme
of the spoken word). Any part left out is drawn by the member's `style`.
The editorial kit in [`02d-kit.js`](src/assets/components/02d-kit.js) is a
complete set of parts to start from.

Arms are posed like a figure drawing, not solved: each pose sets the upper
arm and forearm angles (`SW_TOON_POSES` in `02c-toon.js`), the elbow only
bends forward and stays near the waist when relaxed, and a forearm reaching
toward the viewer is foreshortened. IK is used only to reach a target
(`pointAt`, the chin, `leftHand` / `rightHand`).

While words play, the mouth follows their letters and each word gives a
small head dip, brow lift and hand beat, stronger on long, ALL-CAPS or
`!`/`?` words (or `word.emphasis`).

### Conversations: podcasts and interviews

A conversation is data, and the engine directs it:

1. **Cast** — one kit member per speaker in `settings.cast`.
2. **Turns** — `author_transcript { turns: [{ speaker, text, gap? }], language }`
   tags every word with its speaker (the speaker id is the cast name). `gap`
   is the pause before a line in seconds; a negative gap jumps in over the
   end of the previous line (quick reactions, greetings and goodbyes said
   together). Without it the voice track pauses naturally: an answer follows
   a question quickly, other replies a little later.
3. **Voices** — `synthesize_speech { lang, voices: { ada: 'F1', kaan: 'M1' } }`
   speaks each line in its speaker's voice (Supertonic M1-M5 / F1-F5), trims
   the model's silences, levels every voice to one speech loudness, mixes
   overlapping lines through a soft limiter and aligns every word.
   `bed: 'ambient'` lays a quiet chord bed under it, ducked while anyone
   talks (mixed into the narration: the player plays one audio track).
4. **Scene** — one `conversation` component:
   `{ seats: [{ cast, role?, bio?, color? }], title?, subtitle?, liveLabel?,
   camera?, lowerThirds?, intro?, seated? }`.

From the speakers alone the scene then plays like an edited show: each
person acts their own lines (`pose: 'auto'`: hello and goodbye wave,
agreement is a thumbs-up, a short question looks surprised, a long line
changes gesture clause by clause, a "haha" laughs — and the others laugh
along a beat later), lip-syncs only their own words, opens the show and
says hello and goodbye to the camera and otherwise talks round the table.
While others talk they listen — nod on the speaker's stressed words, warm
up, look at whoever speaks with the odd glance at another listener. Everyone
keeps their own blink and breathing rhythm and sits at the desk. The
camera holds a close-up on every line of 2.5 s or more (the neighbours fade
out), cuts face to face between lines that meet, and plays reactions on
the wide shot (`camera: 'wide'` keeps it wide). The title band slides in and
the seats come up one by one (`intro: false` skips it); the first time a
seat speaks, a lower third with name, role and bio slides over its desk
(`lowerThirds: false`). Seats lay out for portrait (two across) and
landscape (one row up to four), up to six; the live seat is lit with a
level meter. Add `kineticWords` for captions — `speakerColors: { cast:
'#hex' }` colours each speaker's words, `speakerLabels: true` names them,
and a phrase never mixes two speakers.
[`examples/podcast/build.mjs`](examples/podcast/build.mjs) is a complete
four-speaker episode.

The same direction is available to code overlays: `sw.character(ctx, { cast,
pose: 'auto', lookAt: 'speaker', seatHeads })`, `sw.speakerAt(t)` and
`sw.conversationPlan(words)` (lines, per-speaker pose and emotion tracks,
shots).

### Stories: scenes on illustrated sets

A story is the same cast and turns as a conversation (a speaker with no
character in the scene is a narrator), staged by one `story` component:

```json
{ "scenes": [
  { "set": "park", "title": "Bir sabah",
    "cast": [{ "cast": "ada", "x": 0.3, "enter": "left" }, { "cast": "kaan", "x": 0.7, "enter": "right" }],
    "actions": [{ "line": 2, "type": "handshake", "a": "ada", "b": "kaan" }] },
  { "startLine": 3, "set": "cafe", "night": true,
    "cast": [{ "cast": "ada", "x": 0.32 }, { "cast": "kaan", "x": 0.68, "seated": true }],
    "actions": [{ "line": 4, "type": "give", "a": "ada", "b": "kaan", "prop": "phone" },
                { "at": 18.8, "type": "hug", "a": "ada", "b": "kaan" }] }
] }
```

A scene starts at `start` (seconds), `startLine` (the index of a spoken
line) or `startWord` (a word id); the first starts at 0. `set` is one of
`room`, `office`, `street`, `park`, `cafe`, `studio` (`night: true` lights
the windows and lamps, `colors` overrides the palette). Each cast entry
stands at `x` (0..1) on the set's floor at a scale that fits the set;
`enter` / `exit` (`left` | `right`) walk them in and out, `moves` walk them
across, `seated`, `prop` and `bag` (a crossbody bag) work as on the character.
`items` puts things on the floor; `drop` lets a thing fall from someone's
bag where they walk (it stays on the floor, into later scenes via `items`)
and `pickup` walks someone to it, crouches and puts it in their hand; the
camera cuts in close on both. Any time takes `offset` seconds after its
line. `actions` —
`handshake`, `give` (the `prop` changes hands) and `hug` (a side hug: shoulder to shoulder, heads together) — first bring the
two together, then play. Characters face whoever they talk to, act their
own lines and look at the speaker; the camera eases toward the speaker
(`camera: 'wide'` holds still); a `title` card opens the scene; scenes dip
through black. Sets alone are `SWDraw.set(ctx, name, { W, H, time, night,
camX, layer })` for code overlays.

### Other helpers

`sw.layout` (`safe`, `row`, `column`, `grid`, `anchorTo`, `fitInside`,
`resolve` to push overlapping boxes apart), `sw.follow` / `sw.lag` (a
deterministic spring on any signal), `sw.parsePath`, `sw.pathLength`,
`sw.pointOnPath`, `sw.morph`, `sw.fitViewBox`, `sw.anim`, `sw.ik2`,
`sw.viseme`, `sw.mouth`, `sw.hand`, `sw.anatomicalLimb`, `sw.mix`, `sw.shade`.

A code overlay that throws skips its own drawing for that frame (with one
console warning per code version); the rest of the frame still renders.
`node tools/test-draw.mjs` (run by `cargo test`) checks this toolkit,
including the anatomy rules every pose must keep (bone lengths, elbows
that never fold back, relaxed arms beside the ribcage with the elbow at the
waist, straight standing legs with the feet on the ground, seated knees over
the ankles); the character returns its skeleton as `joints` for such
checks.

## Verifying the catalog

```sh
cargo test
cargo run -- render showcase-extras --out component-showcase-extras.html
```

`showcase-extras/project.json` places one instance of every id in its own
2.4 s window (chapters 69–300; the six camera transforms also carry a line
companion so their movement is visible). The rendered page accepts `?t=` in
seconds, e.g. `component-showcase-extras.html?t=183.6` for `textReveal`, or
`?t=443.6` for the first second-pack id `echoTitle`.
