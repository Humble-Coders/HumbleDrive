import { assertEquals } from "@std/assert";
import { allowedOrigins, corsHeaders, isAllowedOrigin, preflight } from "./cors.ts";

const APP = "http://localhost:5173";
const EVIL = "https://evil.example";

/** Set ALLOWED_ORIGINS for one test, then put it back. */
function withOrigins(value: string | null, fn: () => void): void {
  const previous = Deno.env.get("ALLOWED_ORIGINS");
  if (value === null) Deno.env.delete("ALLOWED_ORIGINS");
  else Deno.env.set("ALLOWED_ORIGINS", value);
  try {
    fn();
  } finally {
    if (previous === undefined) Deno.env.delete("ALLOWED_ORIGINS");
    else Deno.env.set("ALLOWED_ORIGINS", previous);
  }
}

function request(origin?: string, method = "GET"): Request {
  return new Request("https://example.test/admin-me", {
    method,
    headers: origin ? { Origin: origin } : {},
  });
}

// ------------------------------------------------------------- the allowlist

Deno.test("the list is comma-separated and tolerates stray whitespace", () => {
  withOrigins(` ${APP} , https://app.example `, () => {
    assertEquals(allowedOrigins(), [APP, "https://app.example"]);
  });
});

Deno.test("an unset or empty ALLOWED_ORIGINS allows nothing", () => {
  withOrigins(null, () => {
    assertEquals(allowedOrigins(), []);
    assertEquals(isAllowedOrigin(APP), false);
  });
  withOrigins("", () => assertEquals(isAllowedOrigin(APP), false));
  withOrigins("  ,  ", () => assertEquals(isAllowedOrigin(APP), false));
});

Deno.test("matching is exact — a near miss is not on the list", () => {
  withOrigins(APP, () => {
    assertEquals(isAllowedOrigin(APP), true);
    assertEquals(isAllowedOrigin("http://localhost:5174"), false);
    assertEquals(isAllowedOrigin("https://localhost:5173"), false);
    assertEquals(isAllowedOrigin(`${APP}/`), false);
    assertEquals(isAllowedOrigin(null), false);
  });
});

// ----------------------------------------------------------------- headers

Deno.test("an allowed origin is echoed back", () => {
  withOrigins(APP, () => {
    assertEquals(corsHeaders(request(APP))["Access-Control-Allow-Origin"], APP);
  });
});

Deno.test("a disallowed origin gets no Access-Control-Allow-Origin at all", () => {
  withOrigins(APP, () => {
    const headers = corsHeaders(request(EVIL));
    assertEquals("Access-Control-Allow-Origin" in headers, false);
  });
});

Deno.test("a request with no Origin gets no Access-Control-Allow-Origin", () => {
  withOrigins(APP, () => {
    assertEquals("Access-Control-Allow-Origin" in corsHeaders(request()), false);
  });
});

Deno.test("Vary: Origin is always set, allowed or not", () => {
  withOrigins(APP, () => {
    // Without this a cache could hand an allowed origin's response, CORS header
    // and all, to an origin we just turned down.
    assertEquals(corsHeaders(request(APP))["Vary"], "Origin");
    assertEquals(corsHeaders(request(EVIL))["Vary"], "Origin");
    assertEquals(corsHeaders(request())["Vary"], "Origin");
  });
});

Deno.test("we never answer with a wildcard", () => {
  withOrigins(APP, () => {
    assertEquals(corsHeaders(request(APP))["Access-Control-Allow-Origin"] === "*", false);
  });
});

// --------------------------------------------------------------- preflight

Deno.test("preflight returns 204 with no body", () => {
  withOrigins(APP, () => {
    const res = preflight(request(APP, "OPTIONS"), ["GET"]);
    assertEquals(res.status, 204);
    assertEquals(res.body, null);
  });
});

Deno.test("preflight advertises this endpoint's methods, plus OPTIONS", () => {
  withOrigins(APP, () => {
    const res = preflight(request(APP, "OPTIONS"), ["GET"]);
    assertEquals(res.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), APP);
    assertEquals(res.headers.get("Access-Control-Allow-Headers")?.includes("authorization"), true);
    assertEquals(res.headers.get("Access-Control-Max-Age"), "86400");
  });
});

Deno.test("preflight from a disallowed origin answers, but permits nothing", () => {
  withOrigins(APP, () => {
    const res = preflight(request(EVIL, "OPTIONS"), ["GET"]);
    assertEquals(res.status, 204);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
  });
});
