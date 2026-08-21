import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

/**
 * The shared primitives.
 *
 * Tickets 5, 6 and 8 build inside these. If one falls short, extend it here
 * rather than forking a variant into a feature folder — CLAUDE.md forbids
 * duplicated component code, and a forked button is how a design drifts.
 *
 * Every colour is a theme token. No hex appears in this file or any other
 * component.
 */

/* ------------------------------------------------------------------ Button */

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-text hover:bg-brand-2 border-transparent",
  secondary: "bg-secondary text-text hover:bg-muted border-edge",
  ghost: "bg-transparent text-muted-text hover:text-text hover:bg-secondary border-transparent",
  danger: "bg-transparent text-gold hover:bg-secondary border-edge",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Disables and shows progress. Callers must set this for the whole request,
   *  which is what stops a double-click doing the thing twice. */
  busy?: boolean;
  busyLabel?: string;
}

export function Button({
  variant = "primary",
  busy = false,
  busyLabel,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      // min-h-11 is ~44px: the touch-target floor, and it also stops buttons
      // looking cramped next to inputs.
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-token)] border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

/* ----------------------------------------------------------------- Spinner */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

/* ------------------------------------------------------------------- Field */

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Rendered under the input and linked with aria-describedby, so a screen
   *  reader hears the error with the field rather than adrift on the page. */
  error?: string;
  hint?: string;
}

export function Field({ label, error, hint, id, className = "", ...rest }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className={`min-h-11 rounded-[var(--radius-token)] border border-edge bg-secondary px-3 text-text placeholder:text-muted-text focus:border-brand-2 focus:outline-none disabled:opacity-50 ${className}`}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-text">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-gold">
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  children,
  className = "",
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  /** Lifts the surface one step. For panels that sit on top of other panels. */
  elevated?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-token)] border border-edge ${
        elevated ? "bg-elevated shadow-lg shadow-black/20" : "bg-card"
      } p-5 ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- StatTile */

/**
 * A single number, large, with its label above and optional context below.
 *
 * The dashboard is scanned rather than read, so the figure carries the weight
 * and everything else recedes. Tabular numerals keep a row of tiles aligned.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-token)] border border-edge bg-card p-4">
      <div className="flex items-center gap-2 text-muted-text">
        {icon}
        <span className="text-xs font-medium tracking-wide uppercase">{label}</span>
      </div>
      <span
        className={`text-3xl font-semibold tabular-nums ${
          tone === "accent" ? "text-gold" : "text-text"
        }`}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-text">{hint}</span>}
    </div>
  );
}

/* -------------------------------------------------------------- PageHeader */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-muted-text">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ----------------------------------------------------------- SectionTitle */

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-text uppercase">{children}</h2>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ Banner */

/** Inline message in the app's own styling. Never a raw error object, never
 *  an alert() — CLAUDE.md, Conventions. `role="alert"` so it is announced. */
export function Banner({ tone = "error", children, action }: { tone?: "error" | "info"; children: ReactNode; action?: ReactNode }) {
  const toneClass = tone === "error" ? "border-gold/40 text-gold" : "border-edge text-muted-text";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-token)] border bg-secondary px-4 py-3 text-sm ${toneClass}`}
    >
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted-text">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

/* ----------------------------------------------------------------- Loading */

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-12 text-sm text-muted-text">
      <Spinner />
      {label}
    </div>
  );
}

/* ------------------------------------------------------------------ Dialog */


/**
 * Native <dialog>, opened with showModal().
 *
 * Deliberately not hand-rolled: the platform gives us the focus trap, the
 * backdrop, Escape-to-close and inert background for free, and every one of
 * those is a thing a custom overlay gets subtly wrong.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicking the backdrop closes; clicking the panel must not.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-token)] border border-edge bg-card p-0 text-text backdrop:bg-black/60"
    >
      <div className="p-5">
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
