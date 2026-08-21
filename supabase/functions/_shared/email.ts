// Transactional email, via Resend.
//
// The site never sends email; only Edge Functions do (CLAUDE.md). The driver's
// email carries the CODE and nothing about the route — no origin, destination,
// stops or consignment.
//
// That is safer than it first looks because of an invariant we already have: a
// driver can hold only one live trip at a time, so there is no "which of my
// three codes is this?" problem. An older code is always a dead code.

export interface EmailDeps {
  apiKey(): string | null;
  from(): string;
  fetch: typeof fetch;
}

export interface SendResult {
  sent: boolean;
}

function body(code: string): { html: string; text: string } {
  // Generous letter spacing: this is read off a phone, often in poor light.
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-size:14px;color:#5a6478">Humble Coders</p>
    <h1 style="margin:0 0 16px;font-size:18px;color:#0f131c">Your run is ready</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#3d4759">Open the Humble Drive app and enter this code to see your route.</p>
    <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;color:#0f131c">${code}</p>
    <p style="margin:0;font-size:13px;color:#5a6478">If you didn't expect this, you can ignore it.</p>
  </div></body></html>`;

  const text = `Humble Coders — your run is ready

Open the Humble Drive app and enter this code to see your route:

    ${code}

If you didn't expect this, you can ignore it.`;

  return { html, text };
}

/**
 * Send a code. Never throws: the caller has already written the trip, and a
 * mail failure must cost an email rather than the whole plan.
 */
export async function sendCode(
  deps: EmailDeps,
  to: string,
  code: string,
): Promise<SendResult> {
  const key = deps.apiKey();
  if (!key) return { sent: false };

  const { html, text } = body(code);

  try {
    const res = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: deps.from(),
        to: [to],
        subject: "Your Humble Drive code",
        html,
        text,
      }),
    });

    if (!res.ok) {
      // Swallowing this silently makes a failed send undiagnosable: the caller
      // only learns `sent: false`, with no way to tell a bad key from a
      // rejected sender address. Logged server-side, never returned — and
      // never with the code in it.
      const detail = await res.text().catch(() => "");
      console.error(
        `Resend rejected the send: HTTP ${res.status} from=${deps.from()} detail=${detail.slice(0, 300)}`,
      );
    }

    return { sent: res.ok };
  } catch (err) {
    console.error("Resend request failed:", err instanceof Error ? err.message : err);
    return { sent: false };
  }
}
