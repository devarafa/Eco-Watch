import { buildBrief } from './report.js';

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fixed(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '-';
}

function table(headers, rows, sceneIdColumn = -1) {
  if (!rows.length) {
    return '';
  }
  return '<table><thead><tr>' + headers.map((header) => '<th>' + escapeHtml(header) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((cell, index) =>
      '<td' + (index === sceneIdColumn ? ' class="scene-id"' : '') + '>' + escapeHtml(cell) + '</td>'
    ).join('') + '</tr>').join('') + '</tbody></table>';
}

function section(title, body) {
  if (!body) {
    return '';
  }
  return '<section><h2>' + escapeHtml(title) + '</h2>' + body + '</section>';
}

export function renderReportHtml(session, brief, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const metaRows = brief.meta.map((item) => [item.label, item.value]);
  const evidenceRows = brief.evidenceRows.map((row) => {
    const values = [row.label, row.id, row.date, row.cloud];
    if (brief.evidenceRows.some((item) => item.masked && item.masked !== '-')) {
      values.push(row.masked || '-');
    }
    return values;
  });
  const evidenceHeaders = brief.evidenceRows.some((item) => item.masked && item.masked !== '-')
    ? ['Role', 'Scene ID', 'Date', 'Cloud metadata', 'Masked pixels']
    : ['Role', 'Scene ID', 'Date', 'Cloud metadata'];

  const classRows = brief.classRows.map((row) => [row.label, fixed(row.before) + '%', fixed(row.after) + '%', (row.delta > 0 ? '+' : '') + fixed(row.delta) + ' pp']);
  const timelineRows = (brief.timelineRows || []).map((row) => [
    row.year,
    row.date,
    fixed(row.vegetation) + '%',
    fixed(row.water) + '%',
    fixed(row.built) + '%',
    fixed(row.bare) + '%',
    Number(row.valid || 0).toLocaleString('en-US'),
    row.masked || '-'
  ]);
  const trendRows = (brief.trendRows || []).map((row) => [
    row.label,
    row.net > 0 ? '+' + fixed(row.net) + ' pp' : fixed(row.net) + ' pp',
    row.direction
  ]);
  const modelRows = (brief.modelRows || []).map((row) => [
    row.year,
    fixed(row.agreement) + '%',
    Number(row.trainedOn || 0).toLocaleString('en-US'),
    fixed(row.vegetation) + '%',
    fixed(row.water) + '%',
    fixed(row.built) + '%',
    fixed(row.bare) + '%'
  ]);
  const modelClassRows = (brief.modelClassRows || []).map((row) => [
    row.label,
    fixed(row.before) + '%',
    fixed(row.after) + '%',
    (row.delta > 0 ? '+' : '') + fixed(row.delta) + ' pp'
  ]);
  const findings = '<ul>' + brief.findings.map((text) => '<li>' + escapeHtml(text) + '</li>').join('') + '</ul>';
  const actions = '<ol class="actions">' + brief.actions.map((action) =>
    '<li><strong>' + escapeHtml(action.priority) + '</strong><span>' + escapeHtml(action.text) + '</span></li>'
  ).join('') + '</ol>';
  const limitations = '<ul>' + brief.limitations.map((text) => '<li>' + escapeHtml(text) + '</li>').join('') + '</ul>';

  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>Eco Watch decision report</title>\n' +
    '<style>' +
    ':root{color:#17251d;background:#f3f6f1;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}' +
    'body{margin:0;padding:32px 16px 64px}main{max-width:960px;margin:0 auto}' +
    'header{padding:26px;border:1px solid #cfe0d2;border-radius:14px;background:linear-gradient(135deg,#fff,#edf6ee)}' +
    'h1{margin:8px 0;font-size:30px;line-height:1.2}h2{margin:0 0 12px;font-size:18px}h3{margin:18px 0 8px;font-size:13px;color:#1f7a4d;text-transform:uppercase;letter-spacing:.1em}' +
    'p{line-height:1.65;color:#4b5d51}section{margin-top:16px;padding:20px;border:1px solid #dfe6dd;border-radius:14px;background:#fff;break-inside:avoid}' +
    'table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 10px;border-bottom:1px solid #dfe6dd;text-align:left;vertical-align:top}' +
    'th{background:#f3f7f2;color:#617066;font-size:10px;text-transform:uppercase;letter-spacing:.08em}' +
    '.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.meta div{padding:10px;border:1px solid #dfe6dd;border-radius:9px;background:#fbfcfa}' +
    '.meta span,.meta strong{display:block}.meta span{font-size:10px;color:#617066}.meta strong{font-size:13px;overflow-wrap:anywhere}' +
    'ul,ol{margin:0;padding-left:20px}li{margin-bottom:8px;line-height:1.6}.actions{list-style:none;padding:0}.actions li{display:flex;gap:12px;padding:12px;border:1px solid #dfe6dd;border-radius:10px;background:#fbfefb}' +
    '.actions strong{flex:none;min-width:70px;color:#1f7a4d;font-size:11px;text-transform:uppercase}.actions span{font-size:12px}' +
    '.scene-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;overflow-wrap:anywhere}' +
    'footer{margin-top:20px;color:#617066;font-size:11px;text-align:center}@media(max-width:700px){.meta{grid-template-columns:1fr}body{padding:16px 10px 40px}h1{font-size:24px}}' +
    '@media print{body{background:#fff;padding:0}.panel,section{box-shadow:none}}' +
    '</style>\n</head>\n<body>\n<main>\n' +
    '<header><div>Eco Watch decision report</div><h1>' + escapeHtml(brief.headline) + '</h1><p>' + escapeHtml(brief.summary) + '</p></header>\n' +
    section('Analysis summary', '<div class="meta">' + metaRows.map((row) =>
      '<div><span>' + escapeHtml(row[0]) + '</span><strong>' + escapeHtml(row[1]) + '</strong></div>'
    ).join('') + '</div>') +
    section('Scenes used', table(evidenceHeaders, evidenceRows, 1)) +
    section('Estimated class change', table(['Class', 'Before', 'After', 'Change'], classRows)) +
    section('Timeline by year', table(['Year', 'Date', 'Vegetation', 'Water', 'Built', 'Bare', 'Valid px', 'Masked'], timelineRows)) +
    section('Trend direction', table(['Class', 'Net change', 'Direction'], trendRows)) +
    section('WorldCover-assisted estimates', table(['Year', 'Label agreement', 'Training px', 'Vegetation', 'Water', 'Built', 'Bare'], modelRows) +
      '<h3>Model-assisted class change</h3>' + table(['Class', 'Before', 'After', 'Change'], modelClassRows)) +
    section('Findings', findings) +
    section('Decision now', actions) +
    section('Read before deciding', limitations) +
    '<footer>Generated locally by Eco Watch at ' + escapeHtml(generatedAt) + '. No account, backend or API key is required.</footer>\n' +
    '</main>\n</body>\n</html>\n';
}

function fileSafe(value) {
  return String(value || 'area')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'area';
}

export function downloadReportFile(session) {
  const brief = buildBrief(session);
  const html = renderReportHtml(session, brief);
  const filename = 'eco-watch-report-' + fileSafe(session.area) + '.html';
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, bytes: blob.size };
}
