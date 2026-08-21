import { strings } from "../strings";

/**
 * The Humble Coders wordmark.
 *
 * CLAUDE.md requires the real humblecoders.in logo asset. It has not been
 * handed over yet, so this renders the name in the brand script face as a
 * stand-in. Swap in the asset when it arrives — this is the only place that
 * needs to change.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-script text-2xl leading-none text-text ${className}`}>
      {strings.app.name}
    </span>
  );
}
