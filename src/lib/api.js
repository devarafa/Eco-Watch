import { CONFIG, SCL_INVALID_CLASSES, WORLDCOVER_LABEL_MAP } from './config.js';
import { trainCentroidClassifier, predictClasses, confusionMatrix } from './classifier.js';
import { englishText } from './format.js';
import { applyMask, buildTrend, compareScenes, countClasses, grayToIndex, percentagesFromCounts, summarizeScene } from './stats.js';

export function englishPlaceName(result, fallback = '') {
  const details = (result && result.namedetails) || {};
  const candidates = [details['name:en'], result && result.display_name, fallback];
  for (const candidate of candidates) {
    const clean = englishText(candidate);
    if (clean) {
      return clean;
    }
  }
  return 'Selected area';
}

async function request(url, options = {}, timeoutMs = CONFIG.timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body && (body.description || body.error || body.message) ? ' - ' + (body.description || body.error || body.message) : '';
      } catch (error) {
        detail = '';
      }
      throw new Error('HTTP ' + response.status + detail + ' - ' + url.split('?')[0]);
    }
    return response;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('Request timed out - ' + url.split('?')[0]);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, options) {
  const response = await request(url, options);
  return response.json();
}

export async function geocode(query, cache, lastSearchRef) {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) {
    return cache.get(key);
  }

  const wait = CONFIG.searchSpacingMs - (Date.now() - lastSearchRef.current);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastSearchRef.current = Date.now();

  const params = new URLSearchParams({ q: query.trim(), format: 'jsonv2', limit: '1', namedetails: '1' });
  const data = await fetchJson(CONFIG.nominatim + '?' + params.toString(), {
    headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    referrerPolicy: 'strict-origin-when-cross-origin'
  });
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No place found for that name');
  }
  const result = data[0];
  result.englishName = englishPlaceName(result, query.trim());
  cache.set(key, result);
  return result;
}

export async function searchScenes(year, range, bbox) {
  const params = new URLSearchParams({
    collections: CONFIG.collection,
    bbox: bbox.join(','),
    datetime: year + '-' + range[0] + 'T00:00:00Z/' + year + '-' + range[1] + 'T23:59:59Z',
    limit: '30'
  });
  const data = await fetchJson(CONFIG.stac + '?' + params.toString(), {
    headers: { Accept: 'application/geo+json' }
  });
  const items = Array.isArray(data.features) ? data.features.slice() : [];
  items.sort((a, b) => cloudCover(a) - cloudCover(b));
  return { best: items[0] || null, count: items.length };
}

export async function searchWorldCover(bbox) {
  const params = new URLSearchParams({
    collections: CONFIG.worldcoverCollection,
    bbox: bbox.join(','),
    limit: '5'
  });
  const data = await fetchJson(CONFIG.stac + '?' + params.toString(), {
    headers: { Accept: 'application/geo+json' }
  });
  return (Array.isArray(data.features) && data.features[0]) || null;
}

export function cloudCover(item) {
  const value = item && item.properties ? item.properties['eo:cloud_cover'] : null;
  return typeof value === 'number' ? value : 100;
}

export async function getTileConfig(item, kind) {
  const params = new URLSearchParams({
    collection: CONFIG.collection,
    item: item.id,
    format: 'png',
    nodata: '0'
  });

  if (kind === 'ndvi') {
    params.set('expression', '(B08-B04)/(B08+B04)');
    params.set('asset_as_band', 'true');
    params.set('rescale', '-1,1');
    params.set('colormap_name', 'rdylgn');
  } else {
    params.set('assets', 'visual');
    params.set('asset_bidx', 'visual|1,2,3');
  }

  const tilejson = await fetchJson(CONFIG.data + '/item/tilejson.json?' + params.toString());
  const url = tilejson.tiles && tilejson.tiles[0];
  if (!url) {
    throw new Error('Tile service returned no URL for ' + kind);
  }
  const bounds = tilejson.bounds
    ? [[tilejson.bounds[1], tilejson.bounds[0]], [tilejson.bounds[3], tilejson.bounds[2]]]
    : null;
  return { url, bounds };
}

async function bitmapFromBlob(blob) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not decode raster'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readRaster(blob, size) {
  const bitmap = await bitmapFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  const values = new Uint8Array(size * size);
  const alpha = new Uint8Array(size * size);

  for (let i = 0; i < values.length; i += 1) {
    values[i] = pixels[i * 4];
    alpha[i] = pixels[i * 4 + 3];
  }
  return { values, alpha, size };
}

export async function fetchIndexRaster(item, expression, bbox, size) {
  const params = new URLSearchParams({
    collection: CONFIG.collection,
    item: item.id,
    expression,
    asset_as_band: 'true',
    nodata: '0',
    rescale: '-1,1',
    format: 'png'
  });
  const url = CONFIG.data + '/item/bbox/' + bbox.join(',') + '/' + size + 'x' + size + '.png?' + params.toString();
  const response = await request(url, { headers: { Accept: 'image/png' } });
  const raster = await readRaster(await response.blob(), size);
  const values = new Float32Array(size * size);
  let valid = 0;

  for (let i = 0; i < values.length; i += 1) {
    if (raster.alpha[i] === 0) {
      values[i] = NaN;
    } else {
      const index = grayToIndex(raster.values[i]);
      values[i] = index === null ? NaN : index;
      valid += 1;
    }
  }

  return { values, valid, size };
}

async function fetchCategoryRaster(item, asset, bbox, size, collection) {
  const params = new URLSearchParams({
    collection,
    item: item.id,
    assets: asset,
    asset_bidx: asset + '|1',
    nodata: '0',
    format: 'png'
  });
  const url = CONFIG.data + '/item/bbox/' + bbox.join(',') + '/' + size + 'x' + size + '.png?' + params.toString();
  const response = await request(url, { headers: { Accept: 'image/png' } });
  return readRaster(await response.blob(), size);
}

export function buildSclMask(raster) {
  const invalid = new Set(SCL_INVALID_CLASSES);
  const mask = new Uint8Array(raster.values.length);
  let valid = 0;
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = raster.alpha[i] > 0 && !invalid.has(raster.values[i]) ? 1 : 0;
    valid += mask[i];
  }
  const total = mask.length;
  return {
    mask,
    validPixels: valid,
    maskedPixels: total - valid,
    maskedPercent: total > 0 ? ((total - valid) / total) * 100 : 0
  };
}

export async function fetchSclMask(item, bbox, size) {
  if (!item || !item.assets || !item.assets.SCL) {
    return null;
  }
  const raster = await fetchCategoryRaster(item, 'SCL', bbox, size, CONFIG.collection);
  return buildSclMask(raster);
}

export function worldCoverClass(code) {
  return WORLDCOVER_LABEL_MAP[code] || null;
}

export async function fetchWorldCoverLabels(item, bbox, size) {
  if (!item || !item.assets || !item.assets.map) {
    return null;
  }
  const raster = await fetchCategoryRaster(item, 'map', bbox, size, CONFIG.worldcoverCollection);
  const labels = new Array(raster.values.length).fill(null);
  const codeCounts = {};
  let usable = 0;

  for (let i = 0; i < labels.length; i += 1) {
    if (raster.alpha[i] === 0) {
      continue;
    }
    const code = raster.values[i];
    const label = worldCoverClass(code);
    if (label) {
      labels[i] = label;
      usable += 1;
    }
    codeCounts[code] = (codeCounts[code] || 0) + 1;
  }

  return { labels, usable, codeCounts, itemId: item.id, labelYear: 2021 };
}

export async function computeSceneStats(item, bbox, size = CONFIG.rasterSize, options = {}) {
  const [ndvi, ndwi, ndbi] = await Promise.all([
    fetchIndexRaster(item, '(B08-B04)/(B08+B04)', bbox, size),
    fetchIndexRaster(item, '(B03-B08)/(B03+B08)', bbox, size),
    fetchIndexRaster(item, '(B11-B08)/(B11+B08)', bbox, size)
  ]);

  const rawIndices = { ndvi: ndvi.values, ndwi: ndwi.values, ndbi: ndbi.values };
  const scl = options.mask === false ? null : await fetchSclMask(item, bbox, size);
  const indices = scl ? applyMask(rawIndices, scl.mask) : rawIndices;
  const summary = summarizeScene(indices);

  const result = {
    summary,
    classes: summary.classes,
    valid: summary.valid,
    meanNdvi: summary.meanNdvi,
    percentages: summary.percentages,
    counts: summary.counts,
    mask: scl
      ? {
          applied: true,
          source: 'Sentinel-2 L2A SCL',
          totalPixels: scl.mask.length,
          validPixels: scl.validPixels,
          maskedPixels: scl.maskedPixels,
          maskedPercent: scl.maskedPercent
        }
      : { applied: false, source: 'Sentinel-2 L2A SCL', totalPixels: size * size }
  };

  const referenceLabels = options.labels && options.labels.labels;
  if (referenceLabels && referenceLabels.length && scl) {
    const features = [];
    const trainingLabels = [];
    const length = Math.min(referenceLabels.length, indices.ndvi.length);

    for (let i = 0; i < length; i += 1) {
      const label = referenceLabels[i];
      if (label && Number.isFinite(indices.ndvi[i]) && Number.isFinite(indices.ndwi[i]) && Number.isFinite(indices.ndbi[i])) {
        features.push([indices.ndvi[i], indices.ndwi[i], indices.ndbi[i]]);
        trainingLabels.push(label);
      }
    }

    if (trainingLabels.length >= CONFIG.minTrainingPixels) {
      const classifier = trainCentroidClassifier(features, trainingLabels);
      const predicted = predictClasses(indices, classifier);
      const agreement = confusionMatrix(referenceLabels, predicted);
      const modelCounts = countClasses(predicted);
      result.modelClasses = predicted;
      result.modelPercentages = percentagesFromCounts(modelCounts, modelCounts.vegetation + modelCounts.water + modelCounts.built + modelCounts.bare);
      result.model = {
        trainedOn: classifier.trainedOn,
        classes: classifier.classes,
        compared: agreement.compared,
        matched: agreement.matched,
        agreementPercent: agreement.agreementPercent,
        labelSource: 'ESA WorldCover 2021',
        labelItem: options.labels.itemId
      };
    }
  }

  return result;
}

export function compactSceneStats(stats) {
  return {
    valid: stats.valid,
    meanNdvi: stats.meanNdvi,
    percentages: stats.percentages,
    counts: stats.counts,
    mask: stats.mask,
    model: stats.model || null,
    modelPercentages: stats.modelPercentages || null
  };
}

export function combineStats(before, after) {
  const comparison = compareScenes(before, after);
  const modelComparison = before.modelClasses && after.modelClasses
    ? compareScenes(before, after, 'modelClasses')
    : null;
  return {
    before: compactSceneStats(before),
    after: compactSceneStats(after),
    comparison,
    modelComparison,
    mask: { before: before.mask, after: after.mask },
    model: { before: before.model || null, after: after.model || null }
  };
}

export function combineTimeline(entries) {
  const full = entries.map((entry, index) => {
    const previous = index > 0 ? entries[index - 1] : null;
    return {
      year: entry.year,
      date: entry.date || String(entry.item.properties.datetime).slice(0, 10),
      id: entry.item.id,
      cloud: cloudCover(entry.item),
      sceneCount: entry.count,
      stats: entry.stats,
      comparison: previous ? compareScenes(previous.stats, entry.stats) : null,
      modelComparison: previous && previous.stats.modelClasses && entry.stats.modelClasses
        ? compareScenes(previous.stats, entry.stats, 'modelClasses')
        : null
    };
  });

  return {
    timeline: full.map((item) => ({ ...item, stats: compactSceneStats(item.stats) })),
    intervals: full.filter((item) => item.comparison),
    trend: buildTrend(full),
    first: full[0] || null,
    last: full[full.length - 1] || null
  };
}

export function savedItem(saved) {
  return {
    id: saved.id,
    properties: {
      datetime: saved.date + 'T00:00:00Z',
      'eo:cloud_cover': saved.cloud
    }
  };
}

export { compareScenes };
