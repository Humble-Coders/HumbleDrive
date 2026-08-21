import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { callFunction, messageFor } from "../lib/api";
import { strings } from "../strings";
import { duration, dateTime, plural } from "../lib/format";
import { Banner, Button, Card, EmptyState, LoadingState, PageHeader } from "../components/ui";
import { StatusPill, STATUS_LABELS } from "../components/StatusPill";

/**
 * The trips list.
 *
 * Paged in SQL, 10 at a time, unlike the driver roster which filters in the
 * browser. Drivers are capped at tens of people; trips grow without limit, so
 * the same shortcut would break quietly a few months in.
 *
 * Ordering is fixed server-side: live runs first, then newest. A supervisor
 * opens this page to see what is happening now.
 */

const PAGE_SIZE = 10;

interface TripRow {
  id: string;
  status: string;
  created_at: string;
  code_sent_at: string | null;
  consignment_ref: string | null;
  drivers: { id: string; name: string } | null;
  routes: {
    origin_name: string;
    dest_name: string;
    drive_duration_s: number;
    route_stops: Array<{ planned_minutes: number }>;
  } | null;
}

function plannedTotal(row: TripRow): number {
  const drive = row.routes?.drive_duration_s ?? 0;
  const breaks = (row.routes?.route_stops ?? []).reduce((s, x) => s + x.planned_minutes * 60, 0);
  return drive + breaks;
}

export function Trips() {
  // Filters live in the URL so a view can be linked and survives a refresh.
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const page = Math.max(0, Number(params.get("page") ?? 0));

  const [rows, setRows] = useState<TripRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFunction<{ trips: TripRow[]; total: number }>("trips", {
        body: {
          action: "list",
          status: status ? [status] : undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      setRows(res.trips);
      setTotal(res.total);
    } catch (err) {
      setError(messageFor(err));
      setRows([]);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function setFilter(next: string) {
    const p = new URLSearchParams(params);
    if (next) p.set("status", next);
    else p.delete("status");
    p.delete("page");
    setParams(p);
  }

  function setPage(next: number) {
    const p = new URLSearchParams(params);
    p.set("page", String(next));
    setParams(p);
  }

  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title={strings.trips.title}
        description={strings.trips.description}
        actions={<Link to="/plan"><Button>{strings.trips.planRun}</Button></Link>}
      />

      {error && (
        <div className="mb-4">
          <Banner action={<Button variant="secondary" onClick={() => void load()}>{strings.common.retry}</Button>}>
            {error}
          </Banner>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{strings.trips.filterStatus}</span>
          <select
            value={status}
            onChange={(e) => setFilter(e.target.value)}
            className="min-h-11 rounded-[var(--radius-token)] border border-edge bg-secondary px-3 text-text"
          >
            <option value="">{strings.trips.all}</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {rows === null ? (
        <LoadingState label={strings.common.loading} />
      ) : rows.length === 0 ? (
        status ? (
          // "No runs match these filters" is a different situation from "no runs
          // yet", and only one of them is fixed by clearing the filter.
          <EmptyState
            title={strings.trips.noMatches}
            body={strings.trips.noMatchesBody}
            action={<Button variant="secondary" onClick={() => setFilter("")}>{strings.trips.clearFilters}</Button>}
          />
        ) : (
          <EmptyState
            title={strings.trips.empty}
            body={strings.trips.emptyBody}
            action={<Link to="/plan"><Button>{strings.trips.planRun}</Button></Link>}
          />
        )
      ) : (
        <>
          <div className="hidden md:block">
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-edge text-left text-muted-text">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">{strings.trips.route}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{strings.trips.driver}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{strings.trips.planned}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{strings.trips.stops}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{strings.trips.code}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{strings.trips.created}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{strings.trips.filterStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-edge last:border-0 hover:bg-secondary">
                      <td className="max-w-[18rem] px-4 py-3">
                        <Link to={`/trips/${r.id}`} className="block truncate underline-offset-2 hover:underline">
                          {r.routes?.origin_name} → {r.routes?.dest_name}
                        </Link>
                      </td>
                      <td className="max-w-[10rem] truncate px-4 py-3 text-muted-text">{r.drivers?.name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-text">{duration(plannedTotal(r))}</td>
                      <td className="px-4 py-3 text-muted-text">{r.routes?.route_stops.length ?? 0}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-text">
                        {r.code_sent_at ? strings.trips.codeSent : strings.trips.codeNotSent}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-text">{dateTime(r.created_at)}</td>
                      <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/trips/${r.id}`} className="block">
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-medium">
                        {r.routes?.origin_name} → {r.routes?.dest_name}
                      </p>
                      <StatusPill status={r.status} />
                    </div>
                    <p className="mt-2 truncate text-sm text-muted-text">
                      {r.drivers?.name ?? "—"} · {duration(plannedTotal(r))} · {plural(r.routes?.route_stops.length ?? 0, "stop")}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-text">
            <span>{strings.trips.showing} {from}–{to} {strings.trips.of} {total}</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>{strings.trips.prev}</Button>
              <Button variant="secondary" disabled={to >= total} onClick={() => setPage(page + 1)}>{strings.trips.next}</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
