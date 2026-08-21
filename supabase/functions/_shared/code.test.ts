import { assertEquals, assertNotEquals } from "@std/assert";
import { CODE_LENGTH, generateCode, hashCode } from "./code.ts";

Deno.test("codes avoid every zero/one lookalike", () => {
  for (let i = 0; i < 500; i++) {
    const code = generateCode();
    assertEquals(code.length, CODE_LENGTH);
    // O, I, 0 and 1 are exactly what a driver misreads in a moving vehicle.
    assertEquals(/[OI01]/.test(code), false, `bad character in ${code}`);
    assertEquals(/^[A-Z2-9]+$/.test(code), true, `unexpected character in ${code}`);
  }
});

Deno.test("codes are not repeated in any realistic run", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) seen.add(generateCode());
  // 32^6 is ~1.07 billion, so collisions in 2000 draws would indicate a
  // broken generator rather than bad luck.
  assertEquals(seen.size, 2000);
});

Deno.test("hashing is case-insensitive and does not echo the code", async () => {
  const hash = await hashCode("ABC234");
  assertEquals(await hashCode("abc234"), hash);
  assertEquals(await hashCode(" AbC234 "), hash);
  assertEquals(hash.length, 64);
  assertEquals(hash.includes("ABC234"), false);
  assertNotEquals(await hashCode("ABC235"), hash);
});
