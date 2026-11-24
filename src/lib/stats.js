export const CLASS_KEYS = ['vegetation', 'water', 'built', 'bare'];

export const CLASS_LABELS = {
  vegetation: 'Vegetation',
  water: 'Water',
  built: 'Built-up / hard surface',
  bare: 'Bare soil / other'
};

export const INDEX_EXPRESSIONS = {
  ndvi: '(B08-B04)/(B08+B04)',
  ndwi: '(B03-B08)/(B03+B08)',
  ndbi: '(B11-B08)/(B11+B08)'
};

export function grayToIndex(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return (value / 255) * 2 - 1;
}

export function applyMask(indices, mask) {
  if (!mask || !mask.length) {
    return indices;
  }
  const length = Math.min(indices.ndvi.length, indices.ndwi.length, indices.ndbi.length, mask.length);
  const ndvi = Float32Array.from(indices.ndvi.subarray ? indices.ndvi.subarray(0, length) : indices.ndvi.slice(0, length));
  const ndwi = Float32Array.from(indices.ndwi.subarray ? indices.ndwi.subarray(0, length) : indices.ndwi.slice(0, length));
  const ndbi = Float32Array.from(indices.ndbi.subarray ? indices.ndbi.subarray(0, length) : indices.ndbi.slice(0, length));

  for (let i = 0; i < length; i += 1) {
    if (!mask[i]) {
      ndvi[i] = NaN;
      ndwi[i] = NaN;
      ndbi[i] = NaN;
    }
  }
  return { ndvi, ndwi, ndbi };
}

export function classifyPixel(ndvi, ndwi, ndbi) {
  const values = [ndvi, ndwi, ndbi];
  if (values.some((value) => value === null || !Number.isFinite(value))) {
    return null;
  }
  if (ndwi > 0.25 && ndvi < 0.4) {
    return 'water';
  }
  if (ndvi > 0.25) {
    return 'vegetation';
  }
  if (ndbi > 0.08 && ndvi < 0.25) {
    return 'built';
  }
  return 'bare';
}

export function countClasses(classes) {
  const counts = { vegetation: 0, water: 0, built: 0, bare: 0 };
  for (const value of classes) {
    if (CLASS_KEYS.includes(value)) {
      counts[value] += 1;
    }
  }
  return counts;
}

export function percentagesFromCounts(counts, total) {
  const percentages = {};
  for (const key of CLASS_KEYS) {
    percentages[key] = total > 0 ? (counts[key] / total) * 100 : 0;
  }
  return percentages;
}

export function summarizeScene(indices) {
  const ndvi = indices.ndvi;
  const length = Math.min(ndvi.length, indices.ndwi.length, indices.ndbi.length);
  const classes = new Array(length);
  let ndviSum = 0;
  let ndviCount = 0;

  for (let i = 0; i < length; i += 1) {
    const vegetationIndex = ndvi[i];
    const waterIndex = indices.ndwi[i];
    const builtIndex = indices.ndbi[i];
    const pixelClass = classifyPixel(vegetationIndex, waterIndex, builtIndex);
    classes[i] = pixelClass;
    if (Number.isFinite(vegetationIndex)) {
      ndviSum += vegetationIndex;
      ndviCount += 1;
    }
  }

  const counts = countClasses(classes);
  return {
    classes,
    valid: counts.vegetation + counts.water + counts.built + counts.bare,
    meanNdvi: ndviCount > 0 ? ndviSum / ndviCount : null,
    counts,
    percentages: percentagesFromCounts(counts, counts.vegetation + counts.water + counts.built + counts.bare)
  };
}

export function compareScenes(before, after, classKey = 'classes') {
  const beforeClasses = before[classKey] || before.classes;
  const afterClasses = after[classKey] || after.classes;
  if (!beforeClasses || !afterClasses) {
    return null;
  }
  const length = Math.min(beforeClasses.length, afterClasses.length);
  const countsBefore = { vegetation: 0, water: 0, built: 0, bare: 0 };
  const countsAfter = { vegetation: 0, water: 0, built: 0, bare: 0 };
  const transitions = {};
  let compared = 0;
  let changed = 0;

  for (let i = 0; i < length; i += 1) {
    const from = beforeClasses[i];
    const to = afterClasses[i];
    if (!CLASS_KEYS.includes(from) || !CLASS_KEYS.includes(to)) {
      continue;
    }
    compared += 1;
    countsBefore[from] += 1;
    countsAfter[to] += 1;
    if (from !== to) {
      changed += 1;
      const key = from + '>' + to;
      transitions[key] = (transitions[key] || 0) + 1;
    }
  }

  const percentagesBefore = percentagesFromCounts(countsBefore, compared);
  const percentagesAfter = percentagesFromCounts(countsAfter, compared);
  const deltas = {};
  for (const key of CLASS_KEYS) {
    deltas[key] = percentagesAfter[key] - percentagesBefore[key];
  }

  const gains = { vegetation: 0, water: 0, built: 0, bare: 0 };
  const losses = { vegetation: 0, water: 0, built: 0, bare: 0 };
  for (const [key, count] of Object.entries(transitions)) {
    const [from, to] = key.split('>');
    losses[from] += (count / compared) * 100;
    gains[to] += (count / compared) * 100;
  }

  return {
    compared,
    totalPixels: length,
    coveragePercent: length > 0 ? (compared / length) * 100 : 0,
    changed,
    changedPercent: compared > 0 ? (changed / compared) * 100 : 0,
    countsBefore,
    countsAfter,
    percentagesBefore,
    percentagesAfter,
    deltas,
    gains,
    losses,
    transitions
  };
}

export function dominantSignal(comparison) {
  if (!comparison || !comparison.deltas) {
    return null;
  }
  let key = null;
  let value = 0;
  for (const classKey of CLASS_KEYS) {
    const delta = comparison.deltas[classKey];
    if (Math.abs(delta) > Math.abs(value)) {
      key = classKey;
      value = delta;
    }
  }
  return key ? { key, delta: value } : null;
}

export function buildTrend(timeline) {
  const rows = CLASS_KEYS.map((key) => {
    const deltas = timeline
      .map((item) => (item.comparison ? item.comparison.deltas[key] : NaN))
      .filter((value) => Number.isFinite(value));
    let direction = 'mixed';
    if (deltas.length >= 2 && deltas.every((value) => value >= 1)) {
      direction = 'increasing';
    } else if (deltas.length >= 2 && deltas.every((value) => value <= -1)) {
      direction = 'decreasing';
    }
    return {
      key,
      label: CLASS_LABELS[key],
      deltas,
      direction,
      net: deltas.length ? deltas.reduce((sum, value) => sum + value, 0) : 0
    };
  });

  const earlyWarning = [];
  const vegetation = rows.find((row) => row.key === 'vegetation');
  const water = rows.find((row) => row.key === 'water');
  const bare = rows.find((row) => row.key === 'bare');
  const built = rows.find((row) => row.key === 'built');

  if (vegetation && vegetation.direction === 'decreasing') {
    earlyWarning.push('Vegetation declined in every interval. Treat this as an early vegetation-loss signal.');
  }
  if (water && water.direction === 'decreasing') {
    earlyWarning.push('Water declined in every interval. Check abstraction, irrigation and storage before the next dry season.');
  }
  if (bare && bare.direction === 'increasing') {
    earlyWarning.push('Bare soil increased in every interval. Check rainfall and land use for desertification risk.');
  }
  if (built && built.direction === 'increasing') {
    earlyWarning.push('Hard surfaces increased in every interval. Review planning records and farmland edges.');
  }

  return { rows, earlyWarning };
}
