const COLORS = ["Merah", "Biru", "Hijau", "Kuning"];
const HEX = {
  Merah: "#C81E43",
  Biru: "#1D4ED8",
  Hijau: "#0F7B3A",
  Kuning: "#A77500"
};

const API_BASE = "/api";
const FINAL_SESSION_CODE = "mid_evening";
const currentStudyDate = new Date();

let pid = "";
let day = "";
let session = "";
let sessionDisplay = "";

let trialList = [];
let currentTrialIndex = 0;
let isPractice = false;
let stimulusOnsetTime = 0;
let results = [];
let awaitingResponse = false;
let timeoutHandle = null;
let summaryForExport = null;
let vasFatigueScore = 50;
let pendingSummary = null;

const el = {
  setupScreen: document.getElementById("setupScreen"),
  instructionScreen: document.getElementById("instructionScreen"),
  testScreen: document.getElementById("testScreen"),
  practiceDoneScreen: document.getElementById("practiceDoneScreen"),
  vasScreen: document.getElementById("vasScreen"),
  questionnaireScreen: document.getElementById("questionnaireScreen"),
  resultsScreen: document.getElementById("resultsScreen"),
  setupForm: document.getElementById("setupForm"),
  pidInput: document.getElementById("pid"),
  dayDisplay: document.getElementById("dayDisplay"),
  sessionSelect: document.getElementById("session"),
  startPracticeBtn: document.getElementById("startPracticeBtn"),
  startMainBtn: document.getElementById("startMainBtn"),
  progressFill: document.getElementById("progressFill"),
  trialCounter: document.getElementById("trialCounter"),
  fixation: document.getElementById("fixation"),
  stimulus: document.getElementById("stimulus"),
  trialStatus: document.getElementById("trialStatus"),
  saveCsvBtn: document.getElementById("saveCsvBtn"),
  newSessionBtn: document.getElementById("newSessionBtn"),
  saveStatus: document.getElementById("saveStatus"),
  vasSlider: document.getElementById("vasSlider"),
  vasValue: document.getElementById("vasValue"),
  submitVasBtn: document.getElementById("submitVasBtn"),
  showResultsBtn: document.getElementById("showResultsBtn"),
  choiceButtons: Array.from(document.querySelectorAll(".choiceBtn"))
};

initializeStudyDate();

el.setupForm.addEventListener("submit", goInstructions);
el.startPracticeBtn.addEventListener("click", startPractice);
el.startMainBtn.addEventListener("click", startMain);
el.saveCsvBtn.addEventListener("click", downloadCSV);
el.newSessionBtn.addEventListener("click", () => window.location.reload());
el.vasSlider.addEventListener("input", updateVASValue);
el.submitVasBtn.addEventListener("click", submitVAS);
el.showResultsBtn.addEventListener("click", continueToResults);

el.choiceButtons.forEach((button) => {
  button.addEventListener("click", () => respond(button.dataset.color));
});

document.addEventListener("keydown", handleKeyResponse);

function goInstructions(event) {
  event.preventDefault();

  const formData = new FormData(el.setupForm);
  pid = String(formData.get("pid") || "").trim() || "ANON";
  day = formatStudyDateForBackend(currentStudyDate);
  session = String(formData.get("session") || "").trim() || "morning_before_work";
  sessionDisplay = el.sessionSelect.selectedOptions[0]?.textContent?.trim() || "Pagi, sesaat sebelum bekerja";
  switchScreen(el.setupScreen, el.instructionScreen);
  el.startPracticeBtn.focus();
}

function initializeStudyDate() {
  el.dayDisplay.value = formatStudyDateForDisplay(currentStudyDate);
}

function formatStudyDateForDisplay(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatStudyDateForBackend(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

function buildTrials(n) {
  const list = [];
  const typesPerBlock = Math.floor(n / 3);

  for (let t = 0; t < typesPerBlock; t += 1) {
    list.push(makeTrial("congruent"));
  }

  for (let t = 0; t < typesPerBlock; t += 1) {
    list.push(makeTrial("incongruent"));
  }

  for (let t = 0; t < typesPerBlock; t += 1) {
    list.push(makeTrial("neutral"));
  }

  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }

  return list;
}

function makeTrial(type) {
  if (type === "neutral") {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return { type, word: "XXXX", color };
  }

  const word = COLORS[Math.floor(Math.random() * COLORS.length)];
  let color = word;

  if (type === "incongruent") {
    do {
      color = COLORS[Math.floor(Math.random() * COLORS.length)];
    } while (color === word);
  }

  return { type, word, color };
}

function startPractice() {
  isPractice = true;
  trialList = buildTrials(6);
  currentTrialIndex = 0;
  results = [];
  el.trialStatus.textContent = "Latihan dimulai.";

  switchScreen(el.instructionScreen, el.testScreen);
  runTrial();
}

function startMain() {
  isPractice = false;
  trialList = buildTrials(36);
  currentTrialIndex = 0;
  el.trialStatus.textContent = "Tes utama dimulai.";

  switchScreen(el.practiceDoneScreen, el.testScreen);
  runTrial();
}

function runTrial() {
  if (currentTrialIndex >= trialList.length) {
    finishBlock();
    return;
  }

  const total = trialList.length;
  el.progressFill.style.width = `${Math.round((currentTrialIndex / total) * 100)}%`;
  el.trialCounter.textContent = `${isPractice ? "Latihan" : "Soal"} ${currentTrialIndex + 1} / ${total}`;

  el.stimulus.textContent = "";
  el.fixation.classList.remove("hidden");
  awaitingResponse = false;
  setChoiceDisabled(true);

  window.setTimeout(() => {
    el.fixation.classList.add("hidden");
    const trial = trialList[currentTrialIndex];
    el.stimulus.textContent = trial.word;
    el.stimulus.style.color = HEX[trial.color];
    stimulusOnsetTime = performance.now();
    awaitingResponse = true;
    setChoiceDisabled(false);

    timeoutHandle = window.setTimeout(() => {
      if (awaitingResponse) {
        respond(null);
      }
    }, 3000);
  }, 500);
}

function respond(chosenColor) {
  if (!awaitingResponse) {
    return;
  }

  awaitingResponse = false;
  clearTimeout(timeoutHandle);
  setChoiceDisabled(true);

  const rt = Math.round(performance.now() - stimulusOnsetTime);
  const trial = trialList[currentTrialIndex];
  const correct = chosenColor === trial.color;

  results.push({
    phase: isPractice ? "practice" : "main",
    trialNum: currentTrialIndex + 1,
    type: trial.type,
    word: trial.word,
    printColor: trial.color,
    response: chosenColor || "(timeout)",
    rt: chosenColor ? rt : null,
    correct: chosenColor ? correct : false
  });

  if (!chosenColor) {
    el.trialStatus.textContent = "Waktu habis untuk trial ini.";
  }

  currentTrialIndex += 1;
  runTrial();
}

function finishBlock() {
  el.testScreen.classList.add("hidden");

  if (isPractice) {
    el.practiceDoneScreen.classList.remove("hidden");
    el.startMainBtn.focus();
    return;
  }

  startPostTestFlow();
}

function startPostTestFlow() {
  pendingSummary = buildSummaryPayload();
  updateVASValue();
  switchScreen(el.testScreen, el.vasScreen);
  el.submitVasBtn.focus();
}

function buildSummaryPayload() {
  const mainResults = results.filter((row) => row.phase === "main");
  const types = ["congruent", "incongruent", "neutral"];
  const summary = {};

  for (const type of types) {
    const rows = mainResults.filter((row) => row.type === type);
    const correctRows = rows.filter((row) => row.correct && row.rt !== null);
    const meanRT = correctRows.length
      ? Math.round(correctRows.reduce((acc, row) => acc + row.rt, 0) / correctRows.length)
      : null;
    const acc = rows.length ? Math.round((100 * rows.filter((row) => row.correct).length) / rows.length) : null;

    summary[type] = { n: rows.length, meanRT, acc };
  }

  const interference =
    summary.incongruent.meanRT !== null && summary.congruent.meanRT !== null
      ? summary.incongruent.meanRT - summary.congruent.meanRT
      : null;

  const overallAcc = mainResults.length
    ? Math.round((100 * mainResults.filter((row) => row.correct).length) / mainResults.length)
    : 0;

  return {
    pid,
    day,
    session,
    sessionDisplay,
    summary,
    interference,
    overallAcc,
    mainResults,
    submittedAt: new Date().toISOString()
  };
}

function updateVASValue() {
  vasFatigueScore = Number(el.vasSlider.value);
  el.vasValue.textContent = String(vasFatigueScore);
}

function submitVAS() {
  if (isFinalSessionOfDay()) {
    switchScreen(el.vasScreen, el.questionnaireScreen);
    return;
  }

  finalizeAndShowResults(el.vasScreen);
}

function continueToResults() {
  if (!pendingSummary) {
    return;
  }

  finalizeAndShowResults(el.questionnaireScreen);
}

function finalizeAndShowResults(fromScreen) {
  if (!pendingSummary) {
    return;
  }

  summaryForExport = {
    ...pendingSummary,
    vasFatigueScore
  };

  el.saveStatus.textContent = "Menyimpan hasil ke server...";
  switchScreen(fromScreen, el.resultsScreen);

  void saveResultsToBackend(summaryForExport);
}

function isFinalSessionOfDay() {
  return session === FINAL_SESSION_CODE;
}

function downloadCSV() {
  if (!summaryForExport) {
    return;
  }

  let csv = "pid,study_date,session,phase,trialNum,type,word,printColor,response,rt_ms,correct\n";

  for (const row of results) {
    csv += [
      pid,
      day,
      sessionDisplay,
      row.phase,
      row.trialNum,
      row.type,
      row.word,
      row.printColor,
      row.response,
      row.rt ?? "",
      row.correct
    ].join(",") + "\n";
  }

  csv += "\nSUMMARY,,,,,,,,,,\n";
  csv += "type,n,meanRT_ms,accuracy_pct\n";

  for (const type of Object.keys(summaryForExport.summary)) {
    const item = summaryForExport.summary[type];
    csv += [type, item.n, item.meanRT ?? "", item.acc ?? ""].join(",") + "\n";
  }

  csv += `\nInterferenceScore_ms,${summaryForExport.interference ?? ""}\n`;
  csv += `OverallAccuracy_pct,${summaryForExport.overallAcc}\n`;
  csv += `VASFatigueScore_0_100,${summaryForExport.vasFatigueScore}\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Stroop_${pid}_${day}_${session}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function saveResultsToBackend(payload) {
  try {
    const response = await fetch(`${API_BASE}/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        participant_id: payload.pid,
        study_day: payload.day,
        session_label: payload.session,
        summary: payload.summary,
        interference_score: payload.interference,
        overall_accuracy: payload.overallAcc,
        vas_fatigue_score: payload.vasFatigueScore,
        trials: payload.mainResults,
        client_submitted_at: payload.submittedAt,
        user_agent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`
      })
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      let message = `HTTP ${response.status}`;

      if (contentType.includes("application/json")) {
        const errorData = await response.json().catch(() => ({}));
        if (typeof errorData?.detail === "string") {
          message = errorData.detail;
        } else if (errorData?.detail?.error) {
          message = `${errorData.detail.message || "Server error"}: ${errorData.detail.error}`;
        } else if (errorData?.message) {
          message = errorData.message;
        }
      } else {
        const textBody = (await response.text().catch(() => "")).trim();
        if (textBody) {
          message = textBody;
        }
      }

      throw new Error(message);
    }

    const data = await response.json();
    el.saveStatus.textContent = `Hasil tersimpan di server (id: ${data.result_id}).`;
  } catch (error) {
    el.saveStatus.textContent = `Gagal menyimpan ke server: ${error.message}. Data lokal tetap bisa diunduh via CSV.`;
  }
}

function handleKeyResponse(event) {
  if (!awaitingResponse) {
    return;
  }

  const colorMap = {
    1: "Merah",
    2: "Biru",
    3: "Hijau",
    4: "Kuning"
  };

  const color = colorMap[event.key];
  if (color) {
    event.preventDefault();
    respond(color);
  }
}

function setChoiceDisabled(disabled) {
  for (const button of el.choiceButtons) {
    button.disabled = disabled;
  }
}

function switchScreen(fromElement, toElement) {
  fromElement.classList.add("hidden");
  toElement.classList.remove("hidden");
}
