import { Link } from 'react-router-dom';

export default function TopBar({ step, subtitle = 'Environmental change explorer' }) {
  return (
    <header className="topbar">
      <Link className="brand" to="/" aria-label="Eco Watch home">
        <img className="brand-logo" src="/eco-watch-logo.svg" alt="Eco Watch logo" />
        <span className="brand-copy">
          <strong>Eco Watch</strong>
          <small>{subtitle}</small>
        </span>
      </Link>
      {step ? <span className="status-pill">{step}</span> : null}
    </header>
  );
}
