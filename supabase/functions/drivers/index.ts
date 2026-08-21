// Entrypoint. Real infrastructure lives here; the logic is in handler.ts so the
// suite runs with no project and no network.

import { withHttp } from "../_shared/http.ts";
import { realAuthDeps, serviceClient } from "../_shared/supabase.ts";
import { type DriverBody, type DriverDeps, type DriverInput, makeHandler } from "./handler.ts";

/** Rows come back with the live trip nested; flatten to the wire shape. */
// deno-lint-ignore no-explicit-any
function toBody(row: any): DriverBody {
  const trips = (row.trips ?? []) as Array<
    { id: string; status: string; routes?: { dest_name?: string } | null }
  >;
  const live = trips.find((t) => t.status === "pending" || t.status === "active") ?? null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    active: row.active,
    created_at: row.created_at,
    current_trip: live
      ? { id: live.id, status: live.status, dest_name: live.routes?.dest_name ?? "" }
      : null,
  };
}

const SELECT = "id, name, email, phone, active, created_at, trips(id, status, routes(dest_name))";

function deps(): DriverDeps {
  const db = serviceClient();

  return {
    async list() {
      const { data, error } = await db.from("drivers").select(SELECT).order("name");
      if (error) throw new Error(`drivers list failed: ${error.message}`);
      return (data ?? []).map(toBody);
    },

    async findByEmail(email: string) {
      const { data, error } = await db.from("drivers").select("id").eq("email", email).maybeSingle();
      if (error) throw new Error(`drivers lookup failed: ${error.message}`);
      return data ? { id: data.id as string } : null;
    },

    async create(input: DriverInput) {
      const { data, error } = await db.from("drivers").insert(input).select(SELECT).single();
      if (error) throw new Error(`driver create failed: ${error.message}`);
      return toBody(data);
    },

    async get(id: string) {
      const { data, error } = await db.from("drivers").select(SELECT).eq("id", id).maybeSingle();
      if (error) throw new Error(`driver read failed: ${error.message}`);
      return data ? toBody(data) : null;
    },

    async update(id: string, input: DriverInput) {
      const { data, error } = await db.from("drivers").update(input).eq("id", id).select(SELECT)
        .single();
      if (error) throw new Error(`driver update failed: ${error.message}`);
      return toBody(data);
    },

    async setActive(id: string, active: boolean) {
      const { data, error } = await db.from("drivers").update({ active }).eq("id", id).select(SELECT)
        .single();
      if (error) throw new Error(`driver setActive failed: ${error.message}`);
      return toBody(data);
    },

    async hasLiveTrip(id: string) {
      const { count, error } = await db
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("driver_id", id)
        .in("status", ["pending", "active"]);
      if (error) throw new Error(`live trip check failed: ${error.message}`);
      return (count ?? 0) > 0;
    },
  };
}

Deno.serve(withHttp({ methods: ["POST"] }, makeHandler(realAuthDeps(), deps())));
