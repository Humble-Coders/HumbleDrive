import { assertEquals } from "@std/assert";
import { type AuthDeps } from "../_shared/auth.ts";
import { makeHandler, MAX_STOPS, type RoutesDeps } from "./handler.ts";
import { ROUTES_FIELD_MASK } from "../_shared/googleAdapters.ts";

const SUPERVISOR: AuthDeps = {
  getUserId: () => Promise.resolve("admin-1"),
  getAdmin: () => Promise.resolve({ name: "Test Supervisor", active: true }),
};

const GOOGLE_OK = {
  routes: [
    { distanceMeters: 310000, duration: "21600s", polyline: { encodedPolyline: "abc" }, description: "via NH-44" },
    { distanceMeters: 330000, duration: "23000s", polyline: { encodedPolyline: "def" }, description: "via NH-52" },
  ],
};

function deps(over: Partial<RoutesDeps> = {}) {
  const sent: { url?: string; init?: RequestInit; calls: number } = { calls: 0 };
  const base: RoutesDeps = {
    apiKey: () => "test-key",
    fetch: ((url: string, init: RequestInit) => {
      sent.calls++;
      sent.url = url;
      sent.init = init;
      return Promise.resolve(new Response(JSON.stringify(GOOGLE_OK), { status: 200 }));
    }) as unknown as typeof fetch,
    limits: { bump: () => Promise.resolve(1) },
    cache: { read: () => Promise.resolve(null), write: () => Promise.resolve() },
    ...over,
  };
  return { deps: base, sent };
}

function post(body: unknown): Request {
  return new Request("https://example.test/routes-preview", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ORIGIN = { lat: 30.9010, lng: 75.8573 };
const DEST = { lat: 28.6139, lng: 77.2090 };

function sentBody(sent: { init?: RequestInit }) {
  return JSON.parse(String(sent.init?.body));
}

Deno.test("without stops: asks for alternatives, sends no intermediates", async () => {
  const { deps: d, sent } = deps();
  const res = await makeHandler(SUPERVISOR, d)(post({ origin: ORIGIN, destination: DEST }));
  assertEquals(res.status, 200);

  const body = sentBody(sent);
  assertEquals(body.computeAlternativeRoutes, true);
  assertEquals("intermediates" in body, false);

  const json = await res.json();
  assertEquals(json.routes.length, 2);
  assertEquals(json.refined, false);
});

Deno.test("with stops: sends intermediates, never asks for alternatives", async () => {
  const { deps: d, sent } = deps();
  const res = await makeHandler(SUPERVISOR, d)(
    post({ origin: ORIGIN, destination: DEST, stops: [{ lat: 30.5, lng: 76.0 }] }),
  );
  assertEquals(res.status, 200);

  const body = sentBody(sent);
  // The constraint the entire wizard is built on: never both.
  assertEquals("computeAlternativeRoutes" in body, false);
  assertEquals(body.intermediates.length, 1);
  assertEquals((await res.json()).refined, true);
});

Deno.test("stop order is preserved and never optimised", async () => {
  const { deps: d, sent } = deps();
  const stops = [{ lat: 30.5, lng: 76.0 }, { lat: 29.8, lng: 76.8 }, { lat: 29.1, lng: 77.0 }];
  await makeHandler(SUPERVISOR, d)(post({ origin: ORIGIN, destination: DEST, stops }));

  const body = sentBody(sent);
  assertEquals(body.optimizeWaypointOrder, false);
  assertEquals(
    body.intermediates.map((i: { location: { latLng: { latitude: number } } }) => i.location.latLng.latitude),
    stops.map((s) => s.lat),
  );
});

Deno.test("the field mask is exactly the agreed list — it is a billing decision", async () => {
  const { deps: d, sent } = deps();
  await makeHandler(SUPERVISOR, d)(post({ origin: ORIGIN, destination: DEST }));
  const mask = new Headers(sent.init?.headers).get("X-Goog-FieldMask");
  assertEquals(mask, ROUTES_FIELD_MASK);
  assertEquals(mask?.includes("legs.steps"), false);
});

Deno.test("an identical repeat is served from cache and never calls Google", async () => {
  const { deps: d, sent } = deps({
    cache: { read: () => Promise.resolve(GOOGLE_OK), write: () => Promise.resolve() },
    // If this is reached, the test fails loudly rather than passing quietly.
    fetch: (() => {
      throw new Error("fetch must not be called on a cache hit");
    }) as unknown as typeof fetch,
  });
  const res = await makeHandler(SUPERVISOR, d)(post({ origin: ORIGIN, destination: DEST }));
  assertEquals(res.status, 200);
  assertEquals(sent.calls, 0);
  assertEquals((await res.json()).routes.length, 2);
});

Deno.test("over the rate limit: refused without calling Google", async () => {
  const { deps: d, sent } = deps({ limits: { bump: () => Promise.resolve(999) } });
  const res = await makeHandler(SUPERVISOR, d)(post({ origin: ORIGIN, destination: DEST }));
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "routes_failed");
  assertEquals(sent.calls, 0);
});

Deno.test("a Google failure becomes routes_failed, never an empty success", async () => {
  const { deps: d } = deps({
    fetch: (() => Promise.resolve(new Response("quota exceeded", { status: 429 }))) as unknown as typeof fetch,
  });
  const res = await makeHandler(SUPERVISOR, d)(post({ origin: ORIGIN, destination: DEST }));
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "routes_failed");
});

Deno.test("a missing key says so instead of sending a bogus one upstream", async () => {
  const { deps: d, sent } = deps({ apiKey: () => null });
  const res = await makeHandler(SUPERVISOR, d)(post({ origin: ORIGIN, destination: DEST }));
  assertEquals(res.status, 502);
  assertEquals(sent.calls, 0);
});

Deno.test("malformed coordinates and too many stops are bad_request", async () => {
  const { deps: d } = deps();
  const handler = makeHandler(SUPERVISOR, d);

  assertEquals((await handler(post({ origin: ORIGIN }))).status, 400);
  assertEquals((await handler(post({ origin: { lat: "x", lng: 1 }, destination: DEST }))).status, 400);
  assertEquals((await handler(post({ origin: { lat: 200, lng: 1 }, destination: DEST }))).status, 400);

  const tooMany = Array.from({ length: MAX_STOPS + 1 }, () => ({ lat: 30, lng: 76 }));
  assertEquals((await handler(post({ origin: ORIGIN, destination: DEST, stops: tooMany }))).status, 400);
});
