import { Link, NavLink, Outlet } from 'react-router-dom';
import { Radar, ShieldCheck, UserRound } from 'lucide-react';
import { cities } from '../data/cities';

export function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <Radar size={24} />
          <span>Escort Radar</span>
        </Link>
        <nav className="desktop-nav">
          {cities.slice(0, 3).map((city) => (
            <NavLink key={city.slug} to={`/city/${city.slug}`}>{city.name}</NavLink>
          ))}
          <NavLink to="/dashboard">Dashboard</NavLink>
        </nav>
        <Link to="/dashboard" className="icon-link" aria-label="Dashboard">
          <UserRound size={20} />
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <div>
          <strong>18+ privacy-first marketplace.</strong>
          <span>No illegal content, coercion, trafficking, minors, or non-consensual data publication.</span>
        </div>
        <div className="footer-links">
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/content-policy">Policy</Link>
          <Link to="/legal/report-abuse"><ShieldCheck size={16} /> Report Abuse</Link>
        </div>
      </footer>
    </div>
  );
}
