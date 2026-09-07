# ANAGRAMdle

A daily Wordle-style guessing game: you're shown an acronym or initialism (USB, NASA, LASER…) and have 6 tries to guess the full phrase it stands for.

## How it works

- Everyone gets the same puzzle on a given calendar day (UTC), picked deterministically from `data/puzzles.json` so no backend or database is needed.
- Each guess is checked **word by word**, Wordle-style: a word tile is green if it's the right word in the right position, yellow if it appears elsewhere in the answer, grey otherwise.
- Progress and stats (streak, win %, guess distribution) are stored in the browser's `localStorage` — nothing leaves the device.
- Results can be shared as an emoji grid, just like Wordle.

## Project structure

```
index.html          Page markup + modals (how to play / stats)
assets/style.css     Styling, light/dark mode via prefers-color-scheme
assets/game.js       Game logic: puzzle selection, guess checking, stats, sharing
data/puzzles.json    The puzzle bank
```

## Adding puzzles

Append an entry to `data/puzzles.json`:

```json
{ "acronym": "USB", "answer": "Universal Serial Bus", "category": "Technology", "hint": "Plug it in, plug it in" }
```

The daily puzzle index is `days since 2024-01-01 mod puzzles.length`, so puzzles cycle in file order — add new ones at the end so past puzzle numbers stay stable for anyone who already played them. Only add real, verifiable acronyms/initialisms — the game shows the answer as fact.

## Running locally

No build step. Serve the folder with any static file server (fetch requires http(s), not `file://`):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploying

This is a static site, so it deploys as-is to GitHub Pages: repo Settings → Pages → deploy from the `main` branch, root folder.
