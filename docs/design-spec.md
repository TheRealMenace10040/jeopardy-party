# Jeopardy Party — Design Spec

Status: draft for approval · 2026-10-30

## Purpose

A party-friendly Jeopardy-style web app. One host runs the game; the board shows on a shared TV; up to six teams play on their phones.

**Guiding principle:** easy to set up and easy to understand. Every setting has a sensible default, labels are plain language, and each rule has a one-line explanation next to it.

## Screens

| Screen | Device | Shows |
|---|---|---|
| **Host controls** | Host's phone / tablet / laptop | Game setup, correct responses, ✓/✗ judging, undo, score adjust, "Show on TV" |
| **TV view** | Shared display | Board, clue (incl. photo), who buzzed, scores, Final Jeopardy reveal, podium. Never shows correct responses before reveal |
| **Team buzzer** | Each team's phone | Full-screen buzzer, team score, wager and Final Jeopardy inputs |

### Getting the TV view onto the TV

- **"Open TV view here"** on the host device (for laptop + HDMI; F11 fullscreen).
- **"Show on TV"** displays a short URL (`<domain>/tv`) and a 4-character pairing code. Any TV browser, cast tab or AirPlay mirror can open it.
- The TV view auto-reconnects to its room if the connection drops.
- TV display lag never affects fairness: buzz order is decided on the server.

## Joining

- Teams join with a **QR code** (shown on the TV lobby) or a **short room code**. No sign-in for players.
- Up to **6 teams**. Each picks a name and gets a distinct team color (used on their phone, the buzz banner and the scoreboard).
- **Reconnect:** a phone that locks or reloads rejoins the same team slot with its score intact (team token stored on the device).

## Board and values

- Host chooses **3–6 categories × 3–5 clues**. New games default to **6×5**.
- Values step by $200: $200, $400, … up to $1,000.
- Each clue: text, optional **photo**, correct response.
- Played clues go blank on the board.

## Turn flow

1. The team with **board control** picks a clue (host taps it). The TV highlights the controlling team. Host chooses who starts.
2. TV shows the clue. Buzzers are **locked** while the host reads.
3. Host taps **"Open buzzers"**. Phones switch to the team color: **BUZZ!**
   - Buzzing before buzzers open = **0.25 s lockout** ("Too early!").
4. Server records the **first buzz**. TV shows that team; their phone turns gold and vibrates (Android; iPhone gets the flash only).
5. Host judges the spoken answer: **✓ Correct** or **✗ Incorrect**.
   - ✓ → team gains the value and takes board control.
   - ✗ → team loses the value (if penalty is on) and is **locked out** for this clue; buzzers re-open for the remaining eligible teams.
6. If nobody is right (or host ends the clue), the TV shows the correct response; board control stays with the picker.
7. **Undo** reverts the last judgement; **adjust score** edits any team's score directly.

## Scoring settings

| Setting | Default | Plain-language label |
|---|---|---|
| Lose points for wrong answers | **On** | "Wrong answers subtract the clue's value" |
| Daily Doubles | **On** | "Hidden clues where a team bets its own points" |

Scores can go negative when the penalty is on.

## Daily Doubles

- Placed **randomly** by the app: **1** per board, or **2** when the board has ≥20 clues. Never in the cheapest row. Re-rolled per game session.
- Reveal moment on the TV. Only the picking team answers; no buzzing.
- Wager on the team's phone with quick buttons (+$100, +$500, All in). Max = greater of the team's score or the board's top clue value; min $5.

## Final Jeopardy

1. **Category** shown on the TV. Each phone enters a **private wager** (0 to current score). TV shows "3 of 4 teams locked in ✓". No wager in time → $0.
2. **Clue** revealed; **30 s** countdown. Phones type a response privately; locks at zero. Host can add time.
3. **Reveal** from lowest score to highest: host sees each response beside the correct one and taps ✓/✗; TV shows response → wager → new score.
4. **Podium**: final standings and winner celebration.

Teams at **$0 or below still play**: wager fixed at $0, response is still revealed ("Answer for bragging rights!").

## Hosts, saving and reuse

- Hosts sign in with **Google only**. Players never sign in.
- **My games**: create, edit, duplicate, delete.
- **Export / Import** a game as a file (backup or sharing).
- Photos stored in the cloud with the game.

## Visual style

- **Classic TV**: deep blue tiles, gold values, bold uppercase category headers.
- Per-team accent colors.
- TV typography sized to read from ~4 m.
- Team phone: whole screen is the buzzer, states by color — locked (gray), open (team color), won buzz (gold), locked out (dark red). Score in a top bar.
- Screen kept awake during play where supported (Wake Lock API).

## Technical design

- **Frontend:** single-page web app, hosted on **Vercel**. Code on GitHub (TheRealMenace10040, public).
- **Backend:** Supabase project `jeopardy-party` (`niizscsrpuxtmtynfmvz`, us-east-1, free plan).
  - **Auth:** Google provider (enabled).
  - **Postgres:** games, categories, clues, rooms, teams, scores, judgements (for undo).
  - **Storage:** private photo bucket; images only, ≤2 MB each; served to room participants via short-lived signed URLs.
  - **Realtime:** room channels for state changes and presence (who is connected).
  - **First buzz:** a database function atomically records the first valid buzz per clue attempt, so client clocks never decide.
  - **Row-level security:** hosts see and edit only their own games; teams see only what the board has revealed — correct responses never reach team phones or the TV before reveal.
- **Keep-alive:** weekly GitHub Actions ping so the free project never pauses.
- **Deploys:** built and tested locally first; deploy only after explicit approval each time.

## Later (not in v1)

Answer timer, sound effects, spreadsheet paste for setup, end-of-game stats, Double Jeopardy round option.

## Out of scope

Audio/video clues, AI-generated boards, spectator mode, multiple simultaneous games per host.
