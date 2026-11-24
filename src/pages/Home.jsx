import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';

const STEPS = [
  {
    number: '1',
    title: 'Choose',
    text: 'Find any place by name, or click two corners on the map to draw your own area.'
  },
  {
    number: '2',
    title: 'Compare',
    text: 'Pick two dates in the same season. Eco Watch finds the least-cloudy Sentinel-2 scene for each one.'
  },
  {
    number: '3',
    title: 'Measure',
    text: 'Real pixels are read for vegetation, water and built-up signals, then compared between the two dates.'
  },
  {
    number: '4',
    title: 'Decide',
    text: 'Read a short evidence brief with changed-area estimates and actions you can take now.'
  }
];

const OUTPUTS = [
  { number: '01', title: 'Real satellite scenes', text: 'Sentinel-2 L2A imagery selected from the Planetary Computer catalog.' },
  { number: '02', title: 'Change evidence', text: 'NDVI, NDWI and NDBI sampled from your area, with a changed-pixel percentage and a side-by-side map for every year.' },
  { number: '03', title: 'Decision brief', text: 'A structured report with findings, two priority actions, limits and a downloadable file.' },
  { number: '04', title: 'Live AI assistant', text: 'Ask about any term, any step, or your own result. It stays open on every page.' }
];

export default function Home() {
  return (
    <>
      <TopBar subtitle="Open-source environmental change explorer" />
      <main className="home-main">
        <section className="landing-hero">
          <img className="hero-image" src="/assets/hero-satellite.jpg" alt="Landsat satellite view of the Ganges River delta" />
          <div className="hero-copy">
            <span className="eyebrow">Free / Open source / Educational</span>
            <h1>See how the Earth changes.</h1>
            <p className="hero-lead">
              Compare satellite scenes of any area on Earth at two dates or across a 3 to 5 year timeline. Get real pixel evidence and a clear decision brief.
            </p>
            <Link className="btn btn-primary btn-centered" to="/analysis">Start Analysis</Link>
          </div>
        </section>

        <section className="home-section">
          <div className="section-head">
            <span className="eyebrow">Workflow</span>
            <h2>How it works</h2>
            <p>From a place name to evidence you can act on.</p>
          </div>
          <div className="step-flow">
            {STEPS.map((step) => (
              <article className="step-card" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section">
          <div className="section-head">
            <span className="eyebrow">Outputs</span>
            <h2>What you get</h2>
            <p>Simple outputs, honest limits.</p>
          </div>
          <div className="feature-grid">
            {OUTPUTS.map((item) => (
              <article className="feature-card" key={item.number}>
                <span className="feature-icon">{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section open-section">
          <div className="section-head">
            <span className="eyebrow">Open by design</span>
            <h2>Built to be open</h2>
          </div>
          <div className="open-card">
            <div>
              <h3>Real engines, no black box</h3>
              <p>
                MIT licensed and designed for a public repository. Data stays in your browser tab,
                and every source is credited in the project details. The engines behind it are real:
                Nominatim, Planetary Computer STAC, the Sentinel-2 Data API and a live AI assistant.
              </p>
              <Link className="text-link" to="/project-details">Project details</Link>
            </div>
          </div>
          <div className="tech-strip">
            <span>React + Vite</span>
            <span>Leaflet</span>
            <span>OpenStreetMap</span>
            <span>Nominatim</span>
            <span>Planetary Computer</span>
            <span>Sentinel-2 L2A</span>
            <span>Live AI assistant</span>
            <span>MIT License</span>
          </div>
        </section>
      </main>
    </>
  );
}
