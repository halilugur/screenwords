//! The built-in component catalog (from the app's component docs) and the
//! param checks `add_component` / `update_component` apply before placing:
//! hex colours `#RRGGBB[AA]`, positions 0–1, and the `notFound` error that
//! lists the known ids.

use crate::json::Value;

/// Built-in component ids, grouped by category (the categories of
/// `list_components {category}`).
///
/// The `ec`-pack ids (everything after the original 68) are painted by the
/// shared component pack in `assets/player.html` and `assets/editor.html`;
/// one block, kept byte-identical in both files.
pub const CATALOG: &[(&str, &[&str])] = &[
    (
        "title",
        &[
            "lowerThird", "titleCard", "quoteBox", "statBadge", "chapterCard", "typewriter",
            "textReveal", "splitTitle", "outlineTitle", "gradientTitle", "kickerTitle",
            "stampTitle", "verticalTitle", "underlinerTitle", "popWordsTitle", "ribbonTitle",
            "echoTitle", "neonSign", "magazineTitle", "verticalStack", "typeOnTitle",
            "glitchTitle", "sliceTitle", "curveTitle", "marqueeBand", "spotlightTitle",
            "countUpTitle", "multilineTitle", "quoteTitle", "labelStack",
            "glowTitle", "shadowTitle", "badgeTitle", "tickerTitle",
            "auroraHeadline", "chromeTitle", "neonUnderlineTitle", "splitFlapTitle",
            "glassTitle", "outlineShadowTitle", "gradientSweepTitle", "kineticStackTitle",
            "ribbonBannerTitle", "typewriterBlockTitle", "spotlightRevealTitle",
            "glitchSliceTitle", "curvedArcTitle", "countdownHeadline", "boldStatementTitle",
            "minimalKickerTitle", "magazineCoverTitle", "verticalMarqueeTitle",
            "dualToneTitle", "neonFlickerTitle", "embossTitle", "scatterTitle",
            "underlineDrawTitle", "badgeRibbonTitle", "cinematicTitle",
        ],
    ),
    (
        "caption",
        &[
            "captions", "kineticWords", "subtitleBar",
            "captionBox", "captionBounce", "captionSplit", "captionGradient", "captionNeon",
            "captionHandwrite", "captionTicker", "captionTimed", "captionArrow", "captionBracket",
            "captionPill", "wordByWord", "highlightSweep", "bubbleCaption", "underlineWords",
            "karaokeCaption",
            "captionGlowBar", "captionBoxedQuote", "captionSplitColor", "captionWave",
            "captionRise", "captionDrop", "captionTypeOn", "captionHighlightWord",
            "captionUnderline", "captionNeonFrame", "captionPillStack", "captionShadowText",
            "captionArrowTag", "captionBracketLine", "captionProgressDots", "captionTimer",
            "captionSpeakerTag", "captionTwoLine", "captionCenterBar", "captionEdgeFade",
            "captionKaraokeBar", "captionWordPop", "captionBoxOutline",
            "captionGradientText", "captionMinimal",
        ],
    ),
    (
        "graphic",
        &[
            "numberCounter", "calloutBox", "arrowPointer", "flowConnector", "linkNodes", "clickHighlight", "highlightMarker",
            "iconPop", "brandLogo", "progressBar", "spotlight",
            "circleShape", "imageOverlay", "shapeBadge", "dividerLine", "gaugeMeter", "badgePill",
            "neonPulse", "dataBars", "waveform", "countdownRing", "terminalPanel", "progressRing",
            "cornerFrame", "marqueeTicker",
            "ringSpinner", "concentricRings", "triangleBurst", "hexGrid", "diamondShape", "starburst",
            "dottedLine", "bezierArc", "spiralShape", "waveRibbon", "capsuleBar", "blobShape",
            "pieChart", "donutChart", "lineChart", "areaChart", "radarChart", "heatmapGrid",
            "scatterPlot", "stackedBars", "funnelChart", "ganttBars", "gaugeArc", "segmentedProgress",
            "sparkline", "bubbleChart", "scoreMeter", "comparisonBars",
            "phoneMockup", "browserWindow", "chatBubbleLeft", "chatBubbleRight", "notificationToast",
            "cursorClick", "keyboardKey", "searchField", "toggleSwitch", "checkboxTick",
            "sliderControl", "avatarStack", "ratingStars", "tooltipBox",
            "bounceBall", "pendulumSwing", "orbitDots", "rippleWaves", "pulseGrid", "equalizerBars",
            "squareOutline", "roundedSquare", "crossShape", "plusGrid", "lineGrid",
            "arcRings", "dashedCircle", "polygonShape", "pentagonShape", "octagonShape",
            "zigzagLine", "ladderShape", "fanShape", "crescentShape",
            "waterfallChart", "histogramChart", "boxPlot", "candlestickChart", "treemapGrid",
            "sankeyFlow", "chordDiagram", "bulletChart", "dumbbellChart", "slopeChart",
            "waffleChart", "radialBarChart", "progressStack", "latencyBars",
            "mobileTabBar", "listRows", "profileCard", "pricingCard", "calendarStrip",
            "clockFace", "batteryMeter", "signalBars", "wifiIcon", "playButton",
            "badgeCheck", "bellIcon", "menuIcon", "shareIcon", "downloadBar", "stepperDots",
            "spinningCube", "waveDots", "orbitTrail", "bouncingArrows", "rotatingTriangles",
            "flowingWaveLines", "spiralDots", "heartbeatLine", "radarSweep", "sonarBlips",
            "clockHands", "gyroscope", "cometTrail", "pulseRings", "pendulumBalls", "vortexSpiral",
            "particleTrail", "rotatingGear", "springCoil", "chevronFlow",
            "hexRing", "orbitRing", "dashedSquare", "cornerBrackets", "triangleStack",
            "diamondGrid", "starburstOutline", "dotMatrixShape", "arcSweep", "spiralCoil",
            "waveBars", "blobMorph", "capsuleOutline", "crosshairShape", "polygonBurst",
            "gearShape", "rippleCircle", "chevronBadge", "frameCorners", "lineBurst",
            "semicircleFan", "roundedTriangle", "concentricSquares", "zigzagRibbon",
            "pixelCluster",
            "areaStackChart", "barRaceChart", "bulletGraph", "candleStickMini",
            "chordFlowChart", "circularProgressChart", "columnCompareChart",
            "donutSegmentChart", "dotPlotChart", "dumbbellRangeChart", "funnelStageChart",
            "gaugeNeedleChart", "heatmapCalendar", "histogramBins", "lineForecastChart",
            "pieSplitChart", "radarSpiderChart", "sankeyRibbonChart", "scatterTrendChart",
            "sparklineMini", "stackedAreaChart", "treemapTiles", "violinPlot",
            "waterfallSteps", "wafflePercent",
            "appWindow", "authCard", "bottomSheet", "chatThread", "checkoutCard",
            "commandPalette", "cookieBanner", "dashboardTile", "datePicker",
            "dropdownMenu", "emailCard", "fileBrowser", "formField", "heroBanner",
            "kanbanCard", "loginCard", "modalDialog", "navBar", "notificationStack",
            "onboardingCard", "productCard", "progressToast", "searchResults",
            "sidebarMenu", "statTile",
            "orbitSparks", "pendulumWave", "bouncingDots", "rotatingSquares", "ringPulse",
            "cometHead", "spiralTrail", "waveformPulse", "particleFountain", "gearTrain",
            "springBounce", "radarPing", "glitchBlocks", "flowingDots", "ripples",
            "spinningTriangle", "heartbeatPulse", "vortexDots", "waveGrid", "trailLines",
            "clockSweep", "orbitingBalls", "scanBeam", "elasticBar", "confettiTrail",
            "dataTable", "dataTimeline", "dataKpiGrid", "dataScoreboard",
            "dataLeaderboard", "dataSchedule", "dataMatrix", "dataLegend",
            "dataSparkGrid", "dataRatioBar", "dataHeatRow", "dataCalendarHeat",
            "dataProgressList", "dataComparisonTable", "dataMetricCards",
            "dataGaugeCluster", "dataTrafficLights", "dataStepTimeline",
            "dataLiveTicker", "dataPollBars", "dataRankingList", "dataDonutGrid",
            "dataWaterfallList", "dataNetworkMap", "dataSummaryPanel",
        ],
    ),
    (
        "background",
        &[
            "ambientBackground", "gradientBackground", "meshBackground", "gridBackground", "particlesBackground",
            "gridWarp", "starfieldWarp", "bokehDrift",
            "auroraBackground", "grainBackground", "radialGlowBackground", "checkerboardBackground",
            "halftoneBackground", "topographicBackground", "silkBackground", "horizonBackground",
            "cityLightsBackground", "underwaterBackground", "lavaLampBackground", "nebulaBackground",
            "plaidBackground", "circuitBoardBackground", "paperTextureBackground", "marbleBackground",
            "foamBackground", "hexTunnelBackground", "vortexBackground", "confettiWallBackground",
            "prismBackground", "dotMatrixBackground",
            "auroraVeilBackground", "blueprintGridBackground", "bokehNightBackground",
            "canyonDuskBackground", "circuitPulseBackground", "cloudDriftBackground",
            "deepSpaceBackground", "desertDunesBackground", "fogMountainBackground",
            "forestMistBackground", "galaxySpiralBackground", "glassRefractionBackground",
            "halftoneSunBackground", "lavaFlowBackground", "lightRaysBackground",
            "neonCityBackground", "oceanWavesBackground", "paperGrainBackground",
            "prismLightBackground", "rainGlassBackground", "sandRippleBackground",
            "starfieldSlowBackground", "topoLinesBackground", "underwaterGlowBackground",
            "vaporwaveBackground",
        ],
    ),
    (
        "transform",
        &[
            "punchIn", "splitScreen", "pictureInPicture", "textBehindSubject", "cameraPan",
            "cameraShake", "dutchAngle", "zoomEase", "handheldSway", "orbitCamera", "tiltShift",
            "cameraBreathe", "cameraDrift", "cameraFloat", "cameraKick",
            "cameraOrbitTilt", "cameraPanLeft", "cameraPanRight", "cameraPushIn",
            "cameraRoll", "cameraShakeSoft", "cameraSway", "cameraTilt",
            "cameraWobble", "cameraZoomOut", "dutchSway", "focusPull",
            "parallaxPan", "perspectiveTilt", "shakeHandheld", "tiltOrbit",
            "zoomBreath", "zoomInSlow", "zoomOutSlow", "rotateStage",
            "stabilizeFloat",
        ],
    ),
    (
        "effect",
        &[
            "maskBlur", "vignetteDim", "glowPulse", "confettiBurst", "spotlightFollow", "scanLines",
            "filmGrain", "chromaticAberration", "lightLeak", "vignettePulse", "bloomHalo",
            "rainEffect", "snowEffect", "dustMotes", "fogLayer", "bokehBurst", "lensFlare",
            "prismSplit", "neonEdge", "scanSweep", "bloomRays", "retroTv", "shadowVignette",
            "colorWash", "duotoneStripes", "glitchBars", "focusRings", "speedLines",
            "anamorphicFlare", "bloomBurst", "chromaticEdge", "colorSplit",
            "digitalNoise", "duotoneWash", "filmBurn", "glitchScan", "grainyVignette",
            "haloGlow", "lensDistort", "lightSweep", "neonGlow", "pixelGlitch",
            "prismFringe", "scanlineOverlay", "shadowPulse", "softFocus", "sparkleDust",
            "strobeFlash", "thermalMap", "vignetteBreath", "waveDistort", "xrayEdge",
            "zoomBlurBurst",
        ],
    ),
    (
        "transition",
        &[
            "transitionCrossfade", "transitionDipToColor", "transitionSlide", "transitionWipe",
            "transitionZoomBlur", "transitionWhipPan", "transitionGlitch",
            "transitionPush", "transitionIris", "transitionBarnDoors", "transitionPixelate",
            "transitionFold", "transitionFlip", "transitionSpin", "transitionMosaic",
            "transitionClockWipe", "transitionDiagonalWipe", "transitionSplitWipe",
            "transitionZoomIn", "transitionZoomOut", "transitionShutter",
            "transitionWaterRipple", "transitionLumaFade",
            "transitionCircleReveal", "transitionSwipeUp", "transitionBlinds", "transitionBlurWipe",
            "transitionBandSwipe", "transitionCircleWipe", "transitionDiagonalSplit",
            "transitionFadeThrough", "transitionGridReveal", "transitionHexWipe",
            "transitionInkSpread", "transitionLineWipe", "transitionMosaicFlip",
            "transitionPageTurn", "transitionPixelDissolve", "transitionRadialWipe",
            "transitionRippleWipe", "transitionShapeWipe", "transitionSlideStack",
            "transitionSmear", "transitionSplitCurtain", "transitionStaggerBars",
            "transitionStarWipe", "transitionSwipeLeft", "transitionSwipeRight",
            "transitionTunnel", "transitionWaveWipe", "transitionZoomPush",
            "transitionBlindsReveal",
        ],
    ),
    (
        "lottie",
        &[
            "lottieLowerThird", "lottieSectionTitle", "lottieChapterCard", "lottieSubscribe",
            "lottieArrowFlow", "lottiePulseRings", "lottieBarReveal", "lottieConfetti",
            "lottieCheckmark", "lottieTextPop",
            "lottieSocialHandle", "lottieEmphasisBurst", "lottieCountdown", "lottieLogoReveal",
            "lottieArrowBurst", "lottieBadgePop", "lottieBellRing", "lottieBoltStrike",
            "lottieBubbleRise", "lottieCheckDraw", "lottieCircleGrow",
            "lottieConfettiRain", "lottieCursorMove", "lottieDotWave",
            "lottieEnvelopeOpen", "lottieGearSpin", "lottieHeartBeat", "lottieLineDraw",
            "lottieLoadingDots", "lottieLockOpen", "lottieMailSend", "lottiePinDrop",
            "lottieProgressRing", "lottieRocketLaunch", "lottieSearchScan",
            "lottieStarTwinkle", "lottieThumbsUp", "lottieToggleSwitch", "lottieWaveHand",
        ],
    ),
    // Whole scenes acted by the project's cast (settings.cast), directed from
    // a transcript authored with turns.
    ("scene", &["conversation", "story"]),
];

pub fn all_ids() -> Vec<&'static str> {
    CATALOG.iter().flat_map(|(_, ids)| ids.iter().copied()).collect()
}

pub fn exists(component_id: &str) -> bool {
    // codeOverlay_<slug>: an arbitrary drawing component whose params.code is
    // a JS function body (ctx, W, H, time, localTime, params, words) — the
    // AI defines any visual the built-in kinds do not cover.
    if component_id.starts_with("codeOverlay_") && component_id.len() > "codeOverlay_".len() + 2 {
        return true;
    }
    // Code overlays (codeOverlay_<slug>) and user templates
    // (userTemplate_<slug>) are project-local and always accepted.
    component_id.starts_with("codeOverlay_")
        || component_id.starts_with("htmlOverlay_")
        || component_id.starts_with("userTemplate_")
        || component_id.starts_with("shape_")
        || component_id.starts_with("image_")
        || component_id.starts_with("text_")
        || component_id.starts_with("bg_")
        || all_ids().contains(&component_id)
}

pub fn category_of(component_id: &str) -> Option<&'static str> {
    CATALOG
        .iter()
        .find(|(_, ids)| ids.contains(&component_id))
        .map(|(cat, _)| *cat)
}

/// How to make characters and conversations — returned by list_components so
/// an agent learns the workflow from the tool itself.
pub const HOW_TO: &str = "Characters: decide them once per project with apply_edits [{tool: set_project_settings, arguments: {cast: {host: {name: 'Host', kit: 'editorial', hair: 'bob' | 'short' | 'long' | 'curly' | 'bun' | 'bald' | 'hijab', beard?: 'full' | 'long', outfit?: 'blazer' | 'hoodie' | 'tshirt' | 'robe' | 'dress', hat?: 'turban' | 'fez' | 'cap', shoes?: 'sneaker' | 'boot' | 'slipper', age?: 'child' | 'adult' | 'elder', glasses?: true, hatColor, shoeColor, accentColor, skinColor, hairColor, jacketColor, shirtColor, pantsColor}}}}]; a member set to null leaves. Conversations (podcast, interview): 1) author_transcript {turns: [{speaker: 'host', text, gap?}], language} — the speaker is a cast name, a negative gap overlaps the previous line; 2) synthesize_speech {lang, voices: {host: 'F1', guest: 'M1'}}; 3) add_component conversation {seats: [{cast, role?}], title?, subtitle?, liveLabel?} plus kineticWords for captions. Gestures, listening, looks, lower thirds and the camera edit come from the speakers. Stories: the same cast and turns, then add_component story {scenes: [{startLine, set: 'park', cast: [{cast: 'host', enter: 'left'}], actions?: [{line, type: 'handshake', a, b}]}]} — see list_components {componentId: 'story'}. Deliver with export_html (player) and render_video (MP4). One character anywhere: a codeOverlay_<slug> whose params.code calls sw.character(ctx, {cast: 'host', x, y, scale, pose, pointAt, emotion}). list_components {componentId} gives a component's params.";

/// The params of the components whose shape an agent cannot guess.
pub fn params_doc(component_id: &str) -> Option<&'static str> {
    if component_id.starts_with("codeOverlay_") {
        return Some("Pictures: put the path import_image returned in a param ({image: 'media/shot.png'}) and draw it with sw.image(ctx, params.image, x, y, w, h, {radius, fit: 'cover' | 'contain', focus: {x, y}, zoom, shadow, stroke}) (px; false until loaded) — a path written inside the code string is not embedded on export. params.code: a JS function body run every frame as (ctx, W, H, time, localTime, params, words, sw). sw is the drawing toolkit plus the frame (both listed beside these notes, under toolkit and frame). sw.character(ctx, {cast?, kit?, x, y (px or 0..1), scale, pose: idle | present | point | wave | celebrate | think | explain | shrug | thumbsUp | hold | walk | 'auto' | [[t, pose], ...], emotion: neutral | happy | excited | thinking | surprised | focused | sad | confident, pointAt: {x, y} | component id, pointAmount, lookAt: {x, y} | component id | 'viewer' | 'speaker', headTurn, facing, view: 'front' | 'side' (profile), seated, crouch (0..1), stoop (0..1), heightScale, bag, hideArm, prop: 'mug' | 'phone' | 'tablet' | 'book', label}) returns {fingertip, head, ...}. sw.svgLayers(ctx, layers, {viewBox, box}), sw.layout, sw.follow, sw.fx.rays | glow | dust | sparkle | ink(ctx, {...}), sw.scenery(ctx, spec, {W, H, time}). Declarative alternatives: params.svgLayers + viewBox + box, params.scene (node list).");
    }
    if component_id.starts_with("htmlOverlay_") {
        return Some("A scene drawn by the browser: params.html (markup; SVG inline is fine) and params.css, laid over the canvas in a box 1080 px wide and as tall as the frame's shape gives (1920 for 9:16), under the captions. Use it where layout and type are the point — cards, lists, tables, a UI, a diagram in SVG — and CSS animation for the motion. Time is the film's: every animation is paused and set to the frame being drawn, so write ordinary @keyframes with animation-fill-mode both. An animation runs from the start of the scene; an element with data-at=\"w12\" is hidden until that word is spoken and its animations (and its children's) run from that word; data-until=\"w20\" hides it again. Custom properties for calc(): --t (seconds into the scene), --p (0..1 through it), --since on a data-at element, and the theme as --paper, --ink, --accent, --accent2, --accent-ink. The browser's default styles are removed: headings, <b>, lists, tables and buttons carry no look of their own, so style everything the scene shows. Scripts do not run and CSS transitions are off (a frame must not depend on the one before). Stays above every canvas component; zIndex orders HTML scenes among themselves. Put imported pictures in the markup as <img src=\"media/shot.png\"> — the path is embedded on export. For particles, physics or per-frame drawing use a codeOverlay_<slug> instead.");
    }
    match component_id {
        "conversation" => Some("A podcast / interview studio acted by the project's cast and directed from a transcript authored with turns. params: seats [{cast (a settings.cast name, also the speaker id), role?, color? (#hex), name?}] (1-6), title?, subtitle?, liveLabel? (e.g. 'LIVE'), camera?: 'auto' (close-ups on long lines, wide on reactions) | 'wide', lowerThirds? (default true: name and role the first time a seat speaks), intro? (default true: the title band slides in). Seats lay out for portrait and landscape. Pair with kineticWords {speakerColors?: {cast: '#hex'}} for captions."),
        "story" => Some("A story acted by the project's cast on illustrated sets, directed from a transcript authored with turns (a speaker with no character in a scene is a narrator). params: scenes [{start (s) | startLine (index of a spoken line) | startWord (word id) — the first scene starts at 0; set: room | office | street | park | cafe | studio, or a place described from parts {theme: 'sand' | 'verdant' | 'stone' | 'modern', inside?: true, floor? (0..1), sun? / moon? / clouds? / hills? / path?: false, frame?: true (ornamental border), colors?, pieces: [{part, x (0..1 centre), w?, h? (0..1 of the short side), layer?: 'far' | 'mid' | 'front', color?}]} — outdoor parts wall, gate, tower, dome, minaret, house, stall, tree, cypress, palm, flowers, well, banner; indoor parts arch, column, divan, rug, lamp, shelf, table, curtain; furnishings with color / color2 and shapes: table (legs 1..8, shape rect | round, legStyle straight | turned | curved, cloth), chair (back true | false | 'high', legs, facing), vase (shape classic | slim | fat | amphora | jug | bottle | cylinder, pattern band | stripes | dots | zigzag | none, flowers, flowerColors, flowerShape daisy | tulip | round), plant (kind leafy | cactus | tree | flowering, colors), bowl (fruit, fruitColors), lantern, candle (count), chest (shape flat | round), books (count, colors), teapot, cup (shape tulip | mug | cup); a piece stands on another with on: 'table' (part name or piece index) or moves with y (negative up); an object library placed the same way (w / h stretch it, color / color2, flip; wall things hang from top) — kitchen and food: cauldron, pan, kettle, samovar, coffeepot, jar, basket, bread, ringbread, cheese, watermelon, grapes, pomegranate, apple, pear, lemon, orange, fishplate, plate, tray, bottle, honeypot, sack, pumpkin, cake, mortar; furniture: bed, cradle, wardrobe, cupboard, desk, lowtable, cushion, bench, armchair, sofa, throne, screen, mirror, coatstand, grandfatherclock, wallclock, picture, lectern, shelfwall; lights and decoration: candlestick, oillamp, chandelier, hanginglantern, kilim, globe, hourglass, birdcage, parasol, window, door, fireplace, stove, brazier, bust, trophy, crown, coins, key, vaseflowers; tools and crafts: anvil, hammer, chopblock, shovel, rake, pitchfork, broom, bucket, barrel, crate, ladder, wheelbarrow, spinningwheel, scales, rope, saw, toolbox, wateringcan, loom; learning and writing: scroll, hangingscroll, inkwell, openbook, telescope, map, abacus, chalkboard, easel, astrolabe; music: drum, oud, framedrum, harp, trumpet, bell, gramophone, piano; outdoors: fountain, signpost, lamppost, fence, haystack, cart, wheel, rock, bush, stump, logpile, mailbox, birdhouse, scarecrow, tent, campfire, rowboat, anchor, sunflower, beehive, doghouse, wellhouse; toys: ball, kite, top, doll, rockinghorse, blocks; modern things: laptop, tv, radio, monitor, desklamp, fridge, washingmachine, bicycle, suitcase, trashcan, floorlamp, phone, clock, guitar, umbrellastand; night?; colors?; view?: 'front' (default) | 'side' (everyone in profile) | 'auto' (profile while walking or acting together, front otherwise) — also per cast member and on the story params; cast: [{cast, x? (0..1), enter?: 'left' | 'right', exit?: 'left' | 'right', seated? (at a café table in the cafe set, or with table: true), prop?: 'mug' | 'phone' | 'tablet' | 'book', facing?, scale?}]; moves?: [{line | at, cast, x}]; actions?: [{line | at, offset? (s after it), type: 'handshake' | 'give' | 'hug' (shoulder to shoulder from the front, face to face in profile) with a and b, or 'drop' (a's thing falls from the bag and stays on the floor) | 'pickup' (a walks over, crouches and takes it) with a and prop}]; items?: [{prop, x}] (things already on the floor); cast entries also take bag: true; title? (a card as the scene opens); camera?: 'auto' | 'wide'; bubbles?: true (speech bubbles with the speaker's name; or bubbles: true on the story for every scene); crowd?: {count, walkers (0..1 of them walking through), outfits?, hats?, colors?, scale?, seed?, view?} (extras without lines); effects?: [{type: 'rays' | 'glow' | 'dust' | 'sparkle' | 'ink', start | line | word, offset?, duration? | end?, x, y (0..1), r? / size? / length? / w? / h? (0..1 of the short side), angle?, spread?, count?, color?, grow? (s, ink), layer?: 'back'}]}]. Characters walk in and out, face whoever they talk to, act their own lines, look at the speaker; the camera eases toward the speaker; scenes dip through black. Pair with kineticWords for captions."),
        _ => None,
    }
}

/// What every renderer reads from params, generated from the renderers
/// themselves by tools/build-param-docs.mjs (never edited by hand).
const PARAMS_JSON: &str = include_str!("assets/component-params.json");

fn params_table() -> &'static Value {
    static TABLE: std::sync::OnceLock<Value> = std::sync::OnceLock::new();
    TABLE.get_or_init(|| Value::parse(PARAMS_JSON).unwrap_or_else(|_| Value::obj()))
}

/// The drawing toolkit a code overlay receives as `sw`: every function with
/// its parameters and the comment above it, generated with the params table.
const TOOLKIT_JSON: &str = include_str!("assets/toolkit-api.json");

fn toolkit_table() -> &'static Value {
    static TABLE: std::sync::OnceLock<Value> = std::sync::OnceLock::new();
    TABLE.get_or_init(|| Value::parse(TOOLKIT_JSON).unwrap_or_else(|_| Value::obj()))
}

/// What `sw` adds for the frame being drawn, on top of the toolkit's functions.
pub const FRAME_DOC: &str = "sw also carries the frame: W, H (the 1080-wide drawing space), time (seconds on the timeline), localTime (since this component started), dur (its length), prog (0..1 through it), enter (eased 0..1 over its first moments), words [{id, text, start, end, speaker?}], wordStart(id) (when a word is spoken, seconds; null if cut), since(from, d) (0..1 over d seconds after a moment — since(wordStart('w12'), 0.4) moves something in on that word), theme {paper, ink, accent, accent2, accentInk}, safe (the safe area box), boxes and boxOf(id) (where the other visible components are), cast, speakerAt(t), and character / svgLayers / drawScene with the stage already filled in.";

/// Params the shared chain applies to every component, whatever its id.
pub const SHARED_PARAMS: &[&str] = &["position", "animate", "zIndex", "bleed"];
/// Params that turn any component into a drawing of its own (see HOW_TO).
const DRAWING_PARAMS: &[&str] = &["code", "scene", "svg", "svgLayers", "box", "viewBox", "preserveAspectRatio"];

pub const ANIMATE_IN: &[&str] = &["fade", "rise", "drop", "pop", "zoom", "slideLeft", "slideRight"];
pub const ANIMATE_OUT: &[&str] = &["fade", "sink", "rise", "shrink", "slideOut"];

const SHARED_DOC: &str = "Every component also takes: position {x, y} (0-1 of the frame, the component's centre), animate {in: fade | rise | drop | pop | zoom | slideLeft | slideRight, out: fade | sink | rise | shrink | slideOut, duration (s, default 0.4)} (no animate = it appears and leaves at once), bleed: true when it is meant to run to or past the frame's edge (a strip scrolling across, something flying in), so preview_frames does not report that, and on the edit itself zIndex (higher paints on top) and keyframes [{time (s on the timeline), x, y, scale, opacity}] for motion. Colours are #RRGGBB or #RRGGBBAA; sizes are pixels in a 1080-wide drawing space.";

/// What a built-in component draws, in a line, where the catalog docs say.
pub fn draws(component_id: &str) -> Option<&'static str> {
    params_table().get(component_id)?.get("draws")?.as_str()
}

/// How to design a film rather than fill a template — returned by
/// list_components, so the workflow reaches an agent with the catalog.
pub const DESIGN_HOW_TO: &str = "Design the film scene by scene; do not line up stock components over one background. 1) Plan: split the transcript into scenes (a few words to a sentence each) and give each its own layout, focal element and motion; decide the theme once (set_theme) and reuse two or three colours and one type scale. 2) Build each scene: components for the standard parts (list_components {componentId} lists every param its renderer reads, with defaults); for anything else draw it yourself: add_component codeOverlay_<slug> with params.code, a JS function body run every frame as (ctx, W, H, time, localTime, params, words, sw) in a 1080-wide space — sw has easing (easeOut, easeInOut, backOut, spring), text, svgLayers, drawScene, character, image and the frame's safe area and other components' boxes; see list_components {componentId: 'codeOverlay_x'}. Where layout and type are the point (cards, lists, a UI, an SVG diagram) write it as HTML and CSS instead: htmlOverlay_<slug> with params.html and params.css, its CSS animations set to the film's time and its elements gated on words with data-at; see list_components {componentId: 'htmlOverlay_x'}. Put content (copy, colours, numbers, image paths) in params and read it from params, so update_component can change it. 3) Move: give every placed element animate {in, out}; stagger starts on the words that introduce them ({wordId}); put a transition* component across each scene change and a camera component (punchIn, cameraPushIn, zoomEase, cameraPan) inside a scene that would otherwise sit still; keyframes [{time, x, y, scale, opacity}] move one element. 4) Show the real thing: import_image {page: url} screenshots a web page and {file} / {url} bring a picture in; show it with imageOverlay {src} or sw.image, and pan across a screenshot with focus and zoom. 5) Sound: apply_edits add_music {mood: calm | wonder | drive} lays generated music under the whole film, ducked wherever someone speaks; add_sound {kind: whoosh | impact | pop | rise | tick | shimmer, start: {wordId}} puts an effect on the word where something arrives, hits or is revealed — a few, on the moments that matter. gainDB trims either. 6) Look: preview_frames returns one sheet of the film's moments plus problems (off the frame, painted nothing, threw) and overlaps, all measured from the pixels. Open the sheet, fix what is wrong or dull with update_component {instanceId, params} (apply_edits returns the ids it created), and look again. Render with render_video only when the sheet looks designed. Warnings on an edit name any param the component does not read: such a param changes nothing on screen.";

/// The keys a built-in component's renderer reads (None for project-local
/// ids such as codeOverlay_<slug>, whose params are their own).
pub fn param_keys(component_id: &str) -> Option<Vec<&'static str>> {
    let keys = params_table().get(component_id)?.get("keys")?.as_array()?;
    Some(keys.iter().filter_map(Value::as_str).collect())
}

/// `list_components {componentId}`: what the component draws, every param
/// its renderer reads with the default where the code has one, the keys of
/// its array params, the shared params, and the notes written for it.
pub fn describe(component_id: &str) -> Value {
    let mut r = Value::obj();
    r.set("componentId", Value::str(component_id));
    r.set("category", Value::str(category_of(component_id).unwrap_or("code")));
    let entry = params_table().get(component_id);
    if let Some(draws) = entry.and_then(|e| e.get("draws")).and_then(Value::as_str) {
        r.set("draws", Value::str(draws));
    }
    if let Some(keys) = entry.and_then(|e| e.get("keys")).and_then(Value::as_array) {
        let defaults = entry.and_then(|e| e.get("defaults"));
        let mut params = Value::obj();
        for key in keys.iter().filter_map(Value::as_str) {
            let mut one = Value::obj();
            one.set("type", Value::str(param_type(key)));
            if let Some(d) = defaults.and_then(|d| d.get(key)) {
                one.set("default", d.clone());
            }
            params.set(key, one);
        }
        r.set("params", params);
        if let Some(items) = entry.and_then(|e| e.get("items")) {
            r.set("arrayEntryKeys", items.clone());
        }
        if keys.is_empty() {
            r.set("note", Value::str("this component reads no params of its own; only the shared ones apply"));
        }
    }
    if let Some(notes) = params_doc(component_id) {
        r.set("notes", Value::str(notes));
    }
    if component_id.starts_with("codeOverlay_") {
        r.set("frame", Value::str(FRAME_DOC));
        r.set("toolkit", toolkit_table().clone());
    }
    r.set("shared", Value::str(SHARED_DOC));
    r
}

/// What kind of value a param name holds, from the naming the renderers share.
fn param_type(key: &str) -> &'static str {
    let lower = key.to_lowercase();
    if lower.contains("color") || lower.contains("colour") || key == "background" {
        "hex colour"
    } else if matches!(key, "items" | "rows" | "list" | "lines" | "seats" | "scenes" | "colors" | "palette" | "steps" | "columns" | "nodes" | "links") {
        "array"
    } else if matches!(key, "text" | "title" | "subtitle" | "label" | "sublabel" | "caption" | "prefix" | "suffix" | "fontFamily" | "style" | "src" | "url" | "image" | "photo" | "chapter" | "kicker") {
        "string"
    } else if matches!(key, "from" | "to") {
        "number or {x, y}"
    } else {
        "number"
    }
}

/// Params this component's renderer never reads: a typo or a guess that would
/// otherwise change nothing on screen without a word. Empty for project-local
/// ids and for drawings (params.code / scene / svgLayers take their own).
pub fn unread_params(component_id: &str, params: &Value) -> Vec<String> {
    let (Some(keys), Some(entries)) = (param_keys(component_id), params.as_object()) else {
        return Vec::new();
    };
    if entries.iter().any(|(k, _)| DRAWING_PARAMS.contains(&k.as_str())) {
        return Vec::new();
    }
    entries
        .iter()
        .map(|(k, _)| k.as_str())
        .filter(|k| !keys.contains(k) && !SHARED_PARAMS.contains(k))
        .map(str::to_string)
        .collect()
}

/// The warning for `unread_params`, naming what the component does read.
pub fn unread_params_warning(component_id: &str, unread: &[String]) -> String {
    let keys = param_keys(component_id).unwrap_or_default();
    let reads = if keys.is_empty() { "no params of its own".to_string() } else { keys.join(", ") };
    format!(
        "{component_id} does not read params.{} — it changes nothing on screen ({component_id} reads: {reads}; shared: position, animate)",
        unread.join(", params.")
    )
}

/// The `notFound` message add_component produces, listing the known ids.
pub fn not_found_message(component_id: &str) -> String {
    let mut ids = all_ids();
    ids.sort_unstable();
    format!(
        "no component '{component_id}' (known: {} — list_components with a componentId for its params; codeOverlay_<slug> for your code overlays)",
        ids.join(", ")
    )
}

/// `#RRGGBB[AA]` — the documented param colour format.
pub fn is_hex_color(v: &Value) -> bool {
    let Some(s) = v.as_str() else {
        return false;
    };
    let b = s.as_bytes();
    (s.len() == 7 || s.len() == 9) && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

/// The params-level checks every component shares: colour params must be hex,
/// `position` must sit inside the frame (0–1 both axes).
pub fn check_common_params(params: &Value, issues: &mut Vec<(String, String)>) {
    let Some(entries) = params.as_object() else {
        return;
    };
    for (key, value) in entries {
        let looks_like_color = key.to_lowercase().contains("color") || key.to_lowercase().contains("colour");
        if looks_like_color && !value.is_null() {
            if let Some(s) = value.as_str() {
                if !is_hex_color(value) {
                    issues.push((
                        format!("params.{key}"),
                        format!("'{s}' must be a hex color (#RRGGBB or #RRGGBBAA)"),
                    ));
                }
            }
        }
        if key == "animate" {
            for (side, known) in [("in", ANIMATE_IN), ("out", ANIMATE_OUT)] {
                if let Some(name) = value.get(side).and_then(Value::as_str) {
                    if !known.contains(&name) {
                        issues.push((
                            format!("params.animate.{side}"),
                            format!("'{name}' is not an animation (one of: {})", known.join(", ")),
                        ));
                    }
                }
            }
        }
        if key == "position" {
            if let Some(pos) = value.as_object() {
                for axis in ["x", "y"] {
                    if let Some(v) = pos.iter().find(|(k, _)| k == axis).map(|(_, v)| v) {
                        if let Some(n) = v.as_f64() {
                            if !(0.0..=1.0).contains(&n) {
                                issues.push((
                                    "params.position".into(),
                                    format!("{axis} must be 0–1 of the frame (got {n})"),
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_contains_the_documented_builtins() {
        for id in ["lowerThird", "captions", "kineticWords", "numberCounter", "punchIn",
                   "lottieSubscribe", "transitionCrossfade", "maskBlur", "spotlight"] {
            assert!(exists(id), "{id}");
        }
        assert!(exists("codeOverlay_anything"));
        assert!(exists("htmlOverlay_anything"));
        let html = describe("htmlOverlay_intro");
        let notes = html.get("notes").and_then(Value::as_str).unwrap();
        for needle in ["params.html", "params.css", "data-at", "--since", "transitions are off"] {
            assert!(notes.contains(needle), "the HTML scene notes miss {needle}");
        }
        assert!(html.get("toolkit").is_none(), "an HTML scene has no drawing toolkit");
        assert!(unread_params("htmlOverlay_intro", &Value::parse(r#"{"html": "<b>a</b>", "css": "b{}"}"#).unwrap()).is_empty());
        assert!(!exists("doesNotExist"));
        assert!(not_found_message("nope").contains("lowerThird"));
    }

    #[test]
    fn catalog_carries_the_extra_component_pack() {
        let ids = all_ids();
        assert_eq!(ids.len(), 602, "68 original + 232 pack + 300 pack 3 components + the conversation and story scenes");
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        for pair in sorted.windows(2) {
            assert_ne!(pair[0], pair[1], "duplicate component id '{}'", pair[0]);
        }
        for id in [
            "textReveal", "karaokeCaption", "pieChart", "phoneMockup", "bounceBall",
            "auroraBackground", "filmGrain", "transitionIris", "echoTitle", "captionBox",
            "candlestickChart", "clockFace", "vortexSpiral", "hexTunnelBackground", "retroTv",
            "transitionShutter", "cameraShake", "lottieCheckmark",
            "cinematicTitle", "captionKaraokeBar", "wafflePercent", "heroBanner",
            "particleFountain", "vaporwaveBackground", "anamorphicFlare",
            "transitionStarWipe", "cameraBreathe", "lottieRocketLaunch", "dataLeaderboard",
        ] {
            assert!(exists(id), "{id}");
            assert!(category_of(id).is_some(), "{id} has no category");
        }
    }

    #[test]
    fn every_catalog_id_documents_the_params_its_renderer_reads() {
        for id in all_ids() {
            assert!(param_keys(id).is_some(), "{id} has no entry in component-params.json (run node tools/build-param-docs.mjs)");
        }
        // What the renderers really read — the cases the catalog used to hide.
        let pill = param_keys("badgePill").unwrap();
        assert!(pill.contains(&"textScale") && pill.contains(&"text"), "{pill:?}");
        assert!(!pill.contains(&"size"), "badgePill never reads size");
        assert!(param_keys("kickerTitle").unwrap().contains(&"size"));
        assert!(param_keys("titleCard").unwrap().contains(&"titleColor"));
        let pie = describe("pieChart");
        assert!(pie.get("arrayEntryKeys").and_then(|a| a.get("items")).is_some(), "pieChart items are undocumented");
        assert_eq!(describe("punchIn").get("params").and_then(|p| p.get("scale")).and_then(|s| s.get("default")).and_then(Value::as_f64), Some(1.35));
        assert!(describe("badgePill").get("shared").and_then(Value::as_str).unwrap().contains("slideLeft"));
        assert!(describe("story").get("notes").is_some(), "the hand-written notes are kept");
    }

    #[test]
    fn a_code_overlay_is_told_the_whole_toolkit() {
        let d = describe("codeOverlay_intro");
        let toolkit = d.get("toolkit").expect("the toolkit is listed");
        // Functions a film reached for and, not knowing they existed, wrote
        // again by hand: colour mixing, a halo, drifting motes, a row layout.
        for (name, call) in [("mix", "mix(a, b, q)"), ("fx.glow", "fx.glow(ctx, o)"), ("fx.dust", "fx.dust(ctx, o)"), ("layout.row", "layout.row(n, area, gap)"), ("image", "image(ctx, src, x, y, w, h, o)"), ("text", "text(ctx, s, x, y, o)")] {
            let entry = toolkit.get(name).unwrap_or_else(|| panic!("{name} is not listed"));
            assert_eq!(entry.get("call").and_then(Value::as_str), Some(call));
            assert!(entry.get("doc").and_then(Value::as_str).is_some_and(|doc| doc.len() > 10), "{name} has no description");
        }
        assert!(toolkit.as_object().unwrap().len() >= 59);
        // Everything the frame object defines is in the frame note.
        let source = include_str!("assets/components/19-base.js");
        let from = source.find("const sw = Object.assign({}, SWDraw, {").expect("the frame object");
        let literal = &source[from..from + source[from..].find("\n      });").expect("its end")];
        let frame = d.get("frame").and_then(Value::as_str).unwrap();
        for key in ["prog", "enter", "dur", "localTime", "time", "W", "H", "theme", "words", "boxes", "boxOf", "safe", "wordStart", "since", "character", "cast", "speakerAt", "svgLayers", "drawScene"] {
            assert!(literal.contains(key), "the frame object no longer defines {key}");
            assert!(frame.contains(key), "the frame note does not mention {key}");
        }
        // A built-in component is not handed the toolkit it cannot use.
        assert!(describe("badgePill").get("toolkit").is_none());
    }

    #[test]
    fn the_params_file_matches_the_renderers() {
        // Regenerate from the component modules and compare; without node on
        // PATH there is nothing to run the generator with.
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let out = match std::process::Command::new("node").arg(root.join("tools/build-param-docs.mjs")).arg("--check").output() {
            Ok(out) => out,
            Err(_) => return,
        };
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    }

    #[test]
    fn unread_params_and_unknown_animations_are_reported() {
        // The mistakes a real session made: size on a pill, an invented animation.
        let params = Value::parse(r#"{"text": "1 Metni yazar", "size": 58, "width": 760, "position": {"x": 0.5, "y": 0.3}}"#).unwrap();
        assert_eq!(unread_params("badgePill", &params), vec!["size".to_string(), "width".to_string()]);
        let warning = unread_params_warning("badgePill", &["size".to_string()]);
        assert!(warning.contains("params.size") && warning.contains("textScale"), "{warning}");
        assert!(unread_params("badgePill", &Value::parse(r#"{"text": "a", "textScale": 2}"#).unwrap()).is_empty());
        // A drawing and a project-local id take whatever their code reads.
        assert!(unread_params("badgePill", &Value::parse(r#"{"code": "ctx.fillRect(0,0,1,1)", "mine": 1}"#).unwrap()).is_empty());
        assert!(unread_params("codeOverlay_intro", &Value::parse(r#"{"anything": 1}"#).unwrap()).is_empty());

        let mut issues = Vec::new();
        check_common_params(&Value::parse(r#"{"animate": {"in": "slideUp", "duration": 0.35}}"#).unwrap(), &mut issues);
        assert_eq!(issues.len(), 1, "{issues:?}");
        assert!(issues[0].0 == "params.animate.in" && issues[0].1.contains("rise"), "{issues:?}");
        issues.clear();
        check_common_params(&Value::parse(r#"{"animate": {"in": "rise", "out": "sink"}}"#).unwrap(), &mut issues);
        assert!(issues.is_empty(), "{issues:?}");
    }

    #[test]
    fn color_and_position_checks() {
        let mut v = Value::obj();
        v.set("accentColor", Value::str("#FFD60A"));
        let mut issues = Vec::new();
        check_common_params(&v, &mut issues);
        assert!(issues.is_empty());

        let mut bad = Value::obj();
        bad.set("accentColor", Value::str("yellow"));
        bad.set("position", Value::parse(r#"{"x": 1.4, "y": 0.5}"#).unwrap());
        check_common_params(&bad, &mut issues);
        assert_eq!(issues.len(), 2, "{issues:?}");
    }
}
