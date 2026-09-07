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

## Sign-in & cross-device sync

Sign-in is powered by [Supabase](https://supabase.com) (free tier): passwordless email magic links, no passwords stored. Users click the account icon, enter their email, and get a link back that signs them in. Once signed in, progress and stats sync automatically across devices instead of staying local to one browser.

The database schema lives in [`supabase/schema.sql`](supabase/schema.sql) — two tables, `game_progress` and `stats`, both with Row Level Security so a user can only ever read or write their own rows. The Supabase project URL and anon key live in `assets/config.js`; the anon key is meant to be public and safe to commit — access control comes entirely from the RLS policies, not from keeping it secret.

If `assets/config.js` is ever unset, the game just falls back to guest mode using `localStorage` — nothing breaks.

## Running locally

No build step. Serve the folder with any static file server (fetch requires http(s), not `file://`):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploying

Static site, deployed via GitHub Pages from the `main` branch, root folder.
