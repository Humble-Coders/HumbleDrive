import { withHttp } from "../_shared/http.ts";
import { realAuthDeps, serviceClient } from "../_shared/supabase.ts";
import { makeHandler, type RoutesDeps } from "./handler.ts";

const deps: RoutesDeps = {
  apiKey: () => Deno.env.get("GOOGLE_MAPS_API_KEY") ?? null,
  fetch: (...args) => fetch(...args),

  limits: {
    async bump(userId, endpoint, windowStart) {
      const { data, error } = await serviceClient().rpc("bump_rate_limit", {
        p_user_id: userId,
        p_endpoint: endpoint,
        p_window: windowStart.toISOString(),
      });
      if (error) throw new Error(`rate limit failed: ${error.message}`);
      return data as number;
    },
  },

  cache: {
    async read(hash, maxAgeSeconds) {
      const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
      const { data, error } = await serviceClient()
        .from("routes_cache")
        .select("response")
        .eq("request_hash", hash)
        .gte("created_at", cutoff)
        .maybeSingle();
      // A cache miss is normal; a cache failure must not take the request down.
      if (error) return null;
      return data?.response ?? null;
    },

    async write(hash, response) {
      await serviceClient()
        .from("routes_cache")
        .upsert({ request_hash: hash, response, created_at: new Date().toISOString() });
    },
  },
};

Deno.serve(withHttp({ methods: ["POST"] }, makeHandler(realAuthDeps(), deps)));
