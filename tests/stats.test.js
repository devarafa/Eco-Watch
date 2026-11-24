import assert from 'node:assert/strict';
import test from 'node:test';
import { combineTimeline, englishPlaceName } from '../src/lib/api.js';
import { confusionMatrix, predictClasses, trainCentroidClassifier } from '../src/lib/classifier.js';
import { renderReportHtml } from '../src/lib/export.js';
import { englishText, hasNonLatin } from '../src/lib/format.js';
import { buildBrief } from '../src/lib/report.js';
import { applyMask, buildTrend, classifyPixel, compareScenes, grayToIndex, summarizeScene } from '../src/lib/stats.js';

test('grayToIndex maps the 0-255 raster range to -1..1', () => {
  assert.equal(grayToIndex(0), -1);
  assert.equal(grayToIndex(127.5), 0);
  assert.equal(grayToIndex(255), 1);
  assert.equal(grayToIndex(NaN), null);
});

test('classifyPixel uses NDWI, NDVI and NDBI thresholds', () => {
  assert.equal(classifyPixel(0.55, -0.2, -0.1), 'vegetation');
  assert.equal(classifyPixel(0.05, 0.55, -0.2), 'water');
  assert.equal(classifyPixel(0.1, -0.1, 0.3), 'built');
  assert.equal(classifyPixel(0.1, -0.1, -0.1), 'bare');
  assert.equal(classifyPixel(NaN, -0.1, -0.1), null);
});

test('summarizeScene ignores no-data pixels and reports class percentages', () => {
  const summary = summarizeScene({
    ndvi: [0.6, 0.05, 0.1, NaN],
    ndwi: [-0.1, 0.6, -0.1, -0.1],
    ndbi: [-0.1, -0.2, 0.3, -0.1]
  });
  assert.equal(summary.valid, 3);
  assert.equal(summary.counts.vegetation, 1);
  assert.equal(summary.counts.water, 1);
  assert.equal(summary.counts.built, 1);
  assert.ok(Math.abs(summary.percentages.vegetation - 33.333) < 0.01);
  assert.ok(Math.abs(summary.meanNdvi - 0.25) < 0.0001);
});

test('compareScenes reports changed pixels and per-class deltas', () => {
  const before = { classes: ['vegetation', 'vegetation', 'water', 'bare'] };
  const after = { classes: ['vegetation', 'bare', 'water', 'built'] };
  const comparison = compareScenes(before, after);
  assert.equal(comparison.compared, 4);
  assert.equal(comparison.changed, 2);
  assert.equal(comparison.changedPercent, 50);
  assert.equal(comparison.percentagesBefore.vegetation, 50);
  assert.equal(comparison.percentagesAfter.vegetation, 25);
  assert.equal(comparison.deltas.vegetation, -25);
  assert.equal(comparison.percentagesAfter.built, 25);
});

test('buildBrief turns a water decline into an immediate action', () => {
  const session = {
    area: 'Test area',
    bbox: [30, 30, 30.1, 30.1],
    yearA: '2020',
    yearB: '2025',
    season: 'Feb 1 - Mar 31',
    scenes: {
      before: { id: 'before-id', date: '2020-03-01', cloud: 2 },
      after: { id: 'after-id', date: '2025-03-01', cloud: 3 }
    },
    counts: { before: 10, after: 11 },
    stats: {
      before: { valid: 100, meanNdvi: 0.4, percentages: { vegetation: 40, water: 20, built: 10, bare: 30 }, counts: {} },
      after: { valid: 100, meanNdvi: 0.35, percentages: { vegetation: 35, water: 10, built: 15, bare: 40 }, counts: {} },
      comparison: {
        compared: 100,
        totalPixels: 100,
        coveragePercent: 100,
        changedPercent: 20,
        percentagesBefore: { vegetation: 40, water: 20, built: 10, bare: 30 },
        percentagesAfter: { vegetation: 35, water: 10, built: 15, bare: 40 },
        deltas: { vegetation: -5, water: -10, built: 5, bare: 10 },
        gains: {},
        losses: {},
        transitions: {}
      }
    }
  };

  const brief = buildBrief(session);
  assert.match(brief.headline, /Water/i);
  assert.ok(brief.actions.some((action) => action.priority === 'Now' && /water/i.test(action.text)));
  assert.ok(brief.findings.some((text) => /20\.0% of comparable pixels/.test(text)));
  assert.equal(brief.classRows.length, 4);
  assert.equal(brief.actions.length, 2);
});

test('applyMask invalidates pixels rejected by the SCL mask', () => {
  const masked = applyMask(
    { ndvi: [0.6, 0.1, 0.2], ndwi: [-0.1, 0.6, -0.1], ndbi: [-0.1, -0.2, 0.3] },
    [1, 0, 1]
  );
  assert.ok(Number.isFinite(masked.ndvi[0]));
  assert.ok(Number.isNaN(masked.ndvi[1]));
  assert.ok(Number.isNaN(masked.ndwi[1]));
  assert.ok(Number.isFinite(masked.ndbi[2]));
});

test('trainCentroidClassifier predicts mapped classes and reports agreement', () => {
  const prototypes = [
    { features: [0.6, -0.2, -0.1], label: 'vegetation' },
    { features: [0.05, 0.6, -0.2], label: 'water' },
    { features: [0.1, -0.1, 0.3], label: 'built' },
    { features: [0.05, -0.1, -0.1], label: 'bare' }
  ];
  const features = [];
  const labels = [];
  for (let i = 0; i < 30; i += 1) {
    for (const item of prototypes) {
      features.push(item.features);
      labels.push(item.label);
    }
  }
  const classifier = trainCentroidClassifier(features, labels);
  const predictions = predictClasses(
    { ndvi: [0.6, 0.05, 0.1, 0.05], ndwi: [-0.2, 0.6, -0.1, -0.1], ndbi: [-0.1, -0.2, 0.3, -0.1] },
    classifier
  );
  assert.deepEqual(predictions, ['vegetation', 'water', 'built', 'bare']);
  const agreement = confusionMatrix(labels, predictions.concat(labels.slice(0, labels.length - 4)));
  assert.equal(agreement.agreementPercent, 100);
});

test('buildTrend flags classes that move in the same direction every interval', () => {
  const timeline = [
    { comparison: { deltas: { vegetation: -2, water: -1, built: 1, bare: 2 } } },
    { comparison: { deltas: { vegetation: -3, water: -2, built: 2, bare: 3 } } }
  ];
  const trend = buildTrend(timeline);
  assert.equal(trend.rows.find((row) => row.key === 'vegetation').direction, 'decreasing');
  assert.equal(trend.rows.find((row) => row.key === 'bare').direction, 'increasing');
  assert.equal(trend.earlyWarning.length, 4);
});

test('combineTimeline builds interval comparisons without storing pixel arrays', () => {
  const statsFor = (classes) => ({
    valid: classes.length,
    meanNdvi: 0.4,
    percentages: { vegetation: 50, water: 20, built: 10, bare: 20 },
    counts: {},
    mask: { applied: true, maskedPercent: 5 }
  });
  const entries = [
    {
      year: '2020',
      count: 2,
      item: { id: 'scene-a', properties: { datetime: '2020-02-20T00:00:00Z', 'eo:cloud_cover': 1 } },
      stats: { ...statsFor(['vegetation', 'bare']), classes: ['vegetation', 'bare'], modelClasses: ['vegetation', 'bare'] }
    },
    {
      year: '2025',
      count: 3,
      item: { id: 'scene-b', properties: { datetime: '2025-02-20T00:00:00Z', 'eo:cloud_cover': 2 } },
      stats: { ...statsFor(['bare', 'bare']), classes: ['bare', 'bare'], modelClasses: ['bare', 'bare'] }
    }
  ];
  const combined = combineTimeline(entries);
  assert.equal(combined.timeline.length, 2);
  assert.equal(combined.timeline[1].comparison.changed, 1);
  assert.equal(combined.timeline[1].modelComparison.changed, 1);
  assert.equal(combined.trend.rows.length, 4);
  assert.equal('classes' in combined.timeline[0].stats, false);
});

function v3Session() {
  const p1 = { vegetation: 45, water: 20, built: 10, bare: 25 };
  const p2 = { vegetation: 40, water: 15, built: 12, bare: 33 };
  const p3 = { vegetation: 35, water: 10, built: 15, bare: 40 };
  const delta = (a, b) => ({
    vegetation: b.vegetation - a.vegetation,
    water: b.water - a.water,
    built: b.built - a.built,
    bare: b.bare - a.bare
  });
  const comparison = (a, b) => ({
    compared: 100,
    totalPixels: 100,
    coveragePercent: 100,
    changedPercent: 20,
    percentagesBefore: a,
    percentagesAfter: b,
    deltas: delta(a, b),
    gains: {},
    losses: {},
    transitions: {}
  });
  const statsFor = (percentages) => ({
    valid: 100,
    meanNdvi: 0.4,
    percentages,
    counts: {},
    mask: { applied: true, totalPixels: 100, validPixels: 90, maskedPixels: 10, maskedPercent: 10 },
    model: { agreementPercent: 85, trainedOn: 90, compared: 100, classes: ['vegetation', 'water', 'built', 'bare'] },
    modelPercentages: percentages
  });
  const timeline = [
    { year: '2021', date: '2021-02-20', id: 'scene-2021', cloud: 1, count: 2, stats: statsFor(p1), comparison: null },
    { year: '2023', date: '2023-02-20', id: 'scene-2023', cloud: 2, count: 3, stats: statsFor(p2), comparison: comparison(p1, p2) },
    { year: '2025', date: '2025-02-20', id: 'scene-2025', cloud: 1, count: 4, stats: statsFor(p3), comparison: comparison(p2, p3) }
  ];
  return {
    version: 3,
    mode: 'series',
    area: 'Test area',
    bbox: [30, 30, 30.1, 30.1],
    years: ['2021', '2023', '2025'],
    yearA: '2021',
    yearB: '2025',
    season: 'Feb 1 - Mar 31',
    timeline,
    scenes: {
      before: { id: 'scene-2021', date: '2021-02-20', cloud: 1 },
      after: { id: 'scene-2025', date: '2025-02-20', cloud: 1 }
    },
    counts: { before: 2, after: 4 },
    stats: {
      before: statsFor(p1),
      after: statsFor(p3),
      comparison: comparison(p1, p3),
      modelComparison: comparison(p1, p3),
      trend: buildTrend(timeline)
    }
  };
}

test('buildBrief handles a version 3 timeline with model and mask evidence', () => {
  const brief = buildBrief(v3Session());
  assert.equal(brief.timelineRows.length, 3);
  assert.equal(brief.modelRows.length, 3);
  assert.equal(brief.modelClassRows.length, 4);
  assert.equal(brief.trendRows.length, 4);
  assert.equal(brief.actions.length, 2);
  assert.ok(brief.findings.some((text) => /WorldCover-assisted classifier/.test(text)));
  assert.ok(brief.findings.some((text) => /SCL masking/.test(text)));
  assert.ok(brief.limitations.some((text) => /2021 reference labels/.test(text)));
  assert.ok(brief.sample.changedArea > 0);
});

test('renderReportHtml escapes data and writes a self-contained report', () => {
  const session = v3Session();
  session.area = 'Test <img src=x onerror=alert(1)>';
  const brief = buildBrief(session);
  const html = renderReportHtml(session, brief, { generatedAt: '2026-01-01T00:00:00.000Z' });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /<title>Eco Watch decision report<\/title>/);
  assert.match(html, /WorldCover-assisted estimates/);
  assert.match(html, /Decision now/);
  assert.match(html, /2026-01-01/);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
});

test('englishText removes non-Latin scripts from API labels', () => {
  const arabicCity = '\u0637\u0646\u0637\u0627';
  const arabicArea = '\u0637\u0646\u0637\u0627, \u0645\u062d\u0627\u0641\u0638\u0629 \u0627\u0644\u063a\u0631\u0628\u064a\u0629, \u0645\u0635\u0631';
  assert.equal(englishText('Tanta, Gharbiyya Governorate, Egypt'), 'Tanta, Gharbiyya Governorate, Egypt');
  assert.equal(englishText(arabicArea, 'Selected area'), 'Selected area');
  assert.equal(englishText('Tanta (' + arabicCity + '), Egypt'), 'Tanta, Egypt');
  assert.equal(hasNonLatin(arabicCity), true);
  assert.equal(hasNonLatin('Tanta, Egypt'), false);
});

test('englishPlaceName prefers the English name and falls back to the query', () => {
  const arabicArea = '\u0637\u0646\u0637\u0627, \u0645\u0635\u0631';
  assert.equal(englishPlaceName({ namedetails: { 'name:en': 'Tanta' }, display_name: arabicArea }), 'Tanta');
  assert.equal(englishPlaceName({ namedetails: {}, display_name: arabicArea }, 'Tanta, Egypt'), 'Tanta, Egypt');
  assert.equal(englishPlaceName({ namedetails: {}, display_name: '' }), 'Selected area');
});
