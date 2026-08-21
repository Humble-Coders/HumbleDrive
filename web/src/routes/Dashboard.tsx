import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { callFunction, messageFor } from "../lib/api";
import { strings } from "../strings";
import { duration, dateTime, plural } from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import { IconClock, IconPin, IconTruck, IconUsers } from "../components/icons";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SectionTitle,
  StatTile,
} from "../components/ui";

/**
 * The landing screen.
 *
 * A supervisor opens the app to answer one question — what is happening right
 * now — so the live figures come first and history recedes below them. This is
 * a screen that gets scanned, not read, which is why state is carried by shape
 * and number rather than prose.
 */

interface TripRow {
  id: string;
  status: string;
  created_at: string;
  drivers: { name: string } | null;
  routes: {
    origin_name: string;
    dest_name: string;
    drive_duration_s: number;
    route_stops: Array<{ planned_minutes: number }>;
  } | null;
}

interface DriverRow {
  id: string;
  active: boolean;
  current_trip: { id: string } | null;
}

function plannedTotal(row: TripRow): number {
  const drive = row.routes?.drive_duration_s ?? 0;
  const breaks = (row.routes?.route_stops ?? []).reduce((s, x) => s + x.planned_minutes * 60, 0);
  return drive + breaks;
}

export function Dashboard() {
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // One page of recent runs for the list, plus per-status totals for the
      // tiles. Counting client-side over a page would be wrong the moment there
      // are more than ten runs.
      const [recent, driverList, ...statusCounts] = await Promise.all([
        callFunction<{ trips: TripRow[]; total: number }>("trips", {
          body: { action: "list", limit: 6, offset: 0 },
        }),
        callFunction<{ drivers: DriverRow[] }>("drivers", { body: { action: "list" } }),
        ...["active", "pending", "completed"].map((s) =>
          callFunction<{ total: number }>("trips", {
            body: { action: "list", status: [s], limit: 1, offset: 0 },
          }).then((r) => ({ status: s, total: r.total })),
        ),
      ]);

      setTrips(recent.trips);
      setDrivers(driverList.drivers);
      setCounts(
        Object.fromEntries(
          (statusCounts as Array<{ status: string; total: number }>).map((c) => [c.status, c.total]),
        ),
      );
    } catch (err) {
      setError(messageFor(err));
      setTrips([]);
      setDrivers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDrivers = (drivers ?? []).filter((d) => d.active).length;
  const loading = trips === null || drivers === null;

  return (
    <>
      <PageHeader
        title={strings.dashboard.title}
        description={strings.dashboard.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/drivers">
              <Button variant="secondary">{strings.dashboard.quickDrivers}</Button>
            </Link>
            <Link to="/plan">
              <Button>{strings.dashboard.quickPlan}</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <Banner action={<Button variant="secondary" onClick={() => void load()}>{strings.common.retry}</Button>}>
            {error}
          </Banner>
        </div>
      )}

      {loading ? (
        <LoadingState label={strings.common.loading} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={strings.dashboard.onTheRoad}
              value={counts.active ?? 0}
              tone={(counts.active ?? 0) > 0 ? "accent" : "default"}
              icon={<IconTruck />}
              hint={(counts.active ?? 0) === 0 ? strings.dashboard.noneMoving : strings.dashboard.movingNow}
            />
            <StatTile
              label={strings.dashboard.awaitingStart}
              value={counts.pending ?? 0}
              icon={<IconClock />}
              hint={strings.dashboard.codeSentHint}
            />
            <StatTile
              label={strings.dashboard.activeDrivers}
              value={activeDrivers}
              icon={<IconUsers />}
              hint={`${(drivers ?? []).filter((d) => d.current_trip).length} assigned`}
            />
            <StatTile
              label={strings.dashboard.completedRuns}
              value={counts.completed ?? 0}
              icon={<IconPin />}
              hint={strings.dashboard.deliveredHint}
            />
          </div>

          <div>
            <SectionTitle
              action={
                <Link to="/trips" className="text-sm text-muted-text underline-offset-4 hover:text-text hover:underline">
                  {strings.dashboard.viewAll}
                </Link>
              }
            >
              {strings.dashboard.recent}
            </SectionTitle>

            {trips.length === 0 ? (
              <EmptyState
                title={strings.dashboard.firstRun}
                body={strings.dashboard.firstRunBody}
                action={<Link to="/plan"><Button>{strings.dashboard.quickPlan}</Button></Link>}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {trips.map((t) => (
                  <li key={t.id}>
                    <Link to={`/trips/${t.id}`} className="block">
                      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:bg-secondary">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {t.routes?.origin_name} → {t.routes?.dest_name}
                          </p>
                          <p className="truncate text-sm text-muted-text">
                            {t.drivers?.name ?? "—"} · {duration(plannedTotal(t))} · {plural(t.routes?.route_stops.length ?? 0, "stop")}
                          </p>
                        </div>
                        <span className="text-xs text-muted-text">{dateTime(t.created_at)}</span>
                        <StatusPill status={t.status} />
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
