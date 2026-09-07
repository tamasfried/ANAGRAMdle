(() => {
  const MAX_GUESSES = 6;
  const EPOCH = Date.UTC(2024, 0, 1); // puzzle #1
  const STATE_KEY = "anagramdle-state";
  const STATS_KEY = "anagramdle-stats";

  const el = (id) => document.getElementById(id);
  const acronymDisplay = el("acronym-display");
  const wordCountHint = el("word-count-hint");
  const board = el("board");
  const guessForm = el("guess-form");
  const guessInput = el("guess-input");
  const submitBtn = el("submit-btn");
  const message = el("message");
  const hintBtn = el("hint-btn");
  const hintText = el("hint-text");
  const categoryBadge = el("category-badge");
  const puzzleNumberEl = el("puzzle-number");
  const accountBtn = el("account-btn");

  let puzzles = [];
  let puzzle = null;
  let puzzleIndex = 0;
  let state = null;
  let sb = null; // supabase client
  let currentUser = null;

  // ---------- date / puzzle helpers ----------

  function todayKey() {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function puzzleNumberFor(dayMs) {
    return Math.floor((dayMs - EPOCH) / 86400000) + 1;
  }

  function normalizeWord(w) {
    return w.toLowerCase().replace(/[^a-z0-9']/g, "");
  }

  function splitWords(phrase) {
    return phrase.trim().split(/\s+/).filter(Boolean);
  }

  // ---------- local storage (always the fast local cache) ----------

  function defaultStats() {
    return { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, distribution: [0, 0, 0, 0, 0, 0] };
  }

  function loadStatsLocal() {
    try {
      return JSON.parse(localStorage.getItem(STATS_KEY)) || defaultStats();
    } catch {
      return defaultStats();
    }
  }

  function saveStatsLocal(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function defaultState(dayMs) {
    return { day: dayMs, guesses: [], results: [], over: false, won: false, recorded: false, hintUsed: false };
  }

  function loadStateLocal(dayMs) {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY));
      if (saved && saved.day === dayMs) return saved;
    } catch {}
    return defaultState(dayMs);
  }

  function saveStateLocal() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  // ---------- public save wrappers: local cache + best-effort cloud sync ----------

  function saveState() {
    saveStateLocal();
    if (currentUser) upsertRemoteProgress().catch((err) => console.error("sync progress failed", err));
  }

  function saveStats(stats) {
    saveStatsLocal(stats);
    if (currentUser) upsertRemoteStats(stats).catch((err) => console.error("sync stats failed", err));
  }

  // ---------- Supabase sync ----------

  function initSupabase() {
    const cfg = window.ANAGRAMDLE_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL === "YOUR_SUPABASE_URL") {
      return; // guest-only mode: no config provided
    }
    if (!window.supabase || !window.supabase.createClient) {
      console.warn("Supabase library failed to load; running in guest-only mode.");
      return;
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    sb.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      updateAccountUI();
      if (event === "SIGNED_OUT") {
        localStorage.removeItem(STATE_KEY);
        localStorage.removeItem(STATS_KEY);
        location.reload();
        return;
      }
      if (currentUser) {
        mergeRemoteIntoLocal().catch((err) => console.error("merge failed", err));
      }
    });
  }

  async function upsertRemoteProgress() {
    if (!sb || !currentUser) return;
    await sb.from("game_progress").upsert({
      id: currentUser.id,
      puzzle_day: puzzleNumberFor(state.day),
      guesses: state.guesses,
      results: state.results,
      over: state.over,
      won: state.won,
      hint_used: state.hintUsed,
      updated_at: new Date().toISOString(),
    });
  }

  async function upsertRemoteStats(stats) {
    if (!sb || !currentUser) return;
    await sb.from("stats").upsert({
      id: currentUser.id,
      played: stats.played,
      wins: stats.wins,
      current_streak: stats.currentStreak,
      max_streak: stats.maxStreak,
      distribution: stats.distribution,
      updated_at: new Date().toISOString(),
    });
  }

  async function mergeRemoteIntoLocal() {
    if (!sb || !currentUser || !puzzle) return;

    const [{ data: remoteProgress }, { data: remoteStats }] = await Promise.all([
      sb.from("game_progress").select("*").eq("id", currentUser.id).maybeSingle(),
      sb.from("stats").select("*").eq("id", currentUser.id).maybeSingle(),
    ]);

    const todayDayMs = todayKey();
    const todayNum = puzzleNumberFor(todayDayMs);

    // Stats: remote wins if it exists; otherwise migrate up any local guest progress.
    let stats = loadStatsLocal();
    if (remoteStats) {
      stats = {
        played: remoteStats.played,
        wins: remoteStats.wins,
        currentStreak: remoteStats.current_streak,
        maxStreak: remoteStats.max_streak,
        distribution: remoteStats.distribution,
      };
      saveStatsLocal(stats);
    } else if (stats.played > 0) {
      await upsertRemoteStats(stats);
    }

    // Progress: remote wins if it's for today; otherwise push up any local guest progress.
    if (remoteProgress && remoteProgress.puzzle_day === todayNum) {
      state = {
        day: todayDayMs,
        guesses: remoteProgress.guesses || [],
        results: remoteProgress.results || [],
        over: remoteProgress.over,
        won: remoteProgress.won,
        recorded: remoteProgress.over,
        hintUsed: remoteProgress.hint_used,
      };
      saveStateLocal();
    } else if (state.day === todayDayMs && state.guesses.length > 0) {
      await upsertRemoteProgress();
    }

    renderBoard();
    applyStateToUI();
    if (!el("stats-modal").classList.contains("hidden")) renderStats();
  }

  // ---------- account UI ----------

  function updateAccountUI() {
    const signedOut = el("account-signed-out");
    const signedIn = el("account-signed-in");
    if (currentUser) {
      signedOut.classList.add("hidden");
      signedIn.classList.remove("hidden");
      el("account-email").textContent = currentUser.email;
      accountBtn.classList.add("signed-in");
    } else {
      signedOut.classList.remove("hidden");
      signedIn.classList.add("hidden");
      accountBtn.classList.remove("signed-in");
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    if (!sb) {
      el("signin-message").textContent = "Sign-in isn't set up yet — see README for Supabase setup.";
      return;
    }
    const email = el("signin-email").value.trim();
    if (!email) return;
    const btn = el("signin-btn");
    btn.disabled = true;
    el("signin-message").textContent = "Sending…";
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    btn.disabled = false;
    el("signin-message").textContent = error ? `Error: ${error.message}` : "Check your email for a sign-in link!";
  }

  async function handleSignOut() {
    if (!sb) return;
    await sb.auth.signOut();
  }

  // ---------- game logic ----------

  function compareGuess(guessWords, answerWords) {
    const result = new Array(guessWords.length).fill("absent");
    const pool = {};
    const answerNorm = answerWords.map(normalizeWord);
    const guessNorm = guessWords.map(normalizeWord);
    const used = new Array(answerWords.length).fill(false);

    guessNorm.forEach((w, i) => {
      if (i < answerNorm.length && w === answerNorm[i]) {
        result[i] = "correct";
        used[i] = true;
      }
    });

    answerNorm.forEach((w, i) => {
      if (!used[i]) pool[w] = (pool[w] || 0) + 1;
    });

    guessNorm.forEach((w, i) => {
      if (result[i] === "correct") return;
      if (pool[w] > 0) {
        result[i] = "present";
        pool[w] -= 1;
      }
    });

    return result;
  }

  function renderBoard() {
    board.innerHTML = "";
    state.guesses.forEach((guessWords, rowIdx) => {
      const row = document.createElement("div");
      row.className = "guess-row";
      guessWords.forEach((word, i) => {
        const tile = document.createElement("span");
        tile.className = `tile ${state.results[rowIdx][i]}`;
        tile.textContent = word;
        row.appendChild(tile);
      });
      board.appendChild(row);
    });
  }

  function setMessage(text, timeout) {
    message.textContent = text;
    if (timeout) setTimeout(() => { if (message.textContent === text) message.textContent = ""; }, timeout);
  }

  function applyStateToUI() {
    setInputEnabled(!state.over);
    if (state.hintUsed) {
      hintText.textContent = puzzle.hint || "";
      hintBtn.disabled = true;
    } else {
      hintText.textContent = "";
      hintBtn.disabled = false;
    }
    if (state.over) {
      setMessage(state.won ? "🎉 Solved it!" : `The answer was: ${puzzle.answer}`);
    } else {
      message.textContent = "";
    }
  }

  function endGame(won) {
    state.over = true;
    state.won = won;
    if (!state.recorded) {
      const stats = loadStatsLocal();
      stats.played += 1;
      if (won) {
        stats.wins += 1;
        stats.currentStreak += 1;
        stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
        stats.distribution[state.guesses.length - 1] += 1;
      } else {
        stats.currentStreak = 0;
      }
      saveStats(stats);
      state.recorded = true;
    }
    saveState();
    setInputEnabled(false);
    setMessage(won ? "🎉 Solved it!" : `The answer was: ${puzzle.answer}`);
    setTimeout(openStats, 900);
  }

  function setInputEnabled(enabled) {
    guessInput.disabled = !enabled;
    submitBtn.disabled = !enabled;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (state.over) return;
    const raw = guessInput.value;
    if (!raw.trim()) return;
    const guessWords = splitWords(raw);
    const answerWords = splitWords(puzzle.answer);

    if (guessWords.length !== answerWords.length) {
      setMessage(`Expected ${answerWords.length} words, got ${guessWords.length}`, 2000);
      return;
    }

    const result = compareGuess(guessWords, answerWords);
    state.guesses.push(guessWords);
    state.results.push(result);
    guessInput.value = "";
    renderBoard();

    const won = result.every((r) => r === "correct");
    if (won || state.guesses.length >= MAX_GUESSES) {
      endGame(won);
    } else {
      saveState();
    }
  }

  function revealHint() {
    hintText.textContent = puzzle.hint || "No hint for this one.";
    state.hintUsed = true;
    hintBtn.disabled = true;
    saveState();
  }

  function msUntilNextPuzzle() {
    const now = new Date();
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return next - now.getTime();
  }

  function formatCountdown(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `Next puzzle in ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  let countdownTimer = null;
  function startCountdown() {
    const countdownEl = el("countdown");
    clearInterval(countdownTimer);
    const tick = () => { countdownEl.textContent = formatCountdown(msUntilNextPuzzle()); };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function renderStats() {
    const stats = loadStatsLocal();
    el("stat-played").textContent = stats.played;
    el("stat-winpct").textContent = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    el("stat-streak").textContent = stats.currentStreak;
    el("stat-maxstreak").textContent = stats.maxStreak;

    const dist = el("guess-distribution");
    dist.innerHTML = "";
    const maxCount = Math.max(1, ...stats.distribution);
    stats.distribution.forEach((count, i) => {
      const row = document.createElement("div");
      row.className = "dist-row";
      const isCurrentRow = state.over && state.won && state.guesses.length - 1 === i;
      row.innerHTML = `<span>${i + 1}</span><div class="dist-bar${isCurrentRow ? " win" : ""}" style="width:${Math.max(8, (count / maxCount) * 100)}%">${count}</div>`;
      dist.appendChild(row);
    });

    const shareSection = el("share-section");
    if (state.over) {
      shareSection.classList.remove("hidden");
      startCountdown();
    } else {
      shareSection.classList.add("hidden");
    }
  }

  function buildShareText() {
    const num = puzzleNumberFor(state.day);
    const scoreLabel = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const emojiMap = { correct: "🟩", present: "🟨", absent: "⬜" };
    const lines = state.results.map((row) => row.map((r) => emojiMap[r]).join(""));
    return [`ANAGRAMdle #${num} ${scoreLabel}`, "", ...lines].join("\n");
  }

  async function shareResult() {
    const text = buildShareText();
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Result copied to clipboard!", 2000);
    } catch {
      setMessage("Couldn't copy — here's your result:\n" + text, 4000);
    }
  }

  function openModal(id) { el(id).classList.remove("hidden"); }
  function closeModal(id) { el(id).classList.add("hidden"); }
  function openStats() { renderStats(); openModal("stats-modal"); }

  function wireUpUI() {
    guessForm.addEventListener("submit", handleSubmit);
    hintBtn.addEventListener("click", revealHint);
    el("help-btn").addEventListener("click", () => openModal("help-modal"));
    el("stats-btn").addEventListener("click", openStats);
    accountBtn.addEventListener("click", () => openModal("account-modal"));
    el("signin-form").addEventListener("submit", handleSignIn);
    el("signout-btn").addEventListener("click", handleSignOut);
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
    });
    el("share-btn").addEventListener("click", shareResult);
  }

  async function init() {
    wireUpUI();
    const res = await fetch("data/puzzles.json");
    puzzles = await res.json();

    const dayMs = todayKey();
    puzzleIndex = ((puzzleNumberFor(dayMs) - 1) % puzzles.length + puzzles.length) % puzzles.length;
    puzzle = puzzles[puzzleIndex];
    state = loadStateLocal(dayMs);

    categoryBadge.textContent = puzzle.category || "";
    puzzleNumberEl.textContent = `#${puzzleNumberFor(dayMs)}`;
    acronymDisplay.textContent = puzzle.acronym;
    wordCountHint.textContent = `${splitWords(puzzle.answer).length} words`;

    renderBoard();
    applyStateToUI();

    initSupabase();
  }

  init();
})();
