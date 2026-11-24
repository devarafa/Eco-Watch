import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';

export default function ProjectDetails() {
  return (
    <>
      <TopBar step="DOCUMENTATION" subtitle="Project reference" />
      <main className="docs-shell">
        <section className="page-intro">
          <span className="eyebrow">Project reference</span>
          <h1>Resources and data sources</h1>
          <p>
            Everything used to build Eco Watch is free, public and anonymous. This page explains what we use,
            why we use it, and what it can and cannot do. The app itself is a React + Vite web app with no backend.
          </p>
          <Link className="btn btn-ghost" to="/">Back to Home</Link>
        </section>

        <section className="panel docs-section">
          <div className="section-head">
            <h2>Current stack</h2>
            <p>One frontend, real public services.</p>
          </div>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <thead>
                <tr><th>Layer</th><th>Choice</th><th>Role</th><th>Cost</th></tr>
              </thead>
              <tbody>
                <tr><td>Interface</td><td>React + Vite</td><td>Four screens, responsive layout, no framework lock-in</td><td>Free / MIT</td></tr>
                <tr><td>Map</td><td>Leaflet 1.9</td><td>Interactive map, layers, scale and bbox drawing</td><td>Free / BSD-2-Clause</td></tr>
                <tr><td>Basemap</td><td>OpenStreetMap tiles</td><td>Worldwide geographic reference</td><td>Free / ODbL</td></tr>
                <tr><td>AI assistant</td><td>Free.ai / LLM7.io / OVHcloud</td><td>Live chat on every page, with a local answer fallback</td><td>Free anonymous tier</td></tr>
                <tr><td>Hosting target</td><td>Any static host</td><td>Cloudflare Pages, GitHub Pages or similar</td><td>Free tier available</td></tr>
                <tr><td>Source code</td><td>GitHub repository</td><td>Complete React + Vite project, issues and contributions</td><td>Free / MIT</td></tr>
              </tbody>
            </table>
          </div>
          <p className="micro-note">
            Full source code: <a href="https://github.com/devarafa/Eco-Watch" target="_blank" rel="noopener noreferrer">github.com/devarafa/Eco-Watch</a>.
            The repository holds the complete React + Vite project and is open for issues and contributions.
          </p>
        </section>

        <section className="panel docs-section">
          <div className="section-head">
            <h2>APIs and data sources</h2>
            <p>Public endpoints used by the current build.</p>
          </div>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <thead>
                <tr><th>Source</th><th>What it gives us</th><th>Key?</th><th>Terms to respect</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Nominatim</td>
                  <td>Place name to coordinates and bounding box</td>
                  <td>No</td>
                  <td>Max 1 request/second, no autocomplete, show attribution, ODbL data</td>
                </tr>
                <tr>
                  <td>Planetary Computer STAC</td>
                  <td>Search Sentinel-2 L2A items by bbox and date</td>
                  <td>No</td>
                  <td>Public catalog, CORS enabled</td>
                </tr>
                <tr>
                  <td>Planetary Computer Data API</td>
                  <td>True-colour tiles, NDVI / NDWI / NDBI rasters, SCL masks and WorldCover labels</td>
                  <td>No</td>
                  <td>Public tile and crop services, CORS enabled</td>
                </tr>
                <tr>
                  <td>Sentinel-2 L2A SCL</td>
                  <td>Per-pixel scene classification used to remove invalid, cloudy and shadowed pixels</td>
                  <td>No</td>
                  <td>Copernicus open data</td>
                </tr>
                <tr>
                  <td>ESA WorldCover 2021</td>
                  <td>Reference labels used to train an in-browser assisted classifier</td>
                  <td>No</td>
                  <td>ESA open data; label year is fixed at 2021</td>
                </tr>
                <tr>
                  <td>Sentinel-2 L2A</td>
                  <td>10 m multispectral imagery, including red, blue, near-infrared and SWIR</td>
                  <td>No</td>
                  <td>Copernicus open data</td>
                </tr>
                <tr>
                  <td>Free.ai</td>
                  <td>Primary keyless chat completions using qwen3-8b, with mistral as the backup model</td>
                  <td>No</td>
                  <td>Public anonymous endpoint; prompts may be logged</td>
                </tr>
                <tr>
                  <td>LLM7.io</td>
                  <td>Fallback chat completions when Free.ai is busy</td>
                  <td>No</td>
                  <td>Public anonymous endpoint; prompts may be logged</td>
                </tr>
                <tr>
                  <td>OVHcloud AI Endpoints</td>
                  <td>Additional fallback chat completions</td>
                  <td>No</td>
                  <td>Anonymous limit of 2 requests per minute per IP and model</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="micro-note">
            No Hugging Face token, Google Maps key, paid GPU or backend is used. The AI assistant calls free public
            endpoints without a key and falls back to local answers if they are unavailable. Free services can change,
            so do not send sensitive data through the chat.
          </p>
        </section>

        <section className="panel docs-section">
          <div className="section-head">
            <h2>How a request flows</h2>
            <p>From a place name to a decision brief.</p>
          </div>
          <ol className="flow-list">
            <li><b>Locate.</b> Nominatim resolves an explicit place search into a bounded area.</li>
            <li><b>Select.</b> STAC returns candidate Sentinel-2 scenes; the least-cloudy item is chosen for each selected year.</li>
            <li><b>Mask.</b> The Sentinel-2 L2A SCL band removes invalid, cloudy and shadowed pixels before measurement.</li>
            <li><b>Measure.</b> The Data API returns 128 x 128 pixel index rasters for NDVI, NDWI and NDBI, plus WorldCover reference labels.</li>
            <li><b>Classify.</b> Pixels are screened by index thresholds and also classified by a small centroid model trained in the browser from WorldCover labels.</li>
            <li><b>Compare.</b> Valid pixels are compared between two dates or across a 3 to 5 year timeline, with trend direction per class and a side-by-side true-colour map for every year.</li>
            <li><b>Report.</b> Scene metadata, class percentages, changed area, limits and two actions are saved in the browser tab and can be downloaded as an HTML file.</li>
            <li><b>Ask.</b> The AI assistant explains the evidence and answers general questions; a local answer is used if the public service is unavailable.</li>
          </ol>
        </section>

        <section className="panel docs-section">
          <div className="section-head">
            <h2>Honest limitations</h2>
            <p>What the current build does not claim.</p>
          </div>
          <ul className="limit-list">
            <li>Threshold classes are screening signals. The WorldCover-assisted classifier is calibrated from 2021 labels, not independently validated ground truth for every scene year.</li>
            <li>Model agreement is measured on the same pixels used to train it, so it is a calibration check, not an accuracy claim.</li>
            <li>SCL masking removes invalid classes, cloud and cloud shadows, but thin cloud and shadows can remain.</li>
            <li>The 128 x 128 sample can miss small parcels, narrow waterways and thin roads.</li>
            <li>The report is a screening brief with exactly two actions. Confirm any intervention with local data or a site visit.</li>
            <li>Public AI services can be busy or change their terms. The app never asks for keys or private data.</li>
          </ul>
        </section>

        <section className="panel docs-section">
          <div className="section-head">
            <h2>Attribution</h2>
            <p>Sources that must stay credited.</p>
          </div>
          <p className="attribution-text">
            Map data: OpenStreetMap contributors, available under ODbL.
            Satellite imagery: Copernicus Sentinel-2 data via Microsoft Planetary Computer.
            Reference labels: ESA WorldCover 2021 via Microsoft Planetary Computer.
            Hero image: NASA Landsat view of the Ganges River delta via Wikimedia Commons, public domain.
            AI chat: Free.ai, LLM7.io and OVHcloud AI Endpoints.
          </p>
        </section>
      </main>
    </>
  );
}
