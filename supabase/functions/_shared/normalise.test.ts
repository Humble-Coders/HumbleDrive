import { assertEquals } from "@std/assert";
import { isPlausibleEmail, normaliseEmail, normalisePhone } from "./normalise.ts";

Deno.test("normaliseEmail lowercases and trims", () => {
  assertEquals(normaliseEmail("  Foo@Bar.com "), "foo@bar.com");
  assertEquals(normaliseEmail("a@b.com"), "a@b.com");
});

Deno.test("isPlausibleEmail rejects the obviously malformed", () => {
  assertEquals(isPlausibleEmail("a@b.com"), true);
  assertEquals(isPlausibleEmail("a@b"), false);
  assertEquals(isPlausibleEmail("no-at-sign"), false);
  assertEquals(isPlausibleEmail("two @spaces.com"), false);
});

Deno.test("normalisePhone accepts the shapes a human types", () => {
  // Every one of these is the same number.
  for (const input of [
    "9876543210",
    "98765 43210",
    "98765-43210",
    "+91 9876543210",
    "+919876543210",
    "919876543210",
    "09876543210",
    "(98765) 43210",
  ]) {
    assertEquals(normalisePhone(input), "9876543210", `failed on: ${input}`);
  }
});

Deno.test("normalisePhone rejects what cannot be an Indian mobile", () => {
  assertEquals(normalisePhone("12345678"), null); // too short
  assertEquals(normalisePhone("98765432101"), null); // too long
  assertEquals(normalisePhone("1234567890"), null); // does not start 6-9
  assertEquals(normalisePhone("5876543210"), null); // does not start 6-9
  assertEquals(normalisePhone(""), null);
});
