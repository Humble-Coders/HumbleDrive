// Input normalisation shared by the endpoints that accept human-typed data.
//
// Two rules, and it is worth knowing why they sit at different layers:
//
//   Email case is a SAFETY invariant. Two casings of one address would be two
//   driver records for one human, and "one live run per driver" would quietly
//   stop meaning anything. Postgres enforces it with a check constraint; we
//   lowercase here so a supervisor sees a friendly message instead of a raw
//   constraint violation. Both layers, doing different jobs.
//
//   Phone format is DATA QUALITY. Getting it wrong is untidy, not unsafe, so
//   it is validated here only — no migration, no constraint. CLAUDE.md rule 1
//   is about invariants, not tidiness.

/** Lowercase and trim, matching `check (email = lower(btrim(email)))`. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Deliberately permissive: real validation is that a code can be delivered,
 *  which no regex can tell us. This only rejects the obviously malformed. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * Indian 10-digit mobile, stored as ten digits and nothing else.
 *
 * Accepts what a human would actually type — spaces, dashes, brackets, a
 * leading +91, 91 or 0 — and returns null if what is left is not a plausible
 * Indian mobile. Runs are India-only (ticket 4 restricts address search the
 * same way), so an international number is a mistake rather than a case to
 * support.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(1);

  // Indian mobile numbers begin 6-9. Landlines and short codes are not useful
  // here: this is the number a supervisor rings when a driver goes quiet.
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}
