# Component catalog

`list_components` reports **600** built-in ids: the original 68 plus 532
procedural components (100 in the first pack, 132 in the second, 300 in the
third — twelve families of twenty-five, added 2026-10-30). Every id has a
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
