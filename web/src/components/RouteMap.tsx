import { useEffect, useRef, useState } from "react";
import { strings } from "../strings";
import { Card } from "./ui";

/**
 * The route map.
 *
 * Uses the Maps JavaScript API with a SEPARATE browser key — referrer-restricted
 * and restricted to Maps JS alone, so it cannot call Places or Routes and
 * cannot spend money. That is the one documented exception to CLAUDE.md rule 3
 * (PRD D-25).
 *
 * When the key is absent the component says so plainly instead of rendering a
 * broken grey box. Everything the map conveys is also present as text beside
 * it, which the UI standards require anyway — so a missing key degrades the
 * screen rather than breaking it.
 */

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  kind: "origin" | "destination" | "stop";
}

const KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

/** Dark style, so the map doesn't glare against #07090f. */
const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0f131c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#07090f" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a0b8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2030" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#07090f" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];

let loader: Promise<void> | null = null;

/**
 * Load the Maps JS API once.
 *
 * `loading=async` is what Google asks for, but it changes the contract:
 * script.onload fires before `google.maps` is populated, so waiting on onload
 * gives you a script that has loaded and an API that is not there yet. The
 * documented answer is a callback parameter, which is what this uses.
 *
 * The cached promise is cleared on failure — otherwise one transient network
 * error would poison every later mount for the life of the page, and the map
 * would claim to be unconfigured when it was merely unlucky.
 */
function loadMaps(): Promise<void> {
  if (!KEY) return Promise.reject(new Error("no key"));
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const callbackName = "__humbleDriveMapsReady";
    // deno-lint-ignore no-explicit-any
    (window as any)[callbackName] = () => resolve();

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=geometry&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error("maps failed to load"));
    document.head.appendChild(script);
  }).catch((err) => {
    loader = null;
    throw err;
  });

  return loader;
}

export function RouteMap({
  polylines,
  markers,
  className = "",
}: {
  /** Selected route last, so it draws on top. */
  polylines: Array<{ encoded: string; selected: boolean }>;
  markers: MapMarker[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!KEY);

  useEffect(() => {
    if (!KEY || !ref.current) return;
    let cancelled = false;

    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        // deno-lint-ignore no-explicit-any
        const g = (window as any).google;
        const map = new g.maps.Map(ref.current, {
          // colorScheme is the current way to get a dark map (Maps JS 3.60+)
          // and it works on both the raster and vector renderers. The JSON
          // `styles` array below only applies to raster maps, and is silently
          // ignored on vector ones — which is why the map came back light
          // despite the styles being correct.
          colorScheme: "DARK",
          styles: DARK_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
        });

        const bounds = new g.maps.LatLngBounds();

        for (const line of polylines) {
          const path = g.maps.geometry.encoding.decodePath(line.encoded);
          new g.maps.Polyline({
            path,
            map,
            strokeColor: line.selected ? "#5b7cc4" : "#4263a6",
            strokeOpacity: line.selected ? 1 : 0.35,
            strokeWeight: line.selected ? 5 : 3,
            zIndex: line.selected ? 2 : 1,
          });
          for (const p of path) bounds.extend(p);
        }

        for (const m of markers) {
          // google.maps.Marker is deprecated in favour of AdvancedMarkerElement,
          // which needs a Map ID and therefore cloud-side configuration. Marker
          // still works and is not scheduled for removal; revisit when the
          // project has a Map ID (ticket 15).
          new g.maps.Marker({
            position: { lat: m.lat, lng: m.lng },
            map,
            title: m.label,
          });
          bounds.extend({ lat: m.lat, lng: m.lng });
        }

        if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [polylines, markers]);

  if (failed) {
    return (
      <Card className={`flex min-h-64 flex-col items-center justify-center gap-2 text-center ${className}`}>
        <p className="text-sm font-medium">{strings.map.unavailable}</p>
        <p className="max-w-xs text-sm text-muted-text">{strings.map.unavailableBody}</p>
      </Card>
    );
  }

  return (
    <div
      ref={ref}
      role="img"
      aria-label={strings.plan.routesTitle}
      className={`min-h-64 overflow-hidden rounded-[var(--radius-token)] border border-edge ${className}`}
    />
  );
}
