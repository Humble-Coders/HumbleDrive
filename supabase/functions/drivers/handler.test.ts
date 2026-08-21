import { assertEquals } from "@std/assert";
import { type AuthDeps } from "../_shared/auth.ts";
import { type DriverBody, type DriverDeps, makeHandler } from "./handler.ts";

const SUPERVISOR: AuthDeps = {
  getUserId: () => Promise.resolve("admin-1"),
  getAdmin: () => Promise.resolve({ name: "Test Supervisor", active: true }),
};

const NOT_ADMIN: AuthDeps = {
  getUserId: () => Promise.resolve("someone"),
  getAdmin: () => Promise.resolve(null),
};

function driver(over: Partial<DriverBody> = {}): DriverBody {
  return {
    id: "d1",
    name: "Ravi",
    email: "test+ravi@humblecoders.in",
    phone: "9876543210",
    active: true,
    created_at: "2026-08-21T00:00:00Z",
    current_trip: null,
    ...over,
  };
}

/** Records what reached the database, so tests can assert on it. */
function fakeDb(over: Partial<DriverDeps> = {}) {
  const calls: { created?: unknown; updated?: unknown; active?: boolean } = {};
  const db: DriverDeps = {
    list: () => Promise.resolve([driver()]),
    findByEmail: () => Promise.resolve(null),
    create: (input) => {
      calls.created = input;
      return Promise.resolve(driver({ ...input }));
    },
    get: () => Promise.resolve(driver()),
    update: (_id, input) => {
      calls.updated = input;
      return Promise.resolve(driver({ ...input }));
    },
    setActive: (_id, active) => {
      calls.active = active;
      return Promise.resolve(driver({ active }));
    },
    hasLiveTrip: () => Promise.resolve(false),
    ...over,
  };
  return { db, calls };
}

function post(body: unknown): Request {
  return new Request("https://example.test/drivers", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function bodyOf(res: Response) {
  return await res.json() as Record<string, unknown>;
}

Deno.test("create lowercases the email before it reaches the database", async () => {
  const { db, calls } = fakeDb();
  const res = await makeHandler(SUPERVISOR, db)(
    post({ action: "create", name: "Ravi", email: "  Test+Ravi@HumbleCoders.in ", phone: "" }),
  );
  assertEquals(res.status, 200);
  assertEquals((calls.created as { email: string }).email, "test+ravi@humblecoders.in");
});

Deno.test("create normalises every phone shape a human types", async () => {
  for (const input of ["98765 43210", "+91 9876543210", "09876543210", "9876543210"]) {
    const { db, calls } = fakeDb();
    await makeHandler(SUPERVISOR, db)(
      post({ action: "create", name: "Ravi", email: "a@b.com", phone: input }),
    );
    assertEquals((calls.created as { phone: string }).phone, "9876543210", `failed on ${input}`);
  }
});

Deno.test("create rejects an unusable phone number", async () => {
  const { db } = fakeDb();
  const res = await makeHandler(SUPERVISOR, db)(
    post({ action: "create", name: "Ravi", email: "a@b.com", phone: "12345" }),
  );
  assertEquals(res.status, 400);
  assertEquals((await bodyOf(res)).error, "bad_request");
});

Deno.test("create names the clash when the email is already used", async () => {
  const { db } = fakeDb({ findByEmail: () => Promise.resolve({ id: "other" }) });
  const res = await makeHandler(SUPERVISOR, db)(
    post({ action: "create", name: "Ravi", email: "a@b.com", phone: null }),
  );
  const body = await bodyOf(res);
  assertEquals(res.status, 400);
  // The supervisor needs to know it is a duplicate, not a mystery.
  assertEquals(String(body.message).includes("already exists"), true);
});

Deno.test("deactivating a driver on a live run is refused", async () => {
  const { db, calls } = fakeDb({ hasLiveTrip: () => Promise.resolve(true) });
  const res = await makeHandler(SUPERVISOR, db)(post({ action: "set_active", id: "d1", active: false }));
  assertEquals(res.status, 409);
  assertEquals((await bodyOf(res)).error, "driver_busy");
  // And nothing was written.
  assertEquals(calls.active, undefined);
});

Deno.test("reactivating a driver is never blocked by a live run", async () => {
  const { db, calls } = fakeDb({ hasLiveTrip: () => Promise.resolve(true) });
  const res = await makeHandler(SUPERVISOR, db)(post({ action: "set_active", id: "d1", active: true }));
  assertEquals(res.status, 200);
  assertEquals(calls.active, true);
});

Deno.test("an unknown driver is not_found", async () => {
  const { db } = fakeDb({ get: () => Promise.resolve(null) });
  const res = await makeHandler(SUPERVISOR, db)(post({ action: "set_active", id: "nope", active: false }));
  assertEquals(res.status, 404);
});

Deno.test("a non-supervisor gets nothing", async () => {
  const { db } = fakeDb();
  const res = await makeHandler(NOT_ADMIN, db)(post({ action: "list" }));
  assertEquals(res.status, 403);
  assertEquals((await bodyOf(res)).error, "not_admin");
});

Deno.test("there is no delete action", async () => {
  const { db } = fakeDb();
  const res = await makeHandler(SUPERVISOR, db)(post({ action: "delete", id: "d1" }));
  assertEquals(res.status, 400);
});
