const CHANGE_COLORS = {
  'water>vegetation': [47, 143, 91],
  'vegetation>water': [47, 127, 199],
  'bare>vegetation': [47, 174, 106],
  'vegetation>bare': [206, 118, 46],
  'bare>water': [47, 127, 199],
  'water>bare': [156, 110, 62],
  'bare>built': [226, 78, 66],
  'vegetation>built': [226, 78, 66],
  'water>built': [226, 78, 66],
  'built>bare': [136, 145, 150],
  'built>vegetation': [47, 174, 106],
  'built>water': [47, 127, 199]
};

export function createChangeOverlay(beforeClasses, afterClasses, bounds, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  let changed = 0;

  for (let i = 0; i < size * size; i += 1) {
    const from = beforeClasses[i];
    const to = afterClasses[i];
    if (!from || !to || from === to) {
      continue;
    }
    const color = CHANGE_COLORS[from + '>' + to] || [240, 180, 60];
    const offset = i * 4;
    image.data[offset] = color[0];
    image.data[offset + 1] = color[1];
    image.data[offset + 2] = color[2];
    image.data[offset + 3] = 215;
    changed += 1;
  }

  context.putImageData(image, 0, 0);
  return {
    url: canvas.toDataURL('image/png'),
    bounds,
    changed
  };
}

export const CHANGE_LEGEND = [
  { color: '#2fae6a', label: 'New vegetation' },
  { color: '#ce762e', label: 'Vegetation loss' },
  { color: '#2f7fc7', label: 'Water change' },
  { color: '#e24e42', label: 'New hard surface' },
  { color: '#889199', label: 'Hard surface removed' }
];
