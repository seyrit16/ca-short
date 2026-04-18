# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


## Purpose
Chess Adventures is a local multiplayer board game assistant built with React + TypeScript + Vite.
The app combines tactical map movement, card mechanics, queue ordering, and utility panels for session play.

## Product Scope
- Two-player session lifecycle (create, join, save, restore).
- Tactical board with captures, movement pathing, objects, and territory count.
- Character management (stats, items, icon customization).
- Shared deck utilities (draw/reset/history) and card-to-character stat buffs.
- Side utilities (dice, battle wheel, secret chest, monster tracker).

## Tech Stack
- Frontend: React, TypeScript, Vite.
- API client: fetch to `VITE_API_BASE_URL` or `window.location.origin`.
- Styling: plain CSS modules by feature area in `src/styles`.
- Build: TypeScript project references + Vite production build.

## Project Structure
- `src/App.tsx`: main state orchestration and game actions.
- `src/components/*`: UI panels and widgets.
- `src/utils/gameUtils.ts`: game domain logic, defaults, migrations.
- `src/types/index.ts`: shared domain types.
- `src/api/gameApi.ts`: HTTP API wrapper.
- `public/assets/*`: static visual assets.

## Development Commands
- Install dependencies: `npm install`
- Run dev server: `npm run dev`
- Build production bundle: `npm run build`
- Lint: `npm run lint`

## Core Engineering Rules
- Keep domain logic in `gameUtils` when possible; avoid duplicating rules in components.
- Treat `App.tsx` as orchestration layer, not pure rules container.
- Prefer immutable updates through cloned game state + helper normalization (`ensureExtras`).
- Preserve backward compatibility for saved games when types evolve.
- Avoid introducing non-ASCII in code unless already present or strictly needed.
- Keep UI actions deterministic and idempotent where possible.

## State and Persistence Rules
- Always run loaded game through `GameUtils.ensureExtras`.
- Any persisted structure changes must include migration/fallback in `ensureExtras`.
- Maintain compatibility for legacy fields (`extras.queue`) while preferring new fields (`extras.queueByPlayer`).

## Queue Rules
- Queue is per-player: `extras.queueByPlayer.player1` and `extras.queueByPlayer.player2`.
- Queue reorder operations must affect only the active selected player queue.
- Clicking a queue unit should support distance-based reorder logic.

## Character Icon Rules
- Built-in character icon source folder: `public/assets/characters/`.
- File naming convention: strictly numeric PNG names (`1.png`, `2.png`, `3.png`, ...).
- Code should reference built-ins by generated numeric paths (not hardcoded semantic names).
- Fallback defaults:
  - Player 1: `/assets/characters/1.png`
  - Player 2: `/assets/characters/2.png`
- Custom uploaded PNG icons may be stored as data URLs in local storage and assigned per unit.

## Deck-to-Character Buff Rules
When current deck card is dragged onto a character:
- Jokers are not applicable.
- Rank mapping:
  - Numeric card: that numeric value.
  - `J` => 11
  - `Q` => 12
  - `K` => 13
  - `A` => 15
- Suit mapping:
  - hearts => HP and max HP (increase both by rank value)
  - clubs => attack
  - diamonds => capture points stat
  - spades => defense
- On successful apply: clear `deck.current`.

## Territory Rules
- Territory is counted by captured cells on board.
- Recompute territory after any action that changes captures.
- Keep explicit per-player territory visible in UI.

## UI/UX Conventions
- Keep panel interactions compact and discoverable.
- Character icon selection should open from character card icon as a dropdown popup.
- Drag-and-drop interactions should provide graceful no-op on invalid drops.
- Buttons and clickable visuals should have clear `title` hints where helpful.

## CSS Conventions
- Reuse existing naming style (`kebab-case`) and panel-specific classes.
- Keep animation and visual effects lightweight for responsiveness.
- Avoid global resets inside component styles; scope by class names.

## API and Error Handling
- API layer should throw explicit errors for non-OK responses.
- UI handlers should surface user-friendly notices/errors.
- Any optimistic local state update that persists remotely must be guarded by save error handling.

## Testing and Verification Checklist
Before completing any change:
- `npm run build` passes.
- No TypeScript errors.
- Key interaction path manually verified:
  - create/join game
  - queue operations
  - character icon dropdown and selection/upload
  - card drag from deck to character
  - territory display updates

## Change Management
- Prefer small, focused edits by file responsibility.
- Do not revert user changes outside task scope.
- If unexpected unrelated modifications appear, stop and confirm with user before continuing.

## Suggested Future Improvements
- Add unit tests for rank/suit card buff mapping.
- Add automated migration tests for legacy save payloads.
- Add icon asset manifest generation script for `public/assets/characters`.
- Add E2E smoke tests for drag-and-drop flows.
