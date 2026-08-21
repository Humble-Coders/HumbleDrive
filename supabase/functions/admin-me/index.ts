// Entrypoint. The only file here that knows about real infrastructure — the
// logic lives in handler.ts so `deno test` can exercise it without a project.

import { withHttp } from "../_shared/http.ts";
import { realAuthDeps } from "../_shared/supabase.ts";
import { makeHandler } from "./handler.ts";

Deno.serve(withHttp({ methods: ["GET"] }, makeHandler(realAuthDeps())));
