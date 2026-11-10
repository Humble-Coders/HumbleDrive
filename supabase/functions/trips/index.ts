import { withHttp } from "../_shared/http.ts";
import { realAuthDeps, serviceClient } from "../_shared/supabase.ts";
import type { EmailDeps } from "../_shared/email.ts";
import { type CreateInput, makeHandler, type TripsDeps } from "./handler.ts";

const LIST_SELECT = `
  id, status, created_at, code_sent_at, consignment_ref,
  drivers(id, name),
  routes(origin_name, dest_name, drive_duration_s, distance_m, route_stops(planned_minutes))
`;

const DETAIL_SELECT = `
  id, status, created_at, code_sent_at, started_at, completed_at,
  consignment_ref, consignment_desc, weight_kg, receiver_name, receiver_phone,
  cancel_reason, cancelled_at,
  drivers(id, name, email, phone),
  routes(
    origin_name, origin_lat, origin_lng, dest_name, dest_lat, dest_lng,
    encoded_polyline, distance_m, drive_duration_s,
    route_stops(id, seq, name, lat, lng, stop_type, planned_minutes)
  )
`;

function deps(): TripsDeps {
  const db = serviceClient();

  return {
    async createTrip(input: CreateInput, createdBy: string, codeHash: string) {
      const { data, error } = await db.rpc("create_trip", {
        p_route: input.route,
        p_stops: input.stops,
        p_driver_id: input.driver_id,
        p_created_by: createdBy,
        p_code_hash: codeHash,
        p_consignment: input.consignment,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },

    async driverEmail(driverId: string) {
      const { data } = await db.from("drivers").select("email").eq("id", driverId).maybeSingle();
      return (data?.email as string) ?? null;
    },

    async markCodeSent(tripId: string) {
      await db.from("trips").update({ code_sent_at: new Date().toISOString() }).eq("id", tripId);
    },

    async replaceCode(tripId: string, codeHash: string) {
      const { error } = await db.from("trips").update({ code_hash: codeHash }).eq("id", tripId);
      if (error) throw new Error(`code replace failed: ${error.message}`);
    },

    async tripStatus(tripId: string) {
      const { data } = await db.from("trips").select("status").eq("id", tripId).maybeSingle();
      return (data?.status as string) ?? null;
    },

    async tripDriverEmail(tripId: string) {
      const { data } = await db.from("trips").select("drivers(email)").eq("id", tripId).maybeSingle();
      // deno-lint-ignore no-explicit-any
      return ((data as any)?.drivers?.email as string) ?? null;
    },

    async list(filter) {
      let q = db.from("trips").select(LIST_SELECT, { count: "exact" });
      if (filter.status?.length) q = q.in("status", filter.status);
      if (filter.driverId) q = q.eq("driver_id", filter.driverId);

      // Live runs first, then newest. A supervisor opens this page to see what
      // is happening now, so ordering by created_at alone would bury it.
      const { data, error, count } = await q
        .order("status", { ascending: true })
        .order("created_at", { ascending: false })
        .range(filter.offset, filter.offset + filter.limit - 1);
      if (error) throw new Error(`trips list failed: ${error.message}`);

      // Postgres enum order is pending, active, completed, cancelled — which is
      // already live-first, so no client-side re-sort is needed.
      return { trips: data ?? [], total: count ?? 0 };
    },

    async detail(tripId: string) {
      const { data, error } = await db.from("trips").select(DETAIL_SELECT).eq("id", tripId)
        .maybeSingle();
      if (error) throw new Error(`trip detail failed: ${error.message}`);
      return data ?? null;
    },

    async cancel(tripId: string, reason: string | null, by: string) {
      const { error } = await db.from("trips").update({
        status: "cancelled",
        cancel_reason: reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: by,
      }).eq("id", tripId);
      if (error) throw new Error(`cancel failed: ${error.message}`);
    },
  };
}

const email: EmailDeps = {
  apiKey: () => Deno.env.get("RESEND_API_KEY") ?? null,
  from: () => Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev",
  fetch: (...args) => fetch(...args),
};

Deno.serve(withHttp({ methods: ["POST"] }, makeHandler(realAuthDeps(), deps(), email)));
