import { strings } from "../strings";

/**
 * Trip status.
 *
 * Never colour alone — the word is the signal and the tint supports it, so the
 * status survives a colour-blind viewer and a greyscale print.
 */
export const STATUS_LABELS: Record<string, string> = {
  pending: strings.trips.pending,
  active: strings.trips.active,
  completed: strings.trips.completed,
  cancelled: strings.trips.cancelled,
};

const TONE: Record<string, string> = {
  pending: "border-edge bg-secondary text-text",
  active: "border-gold/40 bg-secondary text-gold",
  completed: "border-edge bg-muted text-muted-text",
  cancelled: "border-edge bg-muted text-muted-text line-through",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs ${TONE[status] ?? TONE.pending}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
