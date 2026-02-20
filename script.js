// ============================
// CONFIG
// ============================
const API_URL = "https://script.google.com/macros/s/AKfycbyJv-8G2ni8gJ-GWJlL3VqaHLIzTM7pNu4b6ZPDbu32hHZzE55JDRatWt1qn89T1jTsQQ/exec";

const GAME = "SCRAMBLE";

// IMPORTANT FIX:
// Kirim POST dengan Content-Type text/plain => NO preflight => score tidak mentok CORS.
async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok:false, error:"Bad JSON response", raw:text }; }
  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}

async function apiGet(params) {
  const url = `${API_URL}?` + new URLSearchParams(params).toString();
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}

// ============================
// SHARED UTILS
// ============================
function $(id){ return document.getElementById(id); }
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function normalize(s){ return (s||"").toUpperCase().replace(/\s+/g,""); }
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

// ============================
// FRONTEND GAME (index.html)
// ============================
const isGamePage = !!$("scrambleText");
let TERMS = []; // loaded from DB

let current = null;
let score = 0;
let streak = 0;
let timeLeft = 120;
let timerId = null;
let usedHint = false;
let soundOn = false;

const LS_PENDING = "cc_pending_scores_v2";
const LS_TOP_FALLBACK = "cc_top_fallback_v2";

function setApiStatus(text, ok=null){
  const el = $("apiStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "badge";
  if (ok===true) el.classList.add("ok");
  if (ok===false) el.classList.add("bad");
}

function setMessage(text, type=""){
  const el = $("message");
  if (!el) return;
  el.textContent = text || "";
  el.className = "message";
  if (type) el.classList.add(type);
}

function updateStats(){
  if ($("score")) $("score").textContent = String(score);
  if ($("streak")) $("streak").textContent = String(streak);
  if ($("time")) $("time").textContent = String(timeLeft);
}

function applyScore(delta){
  score = Math.max(0, score + delta);
  updateStats();
}

function pickTerm(){
  if (!TERMS.length) return null;
  return TERMS[Math.floor(Math.random()*TERMS.length)];
}

function scrambleWord(word){
  const arr = word.split("");
  shuffle(arr);
  const out = arr.join("");
  return out === word ? scrambleWord(word) : out;
}

function nextPuzzle(){
  usedHint = false;
  current = pickTerm();
  if (!current) {
    $("scrambleText").textContent = "—";
    $("categoryChip").textContent = "Keterangan: -";
    setMessage("Belum ada soal. Tambahkan istilah di Admin dulu 🧩", "bad");
    return;
  }
  $("categoryChip").textContent = `Keterangan: ${current.category || "-"}`;
  $("scrambleText").textContent = scrambleWord(current.term).split("").join(" ");
  $("answerInput").value = "";
  $("answerInput").focus();
  setMessage("Gas! Susun hurufnya 🧠");
}

function setGameEnabled(enabled){
  ["answerInput","submitBtn","hintBtn","skipBtn"].forEach(id=>{
    const el=$(id); if(el) el.disabled = !enabled;
  });
}

function startRound(){
  clearInterval(timerId);
  timeLeft = 120;
  score = 0;
  streak = 0;
  updateStats();
  setGameEnabled(true);
  nextPuzzle();

  timerId = setInterval(()=>{
    timeLeft--;
    updateStats();
    if(timeLeft<=0) endRound();
  },1000);

  setMessage("Ronde dimulai! 🔥");
}

function endRound(){
  clearInterval(timerId);
  timerId = null;
  setGameEnabled(false);
  setMessage(`Waktu habis ⏳ Skor kamu: ${score}. Simpan untuk leaderboard!`, "bad");
}

function playSfx(type){
  // (6) sound effect benar/salah
  if (!soundOn) return;
  const el = type === "correct" ? $("sfxCorrect") : $("sfxWrong");
  if (!el) return;
  try { el.currentTime = 0; el.play(); } catch {}
}

function submitAnswer(){
  if(!current) return;
  const guess = normalize($("answerInput").value);
  const correct = normalize(current.term);
  if(!guess) return setMessage("Isi jawaban dulu ✍️", "bad");

  if(guess === correct){
    const bonus = Math.min(5, streak);
    applyScore(10 + bonus);
    streak++;
    updateStats();
    setMessage(`Benar! +10 +${bonus} 🎉`, "ok");
    playSfx("correct");
    nextPuzzle();
  } else {
    streak = 0;
    updateStats();
    setMessage("Belum tepat. Coba lagi 😺", "bad");
    playSfx("wrong");
    $("answerInput").select();
  }
}

function hint(){
  if(!current) return;
  if(usedHint) return setMessage("Hint sudah dipakai 😅", "bad");
  usedHint = true;
  applyScore(-5);
  const reveal = current.term.slice(0, Math.max(1, Math.ceil(current.term.length/3)));
  setMessage(`Hint: mulai dengan "${reveal}" (-5)`, "ok");
}

function skip(){
  if(!current) return;
  applyScore(-3);
  streak = 0;
  updateStats();
  setMessage(`Skip. Jawaban: ${current.term} (-3)`, "bad");
  nextPuzzle();
}

// (5) backsound toggle (autoplay policy: harus klik)
function toggleSound(){
  soundOn = !soundOn;
  const btn = $("soundBtn");
  if (btn) btn.textContent = soundOn ? "🔊 Sound: ON" : "🔊 Sound: OFF";

  const bgm = $("bgm");
  if (!bgm) return;

  try {
    if (soundOn) { bgm.volume = 0.35; bgm.play(); }
    else { bgm.pause(); }
  } catch {}
}



// function renderLeaderboard(rows){
//   const el = $("leaderboard");
//   if(!el) return;

//   if(!rows || !rows.length){
//     el.innerHTML = `
//       <div class="row">
//         <div>-</div>
//         <div class="muted">Belum ada data</div>
//         <div class="muted">-</div>
//         <div class="right">-</div>
//         <div class="right">-</div>
//       </div>`;
//     return;
//   }

//   el.innerHTML = rows.slice(0,10).map((r,i)=>{

//     // 🎖️ Tentukan piala untuk 5 besar
//     let trophy = "";
//     if(i === 0) trophy = " 🥇";
//     else if(i === 1) trophy = " 🥈";
//     else if(i === 2) trophy = " 🥉";
//     else if(i < 5) trophy = " 🏆";

//     return `
//       <div class="row">
//         <div>${i+1}</div>
//         <div><strong>${escapeHtml(r.name||"")}</strong>${trophy}</div>
//         <div>${escapeHtml(r.unit||"")}</div>
//         <div class="right">${Number(r.score||0)}</div>
//         <div class="right">${Number(r.seconds||0)}s</div>
//       </div>
//     `;
//   }).join("");

//   localStorage.setItem(LS_TOP_FALLBACK, JSON.stringify(rows.slice(0,10)));
// }

function renderLeaderboard(rows){
  const el = $("leaderboard");
  if(!el) return;

  if(!rows || !rows.length){
    el.innerHTML = `
      <div class="row">
        <div>-</div>
        <div class="muted">Belum ada data</div>
        <div class="muted">-</div>
        <div class="right">-</div>
        <div class="right">-</div>
      </div>`;
    return;
  }

  // ==========================
  // 🔥 Filter nama unik, pilih score tertinggi
  // ==========================
  const uniqueMap = {};
  rows.forEach(r => {
    const key = normalize(r.name);
    if (!uniqueMap[key] || r.score > uniqueMap[key].score || 
       (r.score === uniqueMap[key].score && r.seconds < uniqueMap[key].seconds)) {
      uniqueMap[key] = r; // pilih score tertinggi, tie-breaker: waktu tercepat
    }
  });

  const uniqueRows = Object.values(uniqueMap);
  uniqueRows.sort((a,b) => (b.score - a.score) || (a.seconds - b.seconds));

  el.innerHTML = uniqueRows.slice(0,10).map((r,i)=>{

    // 🎖️ Tentukan piala untuk 5 besar
    let trophy = "";
    if(i === 0) trophy = " 🥇";
    else if(i === 1) trophy = " 🥈";
    else if(i === 2) trophy = " 🥉";
    else if(i < 5) trophy = " 🏆";

    return `
      <div class="row">
        <div>${i+1}</div>
        <div><strong>${escapeHtml(r.name||"")}</strong>${trophy}</div>
        <div>${escapeHtml(r.unit||"")}</div>
        <div class="right">${Number(r.score||0)}</div>
        <div class="right">${Number(r.seconds||0)}s</div>
      </div>
    `;
  }).join("");

  localStorage.setItem(LS_TOP_FALLBACK, JSON.stringify(uniqueRows.slice(0,10)));
}


function loadFallbackTop(){
  try { return JSON.parse(localStorage.getItem(LS_TOP_FALLBACK)) || []; } catch { return []; }
}
function loadPending(){
  try { return JSON.parse(localStorage.getItem(LS_PENDING)) || []; } catch { return []; }
}
function savePending(list){ localStorage.setItem(LS_PENDING, JSON.stringify(list)); }

// retry sync pending (kalau sebelumnya offline)
async function syncPending(){
  const pending = loadPending();
  if(!pending.length) return;

  const remain = [];
  for(const p of pending){
    try { await apiPost({ action:"submit", ...p }); }
    catch { remain.push(p); }
  }
  savePending(remain);
}

async function refreshTop(){
  try{
    const data = await apiGet({ action:"top", game: GAME, limit: 10 });
    renderLeaderboard(data.rows || []);
    setApiStatus("online", true);
  } catch {
    renderLeaderboard(loadFallbackTop());
    setApiStatus("offline", false);
  }
}

// (2) Load terms dari DB (public endpoint)
async function loadTerms(){
  try{
    const data = await apiGet({ action:"terms_public", game: GAME, limit: 500 });
    TERMS = (data.rows || []).map(x => ({
      term: String(x.term || "").trim(),
      category: x.category || "",
      level: x.level || "easy",
    })).filter(x => x.term && !x.term.includes(" ")); // enforce one-word
  } catch {
    TERMS = [];
  }
}

// (3) After save score: hide form, show leaderboard only
function hideSaveForm(){
  const form = $("saveForm");
  const note = $("afterSaveNote");
  if (form) form.classList.add("hidden");
  if (note) note.classList.remove("hidden");
}


async function handleSaveScore(e){
  e.preventDefault();

  const name = ($("playerName").value || "").trim();
  const unit = ($("playerUnit").value || "").trim();
  const hp = ($("playerHP").value || "").trim();

  if(!name){
    setMessage("Nama wajib diisi ✍️", "bad");
    $("playerName").focus();
    return;
  }

  if(!hp){
    setMessage("No. HP wajib diisi 📱", "bad");
    $("playerHP").focus();
    return;
  }

  const secondsPlayed = 120 - timeLeft;

  const payload = {
    name,
    unit,
    hp,              // ✅ disimpan ke database
    score,
    seconds: secondsPlayed,
    game: GAME,
    source:"web"
  };

  try{
    setMessage("Menyimpan skor…", "");
    const data = await apiPost({ action:"submit", ...payload });
    renderLeaderboard(data.top || []);
    setApiStatus("online", true);
    setMessage("Skor tersimpan ✅", "ok");
    hideSaveForm();
  } catch (err){
    const pending = loadPending();
    pending.push(payload);
    savePending(pending);
    setApiStatus("offline", false);
    setMessage("API offline. Skor disimpan lokal.", "bad");
    hideSaveForm();
  }

  $("playerName").value = "";
  $("playerUnit").value = "";
  $("playerHP").value = "";
}


// Init game page
async function initGame(){
  setApiStatus("checking…");
  renderLeaderboard(loadFallbackTop());

  await syncPending();
  await refreshTop();

  await loadTerms();          // (2) ambil soal dari DB
  startRound();

  $("submitBtn").addEventListener("click", submitAnswer);
  $("answerInput").addEventListener("keydown", (e)=>{ if(e.key==="Enter") submitAnswer(); });
  $("hintBtn").addEventListener("click", hint);
  $("skipBtn").addEventListener("click", skip);
  $("resetBtn").addEventListener("click", startRound);
  $("saveForm").addEventListener("submit", handleSaveScore);

  const soundBtn = $("soundBtn");
  if (soundBtn) soundBtn.addEventListener("click", toggleSound);
}




// ============================
// ADMIN PAGE (admin.html)
// ============================
const isAdminPage = !!$("termsTable");

// function getAdminKey(){
//   return sessionStorage.getItem("cc_admin_key") || "";
// }
// function setAdminKey(k){
//   sessionStorage.setItem("cc_admin_key", k);
// }
function getAdminKey(){
  return (sessionStorage.getItem("cc_admin_key") || "").trim();
}
function setAdminKey(k){
  sessionStorage.setItem("cc_admin_key", String(k || "").trim());
}


function adminMsgAdd(text, type=""){
  const el = $("adminMsgAdd");
  if(!el) return;
  el.textContent = text || "";
  el.className = "message mini";
  if(type) el.classList.add(type);
}



async function adminList(){
  const adminKey = getAdminKey();
  if(!adminKey) return adminMsg("Isi ADMIN KEY dulu.", "bad");
  try{
    const data = await apiPost({ action:"terms_list", adminKey });
    renderTermsTable(data.rows || []);
    adminMsg("Loaded ✅", "ok");
  } catch (e){
    adminMsg("Gagal load: " + String(e.message || e), "bad");
  }
}

function renderTermsTable(rows){
  const el = $("termsTable");
  if(!rows.length){
    el.innerHTML = `<div class="row"><div>-</div><div class="muted">Belum ada istilah</div></div>`;
    return;
  }

  el.innerHTML = rows.map(r => `
    <div class="row" style="grid-template-columns: 60px 1.4fr 1fr .7fr .7fr 80px 80px;">
      <div>${r.id}</div>
      <div>${escapeHtml(r.term)}</div>
      <div>${escapeHtml(r.category||"")}</div>
      <div>${escapeHtml(r.level||"")}</div>
      <div>${r.active ? "TRUE" : "FALSE"}</div>
      <div class="right"><button class="ghost" data-toggle="${r.id}" data-active="${!r.active}">Toggle</button></div>
      <div class="right"><button class="danger" data-del="${r.id}">Delete</button></div>
    </div>
  `).join("");

  el.querySelectorAll("button[data-toggle]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const adminKey = getAdminKey();
      const id = btn.getAttribute("data-toggle");
      const active = btn.getAttribute("data-active") === "true";
      try{
        await apiPost({ action:"terms_toggle", adminKey, id, active });
        await adminList();
      } catch(e){
        adminMsg("Toggle gagal: " + (e.message||e), "bad");
      }
    });
  });

  el.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const adminKey = getAdminKey();
      const id = btn.getAttribute("data-del");
      try{
        await apiPost({ action:"terms_delete", adminKey, id });
        await adminList();
      } catch(e){
        adminMsg("Delete gagal: " + (e.message||e), "bad");
      }
    });
  });
}

async function adminAdd(e){
  e.preventDefault();
  const adminKey = getAdminKey();
  if(!adminKey) return adminMsgAdd("Isi ADMIN KEY dulu.", "bad");

  const term = ($("term").value || "").trim();
  const category = ($("category").value || "").trim();
  const level = $("level").value;
  const active = $("active").value;

  if(!term) return adminMsgAdd("Term wajib diisi.", "bad");
  if(term.includes(" ")) return adminMsgAdd("Term harus 1 kata (tanpa spasi).", "bad");

  try{
    // await apiPost({ action:"terms_add", adminKey, term, category, level, active });
    await apiPost({ action:"terms_add", adminKey, term, category, level, active });
    adminMsgAdd("Berhasil tambah ✅", "ok");
    $("term").value = "";
    $("category").value = "";
    await adminList();
  } catch(e){
    adminMsgAdd("Gagal tambah: " + (e.message||e), "bad");
  }
}

function initAdmin(){
  // preload key
  $("adminKey").value = getAdminKey();

  // $("saveKeyBtn").addEventListener("click", ()=>{
  //   setAdminKey(($("adminKey").value||"").trim());
  //   adminMsg("Admin key tersimpan di session ✅", "ok");
  // });

  $("saveKeyBtn").addEventListener("click", ()=>{
    const k = ($("adminKey").value || "").trim();
    setAdminKey(k);
    adminMsgAdd(k ? "Admin key tersimpan ✅" : "Admin key masih kosong.", k ? "ok" : "bad");
  });


  $("addForm").addEventListener("submit", adminAdd);
  $("refreshBtn").addEventListener("click", adminList);

  // auto load if key exists
  if(getAdminKey()) adminList();
}

// ============================
// BOOT
// ============================
(async function(){
  if(isGamePage) await initGame();
  if(isAdminPage) initAdmin();
})();




























