import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AppShell } from "./routes/AppShell";
import { Login } from "./routes/Login";
import { Stub } from "./routes/Stub";
import { Drivers } from "./routes/Drivers";
import { NotFound } from "./routes/NotFound";
import { LoadingState } from "./components/ui";
import { strings } from "./strings";

/**
 * Routing.
 *
 * Note what is absent: there is no /signup route. Supervisors are created by
 * hand in the Supabase dashboard (PRD §5.1). If you are adding a registration
 * form, stop and re-read the ticket.
 */

/** Requires a session AND an active admins row. Both, in that order. */
function Protected() {
  const { status } = useAuth();
  const location = useLocation();

  if (status.state === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <LoadingState label={strings.login.checking} />
      </main>
    );
  }

  if (status.state === "signed-out") {
    // Remember where they were headed so signing in returns them there.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <AppShell />;
}

function LoginRoute() {
  const { status } = useAuth();
  const location = useLocation() as { state?: { from?: string } };

  if (status.state === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <LoadingState label={strings.login.checking} />
      </main>
    );
  }

  if (status.state === "signed-in") {
    return <Navigate to={location.state?.from ?? "/trips"} replace />;
  }

  return <Login notSupervisor={status.notSupervisor} />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<Protected />}>
            <Route index element={<Navigate to="/trips" replace />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/plan" element={<Stub title={strings.nav.plan} note={strings.placeholder.plan} />} />
            <Route path="/trips" element={<Stub title={strings.nav.trips} note={strings.placeholder.trips} />} />
            <Route path="/trips/:id" element={<Stub title={strings.nav.trips} note={strings.placeholder.tripDetail} />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
