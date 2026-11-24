import { CLASS_KEYS } from './stats.js';

const VARIANCE_FLOOR = 0.0004;

function featureArray(feature) {
  if (Array.isArray(feature) || ArrayBuffer.isView(feature)) {
    return [Number(feature[0]), Number(feature[1]), Number(feature[2])];
  }
  return [Number(feature.ndvi), Number(feature.ndwi), Number(feature.ndbi)];
}

export function trainCentroidClassifier(features, labels) {
  const groups = new Map();
  let trainedOn = 0;

  for (let i = 0; i < features.length; i += 1) {
    const label = labels[i];
    if (!CLASS_KEYS.includes(label)) {
      continue;
    }
    const values = featureArray(features[i]);
    if (values.some((value) => !Number.isFinite(value))) {
      continue;
    }
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(values);
    trainedOn += 1;
  }

  const classes = CLASS_KEYS.filter((key) => (groups.get(key) || []).length > 0);
  const means = {};
  const variances = {};
  const priors = {};

  for (const key of classes) {
    const samples = groups.get(key);
    const meansForKey = [0, 0, 0];
    for (const sample of samples) {
      for (let d = 0; d < 3; d += 1) {
        meansForKey[d] += sample[d];
      }
    }
    for (let d = 0; d < 3; d += 1) {
      meansForKey[d] /= samples.length;
    }

    const variancesForKey = [0, 0, 0];
    for (const sample of samples) {
      for (let d = 0; d < 3; d += 1) {
        const delta = sample[d] - meansForKey[d];
        variancesForKey[d] += delta * delta;
      }
    }
    for (let d = 0; d < 3; d += 1) {
      variancesForKey[d] = Math.max(VARIANCE_FLOOR, variancesForKey[d] / samples.length);
    }

    means[key] = meansForKey;
    variances[key] = variancesForKey;
    priors[key] = samples.length / trainedOn;
  }

  function predict(ndvi, ndwi, ndbi) {
    const values = featureArray([ndvi, ndwi, ndbi]);
    if (values.some((value) => !Number.isFinite(value)) || classes.length === 0) {
      return null;
    }

    let best = null;
    let bestScore = -Infinity;
    for (const key of classes) {
      let score = Math.log(priors[key]);
      for (let d = 0; d < 3; d += 1) {
        const delta = values[d] - means[key][d];
        score += -0.5 * ((delta * delta) / variances[key][d] + Math.log(variances[key][d]));
      }
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
    return best;
  }

  return {
    classes,
    means,
    variances,
    priors,
    trainedOn,
    predict
  };
}

export function predictClasses(indices, classifier) {
  const length = Math.min(indices.ndvi.length, indices.ndwi.length, indices.ndbi.length);
  const predictions = new Array(length).fill(null);
  if (!classifier || typeof classifier.predict !== 'function') {
    return predictions;
  }

  for (let i = 0; i < length; i += 1) {
    predictions[i] = classifier.predict(indices.ndvi[i], indices.ndwi[i], indices.ndbi[i]);
  }
  return predictions;
}

export function confusionMatrix(reference, predicted) {
  const matrix = {};
  for (const from of CLASS_KEYS) {
    matrix[from] = {};
    for (const to of CLASS_KEYS) {
      matrix[from][to] = 0;
    }
  }

  let compared = 0;
  let matched = 0;
  const length = Math.min(reference.length, predicted.length);
  for (let i = 0; i < length; i += 1) {
    const from = reference[i];
    const to = predicted[i];
    if (!CLASS_KEYS.includes(from) || !CLASS_KEYS.includes(to)) {
      continue;
    }
    matrix[from][to] += 1;
    compared += 1;
    if (from === to) {
      matched += 1;
    }
  }

  return {
    compared,
    matched,
    agreementPercent: compared > 0 ? (matched / compared) * 100 : 0,
    matrix
  };
}
