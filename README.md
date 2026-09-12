# Battleship.v2

Browser implementation of the classic Battleship game, built with vanilla JavaScript
(ES modules) and Vite.

## How to play

1. **Deploy.** Pick a ship from the fleet roster, press `R` (or the orientation button) to
   rotate it and click a cell on your board. `Random` deploys the whole fleet, `Reset`
   clears the board and clicking a placed ship takes it back.
2. **Fight.** Press `Start Battle` once the fleet is ready and click a cell on the enemy
   board to fire. Misses show a sonar ring, hits a burning cross, and a ship is revealed
   when it sinks. The enemy answers after a short delay.
3. **Finish.** The battle ends as soon as one of the fleets is completely sunk; the battle
   report offers a new game.

The status bar shows whose turn it is and the outcome of the last shot, and mirrors both to
an `aria-live` region.

## Difficulty

The selector is locked once the battle starts, and the status bar shows which opponent is
in play.

- **Easy** fires at a random untouched cell.
- **Hard** hunts: it sweeps a parity mask no surviving ship can straddle and, as soon as a
  ship is damaged, works that contact out - the gap between two aligned hits first, then
  the ends of the inferred line, then the neighbours of a lone hit - and only resumes the
  sweep once the ship is sunk.

## Saved matches

The match is written to `localStorage` under `battleship.v2.match` after every move, so a
reload picks it up where it stopped and the status bar shows a `Resumed` chip. A reload
during the enemy reply restores the pending enemy turn, which then fires once. `New Game`
wipes the save. A save that is unreadable, from another version or inconsistent with the
engine rules - a ship off the board, overlapping ships, a repeated shot, a hit that does
not match the fleet, a winner nobody earned - is discarded and the game starts fresh.

## Requirements

- Node.js 18.18 or newer
- npm 9 or newer

## Play online

The `main` branch is published to GitHub Pages by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Enable it once under
**Settings > Pages > Build and deployment > Source: GitHub Actions**; every push to `main`
then builds and publishes the site.

Published version: https://renan-devin.github.io/Battleship.v2/

## Run it locally

```bash
npm install       # once
npm run dev       # http://localhost:5173
npm test          # test suite
npm run build     # production bundle in dist/
npm run preview   # serve the production bundle
```

## Scripts

| Script                 | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Start the Vite development server with hot reload.      |
| `npm run build`        | Build the production bundle into `dist/`.               |
| `npm run preview`      | Serve the production build locally.                     |
| `npm test`             | Run the Vitest test suite once.                         |
| `npm run lint`         | Lint the project with ESLint.                           |
| `npm run format`       | Format the project with Prettier.                       |
| `npm run format:check` | Check formatting with Prettier without writing changes. |

## Project structure

```
src/
  engine/   Game rules and board logic (pure logic, no DOM)
  ai/       Opponent strategies (pure logic, no DOM)
  state/    Orchestration between engine, AI and UI (pure logic, no DOM)
  ui/       DOM rendering helpers
  main.js   Entry point that wires state, engine and DOM
tests/      Vitest test suite
docs/       Debugging report
```

## Placement rules

Ships must stay inside the board, must not overlap and can only be placed horizontally or
vertically. Ships may touch each other, side by side or diagonally.
