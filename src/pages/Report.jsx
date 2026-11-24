import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { downloadReportFile } from '../lib/export.js';
import { buildBrief } from '../lib/report.js';
import { readSession } from '../lib/session.js';

function tone(value) {
  return value < 0 ? 'down' : value > 0 ? 'up' : 'flat';
}

export default function Report() {
  const session = readSession();
  const brief = session ? buildBrief(session) : null;
  const [exportNote, setExportNote] = useState('');

  function handleExport() {
    if (!session) {
      return;
    }
    try {
      const result = downloadReportFile(session);
      setExportNote('Saved ' + result.filename + ' (' + Math.max(1, Math.round(result.bytes / 1024)) + ' KB).');
    } catch (error) {
      setExportNote('Could not create the report file. ' + error.message);
    }
  }

  const hasMaskColumn = brief && brief.evidenceRows.some((row) => row.masked && row.masked !== '-');

  return (
    <>
      <TopBar step="STEP 2 OF 2 - REPORT" subtitle="Decision report" />
      <ol className="page-steps" aria-label="App progress">
        <li><span>1</span> Analysis</li>
        <li className="active"><span>2</span> Report</li>
      </ol>

      <main className="report-shell">
        {!session || !brief ? (
          <section className="empty-state panel">
            <span className="empty-icon">EW</span>
            <h2>No analysis yet</h2>
            <p>Run an analysis first. The report is built from the scenes and area you selected, and stays in this browser tab.</p>
            <Link className="btn btn-primary" to="/analysis">Go to analysis</Link>
          </section>
        ) : (
          <>
            <section className="report-hero panel">
              <div>
                <span className="eyebrow">Decision brief</span>
                <h1 id="report-title">{brief.headline}</h1>
                <p id="report-subtitle">{brief.summary}</p>
              </div>
              <span className="report-stamp">LOCAL / EVIDENCE BASED</span>
            </section>

            <section className="panel report-section">
              <div className="section-head compact">
                <span className="eyebrow">Snapshot</span>
                <h2>Analysis summary</h2>
              </div>
              <div className="report-meta-grid">
                {brief.meta.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel report-section">
              <div className="section-head compact">
                <span className="eyebrow">Evidence</span>
                <h2>Scenes used</h2>
                <p>Exact Sentinel-2 items selected from the same season. SCL masking removes invalid pixels before measurement.</p>
              </div>
              <div className="docs-table-wrap">
                <table className="docs-table evidence-table">
                  <thead>
                    <tr>
                      <th>Role</th><th>Scene ID</th><th>Date</th><th>Cloud metadata</th>
                      {hasMaskColumn ? <th>Masked pixels</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {brief.evidenceRows.map((row, index) => (
                      <tr key={row.id + index}>
                        <td>{row.label}</td>
                        <td className="scene-id-cell">{row.id}</td>
                        <td>{row.date}</td>
                        <td>{row.cloud}</td>
                        {hasMaskColumn ? <td>{row.masked}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {brief.timelineRows.length ? (
              <section className="panel report-section">
                <div className="section-head compact">
                  <span className="eyebrow">Timeline</span>
                  <h2>Year-by-year estimates</h2>
                  <p>Same-season scenes, with the masked-pixel share for each year.</p>
                </div>
                <div className="docs-table-wrap">
                  <table className="docs-table evidence-table">
                    <thead>
                      <tr><th>Year</th><th>Date</th><th>Vegetation</th><th>Water</th><th>Built</th><th>Bare</th><th>Valid px</th><th>Masked</th></tr>
                    </thead>
                    <tbody>
                      {brief.timelineRows.map((row, index) => (
                        <tr key={row.year + index}>
                          <td>{row.year}</td>
                          <td>{row.date}</td>
                          <td>{row.vegetation.toFixed(1)}%</td>
                          <td>{row.water.toFixed(1)}%</td>
                          <td>{row.built.toFixed(1)}%</td>
                          <td>{row.bare.toFixed(1)}%</td>
                          <td>{Number(row.valid || 0).toLocaleString('en-US')}</td>
                          <td>{row.masked}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="trend-strip">
                  {brief.trendRows.map((row) => (
                    <span className="trend-badge" data-direction={row.direction} key={row.key}>
                      {row.label}: {row.direction}
                    </span>
                  ))}
                </div>
                {brief.earlyWarning.length ? (
                  <ul className="report-list warning-list">
                    {brief.earlyWarning.map((text, index) => <li key={index}>{text}</li>)}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {brief.classRows.length ? (
              <section className="panel report-section">
                <div className="section-head compact">
                  <span className="eyebrow">Pixel evidence</span>
                  <h2>Estimated class change</h2>
                  <p>Spectral-index estimates over comparable pixels in your selected area.</p>
                </div>
                <div className="docs-table-wrap">
                  <table className="docs-table evidence-table">
                    <thead>
                      <tr><th>Class</th><th>Before</th><th>After</th><th>Change</th></tr>
                    </thead>
                    <tbody>
                      {brief.classRows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{row.before.toFixed(1)}%</td>
                          <td>{row.after.toFixed(1)}%</td>
                          <td data-tone={tone(row.delta)}>
                            {(row.delta > 0 ? '+' : '') + row.delta.toFixed(1)} pp
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {brief.modelRows.length || brief.modelClassRows.length ? (
              <section className="panel report-section">
                <div className="section-head compact">
                  <span className="eyebrow">Assisted model</span>
                  <h2>WorldCover-assisted estimate</h2>
                  <p>Calibrated from ESA WorldCover 2021 labels. Agreement is an in-sample check, not independent validation.</p>
                </div>
                {brief.modelRows.length ? (
                  <div className="docs-table-wrap">
                    <table className="docs-table evidence-table">
                      <thead>
                        <tr><th>Year</th><th>Label agreement</th><th>Training pixels</th><th>Vegetation</th><th>Water</th><th>Built</th><th>Bare</th></tr>
                      </thead>
                      <tbody>
                        {brief.modelRows.map((row, index) => (
                          <tr key={row.year + index}>
                            <td>{row.year}</td>
                            <td>{row.agreement.toFixed(1)}%</td>
                            <td>{Number(row.trainedOn || 0).toLocaleString('en-US')}</td>
                            <td>{row.vegetation.toFixed(1)}%</td>
                            <td>{row.water.toFixed(1)}%</td>
                            <td>{row.built.toFixed(1)}%</td>
                            <td>{row.bare.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {brief.modelClassRows.length ? (
                  <div className="result-table-wrap model-change">
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
                            <td data-tone={tone(row.delta)}>
                              {(row.delta > 0 ? '+' : '') + row.delta.toFixed(1)} pp
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="panel report-section">
              <div className="section-head compact">
                <span className="eyebrow">Findings</span>
                <h2>What the pixels suggest</h2>
              </div>
              <ul className="report-list" id="finding-list">
                {brief.findings.map((text, index) => <li key={index}>{text}</li>)}
              </ul>
            </section>

            <section className="panel report-section decision-section">
              <div className="section-head compact">
                <span className="eyebrow">Decision now</span>
                <h2>What to do with this evidence</h2>
                <p>Ordered actions for people who can investigate, manage or protect this area.</p>
              </div>
              <ol className="action-list" id="action-list">
                {brief.actions.map((action, index) => (
                  <li key={index}>
                    <span className="action-priority">{action.priority}</span>
                    <p>{action.text}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel report-section">
              <div className="section-head compact">
                <span className="eyebrow">Limits</span>
                <h2>Read before deciding</h2>
              </div>
              <ul className="report-list muted-list" id="limitation-list">
                {brief.limitations.map((text, index) => <li key={index}>{text}</li>)}
              </ul>
            </section>

            <div className="report-actions">
              <Link className="btn btn-ghost" to="/analysis">Back to analysis</Link>
              <button className="btn btn-primary" type="button" onClick={handleExport}>Download report</button>
            </div>
            {exportNote ? <p className="export-note">{exportNote}</p> : null}
          </>
        )}
      </main>
    </>
  );
}
