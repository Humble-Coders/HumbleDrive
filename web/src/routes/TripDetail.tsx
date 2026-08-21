import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { callFunction, messageFor, ApiError } from "../lib/api";
import { strings } from "../strings";
import { duration, distance, dateTime } from "../lib/format";
import { RouteMap, type MapMarker } from "../components/RouteMap";
import { StatusPill } from "../components/StatusPill";
import { Banner, Button, Card, Dialog, EmptyState, Field, LoadingState, PageHeader } from "../components/ui";

/**
 * One run, in full.
 *
 * The booking code is a hash and is never returned by any endpoint, so there is
 * nothing here to display it with — and no route to displaying it should be
 * added. When a driver says the email never arrived, the answer is Resend,
 * which mints a fresh code and kills the old one.
 *
 * Live tracking and the recorded trail are ticket 13. The placeholder below
 * names that explicitly: an unexplained blank panel reads as a bug.
 */

const STOP_LABELS: Record<string, string> = {
  break: strings.plan.typeBreak,
  food: strings.plan.typeFood,
  fuel: strings.plan.typeFuel,
  other: strings.plan.typeOther,
};

interface TripDetailBody {
  id: string;
  status: string;
  created_at: string;
  code_sent_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  consignment_ref: string | null;
  consignment_desc: string | null;
  weight_kg: number | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  drivers: { id: string; name: string; email: string; phone: string | null } | null;
  routes: {
    origin_name: string; origin_lat: number; origin_lng: number;
    dest_name: string; dest_lat: number; dest_lng: number;
    encoded_polyline: string; distance_m: number; drive_duration_s: number;
    route_stops: Array<{
      id: string; seq: number; name: string; lat: number; lng: number;
      stop_type: string; planned_minutes: number;
    }>;
  } | null;
}

export function TripDetail() {
  const { id = "" } = useParams();
  const [trip, setTrip] = useState<TripDetailBody | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmResend, setConfirmResend] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFunction<{ trip: TripDetailBody }>("trips", {
        body: { action: "detail", trip_id: id },
      });
      setTrip(res.trip);
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_found") setMissing(true);
      else setError(messageFor(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const res = await callFunction<{ code_sent: boolean }>("trips", {
        body: { action: "resend", trip_id: id },
      });
      setConfirmResend(false);
      setNotice(res.code_sent ? strings.trips.resendDone : strings.trips.resendFailed);
      await load();
    } catch (err) {
      setConfirmResend(false);
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await callFunction("trips", {
        body: { action: "cancel", trip_id: id, reason: reason.trim() || undefined },
      });
      setConfirmCancel(false);
      setReason("");
      await load();
    } catch (err) {
      setConfirmCancel(false);
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <>
        <PageHeader title={strings.trips.detailTitle} />
        <EmptyState
          title={strings.trips.notFound}
          body={strings.trips.notFoundBody}
          action={<Link to="/trips"><Button variant="secondary">{strings.trips.backToTrips}</Button></Link>}
        />
      </>
    );
  }

  if (!trip) return <LoadingState label={strings.common.loading} />;

  const route = trip.routes;
  const stops = route?.route_stops.slice().sort((a, b) => a.seq - b.seq) ?? [];
  const breakSeconds = stops.reduce((s, x) => s + x.planned_minutes * 60, 0);
  const totalSeconds = (route?.drive_duration_s ?? 0) + breakSeconds;
  const isLive = trip.status === "pending" || trip.status === "active";

  const markers: MapMarker[] = route
    ? [
      { lat: route.origin_lat, lng: route.origin_lng, label: route.origin_name, kind: "origin" as const },
      ...stops.map((st) => ({ lat: st.lat, lng: st.lng, label: `${st.seq}. ${st.name}`, kind: "stop" as const })),
      { lat: route.dest_lat, lng: route.dest_lng, label: route.dest_name, kind: "destination" as const },
    ]
    : [];

  return (
    <>
      <PageHeader
        title={`${route?.origin_name ?? "—"} → ${route?.dest_name ?? "—"}`}
        description={`${strings.trips.created} ${dateTime(trip.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={trip.status} />
            {trip.status === "pending" && (
              <Button variant="secondary" onClick={() => setConfirmResend(true)}>{strings.trips.resend}</Button>
            )}
            {isLive && (
              <Button variant="danger" onClick={() => setConfirmCancel(true)}>{strings.trips.cancelRun}</Button>
            )}
          </div>
        }
      />

      {error && <div className="mb-4"><Banner>{error}</Banner></div>}
      {notice && <div className="mb-4"><Banner tone="info">{notice}</Banner></div>}
      {trip.status === "cancelled" && (
        <div className="mb-4">
          <Banner tone="info">
            {strings.trips.cancelledOn} {dateTime(trip.cancelled_at)}
            {trip.cancel_reason ? ` — ${trip.cancel_reason}` : ""}
          </Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <RouteMap
            polylines={route ? [{ encoded: route.encoded_polyline, selected: true }] : []}
            markers={markers}
            className="min-h-64 lg:min-h-[24rem]"
          />
          <Card>
            <p className="text-sm text-muted-text">{strings.trips.trackingSoon}</p>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-2 text-sm">
            <Row label={strings.plan.driveTime} value={duration(route?.drive_duration_s ?? 0)} />
            <Row label={strings.plan.breakTime} value={duration(breakSeconds)} />
            <Row label={strings.plan.totalTime} value={duration(totalSeconds)} />
            <Row label="Distance" value={distance(route?.distance_m ?? 0)} />
            <Row label={strings.trips.code} value={trip.code_sent_at ? `${strings.trips.codeSent} · ${dateTime(trip.code_sent_at)}` : strings.trips.codeNotSent} />
          </Card>

          <Card>
            <h2 className="mb-2 font-medium">{strings.plan.stopsTitle}</h2>
            {stops.length === 0 ? (
              <p className="text-sm text-muted-text">{strings.plan.noStops}</p>
            ) : (
              <ol className="flex flex-col gap-2 text-sm">
                {stops.map((st) => (
                  <li key={st.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate" title={st.name}>{st.seq}. {st.name}</span>
                    <span className="shrink-0 text-muted-text">
                      {STOP_LABELS[st.stop_type] ?? st.stop_type} · {st.planned_minutes} min
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="flex flex-col gap-2 text-sm">
            <h2 className="mb-1 font-medium">{strings.trips.consignment}</h2>
            <Row label={strings.plan.ref} value={trip.consignment_ref || "—"} />
            <Row label={strings.plan.description} value={trip.consignment_desc || "—"} />
            <Row label={strings.plan.weight} value={trip.weight_kg ? `${trip.weight_kg} kg` : "—"} />
            <Row label={strings.trips.receiver} value={trip.receiver_name || "—"} />
            <Row label={strings.plan.receiverPhone} value={trip.receiver_phone || "—"} />
          </Card>

          <Card className="flex flex-col gap-2 text-sm">
            <h2 className="mb-1 font-medium">{strings.trips.driver}</h2>
            <Row label={strings.drivers.name} value={trip.drivers?.name ?? "—"} />
            <Row label={strings.drivers.email} value={trip.drivers?.email ?? "—"} />
            <Row label={strings.drivers.phone} value={trip.drivers?.phone ?? "—"} />
          </Card>
        </div>
      </div>

      <Dialog open={confirmResend} onClose={() => setConfirmResend(false)} title={strings.trips.resendTitle}>
        <p className="text-sm text-muted-text">{strings.trips.resendBody}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmResend(false)}>{strings.common.cancel}</Button>
          <Button busy={busy} onClick={() => void resend()}>{strings.trips.resend}</Button>
        </div>
      </Dialog>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title={strings.trips.cancelTitle}>
        <p className="text-sm text-muted-text">
          {trip.status === "active" ? strings.trips.cancelActiveBody : strings.trips.cancelPendingBody}
        </p>
        <div className="mt-4">
          <Field
            label={strings.trips.cancelReason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={trip.status === "active" && !reason.trim() ? strings.trips.cancelReasonRequired : undefined}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>{strings.common.close}</Button>
          <Button
            variant="danger"
            busy={busy}
            disabled={trip.status === "active" && !reason.trim()}
            onClick={() => void cancel()}
          >
            {strings.trips.cancelRun}
          </Button>
        </div>
      </Dialog>
    </>
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
