# Play12 Main MVP — isolated development plan

Base commit: 3442ae3a2c45661d5779c34702145439a9b7b1a6
Development branch: play12-main-mvp-v1
Rollback branch: checkpoint-pre-main-mvp-3442ae3
Production MVP: /MVP/ (must remain operational and untouched)

## Approved desktop layout

Three upper areas and inverted-T player:
- Left: User Space, with clickable flower/avatar opening Garden, username, time on Play12, compositions list. Active composition expanded with title, composer, difficulty, mastery progress, skill count and contextual actions; others compact with title/progress/level. Add via MusicXML -> P12 editor or built-in library.
- Center: existing *real* vertical Note Field and existing transport. Keep all current engine logic.
- Right: 'Bank of Skills for [composition]' (no cover art), Keys and Rhythm only; show only skills actually used by active composition. Each skill has gray monochrome icon until mastered, orange→green mastery ring, and an independent green playback-event highlight driven by existing musical timeline. Active skill detail includes description, optional explanatory video, built-from skills, part-of skills, and Training / Reinforcement / Use in piece.
- Below upper areas: keep every existing BPM, 0, Practice, Play/Pause/Restart, Round & Loop, Pre-count and progress control. Do not replace or redesign behavior.
- Bottom: actual calibrated piano keyboard spanning page width, capable of 88 keys. The center vertical note field + full-width keyboard form an inverted T.

## Engineering constraints

1. Reuse existing renderer, playback, onboarding, MIDI logic, tempo clock and CSS design tokens. No new independently implemented musical engine.
2. First create an isolated preview shell/layout. Fill it with the real playback component, not a hardcoded fake music visualization. Preserve existing Function-key MIDI commands and acceptance rules.
3. Keep EN/RU dimensions, responsive behavior and language parity.
4. Separate user state/composition state/skill graph from presentation. No fabricated mastery figures in production data.
5. Do not deploy development branch to /MVP/ or alter live paths until a separate staging target is configured and verified.
6. A GitHub branch is **not** automatically available as a GitHub Pages URL. Choose and verify a deployment mechanism before giving users /MVP-next/ as a working preview URL.
7. Staging may be public even if not indexed or linked. Do not claim it is private without access control.
8. For each change: inspect HEAD, commit, test and document visual+functional regressions. Production changes only after explicit acceptance.

## First implementation milestone

- Choose staging mechanism that does not overwrite current Pages publication.
- Render layout shell at a verified staging address.
- Integrate existing Note Field, full-width keyboard and all boards into inverted-T geometry.
- Validate 61/76/88-key configurations and representative desktop/laptop sizes.
- Only then populate User Space and Skill Bank with data and actions.

## Excluded from first milestone

Friends, greenhouse visits, gifting water/fertilizer, weeds, rewards economy, persistent accounts unless needed for a genuine vertical slice.
