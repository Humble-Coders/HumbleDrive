import { strings } from "../strings";

/**
 * The Humble Coders wordmark.
 *
 * CLAUDE.md requires the real humblecoders.in logo asset. It has not been
 * handed over yet, so this sets the name in a tight grotesque as a stand-in —
 * closer to a product mark than the script face. Swap in the asset when it
 * arrives; this is the only place that needs to change.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-wordmark text-2xl leading-none font-bold tracking-tight text-text ${className}`}
    >
      {strings.app.name}
    </span>
  );
}
