/**
 * The sign-in illustration.
 *
 * A stylised journey: origin, three break stops, destination — the exact
 * objects the product deals in, rather than generic decoration. Drawn as inline
 * SVG so it inherits the theme tokens, costs no network request, and stays
 * sharp at any size.
 *
 * The dashes travel along the route to suggest movement. That motion is the one
 * flourish on the page, and it stops entirely under prefers-reduced-motion.
 */
export function RouteGraphic({ className = "" }: { className?: string }) {
  // A single path shared by the base line, the moving dashes and the markers,
  // so the pins sit exactly on the route rather than near it.
  const path = "M 40 250 C 90 190, 120 210, 165 165 S 235 95, 290 120 S 360 175, 415 110";

  const stops = [
    { x: 165, y: 165 },
    { x: 290, y: 120 },
  ];

  return (
    <svg
      viewBox="0 0 460 300"
      role="img"
      aria-label="A planned route with break stops between an origin and a destination"
      className={className}
    >
      <defs>
        <linearGradient id="routeFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-brand)" />
          <stop offset="100%" stopColor="var(--color-brand-2)" />
        </linearGradient>
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ground grid, kept very faint — it suggests a map without pretending
          to be one. */}
      <g stroke="var(--color-hairline)" strokeWidth="1">
        {[60, 120, 180, 240].map((y) => (
          <line key={y} x1="0" y1={y} x2="460" y2={y} />
        ))}
        {[80, 160, 240, 320, 400].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="300" />
        ))}
      </g>

      {/* The route: a soft under-stroke for weight, the line itself, then the
          travelling dashes on top. */}
      <path d={path} fill="none" stroke="var(--color-glow)" strokeWidth="14" strokeLinecap="round" />
      <path
        d={path}
        fill="none"
        stroke="url(#routeFade)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d={path}
        fill="none"
        stroke="var(--color-gold)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 22"
        opacity="0.85"
        className="route-dashes"
      />

      {/* Break stops sit on the line, smaller than the endpoints. */}
      {stops.map((s) => (
        <g key={`${s.x}-${s.y}`}>
          <circle cx={s.x} cy={s.y} r="9" fill="var(--color-bg)" stroke="var(--color-brand-2)" strokeWidth="2" />
          <circle cx={s.x} cy={s.y} r="3" fill="var(--color-brand-2)" />
        </g>
      ))}

      {/* Origin */}
      <circle cx="40" cy="250" r="11" fill="var(--color-bg)" stroke="var(--color-brand-2)" strokeWidth="3" />
      <circle cx="40" cy="250" r="4" fill="var(--color-brand-2)" />

      {/* Destination, marked with a pin and lifted by the glow filter so the
          eye lands on where the run ends. */}
      <g filter="url(#softGlow)">
        <path
          d="M 415 92 c 9 0 16 7 16 16 c 0 11 -16 24 -16 24 s -16 -13 -16 -24 c 0 -9 7 -16 16 -16 z"
          fill="var(--color-gold)"
        />
        <circle cx="415" cy="108" r="5.5" fill="var(--color-bg)" />
      </g>
    </svg>
  );
}
