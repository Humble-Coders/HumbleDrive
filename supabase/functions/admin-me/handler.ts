// GET admin-me — "am I a supervisor?"
//
// Ticket 3's login screen calls this straight after sign-in: a Supabase Auth
// account is not a supervisor, so the app cannot tell from the session alone.
// A 403 here is what triggers the immediate sign-out described in PRD §5.1.
//
// Dependencies are a required parameter with no default. A default would mean
// importing supabase.ts, which pulls the npm: client, which would drag the whole
// package into this file's tests. Requiring them makes the network-free suite
// structural instead of something to remember.

import { type AuthDeps, requireAdmin } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/errors.ts";
import type { Handler } from "../_shared/http.ts";

/** snake_case on the wire, camelCase inside (CLAUDE.md, Conventions). */
export interface AdminMeBody {
  user_id: string;
  name: string;
}

export function makeHandler(deps: AuthDeps): Handler {
  return async (req: Request): Promise<Response> => {
    const supervisor = await requireAdmin(req, deps);
    if (supervisor instanceof Response) return supervisor;

    const body: AdminMeBody = { user_id: supervisor.userId, name: supervisor.name };
    return jsonResponse(body);
  };
}
