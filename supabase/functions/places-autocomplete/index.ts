import { withHttp } from "../_shared/http.ts";
import { realAuthDeps, serviceClient } from "../_shared/supabase.ts";
import { makeHandler, type PlacesDeps } from "./handler.ts";

const deps: PlacesDeps = {
  apiKey: () => Deno.env.get("GOOGLE_MAPS_API_KEY") ?? null,
  fetch: (...args) => fetch(...args),
  limits: {
    async bump(userId, endpoint, windowStart) {
      const { data, error } = await serviceClient().rpc("bump_rate_limit", {
        p_user_id: userId,
        p_endpoint: endpoint,
        p_window: windowStart.toISOString(),
      });
      // A broken limiter must not silently become no limiter.
      if (error) throw new Error(`rate limit failed: ${error.message}`);
      return data as number;
    },
  },
};

Deno.serve(withHttp({ methods: ["POST"] }, makeHandler(realAuthDeps(), deps)));
