import { areaKm2, daysBetween, formatKm2, signed } from './format.js';
import { CLASS_KEYS, CLASS_LABELS, buildTrend, dominantSignal } from './stats.js';

function percent(value) {
  return Number.isFinite(value) ? value.toFixed(1) + '%' : '-';
}

function signedPercent(value) {
  return Number.isFinite(value) ? signed(value, 1) + ' pp' : '-';
}

function number(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function timelineScenes(session) {
  return Array.isArray(session.timeline) && session.timeline.length ? session.timeline : null;
}

function firstScene(session) {
  const timeline = timelineScenes(session);
  return timeline ? timeline[0] : session.scenes.before;
}

function lastScene(session) {
  const timeline = timelineScenes(session);
  return timeline ? timeline[timeline.length - 1] : session.scenes.after;
}

function periodLabel(session) {
  if (Array.isArray(session.years) && session.years.length > 2) {
    return session.years.join(' > ') + ' - ' + session.season;
  }
  return session.yearA + ' to ' + session.yearB + ' - ' + session.season;
}

function sceneCloud(scene) {
  return Number.isFinite(Number(scene.cloud)) ? Number(scene.cloud) : 0;
}

function maskValue(scene) {
  const mask = scene && scene.stats && scene.stats.mask;
  return mask && mask.applied ? percent(mask.maskedPercent) : '-';
}

function baseMeta(session) {
  const before = firstScene(session);
  const after = lastScene(session);
  const gap = daysBetween(before.date, after.date);
  const timeline = timelineScenes(session);

  return [
    { label: 'Area', value: session.area || 'Custom area' },
    { label: 'Period', value: periodLabel(session) },
    { label: 'Sample area', value: formatKm2(areaKm2(session.bbox)) },
    { label: 'Time gap', value: gap === null ? '-' : (gap / 365.25).toFixed(1) + ' years' },
    {
      label: 'Cloud metadata',
      value: sceneCloud(before).toFixed(1) + '% / ' + sceneCloud(after).toFixed(1) + '%'
    },
    {
      label: 'Pixel mask',
      value: timeline
        ? 'SCL applied to ' + timeline.length + ' scenes'
        : session.stats && session.stats.mask && session.stats.mask.before && session.stats.mask.before.applied
          ? 'SCL applied'
          : 'Metadata only'
    }
  ];
}

function evidenceRows(session) {
  const timeline = timelineScenes(session);
  if (timeline) {
    return timeline.map((scene, index) => ({
      label: index === 0 ? 'Start' : index === timeline.length - 1 ? 'End' : 'Step ' + (index + 1),
      id: scene.id,
      date: scene.date,
      cloud: sceneCloud(scene).toFixed(1) + '%',
      masked: maskValue(scene)
    }));
  }

  return [
    {
      label: 'Before',
      id: session.scenes.before.id,
      date: session.scenes.before.date,
      cloud: Number(session.scenes.before.cloud).toFixed(1) + '%',
      masked: '-'
    },
    {
      label: 'After',
      id: session.scenes.after.id,
      date: session.scenes.after.date,
      cloud: Number(session.scenes.after.cloud).toFixed(1) + '%',
      masked: '-'
    }
  ];
}

function timelineRows(session) {
  const timeline = timelineScenes(session);
  if (!timeline) {
    return [];
  }
  return timeline.map((scene, index) => ({
    year: scene.year,
    date: scene.date,
    vegetation: scene.stats && scene.stats.percentages ? scene.stats.percentages.vegetation : NaN,
    water: scene.stats && scene.stats.percentages ? scene.stats.percentages.water : NaN,
    built: scene.stats && scene.stats.percentages ? scene.stats.percentages.built : NaN,
    bare: scene.stats && scene.stats.percentages ? scene.stats.percentages.bare : NaN,
    valid: scene.stats ? scene.stats.valid : 0,
    masked: maskValue(scene),
    delta: index > 0 && scene.comparison ? scene.comparison.deltas : null
  }));
}

function trendData(session) {
  const timeline = timelineScenes(session);
  if (!timeline) {
    return { rows: [], earlyWarning: [] };
  }
  return (session.stats && session.stats.trend) || buildTrend(timeline);
}

function latestModel(session, stats) {
  const timeline = timelineScenes(session);
  if (timeline) {
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      if (timeline[index].stats && timeline[index].stats.model) {
        return timeline[index].stats.model;
      }
    }
  }
  return stats.model && stats.model.after;
}

function modelRows(session) {
  const timeline = timelineScenes(session);
  if (!timeline) {
    return [];
  }
  return timeline
    .filter((scene) => scene.stats && scene.stats.model)
    .map((scene) => ({
      year: scene.year,
      agreement: scene.stats.model.agreementPercent,
      trainedOn: scene.stats.model.trainedOn,
      vegetation: scene.stats.modelPercentages ? scene.stats.modelPercentages.vegetation : NaN,
      water: scene.stats.modelPercentages ? scene.stats.modelPercentages.water : NaN,
      built: scene.stats.modelPercentages ? scene.stats.modelPercentages.built : NaN,
      bare: scene.stats.modelPercentages ? scene.stats.modelPercentages.bare : NaN
    }));
}

function modelClassRows(session) {
  const modelComparison = session.stats && session.stats.modelComparison;
  if (!modelComparison) {
    return [];
  }
  return CLASS_KEYS.map((key) => ({
    key,
    label: CLASS_LABELS[key],
    before: modelComparison.percentagesBefore[key],
    after: modelComparison.percentagesAfter[key],
    delta: modelComparison.deltas[key]
  }));
}

function noStatsBrief(session) {
  return {
    headline: 'Scene evidence is ready. Pixel change estimates are missing.',
    summary:
      'This saved run has real scene metadata but no pixel statistics. Run the analysis again to compute land-cover change estimates and decision actions from the selected area.',
    meta: baseMeta(session),
    evidenceRows: evidenceRows(session),
    classRows: [],
    timelineRows: timelineRows(session),
    trendRows: [],
    earlyWarning: [],
    modelRows: [],
    modelClassRows: [],
    findings: [
      'Sentinel-2 scenes were selected from the same season in different years.',
      'Pixel statistics were not stored for this saved run.'
    ],
    actions: [
      { priority: 'Now', text: 'Return to Analysis and run the analysis again to compute pixel-based change estimates.' },
      { priority: 'Always', text: 'Use the saved scene IDs only as a lead. Do not make a land-management decision from metadata alone.' }
    ],
    limitations: [
      'Pixel statistics were not stored for this older session.',
      'Satellite evidence is a screening tool. Confirm any intervention with local data and an on-site visit.'
    ],
    sample: null
  };
}

function buildFindings(session, stats, comparison, trend) {
  const meanBefore = stats.before.meanNdvi;
  const meanAfter = stats.after.meanNdvi;
  const ndviDelta = Number.isFinite(meanBefore) && Number.isFinite(meanAfter) ? meanAfter - meanBefore : null;
  const timeline = timelineScenes(session);
  const findings = [];

  if (timeline) {
    findings.push(
      timeline.length + ' real Sentinel-2 scenes were selected from the same seasonal window between ' +
        timeline[0].year + ' and ' + timeline[timeline.length - 1].year + '.'
    );
  }

  if (ndviDelta !== null) {
    const direction = ndviDelta > 0.02 ? 'increased' : ndviDelta < -0.02 ? 'decreased' : 'stayed nearly stable';
    findings.push('Mean NDVI ' + direction + ' from ' + number(meanBefore) + ' to ' + number(meanAfter) + ' (' + signed(ndviDelta, 3) + ').');
  }

  for (const key of CLASS_KEYS) {
    const delta = comparison.deltas[key];
    if (Math.abs(delta) >= 1) {
      findings.push(
        CLASS_LABELS[key] + ' estimate moved from ' + percent(comparison.percentagesBefore[key]) +
          ' to ' + percent(comparison.percentagesAfter[key]) + ' (' + signedPercent(delta) + ').'
      );
    }
  }

  findings.push(
    'About ' + percent(comparison.changedPercent) + ' of comparable pixels changed class between the first and last scenes, covering ' +
      percent(comparison.coveragePercent) + ' of the selected image sample.'
  );

  for (const warning of trend.earlyWarning) {
    findings.push(warning);
  }

  const model = latestModel(session, stats);
  if (model && Number.isFinite(model.agreementPercent)) {
    findings.push(
      'The WorldCover-assisted classifier matched its 2021 reference labels on ' + percent(model.agreementPercent) +
        ' of ' + model.compared.toLocaleString('en-US') + ' compared pixels. This is an in-sample calibration check, not independent validation.'
    );
  }

  const firstMask = timeline && timeline[0].stats && timeline[0].stats.mask;
  const lastMask = timeline && timeline[timeline.length - 1].stats && timeline[timeline.length - 1].stats.mask;
  if (firstMask && lastMask && firstMask.applied && lastMask.applied) {
    findings.push(
      'Per-pixel SCL masking removed ' + percent(firstMask.maskedPercent) + ' of the first scene and ' +
        percent(lastMask.maskedPercent) + ' of the last scene before comparison.'
    );
  }

  return findings;
}

function primarySignal(comparison, trend) {
  if (trend.earlyWarning.length) {
    const warning = trend.earlyWarning[0];
    if (/Vegetation/.test(warning)) return { key: 'vegetation', delta: comparison.deltas.vegetation, repeated: true };
    if (/Water/.test(warning)) return { key: 'water', delta: comparison.deltas.water, repeated: true };
    if (/Bare/.test(warning)) return { key: 'bare', delta: comparison.deltas.bare, repeated: true };
    if (/Hard/.test(warning)) return { key: 'built', delta: comparison.deltas.built, repeated: true };
  }

  const candidates = [
    { key: 'water', delta: comparison.deltas.water, priority: 1 },
    { key: 'vegetation', delta: comparison.deltas.vegetation, priority: 2 },
    { key: 'built', delta: comparison.deltas.built, priority: 3 },
    { key: 'bare', delta: comparison.deltas.bare, priority: 4 }
  ].filter((item) => Math.abs(item.delta) >= 2);
  candidates.sort((a, b) => a.priority - b.priority || Math.abs(b.delta) - Math.abs(a.delta));
  return candidates[0] ? { ...candidates[0], repeated: false } : null;
}

function buildActions(session, stats, comparison, trend) {
  const signal = primarySignal(comparison, trend);
  let first;

  if (signal && signal.key === 'water' && signal.delta < 0) {
    first = {
      priority: 'Now',
      text:
        (signal.repeated ? 'Water declined in every interval. ' : '') +
        'Inspect canals, reservoirs and irrigation offtakes after a ' + number(Math.abs(signal.delta), 1) +
        ' pp water-index decline. Check abstraction records before deciding on restrictions.'
    };
  } else if (signal && signal.key === 'vegetation' && signal.delta < 0) {
    first = {
      priority: 'Now',
      text:
        (signal.repeated ? 'Vegetation declined in every interval. ' : '') +
        'Field-check the ' + number(Math.abs(signal.delta), 1) +
        ' pp vegetation decline against farm records, irrigation logs and recent land-use permits.'
    };
  } else if (signal && signal.key === 'built' && signal.delta > 0) {
    first = {
      priority: 'This week',
      text:
        (signal.repeated ? 'Hard surfaces increased in every interval. ' : '') +
        'Review the ' + number(signal.delta, 1) +
        ' pp rise in hard surfaces against planning records, starting at farmland and waterway edges.'
    };
  } else if (signal && signal.key === 'bare' && signal.delta > 0) {
    first = {
      priority: 'This week',
      text:
        (signal.repeated ? 'Bare soil increased in every interval. ' : '') +
        'Check rainfall, ploughing and land use for desertification risk after a ' + number(signal.delta, 1) +
        ' pp bare-soil increase.'
    };
  } else if (signal && signal.delta > 0) {
    first = {
      priority: 'Monitor',
      text:
        CLASS_LABELS[signal.key] + ' rose by ' + number(signal.delta, 1) +
        ' pp. Confirm whether this is a crop cycle, seasonal water or real gain, then keep it as a baseline.'
    };
  } else {
    first = {
      priority: 'Monitor',
      text:
        'No class moved by 2 pp or more. Keep this comparison as the baseline and repeat the same season next year to catch early drift.'
    };
  }

  const maxCloud = Math.max(sceneCloud(firstScene(session)), sceneCloud(lastScene(session)));
  const modelNote = latestModel(session, stats)
    ? ' The WorldCover-assisted estimate is calibrated from 2021 labels, not confirmed ground truth for these scene years.'
    : '';
  const cloudNote = maxCloud > 10
    ? ' One scene reports ' + maxCloud.toFixed(1) + '% metadata cloud cover, so inspect the imagery visually.'
    : '';

  return [
    first,
    {
      priority: 'Always',
      text:
        'Before funds or enforcement are committed, confirm this screening result with local records or a site visit.' +
        modelNote + cloudNote
    }
  ];
}

function buildHeadline(comparison, trend) {
  if (trend.earlyWarning.length) {
    return 'Repeated signal across the timeline - ' + trend.earlyWarning[0].split('.')[0].toLowerCase();
  }
  const signal = dominantSignal(comparison);
  if (!signal || Math.abs(signal.delta) < 1) {
    return 'No strong spectral shift in the sampled area';
  }
  const direction = signal.delta < 0 ? 'decline' : 'rise';
  return CLASS_LABELS[signal.key] + ' shows the clearest ' + direction + ' (' + signedPercent(signal.delta) + ')';
}

export function buildBrief(session) {
  const stats = session.stats;
  if (!stats || !stats.before || !stats.after || !stats.comparison) {
    return noStatsBrief(session);
  }

  const comparison = stats.comparison;
  const trend = trendData(session);
  const changedArea = areaKm2(session.bbox) * (comparison.coveragePercent / 100) * (comparison.changedPercent / 100);
  const classRows = CLASS_KEYS.map((key) => ({
    key,
    label: CLASS_LABELS[key],
    before: comparison.percentagesBefore[key],
    after: comparison.percentagesAfter[key],
    delta: comparison.deltas[key]
  }));
  const timeline = timelineScenes(session);

  return {
    headline: buildHeadline(comparison, trend),
    summary:
      (timeline
        ? 'A ' + timeline.length + '-scene same-season Sentinel-2 timeline from ' + timeline[0].year + ' to ' +
          timeline[timeline.length - 1].year + '.'
        : 'A ' + (daysBetween(session.scenes.before.date, session.scenes.after.date) / 365.25).toFixed(1) +
          '-year same-season comparison of Sentinel-2 scenes.') +
      ' Estimates come from three spectral indices read from ' + comparison.compared.toLocaleString('en-US') +
      ' comparable pixels in the selected area.',
    meta: baseMeta(session).concat([
      { label: 'Changed pixels', value: percent(comparison.changedPercent) },
      { label: 'Approx. changed area', value: formatKm2(changedArea) }
    ]),
    evidenceRows: evidenceRows(session),
    classRows,
    timelineRows: timelineRows(session),
    trendRows: trend.rows,
    earlyWarning: trend.earlyWarning,
    modelRows: modelRows(session),
    modelClassRows: modelClassRows(session),
    findings: buildFindings(session, stats, comparison, trend),
    actions: buildActions(session, stats, comparison, trend),
    limitations: timeline
      ? [
          'Threshold classes are screening signals, not a validated land-cover product.',
          'The WorldCover-assisted classifier uses 2021 reference labels for all scene years; it is calibrated, not independently validated.',
          'SCL masking removes invalid and cloudy classes, but thin cloud and shadows can remain.',
          'The estimate is sampled at 128 x 128 pixels over the selected box; small parcels and narrow waterways can be missed.',
          'Only pixels covered by all compared scenes are used. Coverage for this run is ' + percent(comparison.coveragePercent) + '.',
          'Satellite evidence is a screening tool. Confirm any intervention with local data and an on-site visit.'
        ]
      : [
          'Classes are estimated from NDVI, NDWI and NDBI thresholds, not from a supervised or validated land-cover model.',
          'The estimate is sampled at 128 x 128 pixels over the selected box; small parcels and narrow waterways can be missed.',
          'Only pixels covered by both scenes are compared. Coverage for this run is ' + percent(comparison.coveragePercent) + '.',
          'This older session has no per-pixel SCL mask or WorldCover-assisted classifier.',
          'Satellite evidence is a screening tool. Confirm any intervention with local data and an on-site visit.'
        ],
    sample: {
      changedPercent: comparison.changedPercent,
      changedArea,
      coveragePercent: comparison.coveragePercent,
      comparedPixels: comparison.compared
    }
  };
}
