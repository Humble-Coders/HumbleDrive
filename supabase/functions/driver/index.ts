import { withHttp } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { type DriverDeps, makeHandler, type RunPayload } from "./handler.ts";

const RUN_SELECT = `
  id, status, consignment_ref, consignment_desc, weight_kg, receiver_name, receiver_phone,
  drivers(name),
  routes(
    origin_name, origin_lat, origin_lng, dest_name, dest_lat, dest_lng,
    encoded_polyline, distance_m, drive_duration_s,
    route_stops(id, seq, name, lat, lng, stop_type, planned_minutes)
  )
`;

function deps(): DriverDeps {
  const db = serviceClient();

  return {
    async findPendingByCodeHash(codeHash) {
      const { data } = await db.from("trips").select("id, status").eq("code_hash", codeHash)
        .eq("status", "pending").maybeSingle();
      return data ? { tripId: data.id as string, status: data.status as string } : null;
    },

    async findAnyByCodeHash(codeHash) {
      const { data } = await db.from("trips").select("id, status").eq("code_hash", codeHash)
        .maybeSingle();
      return data ? { tripId: data.id as string, status: data.status as string } : null;
    },

    async hasSession(tripId) {
      const { count } = await db.from("driver_sessions")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .is("revoked_at", null);
      return (count ?? 0) > 0;
    },

    async createSession(tripId, tokenHash, deviceLabel) {
      const { error } = await db.from("driver_sessions").insert({
        trip_id: tripId,
        token_hash: tokenHash,
        device_label: deviceLabel,
      });
      if (error) throw new Error(`session create failed: ${error.message}`);
    },

    async findSession(tokenHash) {
      const { data } = await db.from("driver_sessions")
        .select("trip_id, revoked_at, trips(status, drivers(id, name))")
        .eq("token_hash", tokenHash).maybeSingle();
      if (!data || data.revoked_at) return null;

      // deno-lint-ignore no-explicit-any
      const trip = (data as any).trips;
      if (!trip) return null;

      return {
        tripId: data.trip_id as string,
        driverId: trip.drivers?.id ?? "",
        driverName: trip.drivers?.name ?? "",
        status: trip.status as string,
      };
    },

    async loadRun(tripId): Promise<RunPayload | null> {
      const { data } = await db.from("trips").select(RUN_SELECT).eq("id", tripId).maybeSingle();
      if (!data) return null;
      // deno-lint-ignore no-explicit-any
      const t = data as any;
      if (!t.routes) return null;

      return {
        trip_id: t.id,
        status: t.status,
        driver_name: t.drivers?.name ?? "",
        consignment: {
          ref: t.consignment_ref,
          description: t.consignment_desc,
          weight_kg: t.weight_kg,
          receiver_name: t.receiver_name,
          receiver_phone: t.receiver_phone,
        },
        route: {
          origin_name: t.routes.origin_name,
          origin_lat: t.routes.origin_lat,
          origin_lng: t.routes.origin_lng,
          dest_name: t.routes.dest_name,
          dest_lat: t.routes.dest_lat,
          dest_lng: t.routes.dest_lng,
          encoded_polyline: t.routes.encoded_polyline,
          distance_m: t.routes.distance_m,
          drive_duration_s: t.routes.drive_duration_s,
        },
        // deno-lint-ignore no-explicit-any
        stops: (t.routes.route_stops ?? []).slice().sort((a: any, b: any) => a.seq - b.seq),
      };
    },
  };
}

Deno.serve(withHttp({ methods: ["POST"] }, makeHandler(deps())));
