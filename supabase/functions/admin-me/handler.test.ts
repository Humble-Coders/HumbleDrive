// Tests the deployed composition — withHttp wrapped around the handler — because
// that is what actually answers a request. Testing the bare handler would miss
// the method check and the CORS headers entirely.

import { assertEquals } from "@std/assert";
import { withHttp } from "../_shared/http.ts";
import { type AuthDeps } from "../_shared/auth.ts";
import { makeHandler } from "./handler.ts";

const APP = "http://localhost:5173";
const EVIL = "https://evil.example";
const USER = "11111111-1111-4111-8111-111111111111";

function deps(over: Partial<AuthDeps> = {}): AuthDeps {
  return {
    getUserId: () => Promise.resolve(USER),
    getAdmin: () => Promise.resolve({ name: "Sharnya", active: true }),
    ...over,
  };
}

function endpoint(over: Partial<AuthDeps> = {}) {
  return withHttp({ methods: ["GET"] }, makeHandler(deps(over)));
}

function request(
  { method = "GET", auth = true, origin = APP as string | undefined } = {},
): Request {
  const headers: Record<string, string> = {};
  if (auth) headers["Authorization"] = "Bearer valid.jwt.here";
  if (origin) headers["Origin"] = origin;
  return new Request("https://example.test/admin-me", { method, headers });
}

function setUp(): void {
  Deno.env.set("ALLOWED_ORIGINS", APP);
}

// ------------------------------------------------------------------ success

Deno.test("a supervisor gets 200 and their identity, snake_case on the wire", async () => {
  setUp();
  const res = await endpoint()(request());

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { user_id: USER, name: "Sharnya" });
});

// ------------------------------------------------------------------- denied

Deno.test("no Authorization header: 401, and the admins table is never read", async () => {
  setUp();
  const res = await endpoint({
    getUserId: () => {
      throw new Error("getUserId was called on an unauthenticated request");
    },
    getAdmin: () => {
      throw new Error("getAdmin was called on an unauthenticated request");
    },
  })(request({ auth: false }));

  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
});

Deno.test("a signed-in user who is not a supervisor: 403 not_admin", async () => {
  setUp();
  const res = await endpoint({ getAdmin: () => Promise.resolve(null) })(request());

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "not_admin");
});

Deno.test("a deactivated supervisor: 403 not_admin", async () => {
  setUp();
  const res = await endpoint({
    getAdmin: () => Promise.resolve({ name: "Retired Sam", active: false }),
  })(request());

  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "not_admin");
});

// ------------------------------------------------------------------ methods

Deno.test("POST is refused with bad_request, even from a supervisor", async () => {
  setUp();
  const res = await endpoint()(request({ method: "POST" }));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "bad_request");
  assertEquals(body.message.includes("GET"), true);
});

Deno.test("OPTIONS is answered as a preflight, not routed to the handler", async () => {
  setUp();
  const res = await endpoint({
    getUserId: () => {
      throw new Error("a preflight reached the handler");
    },
  })(request({ method: "OPTIONS", auth: false }));

  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), APP);
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
});

// --------------------------------------------------------------------- CORS

Deno.test("CORS headers are on error responses too, not just successes", async () => {
  setUp();
  for (
    const res of [
      await endpoint()(request({ auth: false })),
      await endpoint()(request({ method: "POST" })),
    ]
  ) {
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), APP);
    await res.body?.cancel();
  }
});

Deno.test("a disallowed origin gets no CORS header on any answer", async () => {
  setUp();
  for (
    const res of [
      await endpoint()(request({ origin: EVIL })),
      await endpoint()(request({ origin: EVIL, auth: false })),
      await endpoint()(request({ origin: EVIL, method: "OPTIONS", auth: false })),
    ]
  ) {
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
    await res.body?.cancel();
  }
});

// ----------------------------------------------------------------- failures

Deno.test("an unexpected failure becomes internal_error, and leaks nothing", async () => {
  setUp();
  const res = await endpoint({
    getAdmin: () => {
      throw new Error("connection to db.abcdefgh.supabase.co refused");
    },
  })(request());

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "internal_error");
  // The thrown message named a host. It must not reach the caller.
  assertEquals(body.message.includes("supabase.co"), false);
});
