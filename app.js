const standardThreadEl = document.getElementById("standard-thread");
const threadTypeEl = document.getElementById("thread-type");
const threadValueEl = document.getElementById("thread-value");
const directionEl = document.getElementById("thread-direction");
const directionFieldEl = document.getElementById("direction-field");
const diameterEl = document.getElementById("diameter");
const diameterFieldEl = document.getElementById("diameter-field");
const materialEl = document.getElementById("material");
const materialFieldEl = document.getElementById("material-field");
const outputEl = document.getElementById("instructions-output");

const EXTERNAL_TURNING_ALLOWANCE_MM = 0.1;

let currentOptions = [];

function buildOptionsForType(type) {
  const options = [];

  if (type === "inch") {
    computeAchievableInchThreads().forEach((t) => {
      options.push({
        sortKey: t.tpi,
        dedupeKey: t.tpi,
        label: `${t.tpi} TPI`,
        record: {
          threadType: "inch",
          tpi: t.tpi,
          pitchMm: t.pitchMm,
          gears: t.gears,
          leverE: t.leverE,
          leverC: t.leverC,
          leverD: t.leverD,
        },
      });
    });
  } else {
    LATHE_DATA.gitaraConfigs
      .filter((cfg) => cfg.threadType === type)
      .forEach((cfg) => {
        computeAchievableThreads(cfg).forEach((t) => {
          options.push({
            sortKey: t.pitchMm,
            dedupeKey: type === "module" ? t.moduleMm : t.pitchMm,
            label: type === "module" ? `M${t.moduleMm}` : `${t.pitchMm} mm`,
            record: {
              threadType: type,
              pitchMm: t.pitchMm,
              moduleMm: t.moduleMm,
              gears: cfg.gears,
              leverE: t.leverE,
              leverC: t.leverC,
              leverD: t.leverD,
            },
          });
        });
      });
  }

  const seen = new Set();
  const deduped = options.filter((opt) => {
    if (seen.has(opt.dedupeKey)) return false;
    seen.add(opt.dedupeKey);
    return true;
  });

  deduped.sort((a, b) => a.sortKey - b.sortKey);
  return deduped;
}

function populateValues() {
  currentOptions = buildOptionsForType(threadTypeEl.value);
  threadValueEl.innerHTML = "";
  currentOptions.forEach((opt, index) => {
    const el = document.createElement("option");
    el.value = String(index);
    el.textContent = opt.label;
    threadValueEl.appendChild(el);
  });

  const supportsBlankSize = threadTypeEl.value !== "module";
  diameterFieldEl.style.display = supportsBlankSize ? "" : "none";
  directionFieldEl.style.display = supportsBlankSize ? "" : "none";
  materialFieldEl.style.display = supportsBlankSize ? "" : "none";
}

function populateMaterials() {
  MATERIALS.forEach((mat, index) => {
    const el = document.createElement("option");
    el.value = String(index);
    el.textContent = mat.label;
    materialEl.appendChild(el);
  });
  const defaultIndex = MATERIALS.findIndex((mat) => mat.id === "c45");
  if (defaultIndex !== -1) materialEl.value = String(defaultIndex);
}

function populateStandardThreads() {
  STANDARD_THREADS.forEach((std, index) => {
    const el = document.createElement("option");
    el.value = String(index);
    el.textContent = std.designation;
    standardThreadEl.appendChild(el);
  });
}

function applyStandardThread() {
  const std = STANDARD_THREADS[Number(standardThreadEl.value)];
  if (!std) return;

  threadTypeEl.value = std.threadType;
  populateValues();

  const matchIndex = currentOptions.findIndex((opt) =>
    std.threadType === "inch" ? opt.record.tpi === std.tpi : opt.record.pitchMm === std.pitchMm
  );
  if (matchIndex !== -1) threadValueEl.value = String(matchIndex);

  diameterEl.value = std.diameterMm;
}

function clearHighlights() {
  document.querySelectorAll(".ring.highlight").forEach((el) => {
    el.classList.remove("highlight");
  });
}

function highlightPoint(point) {
  clearHighlights();
  document.querySelectorAll(`.ring[data-point="${point}"]`).forEach((el) => {
    el.classList.add("highlight");
  });
}

function leverRef(point) {
  return `<span class="lever-ref" data-point="${point}">${point}</span>`;
}

function calcBlankSize(nominalDiameter, pitchMm, direction) {
  if (direction === "external") {
    return { diameter: Number((nominalDiameter - EXTERNAL_TURNING_ALLOWANCE_MM).toFixed(2)) };
  }
  return { diameter: Number((nominalDiameter - pitchMm).toFixed(2)) };
}

function calcThreadDepth(pitchMm, toolAngleDeg) {
  const factor = toolAngleDeg === 55 ? 0.6403 : 0.5413;
  return Number((factor * pitchMm).toFixed(3));
}

function describeValue(r) {
  if (r.threadType === "inch") return `${r.tpi} TPI (${r.pitchMm} mm)`;
  if (r.threadType === "module") return `moodul ${r.moduleMm} (samm ${r.pitchMm} mm)`;
  return `${r.pitchMm} mm`;
}

function findMatchingStandard(r, diameter) {
  return STANDARD_THREADS.find((std) => {
    if (std.threadType !== r.threadType) return false;
    if (std.threadType === "inch" ? std.tpi !== r.tpi : std.pitchMm !== r.pitchMm) return false;
    return !Number.isNaN(diameter) && Math.abs(std.diameterMm - diameter) < 0.01;
  });
}

function generateInstructions() {
  const opt = currentOptions[Number(threadValueEl.value)];

  if (!opt) {
    outputEl.innerHTML = '<p class="placeholder">Vali keere.</p>';
    return;
  }

  const r = opt.record;
  const nominalDiameter = parseFloat(diameterEl.value);
  const std = findMatchingStandard(r, nominalDiameter);
  const toolAngleDeg = (std && std.toolAngleDeg) || 60;

  const summaryLines = [];
  if (std) summaryLines.push(`Standard: <strong>${std.designation}</strong>`);
  summaryLines.push(`Keerme samm: <strong>${describeValue(r)}</strong>`);

  let blank = null;
  const hasDiameter = r.threadType !== "module" && !Number.isNaN(nominalDiameter) && nominalDiameter > 0;
  if (hasDiameter) {
    blank = calcBlankSize(nominalDiameter, r.pitchMm, directionEl.value);
    const label = directionEl.value === "external" ? "Soovituslik tooriku läbimõõt" : "Augu läbimõõt";
    summaryLines.push(`${label}: <strong>Ø${blank.diameter} mm</strong>`);
  }

  if (r.threadType !== "module") {
    summaryLines.push(`Treitera profiil: <strong>${toolAngleDeg}°</strong>`);
    summaryLines.push(`Keerme sügavus: <strong>${calcThreadDepth(r.pitchMm, toolAngleDeg)} mm</strong>`);
  }

  const summaryStep = summaryLines.length ? `<li>${summaryLines.join("<br>")}</li>` : "";

  let speedStep = "";
  const material = MATERIALS[Number(materialEl.value)];
  if (material && hasDiameter && directionEl.value === "external") {
    const turningRpmTarget = calcRpmForCuttingSpeed(material.turningVcMPerMin, blank.diameter);
    const turning = findNearestSpindleSpeed(turningRpmTarget);

    const threadingRpmTarget = calcRpmForCuttingSpeed(material.turningVcMPerMin * THREADING_SPEED_FACTOR, blank.diameter);
    const threading = findNearestSpindleSpeed(threadingRpmTarget);

    speedStep = `<li>Optimaalne kiirus<br>Tooriku treimisel: <strong>${turning.rpm} p/min</strong> (hoob ${leverRef("B")} asendis <strong>${turning.leverB}</strong> ja hoob ${leverRef("G")} asendis <strong>${turning.leverG}</strong>)<br>Keermestamisel: <strong>${threading.rpm} p/min</strong> (hoob ${leverRef("B")} asendis <strong>${threading.leverB}</strong> ja hoob ${leverRef("G")} asendis <strong>${threading.leverG}</strong>)</li>`;
  }

  let depthStep = "";
  if (r.threadType !== "module") {
    const lines = [];
    if (material) lines.push(`Treimisel: <strong>${material.turningDepthMm} mm</strong>`);
    if (material) {
      const totalThreadDepth = calcThreadDepth(r.pitchMm, toolAngleDeg);
      const initialPasses = calcThreadingPasses(totalThreadDepth, material.turningDepthMm);
      const compoundAngle = calcCompoundAngle(toolAngleDeg);
      const schedule = calcThreadingPassSchedule(totalThreadDepth, initialPasses, compoundAngle);
      const readings = schedule.map((s) => s.dialUnits).join(", ");
      lines.push(`Keermestamisel (${schedule.length} lõiget, ülemine kelk <strong>${compoundAngle}°</strong>)<br>Ülemise kelgu näidud (${COMPOUND_DIAL_UNIT_MM} mm/ühik): <strong>${readings}</strong>`);
    }
    if (lines.length) depthStep = `<li>Soovituslik lõikesügavus<br>${lines.join("<br>")}</li>`;
  }

  outputEl.innerHTML = `
    <ol>
      ${summaryStep}
      ${speedStep}
      <li>Ettenihe<br>Kitarris hammasrattad <strong>${r.gears.join(", ")}</strong><br>Keermesammu hoob ${leverRef("E")} asendis <strong>${r.leverE}</strong><br>Kordistushoovad ${leverRef("C")} ja ${leverRef("D")} asendites <strong>${r.leverC}</strong> ja <strong>${r.leverD}</strong></li>
      ${depthStep}
    </ol>
  `;
}

outputEl.addEventListener("mouseover", (event) => {
  const ref = event.target.closest(".lever-ref");
  if (ref) highlightPoint(ref.dataset.point);
});

outputEl.addEventListener("mouseout", (event) => {
  const ref = event.target.closest(".lever-ref");
  if (ref) clearHighlights();
});

standardThreadEl.addEventListener("change", () => {
  applyStandardThread();
  generateInstructions();
});
threadTypeEl.addEventListener("change", () => {
  populateValues();
  generateInstructions();
});
threadValueEl.addEventListener("change", generateInstructions);
directionEl.addEventListener("change", generateInstructions);
diameterEl.addEventListener("input", generateInstructions);
materialEl.addEventListener("change", generateInstructions);

populateStandardThreads();
populateMaterials();

const defaultStandardIndex = STANDARD_THREADS.findIndex((std) => std.designation === 'G3/4" BSP');
if (defaultStandardIndex !== -1) {
  standardThreadEl.value = String(defaultStandardIndex);
  applyStandardThread();
} else {
  populateValues();
}
generateInstructions();
