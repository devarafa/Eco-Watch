# Eco Watch

Eco Watch is a free, open-source, educational React + Vite web app for exploring environmental change from real Sentinel-2 satellite imagery. It turns a place name or a map-drawn area into spectral-index evidence, a visual change overlay, and a short decision brief.

The site is a public frontend: no backend, no accounts, no API keys and no tracking.

## What the app does

1. Finds an explicit place by name with Nominatim, or lets the user click two map corners to define a custom area.
2. Searches the Planetary Computer STAC catalog for Sentinel-2 L2A scenes in the same seasonal window for two dates or a 3 to 5 year timeline.
3. Picks the least-cloudy candidate scene for each selected year using STAC metadata.
4. Requests real 128 x 128 pixel rasters for NDVI, NDWI and NDBI over the selected area through the Planetary Computer Data API.
5. Reads the Sentinel-2 L2A SCL band and removes invalid, cloudy and shadowed pixels before measurement.
6. Classifies each valid pixel into vegetation, water, built-up / hard surface, or bare soil / other using documented thresholds.
7. Trains a small centroid classifier in the browser from ESA WorldCover 2021 reference labels and reports its in-sample agreement separately.
8. Compares the first and last scenes, reports per-year estimates, trend direction, changed-pixel percentage and estimated changed area, draws a change overlay, and shows the years side by side as true-colour maps.
9. Builds a report with findings, exactly two actions, scene evidence, class estimates, limits, and a self-contained HTML file download.

Threshold classes are screening signals, and the WorldCover-assisted classifier is calibrated from 2021 reference labels rather than independently validated ground truth.

## Screens

- `/` - Home and product entry screen.
- `/analysis` - Place search or map drawing, date selection, live run, map layers and results.
- `/report` - Decision brief saved in the browser tab; can be reopened and edited through Analysis.
- `/project-details` - Documentation, APIs, attribution and limitations.

The app opens on Home, moves to Analysis for a real run, then to Report. Project details is available from Home, and the logo appears on every page. All interface text is English: place names are normalized to English, and AI replies in another script fall back to an English answer.

## Live AI assistant

The assistant is available on every page:

- Desktop: a resizable right sidebar that is part of the site layout, with a styled dock behind it. Closing it with `X` collapses the dock and gives the full width back to the page; the conversation stays in memory when it is reopened.
- Mobile: floating action button that opens a panel above the bottom edge; it can be resized vertically and expanded.
- Providers: Free.ai (`qwen3-8b`, then `mistral`), LLM7.io (`mistral-Nemo-Instruct-2407`), then OVHcloud AI Endpoints (`Mistral-Small-3.2-24B-Instruct-2506`).
- No API key is used. If the public services are unavailable, the assistant replies with a local, evidence-aware answer.
- The assistant receives only the current analysis context and the conversation. Do not send sensitive information.

## Real data sources

| Source | Use | Key required |
| --- | --- | --- |
| Nominatim | Explicit place-name geocoding | No |
| OpenStreetMap tiles | Interactive map basemap | No |
| Planetary Computer STAC | Sentinel-2 L2A scene search | No |
| Planetary Computer Data API | True-colour tiles, index rasters, SCL masks and WorldCover labels | No |
| Sentinel-2 L2A SCL | Per-pixel cloud, shadow and invalid-data mask | No |
| ESA WorldCover 2021 | Reference labels for the in-browser assisted classifier | No |
| Free.ai / LLM7.io / OVHcloud | Keyless live AI chat | No |

All sources are public, CORS-enabled, and used anonymously. Their availability and terms can change, so avoid sending private data through the chat.

## Classification method

Index rasters are rescaled from `-1..1` into `0..255` grayscale PNGs by the Data API, then decoded back to index values in the browser.

- Water: `NDWI > 0.25` and `NDVI < 0.4`
- Vegetation: `NDVI > 0.25`
- Built-up / hard surface: `NDBI > 0.08` and `NDVI < 0.25`
- Bare soil / other: everything else

Only pixels valid in the compared scenes are used. The SCL mask removes classes `0, 1, 2, 3, 7, 8, 9, 10 and 11` before classification, while metadata cloud cover is still shown for scene ranking and warnings.

The WorldCover-assisted classifier uses labels `10, 20, 30, 40, 95, 100` for vegetation, `80, 90` for water, `50` for built-up, and `60, 70` for bare soil. Because WorldCover labels are from 2021, using them on other scene years is reference-label calibration, not confirmed ground truth.

## Folder structure

```text
index.html                 Vite entry HTML
vite.config.js             React plugin and dev server settings
vercel.json                Vercel SPA fallback configuration
public/
  eco-watch-logo.svg       Project logo used in the top bar
  favicon.svg              Browser favicon
  assets/
    hero-satellite.jpg     Public-domain satellite hero image
src/
  main.jsx                 React root and router
  App.jsx                  Routes and global assistant
  styles.css               Design system and responsive layout
  components/
    ChatAssistant.jsx      Live AI panel, resize and fallback logic
    MapCanvas.jsx          Imperative Leaflet map and layer controls
    TopBar.jsx             Logo and page step header
  lib/
    api.js                 Nominatim, STAC, Data API, SCL and WorldCover requests
    classifier.js          In-browser centroid classifier and agreement check
    changeMap.js           Change overlay image generation
    config.js              Endpoints, models, thresholds and constants
    export.js              Self-contained HTML report file generation
    format.js              Formatting helpers
    report.js              Decision brief generation
    session.js             sessionStorage persistence and events
    stats.js               Pixel classification and comparison
  pages/
    Analysis.jsx           Main analysis workflow
    Home.jsx               Product entry screen
    ProjectDetails.jsx     Documentation and attribution
    Report.jsx             Final decision report
tests/
  stats.test.js            Node tests for stats and report logic
```

## Deployment

Deploy the repository to Vercel. Vercel detects Vite, runs `npm run build` and publishes `dist`. The included `vercel.json` keeps direct links and refresh working on every route.

## In the browser

Your analysis stays in the current browser tab. Returning from Report to Analysis keeps the saved work editable, and saved runs reopen without an automatic redirect. The downloaded report is a standalone HTML file; nothing is sent to a backend.

## Limitations

- Spectral-index thresholds are screening signals, not a validated land-cover classifier.
- WorldCover labels are from 2021 and model agreement is an in-sample calibration check, not independent validation.
- SCL masking removes invalid classes, cloud and shadows, but thin cloud can remain.
- The 128 x 128 sample can miss small parcels, narrow waterways and thin roads.
- The report is a screening brief with exactly two actions. Confirm any intervention with local records or a site visit.
- Free public AI services can be rate-limited or change without notice.

## Attribution and license

Map data: OpenStreetMap contributors, ODbL.
Satellite imagery: Copernicus Sentinel-2 data via Microsoft Planetary Computer.
Hero image: NASA Landsat view of the Ganges River delta via Wikimedia Commons, public domain.
AI chat: Free.ai, LLM7.io and OVHcloud AI Endpoints.

Released under the MIT License. See `LICENSE`.
