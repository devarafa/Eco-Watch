# Contributing to Eco Watch

Thanks for helping improve a free, open-source environmental change explorer. This project is built only with React + Vite and public keyless APIs.

## Ground rules

- Keep the project 100% free, non-commercial, educational, backend-free and keyless.
- All code, comments, UI text, docs and file names must be in English.
- Normalize every external text value before display. Nominatim labels must use `Accept-Language: en` and pass through `englishText`; AI replies in another script must fall back to the local English answer.
- Do not add paid services, secrets, private tokens, analytics or tracking.
- Do not add a site navbar, footer, or extra resource buttons. Project details are reached only from Home.
- Do not add sample or experimental result data before a real analysis run.
- Never commit generated build output (`dist`) or dependency folders.

## Setup

```bash
npm install
npm run dev
npm test
```

Node.js `^20.19.0` or `>=22.12.0` is required by Vite 8.

## Code structure

- `src/lib/api.js` owns all external data requests, SCL masking and raster decoding.
- `src/lib/classifier.js` owns the WorldCover-trained centroid classifier and agreement check.
- `src/lib/stats.js` owns pixel screening, masking support, comparison and trend logic.
- `src/lib/report.js` turns saved evidence into the decision brief.
- `src/lib/export.js` builds the self-contained HTML report download.
- `src/lib/session.js` owns `sessionStorage` persistence and update events.
- `src/components/MapCanvas.jsx` uses Leaflet imperatively; do not replace it with another map wrapper without discussion.
- `src/components/ChatAssistant.jsx` owns the live AI panel, resize behaviour, provider fallback and local answer.
- `src/pages/*` owns the four screens defined in `src/App.jsx`.
- `src/styles.css` is the single global stylesheet and design system.

## Recommended workflow

1. Create a branch for the change.
2. Keep changes focused and update only the relevant files.
3. Run `npm test` after any change to stats, report or formatting logic.
4. Run `npm run dev` and manually check the affected page on desktop and mobile widths.
5. If the change touches external APIs, verify the browser console and network tab for errors.
6. Open a pull request describing what changed, what was tested and any new limitation.

## Changing analysis logic

- Keep the raster size and index expressions documented in `src/lib/config.js` and `src/lib/stats.js`.
- Any threshold change must update `tests/stats.test.js`, the README, and the limitations in Project details.
- Do not describe threshold-based estimates as supervised AI, validated classification, or confirmed land cover.
- Do not describe WorldCover-assisted agreement as independent accuracy; its labels are from 2021 and the check is in-sample.
- Keep SCL invalid classes and WorldCover label mapping in `src/lib/config.js`.
- Preserve the current session shape or add a migration path so older saved runs still produce a report.
- Keep the decision brief at exactly two actions and keep the report action buttons to Back to analysis and Download report.
- Keep the desktop assistant as a right sidebar in the layout, not a floating card. Closing it must release the reserved width; reopening must keep the conversation.
- Keep every route scrolled to the top on navigation, including Project details opened from the bottom of Home.

## Changing AI providers

- Only use keyless public endpoints that work from the browser.
- Add new providers to `AI_SOURCES` in `src/lib/config.js` and keep the local answer fallback.
- Never log prompts, responses or personal data to local storage or analytics.
- Update Project details and README when a provider changes.

## UI expectations

- Home is always the entry screen, followed by Analysis and Report.
- The logo must remain visible on the left of the top bar on every page.
- Desktop AI panel must stay resizable and must not cover the whole page.
- Mobile assistant must use a floating button and stay clean and centered like desktop.
- Map wheel and pinch zoom must remain inside Leaflet.
- Use plain, direct English in the interface.

## Tests

Core logic is covered by Node's built-in test runner:

```bash
npm test
```

Tests cover grayscale decoding, class thresholds, no-data handling, SCL masking, scene comparison, classifier agreement, trends, timeline briefs, HTML export and decision-brief generation. Add tests for any new classification, comparison, report or export behaviour.

## License

By contributing, you agree that your work will be released under the MIT License.
