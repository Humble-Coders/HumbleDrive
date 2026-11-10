import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { callFunction, messageFor } from "../lib/api";
import { strings } from "../strings";
import { duration, distance } from "../lib/format";
import { PlaceSearch, type Place } from "../components/PlaceSearch";
import { RouteMap, type MapMarker } from "../components/RouteMap";
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  LoadingState,
  PageHeader,

  StepIndicator,
} from "../components/ui";
import { RouteGraphic } from "../components/RouteGraphic";
import { IconPin, IconRoute } from "../components/icons";

/**
 * The planning wizard.
 *
 * The shape of this screen follows from one fact about the Routes API:
 * alternatives are returned only when there are NO intermediate waypoints. So
 * the supervisor picks a corridor first (step 2), and stops refine that choice
 * (step 3). When the first stop is added the three cards collapse to one, and
 * the UI says why — silently dropping two options is the failure this
 * constraint invites (PRD §4.3, D-16).
 *
 * Stops are the driver's rest, food and fuel breaks. Nothing is dropped off at
 * one (D-3).
 *
 * State lives in sessionStorage: losing three minutes of planning to a stray
 * refresh is bad on its own, and re-fetching the route bills Google again.
 */

const STORAGE_KEY = "humbledrive.plan.v1";
const MAX_STOPS = 10;

type StopType = "break" | "food" | "fuel" | "other";

interface Stop extends Place {
  stop_type: StopType;
  planned_minutes: number;
}

interface RouteOption {
  id: string;
  summary: string;
  distance_m: number;
  duration_s: number;
  encoded_polyline: string;
}

interface Consignment {
  ref: string;
  description: string;
  weight_kg: string;
  receiver_name: string;
  receiver_phone: string;
}

interface DriverOption {
  id: string;
  name: string;
  active: boolean;
  current_trip: { id: string } | null;
}

interface WizardState {
  step: number;
  origin: Place | null;
  destination: Place | null;
  routes: RouteOption[];
  selected: number;
  refined: boolean;
  providerResponse: unknown;
  stops: Stop[];
  consignment: Consignment;
  driverId: string;
}

const EMPTY: WizardState = {
  step: 1,
  origin: null,
  destination: null,
  routes: [],
  selected: 0,
  refined: false,
  providerResponse: null,
  stops: [],
  consignment: { ref: "", description: "", weight_kg: "", receiver_name: "", receiver_phone: "" },
  driverId: "",
};

const STOP_LABELS: Record<StopType, string> = {
  break: strings.plan.typeBreak,
  food: strings.plan.typeFood,
  fuel: strings.plan.typeFuel,
  other: strings.plan.typeOther,
};

function load(): WizardState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as WizardState) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function Plan() {
  const navigate = useNavigate();
  const [s, setS] = useState<WizardState>(load);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DriverOption[] | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ codeSent: boolean } | null>(null);

  const patch = useCallback((next: Partial<WizardState>) => setS((prev) => ({ ...prev, ...next })), []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, [s]);

  /** Fetch routes. Called with no stops for step 2, with stops for step 3. */
  const fetchRoutes = useCallback(async (origin: Place, destination: Place, stops: Stop[]) => {
    setRoutesLoading(true);
    setError(null);
    try {
      const res = await callFunction<{
        routes: RouteOption[];
        refined: boolean;
        provider_response: unknown;
      }>("routes-preview", {
        body: {
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          stops: stops.map((st) => ({ lat: st.lat, lng: st.lng })),
        },
      });
      setS((prev) => ({
        ...prev,
        routes: res.routes,
        refined: res.refined,
        providerResponse: res.provider_response,
        selected: res.refined ? 0 : Math.min(prev.selected, Math.max(res.routes.length - 1, 0)),
      }));
    } catch (err) {
      setError(messageFor(err));
      setS((prev) => ({ ...prev, routes: [] }));
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  // Step 3 re-requests on every stop edit, debounced so typing a stop name
  // doesn't fire five calls. Ticket 4 caches identical requests behind this.
  const stopsKey = useMemo(
    () => s.stops.map((st) => `${st.lat},${st.lng}`).join("|"),
    [s.stops],
  );
  const firstRun = useRef(true);
  useEffect(() => {
    if (s.step !== 3 || !s.origin || !s.destination) return;
    if (firstRun.current) {
      firstRun.current = false;
      if (s.stops.length === 0) return;
    }
    const timer = setTimeout(() => {
      void fetchRoutes(s.origin!, s.destination!, s.stops);
    }, 500);
    return () => clearTimeout(timer);
  }, [stopsKey, s.step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s.step !== 4 || drivers !== null) return;
    void (async () => {
      try {
        const res = await callFunction<{ drivers: DriverOption[] }>("drivers", {
          body: { action: "list" },
        });
        setDrivers(res.drivers);
      } catch (err) {
        setError(messageFor(err));
        setDrivers([]);
      }
    })();
  }, [s.step, drivers]);

  const route = s.routes[s.selected] ?? null;
  const breakSeconds = s.stops.reduce((sum, st) => sum + st.planned_minutes * 60, 0);
  const totalSeconds = (route?.duration_s ?? 0) + breakSeconds;

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    if (s.origin) out.push({ ...s.origin, label: s.origin.name, kind: "origin" });
    s.stops.forEach((st, i) => out.push({ ...st, label: `${i + 1}. ${st.name}`, kind: "stop" }));
    if (s.destination) out.push({ ...s.destination, label: s.destination.name, kind: "destination" });
    return out;
  }, [s.origin, s.destination, s.stops]);

  const polylines = useMemo(
    () =>
      s.routes.map((r, i) => ({ encoded: r.encoded_polyline, selected: i === s.selected }))
        .sort((a, b) => Number(a.selected) - Number(b.selected)),
    [s.routes, s.selected],
  );

  const freeDrivers = (drivers ?? []).filter((d) => d.active && !d.current_trip);

  async function goToStep2() {
    if (!s.origin || !s.destination) return;
    patch({ step: 2 });
    await fetchRoutes(s.origin, s.destination, []);
  }

  function moveStop(from: number, to: number) {
    if (to < 0 || to >= s.stops.length) return;
    const next = [...s.stops];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch({ stops: next });
  }

  async function submit() {
    if (!s.origin || !s.destination || !route) return;
    setSending(true);
    setError(null);
    try {
      const res = await callFunction<{ trip_id: string; code_sent: boolean }>("trips", {
        body: {
          action: "create",
          driver_id: s.driverId,
          route: {
            origin_name: s.origin.name,
            origin_place_id: s.origin.place_id,
            origin_lat: s.origin.lat,
            origin_lng: s.origin.lng,
            dest_name: s.destination.name,
            dest_place_id: s.destination.place_id,
            dest_lat: s.destination.lat,
            dest_lng: s.destination.lng,
            encoded_polyline: route.encoded_polyline,
            distance_m: route.distance_m,
            drive_duration_s: route.duration_s,
            provider_response: s.providerResponse,
          },
          stops: s.stops.map((st) => ({
            name: st.name,
            place_id: st.place_id,
            lat: st.lat,
            lng: st.lng,
            stop_type: st.stop_type,
            planned_minutes: st.planned_minutes,
          })),
          consignment: s.consignment,
        },
      });
      // Cleared on success so a refresh cannot offer to recreate a trip that
      // already exists.
      sessionStorage.removeItem(STORAGE_KEY);
      setDone({ codeSent: res.code_sent });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <>
        <PageHeader title={strings.plan.title} />
        <EmptyState
          title={strings.plan.createdTitle}
          body={done.codeSent ? strings.plan.createdBody : strings.plan.createdNoEmail}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => { setDone(null); setS(EMPTY); setDrivers(null); }}>
                {strings.plan.planAnother}
              </Button>
              <Button variant="secondary" onClick={() => navigate("/trips")}>
                {strings.plan.viewTrips}
              </Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={strings.plan.title} />

      <StepIndicator
        steps={[
          strings.plan.stepShort1,
          strings.plan.stepShort2,
          strings.plan.stepShort3,
          strings.plan.stepShort4,
        ]}
        current={s.step}
        onGoTo={(step) => patch({ step })}
      />

      {error && (
        <div className="mb-4">
          <Banner
            action={
              s.origin && s.destination ? (
                <Button variant="secondary" onClick={() => void fetchRoutes(s.origin!, s.destination!, s.step >= 3 ? s.stops : [])}>
                  {strings.common.retry}
                </Button>
              ) : undefined
            }
          >
            {error}
          </Banner>
        </div>
      )}

      {s.step === 1 && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <Card className="flex flex-col gap-5">
            <div className="flex items-center gap-2 text-muted-text">
              <IconRoute />
              <span className="text-xs font-medium tracking-wide uppercase">{strings.plan.step1}</span>
            </div>
            <PlaceSearch label={strings.plan.origin} value={s.origin} onSelect={(p) => patch({ origin: p, routes: [] })} />
            <PlaceSearch label={strings.plan.destination} value={s.destination} onSelect={(p) => patch({ destination: p, routes: [] })} />
            <div className="flex justify-end">
              <Button disabled={!s.origin || !s.destination} onClick={() => void goToStep2()}>
                {strings.plan.next}
              </Button>
            </div>
          </Card>

          {/* Before there is a route there is nothing truthful to draw, so the
              illustration stands in rather than an empty grey map. */}
          <Card className="hidden flex-col items-center gap-4 py-10 lg:flex">
            <RouteGraphic className="w-full max-w-md" />
            <div className="max-w-sm text-center">
              <p className="font-medium">{strings.plan.emptyRouteTitle}</p>
              <p className="mt-1 text-sm text-muted-text">{strings.plan.emptyRouteBody}</p>
            </div>
          </Card>
        </div>
      )}

      {(s.step === 2 || s.step === 3) && (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <RouteMap polylines={polylines} markers={markers} className="min-h-64 lg:min-h-[28rem]" />

          <div className="flex flex-col gap-4">
            {routesLoading && <LoadingState label={strings.common.loading} />}

            {!routesLoading && s.routes.length === 0 && !error && (
              <Banner tone="info">{strings.plan.noRoutes}</Banner>
            )}

            {s.step === 2 && s.routes.length > 0 && (
              <Card className="flex flex-col gap-3">
                <div>
                  <h2 className="font-medium">{strings.plan.routesTitle}</h2>
                  <p className="text-sm text-muted-text">{strings.plan.routesHint}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {s.routes.map((r, i) => {
                    const fastest =
                      s.routes.length > 1 &&
                      r.duration_s === Math.min(...s.routes.map((x) => x.duration_s));
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          aria-pressed={i === s.selected}
                          onClick={() => patch({ selected: i })}
                          className={`w-full rounded-[var(--radius-token)] border px-3 py-3 text-left transition-colors ${
                            i === s.selected
                              ? "border-brand-2 bg-secondary"
                              : "border-edge hover:bg-secondary"
                          }`}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-lg font-semibold tabular-nums">
                              {duration(r.duration_s)}
                            </span>
                            {fastest && <Badge tone="accent">{strings.plan.fastest}</Badge>}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-text">
                            <IconPin className="h-3 w-3" />
                            <span className="truncate">
                              {distance(r.distance_m)}
                              {r.summary ? ` · ${r.summary}` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex justify-between">
                  <Button variant="secondary" onClick={() => patch({ step: 1 })}>{strings.plan.back}</Button>
                  <Button onClick={() => patch({ step: 3 })}>{strings.plan.next}</Button>
                </div>
              </Card>
            )}

            {s.step === 3 && (
              <Card className="flex flex-col gap-3">
                <div>
                  <h2 className="font-medium">{strings.plan.stopsTitle}</h2>
                  <p className="text-sm text-muted-text">{strings.plan.stopsHint}</p>
                </div>

                {/* Said out loud, not silently enacted. */}
                {s.stops.length > 0 && <Banner tone="info">{strings.plan.refinedNotice}</Banner>}

                {s.stops.length === 0 ? (
                  <p className="text-sm text-muted-text">{strings.plan.noStops}</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {s.stops.map((st, i) => (
                      <li key={`${st.place_id}-${i}`} className="rounded-[var(--radius-token)] border border-edge bg-secondary/40 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-xs text-muted-text">
                              {i + 1}
                            </span>
                            <span className="min-w-0 truncate text-sm font-medium" title={st.name}>
                              {st.name}
                            </span>
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" aria-label={`${strings.plan.moveUp}: ${st.name}`} onClick={() => moveStop(i, i - 1)}>↑</Button>
                            <Button variant="ghost" aria-label={`${strings.plan.moveDown}: ${st.name}`} onClick={() => moveStop(i, i + 1)}>↓</Button>
                            <Button variant="danger" aria-label={`${strings.plan.remove}: ${st.name}`} onClick={() => patch({ stops: s.stops.filter((_, j) => j !== i) })}>×</Button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <label className="flex items-center gap-2 text-xs text-muted-text">
                            {strings.plan.stopType}
                            <select
                              value={st.stop_type}
                              onChange={(e) => patch({ stops: s.stops.map((x, j) => j === i ? { ...x, stop_type: e.target.value as StopType } : x) })}
                              className="min-h-11 rounded-[var(--radius-token)] border border-edge bg-secondary px-2 text-sm text-text"
                            >
                              {(Object.keys(STOP_LABELS) as StopType[]).map((t) => (
                                <option key={t} value={t}>{STOP_LABELS[t]}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-muted-text">
                            {strings.plan.stopMinutes}
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={st.planned_minutes}
                              onChange={(e) => patch({ stops: s.stops.map((x, j) => j === i ? { ...x, planned_minutes: Math.max(0, Number(e.target.value) || 0) } : x) })}
                              className="min-h-11 w-20 rounded-[var(--radius-token)] border border-edge bg-secondary px-2 text-sm text-text"
                            />
                          </label>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {s.stops.length >= MAX_STOPS ? (
                  <p className="text-xs text-gold">{strings.plan.maxStops}</p>
                ) : (
                  <PlaceSearch
                    label={strings.plan.addStop}
                    value={null}
                    onSelect={(p) => p && patch({ stops: [...s.stops, { ...p, stop_type: "break", planned_minutes: 30 }] })}
                  />
                )}

                <Timing driveSeconds={route?.duration_s ?? 0} breakSeconds={breakSeconds} totalSeconds={totalSeconds} />

                <div className="flex justify-between">
                  <Button variant="secondary" onClick={() => patch({ step: 2, stops: s.stops })}>{strings.plan.back}</Button>
                  <Button disabled={!route} onClick={() => patch({ step: 4 })}>{strings.plan.next}</Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {s.step === 4 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <h2 className="font-medium">{strings.plan.consignmentTitle}</h2>
            <Field label={strings.plan.ref} autoCapitalize="characters" value={s.consignment.ref} onChange={(e) => patch({ consignment: { ...s.consignment, ref: e.target.value } })} />
            <Field label={strings.plan.description} value={s.consignment.description} onChange={(e) => patch({ consignment: { ...s.consignment, description: e.target.value } })} />
            <Field label={strings.plan.weight} type="number" inputMode="decimal" min={0} value={s.consignment.weight_kg} onChange={(e) => patch({ consignment: { ...s.consignment, weight_kg: e.target.value } })} />
            <Field label={strings.plan.receiverName} autoCapitalize="words" value={s.consignment.receiver_name} onChange={(e) => patch({ consignment: { ...s.consignment, receiver_name: e.target.value } })} />
            <Field label={strings.plan.receiverPhone} type="tel" inputMode="numeric" value={s.consignment.receiver_phone} onChange={(e) => patch({ consignment: { ...s.consignment, receiver_phone: e.target.value } })} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="driver" className="text-sm font-medium">{strings.plan.driver}</label>
              {drivers === null ? (
                <LoadingState label={strings.common.loading} />
              ) : freeDrivers.length === 0 ? (
                <p className="text-sm text-gold">{strings.plan.noFreeDrivers}</p>
              ) : (
                <select
                  id="driver"
                  value={s.driverId}
                  onChange={(e) => patch({ driverId: e.target.value })}
                  className="min-h-11 rounded-[var(--radius-token)] border border-edge bg-secondary px-3 text-text"
                >
                  <option value="">{strings.plan.chooseDriver}</option>
                  {freeDrivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">{strings.plan.summaryTitle}</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label={strings.plan.origin} value={s.origin?.name ?? "—"} />
              <Row label={strings.plan.destination} value={s.destination?.name ?? "—"} />
              {s.stops.map((st, i) => (
                <Row key={i} label={`${i + 1}. ${STOP_LABELS[st.stop_type]}`} value={`${st.name} · ${st.planned_minutes} min`} />
              ))}
            </dl>
            <Timing driveSeconds={route?.duration_s ?? 0} breakSeconds={breakSeconds} totalSeconds={totalSeconds} />
            <div className="mt-2 flex justify-between">
              <Button variant="secondary" onClick={() => patch({ step: 3 })}>{strings.plan.back}</Button>
              <Button disabled={!s.driverId || !route} busy={sending} busyLabel={strings.plan.sending} onClick={() => void submit()}>
                {strings.plan.send}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

/** Drive + break + total, all three visible. A six-hour drive with 90 minutes
 *  of breaks is a seven-and-a-half-hour day, and the supervisor should see it. */
function Timing({ driveSeconds, breakSeconds, totalSeconds }: { driveSeconds: number; breakSeconds: number; totalSeconds: number }) {
  // Drive, break and total all shown. The total is the number a supervisor
  // commits to, so it carries the accent; the two parts explain how it got
  // there.
  return (
    <dl className="grid grid-cols-3 divide-x divide-edge overflow-hidden rounded-[var(--radius-token)] border border-edge bg-secondary text-center">
      {[
        [strings.plan.driveTime, duration(driveSeconds), false],
        [strings.plan.breakTime, duration(breakSeconds), false],
        [strings.plan.totalShort, duration(totalSeconds), true],
      ].map(([label, value, accent]) => (
        <div key={label as string} className="px-2 py-3">
          <dt className="text-[0.7rem] tracking-wide whitespace-nowrap text-muted-text uppercase">{label}</dt>
          <dd className={`mt-0.5 font-semibold whitespace-nowrap tabular-nums ${accent ? "text-gold" : "text-text"}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-text">{label}</dt>
      <dd className="min-w-0 truncate text-right" title={value}>{value}</dd>
    </div>
  );
}
