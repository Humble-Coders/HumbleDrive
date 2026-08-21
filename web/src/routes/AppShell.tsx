import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { strings } from "../strings";
import { Button } from "../components/ui";
import { Wordmark } from "../components/Wordmark";

/**
 * The authenticated frame every supervisor screen renders inside.
 *
 * Sidebar on desktop, a collapsible panel below 768px. Tickets 5, 6 and 8 fill
 * in the pages without touching layout or routing, which is the whole point of
 * building it once here.
 */

const NAV = [
  { to: "/drivers", label: strings.nav.drivers },
  { to: "/plan", label: strings.nav.plan },
  { to: "/trips", label: strings.nav.trips },
] as const;

function navClass({ isActive }: { isActive: boolean }): string {
  const base =
    "block rounded-[var(--radius-token)] px-3 py-2 text-sm transition-colors min-h-11 content-center";
  return isActive
    ? `${base} bg-secondary text-text font-medium`
    : `${base} text-muted-text hover:bg-secondary hover:text-text`;
}

export function AppShell() {
  const { status, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const supervisorName = status.state === "signed-in" ? status.supervisor.name : "";

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-token)] focus:bg-secondary focus:px-4 focus:py-2"
      >
        {strings.nav.skipToContent}
      </a>

      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        {/* Top bar on mobile, doubling as the sidebar header on desktop. */}
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3 md:hidden">
          <Wordmark className="text-xl" />
          <Button
            variant="secondary"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? strings.common.close : strings.nav.trips}
          </Button>
        </header>

        <nav
          id="primary-nav"
          aria-label={strings.app.name}
          className={`${menuOpen ? "block" : "hidden"} border-b border-edge px-4 py-3 md:block md:w-56 md:shrink-0 md:border-b-0 md:border-r md:px-4 md:py-6`}
        >
          <Wordmark className="mb-6 hidden md:block" />

          <ul className="flex flex-col gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={navClass} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-edge pt-4">
            <p className="truncate px-3 pb-2 text-xs text-muted-text" title={supervisorName}>
              {supervisorName}
            </p>
            <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut()}>
              {strings.nav.signOut}
            </Button>
          </div>
        </nav>

        {/* key on location forces focus-relevant remount per route, which keeps
            screen-reader users oriented when navigating. */}
        <main id="main" key={location.pathname} className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
