import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { type AuthDeps, bearerToken, requireAdmin } from "./auth.ts";

/** Deps that succeed, with individual pieces overridable per test. */
function deps(over: Partial<AuthDeps> = {}): AuthDeps {
  return {
    getUserId: () => Promise.resolve("11111111-1111-4111-8111-111111111111"),
    getAdmin: () => Promise.resolve({ name: "Sharnya", active: true }),
    ...over,
  };
}

/** Blows up if it is called at all. This is how "makes zero database calls"
 *  is proved: a regression fails loudly instead of returning a subtly wrong status. */
const mustNotBeCalled = (what: string) => (): never => {
  throw new Error(`${what} was called, but the request should have been rejected first`);
};

async function bodyOf(res: Response): Promise<{ error: string; message: string }> {
  return await res.json();
}

function request(headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request("https://example.test/admin-me", {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// --------------------------------------------------------------- bearerToken

Deno.test("bearerToken: absent, wrong scheme and empty token all read as no token", () => {
  assertEquals(bearerToken(request()), null);
  assertEquals(bearerToken(request({ Authorization: "Basic abc123" })), null);
  assertEquals(bearerToken(request({ Authorization: "Bearer" })), null);
  assertEquals(bearerToken(request({ Authorization: "Bearer    " })), null);
});

Deno.test("bearerToken: extracts the token, and the scheme is case-insensitive", () => {
  assertEquals(bearerToken(request({ Authorization: "Bearer abc.def.ghi" })), "abc.def.ghi");
  assertEquals(bearerToken(request({ Authorization: "bearer abc.def.ghi" })), "abc.def.ghi");
});

// ------------------------------------------------------ unauthorized (401)

Deno.test("no Authorization header: 401, and nothing is looked up", async () => {
  const res = await requireAdmin(
    request(),
    deps({
      getUserId: mustNotBeCalled("getUserId"),
      getAdmin: mustNotBeCalled("getAdmin"),
    }),
  );

  assertInstanceOf(res, Response);
  assertEquals(res.status, 401);
  assertEquals((await bodyOf(res)).error, "unauthorized");
});

Deno.test("malformed Authorization header: 401, and nothing is looked up", async () => {
  const res = await requireAdmin(
    request({ Authorization: "Basic dXNlcjpwYXNz" }),
    deps({
      getUserId: mustNotBeCalled("getUserId"),
      getAdmin: mustNotBeCalled("getAdmin"),
    }),
  );

  assertInstanceOf(res, Response);
  assertEquals(res.status, 401);
});

Deno.test("token that does not verify: 401, and the admins table is never read", async () => {
  const res = await requireAdmin(
    request({ Authorization: "Bearer expired.or.forged" }),
    deps({
      getUserId: () => Promise.resolve(null),
      getAdmin: mustNotBeCalled("getAdmin"),
    }),
  );

  assertInstanceOf(res, Response);
  assertEquals(res.status, 401);
  assertEquals((await bodyOf(res)).error, "unauthorized");
});

// ---------------------------------------------------------- not_admin (403)

Deno.test("valid account with no admins row: 403 not_admin", async () => {
  const res = await requireAdmin(
    request({ Authorization: "Bearer valid.jwt.here" }),
    deps({ getAdmin: () => Promise.resolve(null) }),
  );

  assertInstanceOf(res, Response);
  assertEquals(res.status, 403);
  assertEquals((await bodyOf(res)).error, "not_admin");
});

Deno.test("admins row with active = false: 403 not_admin", async () => {
  const res = await requireAdmin(
    request({ Authorization: "Bearer valid.jwt.here" }),
    deps({ getAdmin: () => Promise.resolve({ name: "Retired Sam", active: false }) }),
  );

  assertInstanceOf(res, Response);
  assertEquals(res.status, 403);
  assertEquals((await bodyOf(res)).error, "not_admin");
});

// ------------------------------------------------------------------ success

Deno.test("active supervisor: resolves to their identity", async () => {
  const result = await requireAdmin(
    request({ Authorization: "Bearer valid.jwt.here" }),
    deps(),
  );

  assert(!(result instanceof Response));
  assertEquals(result, {
    userId: "11111111-1111-4111-8111-111111111111",
    name: "Sharnya",
  });
});

Deno.test("a user_id in the request body is ignored entirely", async () => {
  const attacker = "99999999-9999-4999-8999-999999999999";

  const result = await requireAdmin(
    request({ Authorization: "Bearer valid.jwt.here" }, { user_id: attacker }),
    // getAdmin asserts it is asked about the JWT's user, never the body's.
    deps({
      getAdmin: (userId) => {
        assertEquals(userId, "11111111-1111-4111-8111-111111111111");
        return Promise.resolve({ name: "Sharnya", active: true });
      },
    }),
  );

  assert(!(result instanceof Response));
  assertEquals(result.userId, "11111111-1111-4111-8111-111111111111");
});
