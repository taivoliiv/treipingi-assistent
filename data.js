// Treipingi püsiandmed: laoseisus olevad muutehammasrattad ja teadaolevad kitarri seadistused.

const AVAILABLE_CHANGE_GEARS = [32, 40, 45, 47, 60, 65, 75, 80, 81, 84, 90, 95, 99, 127];

// Söötekasti kordisti hoovad (C/D) - samad kõigi kitarride jaoks, sest kuuluvad
// käigukastile, mitte kitarrile.
const NORTON_MULTIPLIERS = [
  { factor: 1, leverC: "I", leverD: "IV" },
  { factor: 2, leverC: "II", leverD: "IV" },
  { factor: 4, leverC: "I", leverD: "III" },
  { factor: 8, leverC: "II", leverD: "III" },
];

// Spindli pöördekiirused (p/min) hoobade B ja G asenditel.
const SPINDLE_SPEEDS = [
  { leverB: "I", leverG: 1, rpm: 34.5 },
  { leverB: "I", leverG: 2, rpm: 52 },
  { leverB: "I", leverG: 3, rpm: 82.5 },
  { leverB: "I", leverG: 4, rpm: 132 },
  { leverB: "II", leverG: 1, rpm: 212 },
  { leverB: "II", leverG: 2, rpm: 330 },
  { leverB: "II", leverG: 3, rpm: 520 },
  { leverB: "II", leverG: 4, rpm: 832 },
];

// Üldtunnustatud lõikekiirused (Vc, m/min) HSS-terale, tavatreimise jaoks.
// Keermelõikusel kasutatakse madalamat kiirust (vt THREADING_SPEED_FACTOR),
// et jääks aega poolmutrit käsitsi juhtida. turningDepthMm on üldtunnustatud
// soovituslik lõikesügavus (ap) HSS-teraga ühe käiguga treimisel.
const MATERIALS = [
  { id: "aluminium", label: "Alumiinium", turningVcMPerMin: 150, turningDepthMm: 2.5 },
  { id: "brass", label: "Messing", turningVcMPerMin: 90, turningDepthMm: 2 },
  { id: "cast-iron", label: "Malm", turningVcMPerMin: 20, turningDepthMm: 2 },
  { id: "c45", label: "Teras (C45)", turningVcMPerMin: 25, turningDepthMm: 1.5 },
  { id: "alloy-steel", label: "Tööriistateras", turningVcMPerMin: 15, turningDepthMm: 1 },
  { id: "stainless", label: "Roostevaba teras", turningVcMPerMin: 15, turningDepthMm: 1 },
];

const THREADING_SPEED_FACTOR = 0.4;

// Keermelõikus tehakse mitme järjestikuse lõikega, mitte ühe korraga. Sihitud
// keskmine ühe lõike sügavus skaleerub materjaliga - kasutame osa materjali
// treimise lõikesügavusest (turningDepthMm), mitte fikseeritud väärtust.
const THREADING_PASS_DEPTH_FACTOR = 0.1;

function calcThreadingPasses(totalDepthMm, turningDepthMm) {
  const targetPassDepth = turningDepthMm * THREADING_PASS_DEPTH_FACTOR;
  return Math.max(3, Math.round(totalDepthMm / targetPassDepth));
}

// Ülemine kelk (compound slide) seatakse tavapäraselt keerme poolnurgast
// 1 kraadi võrra vähem, nii et lõikab ainult juhtiv hari (mitte mõlemad korraga).
function calcCompoundAngle(toolAngleDeg) {
  return toolAngleDeg / 2 - 1;
}

// Ülemise kelgu skaala samm - üks skaalaühik vastab 0.05mm liikumisele.
const COMPOUND_DIAL_UNIT_MM = 0.05;

// Ükski üksik lõige ei tohi ületada seda raadiussügavust - ruutjuure-mudel
// annaks vastasel juhul esimesele lõikele ebamõistlikult suure sügavuse.
const THREADING_MAX_PASS_DEPTH_MM = 0.25;

// Kahanev lõigete kava: kumulatiivne raadiussügavus = kogusügavus x sqrt(lõige/lõigete_arv).
// Kuna keerme ristlõike pindala kasvab sügavusega ruutfunktsioonina, hoiab see
// iga lõike eemaldatava metalli koguse ligikaudu ühtlasena (sama põhimõte, mida
// kasutavad CNC-pinkide "constant area" keermetsüklid). Lõiked, mis ületaksid
// THREADING_MAX_PASS_DEPTH_MM, jagatakse mitmeks väiksemaks lõikeks. Ülemise
// kelgu näit on kumulatiivne raadiussügavus jagatud ülemise kelgu nurga
// koosinusega, sest ülemine kelk liigub mööda harja, mitte raadiaalselt.
function calcThreadingPassSchedule(totalDepthMm, passes, compoundAngleDeg) {
  const idealIncrements = [];
  let previousCumulativeRadial = 0;
  for (let n = 1; n <= passes; n++) {
    const cumulativeRadial = totalDepthMm * Math.sqrt(n / passes);
    idealIncrements.push(cumulativeRadial - previousCumulativeRadial);
    previousCumulativeRadial = cumulativeRadial;
  }

  const radialIncrements = [];
  idealIncrements.forEach((increment) => {
    if (increment <= THREADING_MAX_PASS_DEPTH_MM) {
      radialIncrements.push(increment);
      return;
    }
    const subPasses = Math.ceil(increment / THREADING_MAX_PASS_DEPTH_MM);
    for (let i = 0; i < subPasses; i++) radialIncrements.push(increment / subPasses);
  });

  const cosAngle = Math.cos((compoundAngleDeg * Math.PI) / 180);
  const schedule = [];
  let cumulativeDialUnits = 0;
  radialIncrements.forEach((incrementRadial, index) => {
    const incrementCompoundMm = incrementRadial / cosAngle;
    // Ümardame iga lõike enda juurdekasvu (mitte kumulatiivset summat), sest
    // sõltumatult ümardatud kumulatiivsete väärtuste vahed ei pruugi jääda
    // monotoonselt kahanevaks isegi kui alusjada seda on.
    cumulativeDialUnits += Math.max(1, Math.round(incrementCompoundMm / COMPOUND_DIAL_UNIT_MM));
    schedule.push({
      pass: index + 1,
      compoundReadingMm: Number((cumulativeDialUnits * COMPOUND_DIAL_UNIT_MM).toFixed(3)),
      dialUnits: cumulativeDialUnits,
    });
  });
  return schedule;
}

function calcRpmForCuttingSpeed(vcMPerMin, diameterMm) {
  return (vcMPerMin * 1000) / (Math.PI * diameterMm);
}

function findNearestSpindleSpeed(targetRpm) {
  return SPINDLE_SPEEDS.reduce((best, cur) =>
    Math.abs(cur.rpm - targetRpm) < Math.abs(best.rpm - targetRpm) ? cur : best
  );
}

// Levinud standardkeermed - valimisel täidetakse automaatselt läbimõõt ja
// leitakse vastav saavutatav samm/TPI (kõik allolevad on kontrollitud
// saavutatavaks praeguste kitarri kombinatsioonidega).
const STANDARD_THREADS = [
  { designation: "M3", threadType: "metric", diameterMm: 3, pitchMm: 0.5 },
  { designation: "M4", threadType: "metric", diameterMm: 4, pitchMm: 0.7 },
  { designation: "M5", threadType: "metric", diameterMm: 5, pitchMm: 0.8 },
  { designation: "M6", threadType: "metric", diameterMm: 6, pitchMm: 1 },
  { designation: "M8", threadType: "metric", diameterMm: 8, pitchMm: 1.25 },
  { designation: "M10", threadType: "metric", diameterMm: 10, pitchMm: 1.5 },
  { designation: "M12", threadType: "metric", diameterMm: 12, pitchMm: 1.75 },
  { designation: "M14", threadType: "metric", diameterMm: 14, pitchMm: 2 },
  { designation: "M16", threadType: "metric", diameterMm: 16, pitchMm: 2 },
  { designation: "M18", threadType: "metric", diameterMm: 18, pitchMm: 2.5 },
  { designation: "M20", threadType: "metric", diameterMm: 20, pitchMm: 2.5 },
  { designation: "M22", threadType: "metric", diameterMm: 22, pitchMm: 2.5 },
  { designation: "M24", threadType: "metric", diameterMm: 24, pitchMm: 3 },
  // BSP (G) torukeermed - sirged (mitte koonuselised), 55-kraadine keermenurk
  // (mitte tavapärane 60-kraadine). Nimisuurus EI võrdu tegeliku läbimõõduga -
  // see on toru sisemise ava ajalooline mõõt, mitte keerme mõõt.
  // Paigutatud teiste tollikeermete ette, sest tollimõõdus keermeid lõigatakse
  // enamasti just torudele.
  { designation: 'G1/8" BSP', threadType: "inch", diameterMm: 9.728, tpi: 28, toolAngleDeg: 55 },
  { designation: 'G1/4" BSP', threadType: "inch", diameterMm: 13.157, tpi: 19, toolAngleDeg: 55 },
  { designation: 'G3/8" BSP', threadType: "inch", diameterMm: 16.662, tpi: 19, toolAngleDeg: 55 },
  { designation: 'G1/2" BSP', threadType: "inch", diameterMm: 20.955, tpi: 14, toolAngleDeg: 55 },
  { designation: 'G5/8" BSP', threadType: "inch", diameterMm: 22.911, tpi: 14, toolAngleDeg: 55 },
  { designation: 'G3/4" BSP', threadType: "inch", diameterMm: 26.441, tpi: 14, toolAngleDeg: 55 },
  { designation: 'G7/8" BSP', threadType: "inch", diameterMm: 30.201, tpi: 14, toolAngleDeg: 55 },
  { designation: 'G1" BSP', threadType: "inch", diameterMm: 33.249, tpi: 11, toolAngleDeg: 55 },
  { designation: 'G1.1/4" BSP', threadType: "inch", diameterMm: 41.91, tpi: 11, toolAngleDeg: 55 },
  { designation: 'G1.1/2" BSP', threadType: "inch", diameterMm: 47.803, tpi: 11, toolAngleDeg: 55 },
  { designation: 'G2" BSP', threadType: "inch", diameterMm: 59.614, tpi: 11, toolAngleDeg: 55 },

  { designation: '1/4"-20 UNC', threadType: "inch", diameterMm: 6.35, tpi: 20 },
  { designation: '5/16"-18 UNC', threadType: "inch", diameterMm: 7.9375, tpi: 18 },
  { designation: '3/8"-16 UNC', threadType: "inch", diameterMm: 9.525, tpi: 16 },
  { designation: '7/16"-14 UNC', threadType: "inch", diameterMm: 11.1125, tpi: 14 },
  { designation: '1/2"-13 UNC', threadType: "inch", diameterMm: 12.7, tpi: 13 },
  { designation: '9/16"-12 UNC', threadType: "inch", diameterMm: 14.2875, tpi: 12 },
  { designation: '5/8"-11 UNC', threadType: "inch", diameterMm: 15.875, tpi: 11 },
  { designation: '3/4"-10 UNC', threadType: "inch", diameterMm: 19.05, tpi: 10 },
  { designation: '7/8"-9 UNC', threadType: "inch", diameterMm: 22.225, tpi: 9 },
  { designation: '1"-8 UNC', threadType: "inch", diameterMm: 25.4, tpi: 8 },
  { designation: '1/4"-28 UNF', threadType: "inch", diameterMm: 6.35, tpi: 28 },
  { designation: '5/16"-24 UNF', threadType: "inch", diameterMm: 7.9375, tpi: 24 },
  { designation: '3/8"-24 UNF', threadType: "inch", diameterMm: 9.525, tpi: 24 },
  { designation: '7/16"-20 UNF', threadType: "inch", diameterMm: 11.1125, tpi: 20 },
  { designation: '1/2"-20 UNF', threadType: "inch", diameterMm: 12.7, tpi: 20 },
  { designation: '9/16"-18 UNF', threadType: "inch", diameterMm: 14.2875, tpi: 18 },
  { designation: '5/8"-18 UNF', threadType: "inch", diameterMm: 15.875, tpi: 18 },
  { designation: '3/4"-16 UNF', threadType: "inch", diameterMm: 19.05, tpi: 16 },
  { designation: '7/8"-14 UNF', threadType: "inch", diameterMm: 22.225, tpi: 14 },
  { designation: '1"-12 UNF', threadType: "inch", diameterMm: 25.4, tpi: 12 },
];

const LATHE_DATA = {
  gitaraConfigs: [
    {
      id: "40-45x60-127",
      label: "40/45×60/127 (baasseadistus)",
      gears: [40, 45, 60, 127],
      fixed: false,
      threadType: "metric",
      basePitches: [
        { pitchMm: 0.6875, leverE: 1 },
        { pitchMm: 0.75, leverE: 2 },
        { pitchMm: 0.875, leverE: 3 },
        { pitchMm: 1, leverE: 4 },
        { pitchMm: 1.125, leverE: 5 },
        { pitchMm: 1.25, leverE: 6 },
      ],
      multipliers: NORTON_MULTIPLIERS,
    },
    {
      // Baastõusud tuletatud 40/45x60/127 kombinatsioonist, skaleerituna
      // ülekandearvude suhtega (40x32)/(60x127) / (40x60)/(45x127) = 0.4 täpselt.
      // Kordisti hoovad (C/D) kuuluvad käigukastile, mitte kitarrile, seega jäävad samaks.
      id: "40-60x32-127",
      label: "40/60×32/127",
      gears: [40, 60, 32, 127],
      fixed: false,
      threadType: "metric",
      basePitches: [
        { pitchMm: 0.275, leverE: 1 },
        { pitchMm: 0.3, leverE: 2 },
        { pitchMm: 0.35, leverE: 3 },
        { pitchMm: 0.4, leverE: 4 },
        { pitchMm: 0.45, leverE: 5 },
        { pitchMm: 0.5, leverE: 6 },
      ],
      multipliers: NORTON_MULTIPLIERS,
    },
    {
      // Moodulkeermed: telgsamm = pi x moodul. Hammasrataste suhe (47x40)/(75x95)
      // on pi lähend (viga ~0.0004%), skaleerituna baaskombinatsiooni suhtes samamoodi
      // nagu teiste kitarride puhul. Kordisti hoovad (C/D) jäävad samaks.
      id: "47-75x40-95",
      label: "47/75×40/95 (moodulkeermed)",
      gears: [47, 75, 40, 95],
      fixed: false,
      threadType: "module",
      basePitches: [
        { moduleMm: 0.1375, pitchMm: 0.432, leverE: 1 },
        { moduleMm: 0.15, pitchMm: 0.4712, leverE: 2 },
        { moduleMm: 0.175, pitchMm: 0.5498, leverE: 3 },
        { moduleMm: 0.2, pitchMm: 0.6283, leverE: 4 },
        { moduleMm: 0.225, pitchMm: 0.7069, leverE: 5 },
        { moduleMm: 0.25, pitchMm: 0.7854, leverE: 6 },
      ],
      multipliers: NORTON_MULTIPLIERS,
    },
    {
      // pi lähend, moodulikordaja 0.325 (vt 47/75x40/95 kommentaari).
      id: "47-75x65-95",
      label: "47/75×65/95 (moodulkeermed)",
      gears: [47, 75, 65, 95],
      fixed: false,
      threadType: "module",
      basePitches: [
        { moduleMm: 0.2234, pitchMm: 0.7019, leverE: 1 },
        { moduleMm: 0.2438, pitchMm: 0.7658, leverE: 2 },
        { moduleMm: 0.2844, pitchMm: 0.8934, leverE: 3 },
        { moduleMm: 0.325, pitchMm: 1.021, leverE: 4 },
        { moduleMm: 0.3656, pitchMm: 1.1486, leverE: 5 },
        { moduleMm: 0.4063, pitchMm: 1.2763, leverE: 6 },
      ],
      multipliers: NORTON_MULTIPLIERS,
    },
    {
      // pi lähend, moodulikordaja 0.75.
      id: "47-40x80-95",
      label: "47/40×80/95 (moodulkeermed)",
      gears: [47, 40, 80, 95],
      fixed: false,
      threadType: "module",
      basePitches: [
        { moduleMm: 0.5156, pitchMm: 1.6199, leverE: 1 },
        { moduleMm: 0.5625, pitchMm: 1.7671, leverE: 2 },
        { moduleMm: 0.6563, pitchMm: 2.0617, leverE: 3 },
        { moduleMm: 0.75, pitchMm: 2.3562, leverE: 4 },
        { moduleMm: 0.8438, pitchMm: 2.6507, leverE: 5 },
        { moduleMm: 0.9375, pitchMm: 2.9452, leverE: 6 },
      ],
      multipliers: NORTON_MULTIPLIERS,
    },
    {
      // pi lähend, moodulikordaja 0.5 (täpselt pool 47/40x80/95-st).
      id: "47-60x80-95",
      label: "47/60×80/95 (moodulkeermed)",
      gears: [47, 60, 80, 95],
      fixed: false,
      threadType: "module",
      basePitches: [
        { moduleMm: 0.3438, pitchMm: 1.0799, leverE: 1 },
        { moduleMm: 0.375, pitchMm: 1.1781, leverE: 2 },
        { moduleMm: 0.4375, pitchMm: 1.3744, leverE: 3 },
        { moduleMm: 0.5, pitchMm: 1.5708, leverE: 4 },
        { moduleMm: 0.5625, pitchMm: 1.7671, leverE: 5 },
        { moduleMm: 0.625, pitchMm: 1.9635, leverE: 6 },
      ],
      multipliers: NORTON_MULTIPLIERS,
    },
  ],

  // Tollikeermed (TPI): iga kitarr annab täpse (mitte lähendatud) TPI ainult
  // ühel-kolmel konkreetsel hoova E asendil (kordisti ×1) - ülejäänud asendid
  // annavad ebastandardseid (mittetäisarvulisi TPI) tõuse ega ole kasutuses.
  // Kordisti hoobasid (C/D) RAKENDATAKSE - vt computeAchievableInchThreads(),
  // mis jagab TPI läbi kordistiga (2x kordisti = pool TPI-d jne) ja hoiab
  // ainult need tulemused, kus TPI jääb täisarvuks.
  inchThreads: [
    { gears: [32, 81, 81, 99], label: "32/81×81/99", leverE: 1, tpi: 48, pitchMm: 0.5292 },
    { gears: [32, 81, 81, 99], label: "32/81×81/99", leverE: 2, tpi: 44, pitchMm: 0.5773 },
    { gears: [32, 81, 81, 99], label: "32/81×81/99", leverE: 4, tpi: 33, pitchMm: 0.7697 },
    { gears: [32, 81, 81, 90], label: "32/81×81/90", leverE: 2, tpi: 40, pitchMm: 0.635 },
    { gears: [32, 81, 81, 90], label: "32/81×81/90", leverE: 4, tpi: 30, pitchMm: 0.8467 },
    { gears: [32, 81, 81, 90], label: "32/81×81/90", leverE: 6, tpi: 24, pitchMm: 1.0583 },
    { gears: [32, 90, 90, 84], label: "32/90×90/84", leverE: 3, tpi: 32, pitchMm: 0.7937 },
    { gears: [32, 90, 90, 84], label: "32/90×90/84", leverE: 4, tpi: 28, pitchMm: 0.9071 },
    { gears: [32, 90, 90, 81], label: "32/90×90/81", leverE: 2, tpi: 36, pitchMm: 0.7056 },
    { gears: [32, 90, 90, 81], label: "32/90×90/81", leverE: 4, tpi: 27, pitchMm: 0.9407 },
    { gears: [32, 90, 90, 81], label: "32/90×90/81", leverE: 5, tpi: 24, pitchMm: 1.0583 },
    { gears: [40, 65, 80, 90], label: "40/65×80/90", leverE: 2, tpi: 26, pitchMm: 0.9769 },
    { gears: [40, 45, 80, 95], label: "40/45×80/95", leverE: 2, tpi: 19, pitchMm: 1.3368 },
  ],
};

function computeAchievableInchThreads() {
  const results = [];
  for (const base of LATHE_DATA.inchThreads) {
    for (const mult of NORTON_MULTIPLIERS) {
      const tpi = base.tpi / mult.factor;
      if (!Number.isInteger(tpi)) continue;
      results.push({
        tpi,
        pitchMm: Number((base.pitchMm * mult.factor).toFixed(4)),
        gears: base.gears,
        leverE: base.leverE,
        leverC: mult.leverC,
        leverD: mult.leverD,
      });
    }
  }
  results.sort((a, b) => a.tpi - b.tpi);
  return results;
}

function computeAchievableThreads(gitaraConfig) {
  const results = [];
  for (const base of gitaraConfig.basePitches) {
    for (const mult of gitaraConfig.multipliers) {
      const entry = {
        pitchMm: Number((base.pitchMm * mult.factor).toFixed(4)),
        basePitchMm: base.pitchMm,
        leverE: base.leverE,
        multiplier: mult.factor,
        leverC: mult.leverC,
        leverD: mult.leverD,
      };
      if (base.moduleMm !== undefined) {
        entry.moduleMm = Number((base.moduleMm * mult.factor).toFixed(4));
        entry.baseModuleMm = base.moduleMm;
      }
      results.push(entry);
    }
  }
  results.sort((a, b) => a.pitchMm - b.pitchMm);
  return results;
}
