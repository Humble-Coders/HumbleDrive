// Booking codes.
//
// The code is a credential. It exists in plaintext in exactly one place — the
// email body — and is SHA-256 hashed everywhere else. It must never appear in
// a log line, an error message, a response body, or a database column. If you
// find yourself wanting to return it "just for testing", that is the instinct
// this rule exists to stop; check the email instead.
//
// A resend overwrites the hash, so the previous code dies instantly.

/** A-Z and 2-9, minus O and I. No zero/one lookalikes: a driver reads this off
 *  a phone in a cab, and O/0 and I/1 are exactly where that goes wrong. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // Modulo bias is negligible here: 256 % 32 === 0, so the mapping is uniform.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Case-insensitive on entry — a driver reading an email will type lowercase. */
export async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
