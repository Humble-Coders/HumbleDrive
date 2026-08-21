import { useState, type FormEvent } from "react";
import { useAuth, BadCredentials, NotSupervisor } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { strings } from "../strings";
import { Button, Field, Card, Banner } from "../components/ui";
import { messageFor } from "../lib/api";
import { Wordmark } from "../components/Wordmark";

/**
 * Sign in.
 *
 * There is no signup route in this application — not hidden, not disabled,
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

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Wordmark />
          <p className="text-sm text-muted-text">{strings.app.tagline}</p>
        </div>

        <Card>
          {resetMode ? (
            <form onSubmit={onReset} className="flex flex-col gap-4" noValidate>
              <div>
                <h1 className="text-lg font-semibold">{strings.login.resetTitle}</h1>
              </div>
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
              <Button type="button" variant="ghost" onClick={() => { setResetMode(false); setResetSent(false); }}>
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
    </main>
  );
}
