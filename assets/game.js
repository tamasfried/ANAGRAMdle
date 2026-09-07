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

  let puzzles = [];
  let puzzle = null;
  let puzzleIndex = 0;
  let state = null;

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

  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem(STATS_KEY)) || defaultStats();
    } catch {
      return defaultStats();
    }
  }

  function defaultStats() {
    return { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, distribution: [0, 0, 0, 0, 0, 0], lastWinDay: null };
  }

  function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function loadState(dayMs) {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY));
      if (saved && saved.day === dayMs) return saved;
    } catch {}
    return { day: dayMs, guesses: [], results: [], over: false, won: false, recorded: false, hintUsed: false };
  }

  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

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

  function endGame(won) {
    state.over = true;
    state.won = won;
    if (!state.recorded) {
      const stats = loadStats();
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
    if (won) {
      setMessage("🎉 Solved it!");
    } else {
      setMessage(`The answer was: ${puzzle.answer}`);
    }
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
    }
    saveState();
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
    const stats = loadStats();
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
    state = loadState(dayMs);

    categoryBadge.textContent = puzzle.category || "";
    puzzleNumberEl.textContent = `#${puzzleNumberFor(dayMs)}`;
    acronymDisplay.textContent = puzzle.acronym;
    wordCountHint.textContent = `${splitWords(puzzle.answer).length} words`;

    if (state.hintUsed) {
      hintText.textContent = puzzle.hint || "";
      hintBtn.disabled = true;
    }

    renderBoard();

    if (state.over) {
      setInputEnabled(false);
      setMessage(state.won ? "🎉 Solved it!" : `The answer was: ${puzzle.answer}`);
    }
  }

  init();
})();
