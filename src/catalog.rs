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
pub const HOW_TO: &str = "Characters: decide them once per project with apply_edits [{tool: set_project_settings, arguments: {cast: {ada: {name: 'Ada', kit: 'editorial', hair: 'bob' | 'short' | 'long' | 'curly' | 'bun' | 'bald', beard?: 'full', outfit?: 'blazer' | 'hoodie' | 'tshirt', glasses?: true, skinColor, hairColor, jacketColor, shirtColor, pantsColor}}}}]; a member set to null leaves. Conversations (podcast, interview): 1) author_transcript {turns: [{speaker: 'ada', text, gap?}], language} — the speaker is a cast name, a negative gap overlaps the previous line; 2) synthesize_speech {lang, voices: {ada: 'F1', kaan: 'M1'}}; 3) add_component conversation {seats: [{cast, role?}], title?, subtitle?, liveLabel?} plus kineticWords for captions. Gestures, listening, looks, lower thirds and the camera edit come from the speakers. Stories: the same cast and turns, then add_component story {scenes: [{startLine, set: 'park', cast: [{cast: 'ada', enter: 'left'}], actions?: [{line, type: 'handshake', a, b}]}]} — see list_components {componentId: 'story'}. Deliver with export_html (player) and render_video (MP4). One character anywhere: a codeOverlay_<slug> whose params.code calls sw.character(ctx, {cast: 'ada', x, y, scale, pose, pointAt, emotion}). list_components {componentId} gives a component's params.";

/// The params of the components whose shape an agent cannot guess.
pub fn params_doc(component_id: &str) -> Option<&'static str> {
    if component_id.starts_with("codeOverlay_") {
        return Some("params.code: a JS function body run every frame as (ctx, W, H, time, localTime, params, words, sw). sw = SWDraw plus the frame (W, H, time, localTime, words, theme, safe, boxes, boxOf(id), cast, speakerAt(t)). sw.character(ctx, {cast?, kit?, x, y (px or 0..1), scale, pose: idle | present | point | wave | celebrate | think | explain | shrug | thumbsUp | hold | walk | 'auto' | [[t, pose], ...], emotion: neutral | happy | excited | thinking | surprised | focused | sad | confident, pointAt: {x, y} | component id, pointAmount, lookAt: {x, y} | component id | 'viewer' | 'speaker', headTurn, facing, seated, prop: 'mug' | 'phone' | 'tablet' | 'book', label}) returns {fingertip, head, ...}. sw.svgLayers(ctx, layers, {viewBox, box}), sw.layout, sw.follow. Declarative alternatives: params.svgLayers + viewBox + box, params.scene (node list).");
    }
    match component_id {
        "conversation" => Some("A podcast / interview studio acted by the project's cast and directed from a transcript authored with turns. params: seats [{cast (a settings.cast name, also the speaker id), role?, color? (#hex), name?}] (1-6), title?, subtitle?, liveLabel? (e.g. 'LIVE'), camera?: 'auto' (close-ups on long lines, wide on reactions) | 'wide', lowerThirds? (default true: name and role the first time a seat speaks), intro? (default true: the title band slides in). Seats lay out for portrait and landscape. Pair with kineticWords {speakerColors?: {cast: '#hex'}} for captions."),
        "story" => Some("A story acted by the project's cast on illustrated sets, directed from a transcript authored with turns (a speaker with no character in a scene is a narrator). params: scenes [{start (s) | startLine (index of a spoken line) | startWord (word id) — the first scene starts at 0; set: room | office | street | park | cafe | studio; night?; colors?; cast: [{cast, x? (0..1), enter?: 'left' | 'right', exit?: 'left' | 'right', seated? (at a café table in the cafe set, or with table: true), prop?: 'mug' | 'phone' | 'tablet' | 'book', facing?, scale?}]; moves?: [{line | at, cast, x}]; actions?: [{line | at, type: 'handshake' | 'give' | 'hug' (a side hug, shoulder to shoulder), a, b, prop?}]; title? (a card as the scene opens); camera?: 'auto' | 'wide'}]. Characters walk in and out, face whoever they talk to, act their own lines, look at the speaker; the camera eases toward the speaker; scenes dip through black. Pair with kineticWords for captions."),
        _ => None,
    }
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
