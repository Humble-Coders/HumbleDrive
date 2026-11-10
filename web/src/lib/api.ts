import { supabase, functionsBaseUrl } from "./supabase";
import { strings } from "../strings";

/** The closed set from PRD §4.7, plus the platform code ticket 2 added. */
export type ErrorCode = keyof typeof strings.errors;

/**
 * A failed call, carrying the server's code and message.
 *
 * The server's message is preferred when present — it can be more specific
 * than a generic per-code fallback ("Ravi is already on a run to Delhi"
 * rather than "That driver is already on a run"). The code is what callers
 * branch on.
 */
export class ApiError extends Error {
  // Declared explicitly rather than as constructor parameter properties:
  // the template enables `erasableSyntaxOnly`, which forbids syntax that
  // cannot be stripped by a type-only transform.
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function fallbackFor(code: string): string {
  return code in strings.errors
    ? strings.errors[code as ErrorCode]
    : strings.errors.unknown;
}

/**
 * Call an Edge Function with the caller's JWT.
 *
 * Everything the app reads or writes goes through here. There is deliberately
 * no direct table access anywhere in the client.
 */
export async function callFunction<T>(
  name: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let response: Response;
  try {
    response = await fetch(`${functionsBaseUrl}/${name}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // fetch only rejects on a network failure, so this really is connectivity.
    throw new ApiError("internal_error", strings.errors.offline, 0);
  }

  if (!response.ok) {
    let code = "internal_error";
    let message = "";
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      if (body.error) code = body.error;
      if (body.message) message = body.message;
    } catch {
      // A non-JSON error body means something upstream of our handler failed.
    }
    throw new ApiError(code as ErrorCode, message || fallbackFor(code), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Human-readable text for anything thrown by a call. */
export function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return strings.errors.unknown;
}
