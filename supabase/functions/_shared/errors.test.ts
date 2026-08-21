import { assert, assertEquals } from "@std/assert";
import {
  DEFAULT_MESSAGE,
  ERROR_STATUS,
  errorResponse,
  jsonResponse,
  type MappedErrorCode,
} from "./errors.ts";

const CODES = Object.keys(ERROR_STATUS) as MappedErrorCode[];

Deno.test("every code returns the status from the contract", async (t) => {
  const expected: Record<MappedErrorCode, number> = {
    bad_request: 400,
    unauthorized: 401,
    not_admin: 403,
    not_found: 404,
    driver_inactive: 409,
    driver_busy: 409,
    invalid_transition: 409,
    internal_error: 500,
    places_failed: 502,
    routes_failed: 502,
    email_failed: 502,
  };

  for (const code of CODES) {
    await t.step(code, () => {
      assertEquals(errorResponse(code).status, expected[code]);
    });
  }
});

Deno.test("every error body is exactly { error, message } and nothing else", async () => {
  for (const code of CODES) {
    const body = await errorResponse(code).json();
    assertEquals(Object.keys(body).sort(), ["error", "message"]);
    assertEquals(body.error, code);
    assertEquals(body.message, DEFAULT_MESSAGE[code]);
  }
});

Deno.test("every default message is real, plain English prose", () => {
  for (const code of CODES) {
    const message = DEFAULT_MESSAGE[code];
    assert(message.length > 0, `${code} has no message`);
    // Nothing should leak the machine-readable code into the copy a person reads.
    assert(!message.includes("_"), `${code}'s message reads like a code, not a sentence`);
  }
});

Deno.test("a caller can say something more specific without changing the code", async () => {
  const res = errorResponse("bad_request", "Pick a destination before continuing.");
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "bad_request",
    message: "Pick a destination before continuing.",
  });
});

Deno.test("errors are JSON", () => {
  assertEquals(errorResponse("not_found").headers.get("Content-Type"), "application/json");
});

Deno.test("success payloads go back bare, with no wrapper", async () => {
  const res = jsonResponse({ user_id: "abc", name: "Sharnya" });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { user_id: "abc", name: "Sharnya" });
});

Deno.test("the error vocabulary is closed", () => {
  // Never called. It exists so the type-check proves an invented code is
  // rejected: if ErrorCode ever loosens to `string`, the @ts-expect-error below
  // becomes an unused directive and `deno check` fails. A commented-out line,
  // which the ticket offers as an alternative, would rot silently instead.
  const _wouldNotCompile = () => {
    // @ts-expect-error — "admin_expired" is not in the contract (PRD §4.7).
    errorResponse("admin_expired");
  };
  assert(typeof _wouldNotCompile === "function");
});
