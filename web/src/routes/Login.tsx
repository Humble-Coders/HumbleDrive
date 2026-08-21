import { useState, type FormEvent } from "react";
import { useAuth, BadCredentials, NotSupervisor } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { strings } from "../strings";
import { Button, Field, Card, Banner } from "../components/ui";
import { IconCheck } from "../components/icons";
import { messageFor } from "../lib/api";
import { Wordmark } from "../components/Wordmark";

/**
 * Sign in.
 *
 * A split layout: the left panel says what this is, the right holds the form
 * and nothing that competes with it. Below the large breakpoint the panel is
 * dropped entirely — on a phone the form should be the only thing on screen.
 *
 * There is no signup route in this application. Not hidden, not disabled —
 * absent. Supervisors are created by hand in the Supabase dashboard and given
 * an `admins` row (PRD §5.1).
 */
export function Login({ notSupervisor = false }: { notSupervisor?: boolean }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    notSupervisor ? strings.login.notSupervisor : null,
  );
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // On success the provider flips state and the router swaps this out.
    } catch (err) {
      if (err instanceof BadCredentials) setError(strings.login.badCredentials);
      else if (err instanceof NotSupervisor) setError(strings.login.notSupervisor);
      else setError(messageFor(err));
      // The typed email is deliberately kept; only the password is cleared.
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // Always reports success: revealing whether an address has an account
    // would let anyone enumerate our supervisors.
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    setResetSent(true);
    setBusy(false);
  }

  const points: Array<[string, string]> = [
    [strings.login.point1, strings.login.point1Body],
    [strings.login.point2, strings.login.point2Body],
    [strings.login.point3, strings.login.point3Body],
  ];

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-edge bg-card p-12 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(38rem 28rem at 15% -5%, var(--color-glow), transparent 70%), radial-gradient(30rem 24rem at 95% 105%, var(--color-hairline), transparent 65%)",
          }}
        />

        <div className="relative">
          <Wordmark className="text-3xl" />
        </div>

        <div className="relative flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2 className="max-w-md text-3xl font-semibold tracking-tight text-balance">
              {strings.login.pitch}
            </h2>
            <p className="max-w-sm text-sm text-muted-text">{strings.login.pitchBody}</p>
          </div>

          <ul className="flex max-w-md flex-col gap-4">
            {points.map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-text">
                  <IconCheck className="h-3 w-3" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-sm text-muted-text">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-text">{strings.app.tagline}</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
            <Wordmark />
            <p className="text-sm text-muted-text">{strings.app.tagline}</p>
          </div>

          <Card elevated>
            {resetMode ? (
              <form onSubmit={onReset} className="flex flex-col gap-4" noValidate>
                <h1 className="text-lg font-semibold">{strings.login.resetTitle}</h1>

                {resetSent && <Banner tone="info">{strings.login.resetSent}</Banner>}

                <Field
                  label={strings.login.email}
                  type="email"
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button type="submit" busy={busy} busyLabel={strings.common.saving}>
                  {strings.login.resetSubmit}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setResetMode(false);
                    setResetSent(false);
                  }}
                >
                  {strings.login.backToSignIn}
                </Button>
              </form>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
                <div>
                  <h1 className="text-lg font-semibold">{strings.login.title}</h1>
                  <p className="mt-1 text-sm text-muted-text">{strings.login.subtitle}</p>
                </div>

                {error && <Banner>{error}</Banner>}

                <Field
                  label={strings.login.email}
                  type="email"
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  label={strings.login.password}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <Button type="submit" busy={busy} busyLabel={strings.login.submitting}>
                  {strings.login.submit}
                </Button>

                <Button type="button" variant="ghost" onClick={() => setResetMode(true)}>
                  {strings.login.forgot}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </section>
    </main>
  );
}
