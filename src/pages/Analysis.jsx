import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MapCanvas from '../components/MapCanvas.jsx';
import TopBar from '../components/TopBar.jsx';
import YearComparison from '../components/YearComparison.jsx';
import {
  cloudCover,
  combineStats,
  combineTimeline,
  computeSceneStats,
  fetchWorldCoverLabels,
  geocode,
  getTileConfig,
  savedItem,
  searchScenes,
  searchWorldCover
} from '../lib/api.js';
import { createChangeOverlay } from '../lib/changeMap.js';
import { CONFIG, SEASONS } from '../lib/config.js';
import { areaKm2, daysBetween, formatBbox, formatKm2 } from '../lib/format.js';
import { buildBrief } from '../lib/report.js';
import { clearSession, readSession, writeSession } from '../lib/session.js';
import { CLASS_KEYS, CLASS_LABELS } from '../lib/stats.js';

const YEAR_OPTIONS = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];

function ApiStrip({ status }) {
  return (
    <div className="api-strip" data-state={status.kind}>
      <span className="api-pulse" aria-hidden="true" />
      <span>{status.text}</span>
      <span className="api-strip-note">Nominatim / STAC / Data API / AI</span>
    </div>
  );
}

function normalizeBbox(raw) {
  let [west, south, east, north] = raw.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) {
    return null;
  }
  west = Math.max(-180, Math.min(180, west));
  east = Math.max(-180, Math.min(180, east));
  south = Math.max(-85, Math.min(85, south));
  north = Math.max(-85, Math.min(85, north));

  if (east - west > CONFIG.maxSpan) {
    const middle = (west + east) / 2;
    west = middle - CONFIG.maxSpan / 2;
    east = middle + CONFIG.maxSpan / 2;
  }
  if (north - south > CONFIG.maxSpan) {
    const middle = (south + north) / 2;
    south = middle - CONFIG.maxSpan / 2;
    north = middle + CONFIG.maxSpan / 2;
  }
  if (east <= west || north <= south) {
    west -= 0.05;
    east += 0.05;
    south -= 0.05;
    north += 0.05;
  }
  return [west, south, east, north].map((value) => Number(value.toFixed(5)));
}

function sceneMeta(item, year) {
  return {
    id: item.id,
    date: String(item.properties.datetime).slice(0, 10),
    cloud: cloudCover(item),
    year
  };
}

function tableTone(value) {
  return value < 0 ? 'down' : value > 0 ? 'up' : 'flat';
}

async function loadYearTiles(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }
  return Promise.all(records.map(async (record) => ({
    year: record.year,
    date: record.date,
    id: record.id,
    cloud: record.cloud,
    vegetation: record.stats && record.stats.percentages ? record.stats.percentages.vegetation : NaN,
    masked: record.stats && record.stats.mask && record.stats.mask.applied
      ? Number(record.stats.mask.maskedPercent).toFixed(1) + '%'
      : '-',
    layer: await getTileConfig({ id: record.id }, 'visual')
  })));
}

export default function Analysis() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const pointsRef = useRef([]);
  const searchCacheRef = useRef(new Map());
  const lastSearchRef = useRef({ current: 0 });
  const reportTimerRef = useRef(null);

  const [bbox, setBbox] = useState(null);
  const [area, setArea] = useState('');
  const [place, setPlace] = useState('');
  const [mode, setMode] = useState('pair');
  const [years, setYears] = useState(['2020', '2025']);
  const [season, setSeason] = useState('Feb 1 - Mar 31');
  const [status, setStatus] = useState({ kind: 'idle', text: 'APIs idle - no requests yet' });
  const [feedback, setFeedback] = useState('');
  const [feedbackKind, setFeedbackKind] = useState('');
  const [error, setError] = useState('');
  const [clickPoints, setClickPoints] = useState([]);
  const [busy, setBusy] = useState(false);
  const [layers, setLayers] = useState({});
  const [yearTiles, setYearTiles] = useState([]);
  const [scenes, setScenes] = useState({ before: null, after: null });
  const [sceneRecords, setSceneRecords] = useState([]);
  const [results, setResults] = useState(null);
  const [sessionSnapshot, setSessionSnapshot] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [view, setView] = useState('ndvi');
  const [showOsm, setShowOsm] = useState(true);
  const [activeToggles, setActiveToggles] = useState({ before: true, after: true, ndvi: true });

  useEffect(() => () => clearTimeout(reportTimerRef.current), []);

  function invalidateRun(message) {
    clearTimeout(reportTimerRef.current);
    setLayers({});
    setYearTiles([]);
    setScenes({ before: null, after: null });
    setSceneRecords([]);
    setResults(null);
    setSessionSnapshot(null);
    setOverlay(null);
    setView('ndvi');
    clearSession();
    if (message) {
      setFeedback(message);
      setFeedbackKind('');
    }
  }

  function applyBbox(raw, label, preserve = false) {
    const normalized = normalizeBbox(raw);
    if (!normalized) {
      setError('Invalid area coordinates.');
      return null;
    }
    setBbox(normalized);
    setArea(label || 'Custom area');
    pointsRef.current = [];
    setClickPoints([]);
    setError('');

    if (!preserve) {
      invalidateRun();
    }
    return normalized;
  }

  useEffect(() => {
    const saved = readSession();
    if (!saved) {
      return;
    }
    setPlace(saved.placeQuery || saved.area || '');
    setMode(saved.mode || 'pair');
    setYears(saved.years || [saved.yearA || '2020', saved.yearB || '2025']);
    setSeason(saved.season || 'Feb 1 - Mar 31');
    applyBbox(saved.bbox, saved.area || 'Saved area', true);

    const before = savedItem(saved.scenes.before);
    const after = savedItem(saved.scenes.after);
    setScenes({ before, after });
    setSceneRecords(saved.timeline || [
      { year: saved.yearA, ...saved.scenes.before },
      { year: saved.yearB, ...saved.scenes.after }
    ]);
    setResults(saved.stats || null);
    setSessionSnapshot(saved);
    setStatus({ kind: 'loading', text: 'Restoring saved satellite layers...' });

    const pixelClasses = saved.stats && saved.stats.modelPixelClasses
      ? saved.stats.modelPixelClasses
      : saved.stats && saved.stats.pixelClasses;
    if (pixelClasses && pixelClasses.before && pixelClasses.after) {
      setOverlay(createChangeOverlay(pixelClasses.before, pixelClasses.after, [
        [saved.bbox[1], saved.bbox[0]],
        [saved.bbox[3], saved.bbox[2]]
      ]));
      setView('change');
    }

    Promise.all([
      getTileConfig(before, 'visual'),
      getTileConfig(after, 'visual'),
      getTileConfig(after, 'ndvi'),
      loadYearTiles(saved.timeline)
    ]).then(([beforeLayer, afterLayer, ndviLayer, tiles]) => {
      setLayers({ before: beforeLayer, after: afterLayer, ndvi: ndviLayer });
      setYearTiles(tiles);
      setStatus({ kind: 'ready', text: 'Saved analysis restored - edit settings or open the report' });
      setFeedback('Saved analysis restored. You can edit the settings and run again.');
      setFeedbackKind('ok');
    }).catch((restoreError) => {
      setStatus({ kind: 'error', text: 'Could not restore saved layers' });
      setError(restoreError.message);
    });
  }, []);

  function updateSeason(nextSeason) {
    setSeason(nextSeason);
    invalidateRun('Season changed. Run the analysis again with the new window.');
  }

  function updateYear(index, nextYear) {
    if (years.some((year, position) => position !== index && year === nextYear)) {
      setFeedback('Each year must be unique.');
      setFeedbackKind('warn');
      return;
    }
    const next = years.slice();
    next[index] = nextYear;
    next.sort((a, b) => Number(a) - Number(b));
    setYears(next);
    invalidateRun('Years changed. Run the analysis again.');
  }

  function changeMode(nextMode) {
    if (nextMode === mode) {
      return;
    }
    setMode(nextMode);
    setYears(nextMode === 'pair' ? ['2020', '2025'] : ['2021', '2023', '2025']);
    invalidateRun(nextMode === 'pair'
      ? 'Two-date comparison selected. Run the analysis again.'
      : 'Timeline selected. Choose 3 to 5 unique years, then run the analysis.');
  }

  function addYear() {
    if (years.length >= CONFIG.maxTimelineYears) {
      return;
    }
    const candidate = YEAR_OPTIONS.find((year) => !years.includes(year));
    if (!candidate) {
      setFeedback('No more years available.');
      setFeedbackKind('warn');
      return;
    }
    setYears(years.concat([candidate]).sort((a, b) => Number(a) - Number(b)));
    invalidateRun('Year added. Run the analysis again.');
  }

  function removeYear(index) {
    if (years.length <= CONFIG.minTimelineYears) {
      setFeedback('A timeline needs at least 3 years.');
      setFeedbackKind('warn');
      return;
    }
    setYears(years.filter((_, position) => position !== index));
    invalidateRun('Year removed. Run the analysis again.');
  }

  async function handleSearch(event) {
    event.preventDefault();
    const query = place.trim();
    if (query.length < 2) {
      setFeedback('Type at least 2 characters.');
      setFeedbackKind('warn');
      return;
    }

    setStatus({ kind: 'loading', text: 'Geocoding with Nominatim...' });
    setFeedback('Searching for ' + query + '...');
    setFeedbackKind('');

    try {
      const result = await geocode(query, searchCacheRef.current, lastSearchRef);
      const bb = result.boundingbox;
      if (!bb || bb.length !== 4) {
        throw new Error('This place has no usable bounding box');
      }
      const nextBbox = applyBbox([parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])],
        (result.display_name || query).split(',').slice(0, 2).join(',').trim());
      setStatus({ kind: 'idle', text: 'Area ready - choose dates and run the analysis' });
      setFeedback('Found: ' + (result.display_name || area) + '. Choose the years and season, then run the analysis.');
      setFeedbackKind('ok');
      return nextBbox;
    } catch (searchError) {
      setStatus({ kind: 'error', text: 'Geocoding failed' });
      setFeedback(searchError.message);
      setFeedbackKind('error');
      return null;
    }
  }

  function handlePick(latlng) {
    const points = pointsRef.current.concat([{ lat: latlng.lat, lng: latlng.lng }]);
    if (points.length < 2) {
      pointsRef.current = points;
      setClickPoints(points);
      setFeedback('Corner 1 set - click the opposite corner.');
      setFeedbackKind('');
      return;
    }
    pointsRef.current = [];
    setClickPoints([]);
    const nextBbox = [
      Math.min(points[0].lng, points[1].lng),
      Math.min(points[0].lat, points[1].lat),
      Math.max(points[0].lng, points[1].lng),
      Math.max(points[0].lat, points[1].lat)
    ];
    applyBbox(nextBbox, 'Custom map area');
    setStatus({ kind: 'idle', text: 'Area ready - choose dates and run the analysis' });
    setFeedback('Area set from map. Choose the years and season, then run the analysis.');
    setFeedbackKind('ok');
  }

  function resetArea() {
    pointsRef.current = [];
    setClickPoints([]);
    setBbox(null);
    setArea('');
    setPlace('');
    invalidateRun();
    setStatus({ kind: 'idle', text: 'Area cleared - APIs idle' });
    setFeedback('');
    setFeedbackKind('');
    setError('');
    if (mapRef.current) {
      mapRef.current.setView([24, 15], 2);
    }
  }

  async function runAnalysis() {
    if (!bbox) {
      setFeedback('Select an area first: search a place or click two map corners.');
      setFeedbackKind('warn');
      return;
    }
    if (new Set(years).size !== years.length) {
      setFeedback('Each year must be unique.');
      setFeedbackKind('warn');
      return;
    }
    if (mode === 'series' && (years.length < CONFIG.minTimelineYears || years.length > CONFIG.maxTimelineYears)) {
      setFeedback('Choose between 3 and 5 years for a timeline.');
      setFeedbackKind('warn');
      return;
    }

    clearTimeout(reportTimerRef.current);
    setBusy(true);
    setError('');
    setFeedback('');
    const range = SEASONS[season] || SEASONS['Feb 1 - Mar 31'];

    try {
      setStatus({ kind: 'loading', text: 'Loading ESA WorldCover reference labels...' });
      let worldCoverLabels = null;
      try {
        const worldCoverItem = await searchWorldCover(bbox);
        if (worldCoverItem) {
          worldCoverLabels = await fetchWorldCoverLabels(worldCoverItem, bbox, CONFIG.rasterSize);
        }
      } catch (labelError) {
        setFeedback('WorldCover labels are unavailable, so model-assisted estimates will be skipped.');
        setFeedbackKind('warn');
      }

      const entries = [];
      for (let index = 0; index < years.length; index += 1) {
        const year = years[index];
        setStatus({ kind: 'loading', text: 'Year ' + (index + 1) + '/' + years.length + ': searching Sentinel-2 scenes...' });
        const found = await searchScenes(year, range, bbox);
        if (!found.best) {
          throw new Error('No Sentinel-2 scene for ' + year + ' in this area and season');
        }
        setStatus({ kind: 'loading', text: 'Year ' + (index + 1) + '/' + years.length + ': reading real pixels...' });
        const stats = await computeSceneStats(found.best, bbox, CONFIG.rasterSize, { labels: worldCoverLabels });
        entries.push({
          year,
          date: String(found.best.properties.datetime).slice(0, 10),
          item: found.best,
          count: found.count,
          stats
        });
      }

      setStatus({ kind: 'loading', text: 'Building the timeline and change overlay...' });
      const first = entries[0];
      const last = entries[entries.length - 1];
      const combined = combineStats(first.stats, last.stats);
      const timeline = combineTimeline(entries);
      combined.trend = timeline.trend;

      const [firstVisual, lastVisual, lastNdvi, tiles] = await Promise.all([
        getTileConfig(first.item, 'visual'),
        getTileConfig(last.item, 'visual'),
        getTileConfig(last.item, 'ndvi'),
        loadYearTiles(timeline.timeline)
      ]);

      const beforePixels = first.stats.modelClasses || first.stats.classes;
      const afterPixels = last.stats.modelClasses || last.stats.classes;
      const changeOverlay = createChangeOverlay(beforePixels, afterPixels, [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]]
      ]);

      const beforeMeta = sceneMeta(first.item, first.year);
      const afterMeta = sceneMeta(last.item, last.year);
      const modelPixelClasses = first.stats.modelClasses && last.stats.modelClasses
        ? { before: first.stats.modelClasses, after: last.stats.modelClasses }
        : null;

      const session = {
        version: 3,
        createdAt: new Date().toISOString(),
        area,
        placeQuery: place,
        bbox,
        mode,
        years: years.slice(),
        yearA: years[0],
        yearB: years[years.length - 1],
        season,
        range,
        counts: {
          before: first.count,
          after: last.count,
          byYear: entries.map((entry) => ({ year: entry.year, count: entry.count }))
        },
        scenes: {
          before: beforeMeta,
          after: afterMeta,
          all: entries.map((entry) => sceneMeta(entry.item, entry.year))
        },
        timeline: timeline.timeline,
        stats: {
          ...combined,
          pixelClasses: { before: first.stats.classes, after: last.stats.classes },
          modelPixelClasses,
          trend: timeline.trend
        }
      };

      writeSession(session);
      setLayers({ before: firstVisual, after: lastVisual, ndvi: lastNdvi });
      setYearTiles(tiles);
      setScenes({ before: savedItem(beforeMeta), after: savedItem(afterMeta) });
      setSceneRecords(session.timeline);
      setResults(combined);
      setSessionSnapshot(session);
      setOverlay(changeOverlay);
      setView('change');

      setStatus({
        kind: 'ready',
        text: 'Live analysis ready - ' + combined.comparison.changedPercent.toFixed(1) + '% changed pixels'
      });
      setFeedback('Analysis ready. Opening report...');
      setFeedbackKind('ok');
      reportTimerRef.current = setTimeout(() => navigate('/report'), 1800);
    } catch (runError) {
      setStatus({ kind: 'error', text: 'Analysis request failed' });
      setError(runError.message);
    } finally {
      setBusy(false);
    }
  }

  const comparisonItems = useMemo(
    () => yearTiles.filter((item) => item.layer && item.layer.url),
    [yearTiles]
  );
  const availableLayers = Object.keys(layers).filter((key) => activeToggles[key] && layers[key]);
  const viewOrder = view === 'before'
    ? ['before', 'after', 'ndvi', 'change']
    : view === 'after'
      ? ['after', 'before', 'ndvi', 'change']
      : view === 'change'
        ? ['change', 'ndvi', 'after', 'before']
        : ['ndvi', 'after', 'before', 'change'];
  const activeLayer = viewOrder.find((key) => (key === 'change' ? !!overlay : availableLayers.includes(key))) || null;
  const hasResults = !!results && !!sessionSnapshot && !!sessionSnapshot.scenes.before && !!sessionSnapshot.scenes.after;
  const brief = hasResults ? buildBrief(sessionSnapshot) : null;
  const comparison = results && results.comparison;
  const firstRecord = sessionSnapshot && sessionSnapshot.timeline
    ? sessionSnapshot.timeline[0]
    : sessionSnapshot && sessionSnapshot.scenes.before;
  const lastRecord = sessionSnapshot && sessionSnapshot.timeline
    ? sessionSnapshot.timeline[sessionSnapshot.timeline.length - 1]
    : sessionSnapshot && sessionSnapshot.scenes.after;
  const gap = firstRecord && lastRecord ? daysBetween(firstRecord.date, lastRecord.date) : null;
  const periodText = mode === 'series'
    ? years.join(' > ')
    : years[0] + ' to ' + years[1];

  return (
    <>
      <TopBar step="STEP 1 OF 2 - ANALYSIS" subtitle="Analysis workspace" />
      <ol className="page-steps" aria-label="App progress">
        <li className="active"><span>1</span> Analysis</li>
        <li><span>2</span> Report</li>
      </ol>
      <ApiStrip status={status} />

      <main className="analysis-main">
        <div className="analysis-grid">
          <section className="panel control-panel">
            <div className="section-head compact">
              <span className="eyebrow">Step 1</span>
              <h2>Define the area</h2>
              <p>Search a place or click two corners on the map.</p>
            </div>

            <form className="search-form" onSubmit={handleSearch}>
              <input
                type="text"
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                placeholder="Search a place, e.g. Cairo"
                aria-label="Search a place"
              />
              <button className="btn btn-primary" type="submit" disabled={busy}>Search</button>
            </form>
            <p className="field-feedback" data-kind={feedbackKind}>{feedback}</p>

            <div className="area-readout">
              <span>Area</span>
              <strong>{area || 'Not selected yet'}</strong>
              <small>{bbox ? formatBbox(bbox) : 'Search a place or click two map corners'}</small>
            </div>

            <div className="section-head compact">
              <span className="eyebrow">Step 2</span>
              <h2>Choose the comparison</h2>
              <p>Same season, real Sentinel-2 scenes.</p>
            </div>

            <div className="mode-toggle" role="group" aria-label="Comparison mode">
              <button
                type="button"
                data-active={mode === 'pair' ? 'true' : 'false'}
                onClick={() => changeMode('pair')}
                disabled={busy}
              >
                Two dates
              </button>
              <button
                type="button"
                data-active={mode === 'series' ? 'true' : 'false'}
                onClick={() => changeMode('series')}
                disabled={busy}
              >
                Timeline 3-5 years
              </button>
            </div>

            <div className="field-row">
              {mode === 'pair' ? (
                <>
                  <label className="field">
                    <span>Year A</span>
                    <select value={years[0]} onChange={(event) => updateYear(0, event.target.value)} disabled={busy}>
                      {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Year B</span>
                    <select value={years[1]} onChange={(event) => updateYear(1, event.target.value)} disabled={busy}>
                      {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </label>
                </>
              ) : null}
              <label className="field">
                <span>Season</span>
                <select value={season} onChange={(event) => updateSeason(event.target.value)} disabled={busy}>
                  {Object.keys(SEASONS).map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              </label>
            </div>

            {mode === 'series' ? (
              <div className="years-block">
                <div className="years-head">
                  <span>Timeline years</span>
                  <small>{years.length} / {CONFIG.maxTimelineYears} - unique years</small>
                </div>
                {years.map((year, index) => (
                  <div className="year-row" key={index}>
                    <span className="year-index">{String(index + 1).padStart(2, '0')}</span>
                    <select value={year} onChange={(event) => updateYear(index, event.target.value)} disabled={busy} aria-label={'Timeline year ' + (index + 1)}>
                      {YEAR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <button className="year-remove" type="button" onClick={() => removeYear(index)} disabled={busy || years.length <= CONFIG.minTimelineYears} aria-label={'Remove year ' + year}>
                      Remove
                    </button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-small" type="button" onClick={addYear} disabled={busy || years.length >= CONFIG.maxTimelineYears}>
                  Add year
                </button>
              </div>
            ) : null}

            <div className="action-row">
              <button className="btn btn-primary" type="button" onClick={runAnalysis} disabled={busy || !bbox}>
                {busy ? 'Working...' : 'Run analysis'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={resetArea} disabled={busy}>Reset area</button>
              <button className="btn btn-secondary" type="button" disabled={!hasResults} onClick={() => navigate('/report')}>
                Open report
              </button>
            </div>
            {error ? <p className="field-feedback" data-kind="error">{error}</p> : null}
          </section>

          <section className="panel map-panel">
            <div className="map-head">
              <div>
                <h2>{area || 'Map workspace'}</h2>
                <p>{bbox ? area + ' - ' + periodText + ' - ' + season : 'No area selected - search or click two map corners'}</p>
              </div>
              <span className="map-badge">LIVE MAP</span>
            </div>

            <MapCanvas
              onReady={(map) => { mapRef.current = map; }}
              onPick={handlePick}
              bbox={bbox}
              clickPoints={clickPoints}
              layers={Object.fromEntries(Object.entries(layers).filter(([key]) => activeToggles[key]))}
              showOsm={showOsm}
              activeLayer={activeLayer}
              overlay={overlay}
              hint={clickPoints.length ? 'Corner 1 set - click the opposite corner' : 'Click two corners to draw an area'}
            />

            <div className="map-controls">
              <fieldset>
                <legend>View</legend>
                {[
                  ['before', 'Before'],
                  ['after', 'After'],
                  ['ndvi', 'NDVI'],
                  ['change', 'Change']
                ].map(([value, label]) => (
                  <label key={value}>
                    <input type="radio" name="mapview" checked={view === value} onChange={() => setView(value)} />
                    {label}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Layers</legend>
                <label><input type="checkbox" checked={showOsm} onChange={(event) => setShowOsm(event.target.checked)} /> Map</label>
                {['before', 'after', 'ndvi'].map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={activeToggles[key]}
                      onChange={(event) => setActiveToggles((current) => ({ ...current, [key]: event.target.checked }))}
                    />
                    {key === 'ndvi' ? 'NDVI' : key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                ))}
              </fieldset>
            </div>
          </section>
        </div>

        {comparisonItems.length > 1 ? (
          <section className="panel year-compare">
            <div className="section-head compact">
              <span className="eyebrow">Side by side</span>
              <h2>Year-by-year map comparison</h2>
              <p>The same area, the same season, one true-colour Sentinel-2 scene per year.</p>
            </div>
            <YearComparison items={comparisonItems} bbox={bbox} />
          </section>
        ) : null}

        <section className="panel scene-panel">
          <div className="section-head compact">
            <span className="eyebrow">Selected scenes</span>
            <h2>Evidence used</h2>
          </div>
          <div className="scene-grid">
            {sessionSnapshot && sessionSnapshot.timeline
              ? sessionSnapshot.timeline.map((scene, index) => (
                  <article className="scene-card" key={scene.id + index}>
                    <span>{index === 0 ? 'Start' : index === sessionSnapshot.timeline.length - 1 ? 'End' : 'Step ' + (index + 1)} ({scene.year})</span>
                    <strong title={scene.id}>{scene.id}</strong>
                    <small>
                      {scene.date + ' - ' + Number(scene.cloud).toFixed(1) + '% cloud - ' +
                        (scene.stats && scene.stats.mask && scene.stats.mask.applied
                          ? Number(scene.stats.mask.maskedPercent).toFixed(1) + '% masked'
                          : 'no mask')}
                    </small>
                  </article>
                ))
              : ['before', 'after'].map((key) => {
                  const item = scenes[key];
                  const year = key === 'before' ? years[0] : years[1];
                  return (
                    <article className="scene-card" key={key}>
                      <span>{key === 'before' ? 'Year A' : 'Year B'} ({year})</span>
                      <strong title={item ? item.id : ''}>{item ? item.id : 'Not loaded'}</strong>
                      <small>
                        {item
                          ? String(item.properties.datetime).slice(0, 10) + ' - ' + cloudCover(item).toFixed(1) + '% metadata cloud'
                          : 'No scene selected'}
                      </small>
                    </article>
                  );
                })}
          </div>
        </section>

        {hasResults && comparison && brief ? (
          <section className="panel results-section">
            <div className="section-head">
              <span className="eyebrow">Live result</span>
              <h2>{brief.headline}</h2>
              <p>{brief.summary}</p>
            </div>

            <div className="result-metrics">
              <div><span>Sample area</span><strong>{formatKm2(areaKm2(bbox))}</strong></div>
              <div><span>Time gap</span><strong>{gap === null ? '-' : (gap / 365.25).toFixed(1) + ' years'}</strong></div>
              <div><span>Changed pixels</span><strong>{comparison.changedPercent.toFixed(1)}%</strong></div>
              <div><span>Changed area</span><strong>{formatKm2(brief.sample.changedArea)}</strong></div>
              <div><span>Sample coverage</span><strong>{comparison.coveragePercent.toFixed(1)}%</strong></div>
              <div><span>Scenes used</span><strong>{sessionSnapshot.timeline ? sessionSnapshot.timeline.length : years.length}</strong></div>
            </div>

            {brief.timelineRows.length ? (
              <div className="live-subsection">
                <h3>Timeline by year</h3>
                <div className="result-table-wrap">
                  <table className="docs-table">
                    <thead>
                      <tr><th>Year</th><th>Vegetation</th><th>Water</th><th>Built</th><th>Bare</th><th>Masked</th></tr>
                    </thead>
                    <tbody>
                      {brief.timelineRows.map((row, index) => (
                        <tr key={row.year + index}>
                          <td>{row.year}</td>
                          <td>{row.vegetation.toFixed(1)}%</td>
                          <td>{row.water.toFixed(1)}%</td>
                          <td>{row.built.toFixed(1)}%</td>
                          <td>{row.bare.toFixed(1)}%</td>
                          <td>{row.masked}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {brief.trendRows.length ? (
                  <div className="trend-strip">
                    {brief.trendRows.map((row) => (
                      <span className="trend-badge" data-direction={row.direction} key={row.key}>
                        {row.label}: {row.direction}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="live-subsection">
              <h3>Threshold class change</h3>
              <div className="result-table-wrap">
                <table className="docs-table">
                  <thead>
                    <tr><th>Class estimate</th><th>Before</th><th>After</th><th>Change</th></tr>
                  </thead>
                  <tbody>
                    {CLASS_KEYS.map((key) => (
                      <tr key={key}>
                        <td>{CLASS_LABELS[key]}</td>
                        <td>{comparison.percentagesBefore[key].toFixed(1)}%</td>
                        <td>{comparison.percentagesAfter[key].toFixed(1)}%</td>
                        <td data-tone={tableTone(comparison.deltas[key])}>
                          {(comparison.deltas[key] > 0 ? '+' : '') + comparison.deltas[key].toFixed(1)} pp
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {brief.modelClassRows.length ? (
              <div className="live-subsection">
                <h3>WorldCover-assisted estimate</h3>
                <p className="data-note">
                  Calibrated from ESA WorldCover 2021 labels. This is an in-sample check, not independent validation.
                </p>
                <div className="result-table-wrap">
                  <table className="docs-table">
                    <thead>
                      <tr><th>Class estimate</th><th>Before</th><th>After</th><th>Change</th></tr>
                    </thead>
                    <tbody>
                      {brief.modelClassRows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{row.before.toFixed(1)}%</td>
                          <td>{row.after.toFixed(1)}%</td>
                          <td data-tone={tableTone(row.delta)}>
                            {(row.delta > 0 ? '+' : '') + row.delta.toFixed(1)} pp
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="result-guidance">
              <span className="eyebrow">First decision</span>
              <p>{brief.actions[0].text}</p>
              <button className="btn btn-secondary" type="button" onClick={() => navigate('/report')}>Open full report</button>
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
