  // ============================
// Production: Pelindo Scramble + Online Leaderboard (Google Sheets)
// ============================

// 1) SET THIS:
const API_URL = "https://script.google.com/macros/s/AKfycbydSckHvwKfifxA8shfCaHCxX_DCvIGw4hDd4wkbv1D3ShQTAbG2voIHPTY2Go7N5AB/exec";

// Game ID (for leaderboard separation)
const GAME = "SCRAMBLE";
const bgm = document.getElementById("bgm");
bgm.volume = 0.3;
bgm.play().catch(()=>{});
const sfxCorrect = document.getElementById("sfxCorrect");
const sfxWrong = document.getElementById("sfxWrong");

// Word bank
const WORD_BANK = [
  { answer: "PELINDO", category: "Brand" },
  { answer: "AKHLAK", category: "Values" },
  { answer: "PELABUHAN", category: "Maritim" },
  { answer: "LOGISTIK", category: "Operasional" },
  { answer: "TERMINAL", category: "Maritim" },
  { answer: "KONEKTIVITAS", category: "Strategi" },
  { answer: "LAYANAN", category: "Service" },
  { answer: "KESELAMATAN", category: "HSSE" },
  { answer: "INTEGRASI", category: "Transformasi" },
  { answer: "KOLABORASI", category: "Culture" },
  { answer: "RESILIENSI", category: "Port Resilience" },
];

// let WORD_BANK = [];

// async function loadQuestions() {
//   const res = await fetch(`${API_URL}?action=questions`);
//   const data = await res.json();
//   WORD_BANK = data.rows.map(r => ({
//     answer: r.term,
//     category: r.category
//   }));
// }


// Config
const ROUND_SECONDS = 60;
const POINT_CORRECT = 10;
const PENALTY_HINT = 5;
const PENALTY_SKIP = 3;

// State
let current = null;
let score = 0;
let streak = 0;
let timeLeft = ROUND_SECONDS;
let timerId = null;
let usedHint = false;

// UI
const elScore = document.getElementById("score");
const elStreak = document.getElementById("streak");
const elTime = document.getElementById("time");
const elScramble = document.getElementById("scrambleText");
const elCategory = document.getElementById("categoryChip");
const elInput = document.getElementById("answerInput");
const elMsg = document.getElementById("message");

const btnSubmit = document.getElementById("submitBtn");
const btnHint = document.getElementById("hintBtn");
const btnSkip = document.getElementById("skipBtn");
const btnReset = document.getElementById("resetBtn");

const saveForm = document.getElementById("saveForm");
const playerName = document.getElementById("playerName");
const playerUnit = document.getElementById("playerUnit");
const leaderboardEl = document.getElementById("leaderboard");
const apiStatus = document.getElementById("apiStatus");
document.getElementById("saveSection").style.display = "none";


// Local fallback keys
const LS_FALLBACK_TOP = "cc_prod_top_fallback_v1";
const LS_PENDING = "cc_prod_pending_submits_v1";

// ---------- Helpers ----------
function normalize(s) {
  return (s || "").toUpperCase().replace(/\s+/g, "");
}
function shuffleString(str) {
  const arr = str.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}
function pickWord() {
  const item = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
  const scr = shuffleString(item.answer);
  return { ...item, scramble: scr === item.answer ? shuffleString(item.answer) : scr };
}
function setMessage(text, type = "") {
  elMsg.textContent = text || "";
  elMsg.className = "message";
  if (type) elMsg.classList.add(type);
}
function updateStats() {
  elScore.textContent = String(score);
  elStreak.textContent = String(streak);
  elTime.textContent = String(timeLeft);
}
function setGameEnabled(enabled) {
  elInput.disabled = !enabled;
  btnSubmit.disabled = !enabled;
  btnHint.disabled = !enabled;
  btnSkip.disabled = !enabled;
}
function applyScore(delta) {
  score = Math.max(0, score + delta);
  updateStats();
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- Game ----------
function nextPuzzle() {
  usedHint = false;
  current = pickWord();
  elScramble.textContent = current.scramble.split("").join(" ");
  elCategory.textContent = `Kategori: ${current.category}`;
  elInput.value = "";
  elInput.focus();
  setMessage("Susun hurufnya! 🧠");
}

function startRound() {
  clearInterval(timerId);
  timeLeft = ROUND_SECONDS;
  score = 0;
  streak = 0;
  updateStats();
  setGameEnabled(true);
  nextPuzzle();

  timerId = setInterval(() => {
    timeLeft -= 1;
    updateStats();
    if (timeLeft <= 0) endRound();
  }, 1000);

  setMessage("Ronde dimulai! 🔥");
}

function endRound() {
  clearInterval(timerId);
  timerId = null;
  setGameEnabled(false);
  setMessage(`Waktu habis ⏳ Skor kamu: ${score}. Isi nama & simpan untuk leaderboard!`, "bad");
}

function submitAnswer() {
  if (!current) return;
  const guess = normalize(elInput.value);
  if (!guess) return setMessage("Isi jawaban dulu ya ✍️", "bad");

  const correct = normalize(current.answer);
  if (guess === correct) {
    const bonus = Math.min(5, streak);
    applyScore(POINT_CORRECT + bonus);
    sfxCorrect.currentTime = 0;
    sfxCorrect.play();
    streak += 1;
    updateStats();
    setMessage(`Benar! +${POINT_CORRECT}+${bonus} 🎉`, "ok");
    nextPuzzle();
  } else {
    streak = 0;
    updateStats();
    setMessage("Belum tepat. Coba lagi 😺", "bad");
    elInput.select();
    sfxWrong.currentTime = 0;
    sfxWrong.play();
  }
}

function showHint() {
  if (!current) return;
  if (usedHint) return setMessage("Hint sudah dipakai untuk soal ini 😅", "bad");
  usedHint = true;
  applyScore(-PENALTY_HINT);
  const ans = current.answer;
  const revealCount = Math.max(1, Math.ceil(ans.length / 3));
  const revealed = ans.slice(0, revealCount);
  setMessage(`Hint: mulai dengan "${revealed}" (-${PENALTY_HINT})`, "ok");
  elInput.focus();
}

function skipPuzzle() {
  if (!current) return;
  applyScore(-PENALTY_SKIP);
  streak = 0;
  updateStats();
  setMessage(`Skip. Jawaban: ${current.answer} (-${PENALTY_SKIP})`, "bad");
  nextPuzzle();
}

// ---------- Online Leaderboard API ----------
function setApiStatus(text, ok = null) {
  apiStatus.textContent = text;
  apiStatus.className = "badge";
  if (ok === true) apiStatus.classList.add("ok");
  if (ok === false) apiStatus.classList.add("bad");
}

async function apiGetTop() {
  if (!API_URL || API_URL.includes("PASTE_")) throw new Error("API_URL not set");

  const url = `${API_URL}?action=top&game=${encodeURIComponent(GAME)}&limit=10`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");
  return data.rows || [];
}


async function apiSubmitScore(payload) {
  if (!API_URL || API_URL.includes("PASTE_")) throw new Error("API_URL not set");

  const body = new URLSearchParams();
  body.set("action", "submit");
  body.set("name", payload.name);
  body.set("unit", payload.unit || "");
  body.set("score", String(payload.score));
  body.set("seconds", String(payload.seconds));
  body.set("game", payload.game || "SCRAMBLE");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Submit failed");
  return data.top || [];
}

// async function apiSubmitScore(payload) {
//   if (!API_URL || API_URL.includes("PASTE_")) throw new Error("API_URL not set");

//   const res = await fetch(API_URL, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ action: "submit", ...payload }),
//   });
//   const data = await res.json();
//   if (!data.ok) throw new Error(data.error || "Submit failed");
//   return data.top || [];
// }

function renderLeaderboard(rows) {
  if (!rows || !rows.length) {
    leaderboardEl.innerHTML =
      `<div class="row"><div>-</div><div class="muted">Belum ada data</div><div class="muted">-</div><div class="right">-</div><div class="right">-</div></div>`;
    return;
  }

  leaderboardEl.innerHTML = rows.slice(0, 10).map((r, idx) => `
    <div class="row">
      <div>${idx + 1}</div>
      <div>${escapeHtml(r.name || "")}</div>
      <div>${escapeHtml(r.unit || "")}</div>
      <div class="right">${Number(r.score || 0)}</div>
      <div class="right">${Number(r.seconds || 0)}s</div>
    </div>
  `).join("");

  // cache fallback
  localStorage.setItem(LS_FALLBACK_TOP, JSON.stringify(rows.slice(0, 10)));
}

function loadFallbackTop() {
  try { return JSON.parse(localStorage.getItem(LS_FALLBACK_TOP)) || []; }
  catch { return []; }
}

function loadPending() {
  try { return JSON.parse(localStorage.getItem(LS_PENDING)) || []; }
  catch { return []; }
}
function savePending(list) {
  localStorage.setItem(LS_PENDING, JSON.stringify(list));
}

// try re-sync pending submits
async function syncPending() {
  const pending = loadPending();
  if (!pending.length) return;

  const remaining = [];
  for (const p of pending) {
    try {
      await apiSubmitScore(p);
    } catch {
      remaining.push(p);
    }
  }
  savePending(remaining);
}

// async function syncPending() {
//   const pending = loadPending();
//   if (!pending.length) return;

//   // attempt sequentially
//   const remaining = [];
//   for (const p of pending) {
//     try {
//       await apiSubmitScore(p);
//     } catch {
//       remaining.push(p);
//     }
//   }
//   savePending(remaining);
// }

async function refreshTop() {
  try {
    const rows = await apiGetTop();
    renderLeaderboard(rows);
    setApiStatus("online", true);
  } catch (err) {
    // fallback
    renderLeaderboard(loadFallbackTop());
    setApiStatus("offline", false);
  }
}

function doPost(e) {
  try {
    // support both: form-urlencoded and JSON
    let payload = {};
    if (e && e.parameter && e.parameter.action) {
      payload = {
        action: e.parameter.action,
        name: e.parameter.name,
        unit: e.parameter.unit,
        score: e.parameter.score,
        seconds: e.parameter.seconds,
        game: e.parameter.game,
      };
    } else {
      payload = safeJsonParse(e.postData && e.postData.contents);
    }

    const action = (payload.action || "").toLowerCase();
    if (action === "submit") return json(submitScore(payload, e));
    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}


// Save score handler
async function handleSave(e) {
  e.preventDefault();

  const name = (playerName.value || "").trim();
  const unit = (playerUnit.value || "").trim();

  if (!name) {
    setMessage("Nama wajib diisi untuk simpan skor ✍️", "bad");
    playerName.focus();
    return;
  }

  const secondsPlayed = ROUND_SECONDS - timeLeft;

  const payload = {
    name,
    unit,
    score,
    seconds: secondsPlayed,
    game: GAME,
  };

  // If API works, submit; else queue
  try {
    setMessage("Menyimpan ke leaderboard online…", "");
    const top = await apiSubmitScore(payload);
    renderLeaderboard(top);
    setApiStatus("online", true);
    setMessage("Skor tersimpan ✅ (online)", "ok");
  } catch (err) {
    const pending = loadPending();
    pending.push(payload);
    savePending(pending);
    setApiStatus("offline", false);
    setMessage("API sedang offline. Skor disimpan lokal dan akan dicoba sync saat refresh ✅", "bad");
  }

  playerName.value = "";
  playerUnit.value = "";
}

// ---------- Wire up ----------
btnSubmit.addEventListener("click", submitAnswer);
elInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitAnswer(); });

btnHint.addEventListener("click", showHint);
btnSkip.addEventListener("click", skipPuzzle);
btnReset.addEventListener("click", startRound);

saveForm.addEventListener("submit", handleSave);

// ---------- Init ----------
(async function init() {
  setApiStatus("checking…");
  renderLeaderboard(loadFallbackTop());
  await syncPending();
  await refreshTop();
  await loadQuestions();
  setInterval(async () => {
    await syncPending();
    await refreshTop();
  }, 10000);
  startRound();
})();








