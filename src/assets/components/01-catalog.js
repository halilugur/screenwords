

/* 100 extra parametric components. Every id below is painted procedurally from
   document params, so a component with no params still renders something and a
   malformed param can never produce NaN geometry. Params: position {x,y} in
   0-1 frame space, color, accentColor, text/title/subtitle/label, size,
   radius, width, height, items[{label,value,color}], value; all optional. */
const EC_FONT = '"Space Grotesk", "Montserrat", "Arial Black", sans-serif';

const EC_TITLE_IDS = [
  'textReveal', 'splitTitle', 'outlineTitle', 'gradientTitle', 'kickerTitle',
  'stampTitle', 'verticalTitle', 'underlinerTitle', 'popWordsTitle',
  'ribbonTitle', 'glowTitle', 'shadowTitle', 'badgeTitle', 'tickerTitle'
];
const EC_CAPTION_IDS = [
  'captionPill', 'wordByWord', 'highlightSweep', 'bubbleCaption',
  'underlineWords', 'karaokeCaption'
];
const EC_SHAPE_IDS = [
  'ringSpinner', 'concentricRings', 'triangleBurst', 'hexGrid', 'diamondShape',
  'starburst', 'dottedLine', 'bezierArc', 'spiralShape', 'waveRibbon',
  'capsuleBar', 'blobShape'
];
const EC_CHART_IDS = [
  'pieChart', 'donutChart', 'lineChart', 'areaChart', 'radarChart',
  'heatmapGrid', 'scatterPlot', 'stackedBars', 'funnelChart', 'ganttBars',
  'gaugeArc', 'segmentedProgress', 'sparkline', 'bubbleChart', 'scoreMeter',
  'comparisonBars'
];
const EC_UI_IDS = [
  'phoneMockup', 'browserWindow', 'chatBubbleLeft', 'chatBubbleRight',
  'notificationToast', 'cursorClick', 'keyboardKey', 'searchField',
  'toggleSwitch', 'checkboxTick', 'sliderControl', 'avatarStack',
  'ratingStars', 'tooltipBox'
];
const EC_MOTION_IDS = [
  'bounceBall', 'pendulumSwing', 'orbitDots', 'rippleWaves', 'pulseGrid',
  'equalizerBars', 'particleTrail', 'rotatingGear', 'springCoil', 'chevronFlow'
];
const EC_BACKGROUND_IDS = [
  'auroraBackground', 'grainBackground', 'radialGlowBackground',
  'checkerboardBackground', 'halftoneBackground', 'topographicBackground',
  'silkBackground', 'horizonBackground', 'prismBackground', 'dotMatrixBackground'
];
const EC_EFFECT_IDS = [
  'filmGrain', 'chromaticAberration', 'lightLeak', 'vignettePulse',
  'bloomHalo', 'colorWash', 'duotoneStripes', 'glitchBars', 'focusRings',
  'speedLines'
];
const EC_TRANSITION_IDS = [
  'transitionPush', 'transitionIris', 'transitionBarnDoors', 'transitionPixelate',
  'transitionCircleReveal', 'transitionSwipeUp', 'transitionBlinds',
  'transitionBlurWipe'
];

/* --- Second pack: ids 169-300 ------------------------------------------- */
const EC2_TITLE_IDS = [
  'echoTitle', 'neonSign', 'magazineTitle', 'verticalStack', 'typeOnTitle',
  'glitchTitle', 'sliceTitle', 'curveTitle', 'marqueeBand', 'spotlightTitle',
  'countUpTitle', 'multilineTitle', 'quoteTitle', 'labelStack'
];
const EC2_CAPTION_IDS = [
  'captionBox', 'captionBounce', 'captionSplit', 'captionGradient', 'captionNeon',
  'captionHandwrite', 'captionTicker', 'captionTimed', 'captionArrow', 'captionBracket'
];
const EC2_SHAPE_IDS = [
  'squareOutline', 'roundedSquare', 'crossShape', 'plusGrid', 'lineGrid',
  'arcRings', 'dashedCircle', 'polygonShape', 'pentagonShape', 'octagonShape',
  'zigzagLine', 'ladderShape', 'fanShape', 'crescentShape'
];
const EC2_CHART_IDS = [
  'waterfallChart', 'histogramChart', 'boxPlot', 'candlestickChart', 'treemapGrid',
  'sankeyFlow', 'chordDiagram', 'bulletChart', 'dumbbellChart', 'slopeChart',
  'waffleChart', 'radialBarChart', 'progressStack', 'latencyBars'
];
const EC2_UI_IDS = [
  'mobileTabBar', 'listRows', 'profileCard', 'pricingCard', 'calendarStrip',
  'clockFace', 'batteryMeter', 'signalBars', 'wifiIcon', 'playButton',
  'badgeCheck', 'bellIcon', 'menuIcon', 'shareIcon', 'downloadBar', 'stepperDots'
];
const EC2_MOTION_IDS = [
  'spinningCube', 'waveDots', 'orbitTrail', 'bouncingArrows', 'rotatingTriangles',
  'flowingWaveLines', 'spiralDots', 'heartbeatLine', 'radarSweep', 'sonarBlips',
  'clockHands', 'gyroscope', 'cometTrail', 'pulseRings', 'pendulumBalls', 'vortexSpiral'
];
const EC2_BACKGROUND_IDS = [
  'cityLightsBackground', 'underwaterBackground', 'lavaLampBackground', 'nebulaBackground',
  'plaidBackground', 'circuitBoardBackground', 'paperTextureBackground', 'marbleBackground',
  'foamBackground', 'hexTunnelBackground', 'vortexBackground', 'confettiWallBackground'
];
const EC2_EFFECT_IDS = [
  'rainEffect', 'snowEffect', 'dustMotes', 'fogLayer', 'bokehBurst', 'lensFlare',
  'prismSplit', 'neonEdge', 'scanSweep', 'bloomRays', 'retroTv', 'shadowVignette'
];
const EC2_TRANSITION_IDS = [
  'transitionFold', 'transitionFlip', 'transitionSpin', 'transitionMosaic',
  'transitionClockWipe', 'transitionDiagonalWipe', 'transitionSplitWipe',
  'transitionZoomIn', 'transitionZoomOut', 'transitionShutter',
  'transitionWaterRipple', 'transitionLumaFade'
];
const EC2_TRANSFORM_IDS = [
  'cameraShake', 'dutchAngle', 'zoomEase', 'handheldSway', 'orbitCamera', 'tiltShift'
];
const EC2_LOTTIE_IDS = [
  'lottieArrowFlow', 'lottiePulseRings', 'lottieBarReveal', 'lottieConfetti',
  'lottieCheckmark', 'lottieTextPop'
];

const EC2_COMPONENT_IDS = [].concat(
  EC2_TITLE_IDS, EC2_CAPTION_IDS, EC2_SHAPE_IDS, EC2_CHART_IDS, EC2_UI_IDS,
  EC2_MOTION_IDS, EC2_BACKGROUND_IDS, EC2_EFFECT_IDS, EC2_TRANSITION_IDS,
  EC2_TRANSFORM_IDS, EC2_LOTTIE_IDS
);
const EC2_COMPONENT_SET = new Set(EC2_COMPONENT_IDS);

/* Third pack: 300 further components.  Twelve families of twenty-five keep
   the additions evenly distributed across every catalog category. */
const EC3_TITLE_IDS = [
  'auroraHeadline', 'chromeTitle', 'neonUnderlineTitle', 'splitFlapTitle',
  'glassTitle', 'outlineShadowTitle', 'gradientSweepTitle', 'kineticStackTitle',
  'ribbonBannerTitle', 'typewriterBlockTitle', 'spotlightRevealTitle',
  'glitchSliceTitle', 'curvedArcTitle', 'countdownHeadline', 'boldStatementTitle',
  'minimalKickerTitle', 'magazineCoverTitle', 'verticalMarqueeTitle',
  'dualToneTitle', 'neonFlickerTitle', 'embossTitle', 'scatterTitle',
  'underlineDrawTitle', 'badgeRibbonTitle', 'cinematicTitle'
];
const EC3_CAPTION_IDS = [
  'captionGlowBar', 'captionBoxedQuote', 'captionSplitColor', 'captionWave',
  'captionRise', 'captionDrop', 'captionTypeOn', 'captionHighlightWord',
  'captionUnderline', 'captionNeonFrame', 'captionPillStack', 'captionShadowText',
  'captionArrowTag', 'captionBracketLine', 'captionProgressDots', 'captionTimer',
  'captionSpeakerTag', 'captionTwoLine', 'captionCenterBar', 'captionEdgeFade',
  'captionKaraokeBar', 'captionWordPop', 'captionBoxOutline',
  'captionGradientText', 'captionMinimal'
];
const EC3_SHAPE_IDS = [
  'hexRing', 'orbitRing', 'dashedSquare', 'cornerBrackets', 'triangleStack',
  'diamondGrid', 'starburstOutline', 'dotMatrixShape', 'arcSweep', 'spiralCoil',
  'waveBars', 'blobMorph', 'capsuleOutline', 'crosshairShape', 'polygonBurst',
  'gearShape', 'rippleCircle', 'chevronBadge', 'frameCorners', 'lineBurst',
  'semicircleFan', 'roundedTriangle', 'concentricSquares', 'zigzagRibbon',
  'pixelCluster'
];
const EC3_CHART_IDS = [
  'areaStackChart', 'barRaceChart', 'bulletGraph', 'candleStickMini',
  'chordFlowChart', 'circularProgressChart', 'columnCompareChart',
  'donutSegmentChart', 'dotPlotChart', 'dumbbellRangeChart', 'funnelStageChart',
  'gaugeNeedleChart', 'heatmapCalendar', 'histogramBins', 'lineForecastChart',
  'pieSplitChart', 'radarSpiderChart', 'sankeyRibbonChart', 'scatterTrendChart',
  'sparklineMini', 'stackedAreaChart', 'treemapTiles', 'violinPlot',
  'waterfallSteps', 'wafflePercent'
];
const EC3_UI_IDS = [
  'appWindow', 'authCard', 'bottomSheet', 'chatThread', 'checkoutCard',
  'commandPalette', 'cookieBanner', 'dashboardTile', 'datePicker',
  'dropdownMenu', 'emailCard', 'fileBrowser', 'formField', 'heroBanner',
  'kanbanCard', 'loginCard', 'modalDialog', 'navBar', 'notificationStack',
  'onboardingCard', 'productCard', 'progressToast', 'searchResults',
  'sidebarMenu', 'statTile'
];
const EC3_MOTION_IDS = [
  'orbitSparks', 'pendulumWave', 'bouncingDots', 'rotatingSquares', 'ringPulse',
  'cometHead', 'spiralTrail', 'waveformPulse', 'particleFountain', 'gearTrain',
  'springBounce', 'radarPing', 'glitchBlocks', 'flowingDots', 'ripples',
  'spinningTriangle', 'heartbeatPulse', 'vortexDots', 'waveGrid', 'trailLines',
  'clockSweep', 'orbitingBalls', 'scanBeam', 'elasticBar', 'confettiTrail'
];
const EC3_BACKGROUND_IDS = [
  'auroraVeilBackground', 'blueprintGridBackground', 'bokehNightBackground',
  'canyonDuskBackground', 'circuitPulseBackground', 'cloudDriftBackground',
  'deepSpaceBackground', 'desertDunesBackground', 'fogMountainBackground',
  'forestMistBackground', 'galaxySpiralBackground', 'glassRefractionBackground',
  'halftoneSunBackground', 'lavaFlowBackground', 'lightRaysBackground',
  'neonCityBackground', 'oceanWavesBackground', 'paperGrainBackground',
  'prismLightBackground', 'rainGlassBackground', 'sandRippleBackground',
  'starfieldSlowBackground', 'topoLinesBackground', 'underwaterGlowBackground',
  'vaporwaveBackground'
];
const EC3_EFFECT_IDS = [
  'anamorphicFlare', 'bloomBurst', 'chromaticEdge', 'colorSplit',
  'digitalNoise', 'duotoneWash', 'filmBurn', 'glitchScan', 'grainyVignette',
  'haloGlow', 'lensDistort', 'lightSweep', 'neonGlow', 'pixelGlitch',
  'prismFringe', 'scanlineOverlay', 'shadowPulse', 'softFocus', 'sparkleDust',
  'strobeFlash', 'thermalMap', 'vignetteBreath', 'waveDistort', 'xrayEdge',
  'zoomBlurBurst'
];
const EC3_TRANSITION_IDS = [
  'transitionBandSwipe', 'transitionCircleWipe', 'transitionDiagonalSplit',
  'transitionFadeThrough', 'transitionGridReveal', 'transitionHexWipe',
  'transitionInkSpread', 'transitionLineWipe', 'transitionMosaicFlip',
  'transitionPageTurn', 'transitionPixelDissolve', 'transitionRadialWipe',
  'transitionRippleWipe', 'transitionShapeWipe', 'transitionSlideStack',
  'transitionSmear', 'transitionSplitCurtain', 'transitionStaggerBars',
  'transitionStarWipe', 'transitionSwipeLeft', 'transitionSwipeRight',
  'transitionTunnel', 'transitionWaveWipe', 'transitionZoomPush',
  'transitionBlindsReveal'
];
const EC3_TRANSFORM_IDS = [
  'cameraBreathe', 'cameraDrift', 'cameraFloat', 'cameraKick',
  'cameraOrbitTilt', 'cameraPanLeft', 'cameraPanRight', 'cameraPushIn',
  'cameraRoll', 'cameraShakeSoft', 'cameraSway', 'cameraTilt',
  'cameraWobble', 'cameraZoomOut', 'dutchSway', 'focusPull',
  'parallaxPan', 'perspectiveTilt', 'shakeHandheld', 'tiltOrbit',
  'zoomBreath', 'zoomInSlow', 'zoomOutSlow', 'rotateStage',
  'stabilizeFloat'
];
const EC3_LOTTIE_IDS = [
  'lottieArrowBurst', 'lottieBadgePop', 'lottieBellRing', 'lottieBoltStrike',
  'lottieBubbleRise', 'lottieCheckDraw', 'lottieCircleGrow',
  'lottieConfettiRain', 'lottieCursorMove', 'lottieDotWave',
  'lottieEnvelopeOpen', 'lottieGearSpin', 'lottieHeartBeat', 'lottieLineDraw',
  'lottieLoadingDots', 'lottieLockOpen', 'lottieMailSend', 'lottiePinDrop',
  'lottieProgressRing', 'lottieRocketLaunch', 'lottieSearchScan',
  'lottieStarTwinkle', 'lottieThumbsUp', 'lottieToggleSwitch', 'lottieWaveHand'
];
const EC3_DATA_IDS = [
  'dataTable', 'dataTimeline', 'dataKpiGrid', 'dataScoreboard',
  'dataLeaderboard', 'dataSchedule', 'dataMatrix', 'dataLegend',
  'dataSparkGrid', 'dataRatioBar', 'dataHeatRow', 'dataCalendarHeat',
  'dataProgressList', 'dataComparisonTable', 'dataMetricCards',
  'dataGaugeCluster', 'dataTrafficLights', 'dataStepTimeline',
  'dataLiveTicker', 'dataPollBars', 'dataRankingList', 'dataDonutGrid',
  'dataWaterfallList', 'dataNetworkMap', 'dataSummaryPanel'
];

const EC3_COMPONENT_IDS = [].concat(
  EC3_TITLE_IDS, EC3_CAPTION_IDS, EC3_SHAPE_IDS, EC3_CHART_IDS, EC3_UI_IDS,
  EC3_MOTION_IDS, EC3_BACKGROUND_IDS, EC3_EFFECT_IDS, EC3_TRANSITION_IDS,
  EC3_TRANSFORM_IDS, EC3_LOTTIE_IDS, EC3_DATA_IDS
);
const EC3_COMPONENT_SET = new Set(EC3_COMPONENT_IDS);

const EXTRA_COMPONENT_IDS = [].concat(
  EC_TITLE_IDS, EC_CAPTION_IDS, EC_SHAPE_IDS, EC_CHART_IDS, EC_UI_IDS,
  EC_MOTION_IDS, EC_BACKGROUND_IDS, EC_EFFECT_IDS, EC_TRANSITION_IDS,
  EC2_TITLE_IDS, EC2_CAPTION_IDS, EC2_SHAPE_IDS, EC2_CHART_IDS, EC2_UI_IDS,
  EC2_MOTION_IDS, EC2_BACKGROUND_IDS, EC2_EFFECT_IDS, EC2_TRANSITION_IDS,
  EC2_TRANSFORM_IDS, EC2_LOTTIE_IDS,
  EC3_TITLE_IDS, EC3_CAPTION_IDS, EC3_SHAPE_IDS, EC3_CHART_IDS, EC3_UI_IDS,
  EC3_MOTION_IDS, EC3_BACKGROUND_IDS, EC3_EFFECT_IDS, EC3_TRANSITION_IDS,
  EC3_TRANSFORM_IDS, EC3_LOTTIE_IDS, EC3_DATA_IDS
);
const EXTRA_COMPONENT_SET = new Set(EXTRA_COMPONENT_IDS);
const EC_SERIES = [62, 38, 81, 47, 70, 54, 29, 75];
