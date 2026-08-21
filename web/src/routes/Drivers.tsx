import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { callFunction, messageFor } from "../lib/api";
import { strings } from "../strings";
import {
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  LoadingState,
  PageHeader,
} from "../components/ui";

/**
 * The driver roster.
 *
 * Two things this screen deliberately does not do:
 *
 *   - There is no delete. Trips reference drivers and a completed run has to
 *     keep naming who drove it, so deactivation is the only way out.
 *   - It does not enforce anything. The deactivate button is hidden for a busy
 *     driver as a courtesy, and the endpoint refuses regardless (CLAUDE.md
 *     rule 1).
 *
 * Filtering is client-side on purpose: the roster is capped at tens of people
 * (PRD §3), so paging would be speculative. Trips are the opposite case and get
 * server-side paging.
 */

interface CurrentTrip {
  id: string;
  status: string;
  dest_name: string;
}

interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  created_at: string;
  current_trip: CurrentTrip | null;
}

interface FormState {
  id: string | null;
  name: string;
  email: string;
  phone: string;
}

const EMPTY_FORM: FormState = { id: null, name: "", email: "", phone: "" };

/** Indian mobiles read far more easily split 5-5 than as ten digits. */
function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

export function Drivers() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmOff, setConfirmOff] = useState<Driver | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await callFunction<{ drivers: Driver[] }>("drivers", {
        body: { action: "list" },
      });
      setDrivers(res.drivers);
    } catch (err) {
      setLoadError(messageFor(err));
      setDrivers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !drivers) return drivers ?? [];
    return drivers.filter((d) =>
      [d.name, d.email, d.phone ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [drivers, filter]);

  /** The driver being edited, so we can tell whether a pending code is at risk. */
  const editing = form?.id ? drivers?.find((d) => d.id === form.id) ?? null : null;
  const emailChanged =
    editing !== null && form !== null &&
    form.email.trim().toLowerCase() !== editing.email;
  const warnAboutCode = emailChanged && editing?.current_trip?.status === "pending";

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError(null);
    try {
      await callFunction("drivers", {
        body: form.id
          ? { action: "update", id: form.id, name: form.name, email: form.email, phone: form.phone }
          : { action: "create", name: form.name, email: form.email, phone: form.phone },
      });
      setForm(null);
      await load();
    } catch (err) {
      // The form stays open with everything typed still in it.
      setFormError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(driver: Driver, active: boolean) {
    setBusyId(driver.id);
    setLoadError(null);
    try {
      await callFunction("drivers", {
        body: { action: "set_active", id: driver.id, active },
      });
      setConfirmOff(null);
      await load();
    } catch (err) {
      setConfirmOff(null);
      setLoadError(messageFor(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title={strings.drivers.title}
        description={strings.drivers.description}
        actions={<Button onClick={() => { setForm({ ...EMPTY_FORM }); setFormError(null); }}>{strings.drivers.add}</Button>}
      />

      {loadError && (
        <div className="mb-4">
          <Banner action={<Button variant="secondary" onClick={() => void load()}>{strings.common.retry}</Button>}>
            {loadError}
          </Banner>
        </div>
      )}

      {drivers === null ? (
        <LoadingState label={strings.common.loading} />
      ) : drivers.length === 0 ? (
        <EmptyState
          title={strings.drivers.empty}
          body={strings.drivers.emptyBody}
          action={<Button onClick={() => setForm({ ...EMPTY_FORM })}>{strings.drivers.add}</Button>}
        />
      ) : (
        <>
          <div className="mb-4 max-w-sm">
            <Field
              label={strings.drivers.filter}
              type="search"
              placeholder={strings.drivers.filterPlaceholder}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            // Distinct from "no drivers yet" — these mean different things and
            // only one of them is fixed by clearing the search.
            <EmptyState
              title={strings.drivers.noMatches}
              body={strings.drivers.noMatchesBody}
              action={<Button variant="secondary" onClick={() => setFilter("")}>{strings.drivers.clearFilter}</Button>}
            />
          ) : (
            <>
              {/* Desktop: a real table. */}
              <div className="hidden md:block">
                <Card className="overflow-hidden p-0">
                  <table className="w-full text-sm">
                    <thead className="border-b border-edge text-left text-muted-text">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">{strings.drivers.name}</th>
                        <th scope="col" className="px-4 py-3 font-medium">{strings.drivers.email}</th>
                        <th scope="col" className="px-4 py-3 font-medium">{strings.drivers.phone}</th>
                        <th scope="col" className="px-4 py-3 font-medium">{strings.drivers.status}</th>
                        <th scope="col" className="px-4 py-3 font-medium">{strings.drivers.currentRun}</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">{strings.drivers.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((d) => (
                        <tr key={d.id} className="border-b border-edge last:border-0">
                          <td className="max-w-[12rem] truncate px-4 py-3" title={d.name}>{d.name}</td>
                          <td className="max-w-[16rem] truncate px-4 py-3 text-muted-text" title={d.email}>{d.email}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-text">{formatPhone(d.phone)}</td>
                          <td className="px-4 py-3">
                            <StatusPill active={d.active} />
                          </td>
                          <td className="max-w-[12rem] truncate px-4 py-3 text-muted-text">
                            {d.current_trip ? d.current_trip.dest_name || d.current_trip.status : strings.drivers.free}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <RowActions
                              driver={d}
                              busy={busyId === d.id}
                              onEdit={() => { setForm({ id: d.id, name: d.name, email: d.email, phone: d.phone ?? "" }); setFormError(null); }}
                              onDeactivate={() => setConfirmOff(d)}
                              onReactivate={() => void setActive(d, true)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>

              {/* Below 768px: stacked cards. A six-column table that scrolls
                  sideways on a phone is not responsive. */}
              <ul className="flex flex-col gap-3 md:hidden">
                {filtered.map((d) => (
                  <li key={d.id}>
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{d.name}</p>
                          <p className="truncate text-sm text-muted-text">{d.email}</p>
                          <p className="text-sm text-muted-text">{formatPhone(d.phone)}</p>
                        </div>
                        <StatusPill active={d.active} />
                      </div>
                      <p className="mt-3 text-sm text-muted-text">
                        {strings.drivers.currentRun}:{" "}
                        {d.current_trip ? d.current_trip.dest_name || d.current_trip.status : strings.drivers.free}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <RowActions
                          driver={d}
                          busy={busyId === d.id}
                          onEdit={() => { setForm({ id: d.id, name: d.name, email: d.email, phone: d.phone ?? "" }); setFormError(null); }}
                          onDeactivate={() => setConfirmOff(d)}
                          onReactivate={() => void setActive(d, true)}
                        />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? strings.drivers.editTitle : strings.drivers.addTitle}
      >
        {form && (
          <form onSubmit={submitForm} className="flex flex-col gap-4" noValidate>
            {formError && <Banner>{formError}</Banner>}
            {warnAboutCode && <Banner tone="info">{strings.drivers.emailChangeWarning}</Banner>}

            <Field
              label={strings.drivers.name}
              autoCapitalize="words"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Field
              label={strings.drivers.email}
              type="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Field
              label={strings.drivers.phone}
              type="tel"
              inputMode="numeric"
              hint={strings.drivers.phoneHint}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                {strings.common.cancel}
              </Button>
              <Button type="submit" busy={saving} busyLabel={strings.common.saving}>
                {strings.common.save}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={confirmOff !== null}
        onClose={() => setConfirmOff(null)}
        title={strings.drivers.deactivateTitle}
      >
        {confirmOff && (
          <>
            <p className="text-sm text-muted-text">
              {confirmOff.name} — {strings.drivers.deactivateBody}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOff(null)}>
                {strings.common.cancel}
              </Button>
              <Button
                variant="danger"
                busy={busyId === confirmOff.id}
                onClick={() => void setActive(confirmOff, false)}
              >
                {strings.drivers.deactivate}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

/** Status is never colour alone — the word is the signal, the tint supports it. */
function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs ${
        active ? "border-edge bg-secondary text-text" : "border-edge bg-muted text-muted-text"
      }`}
    >
      {active ? strings.drivers.active : strings.drivers.inactive}
    </span>
  );
}

function RowActions({
  driver,
  busy,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  driver: Driver;
  busy: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={onEdit} aria-label={`${strings.drivers.edit} ${driver.name}`}>
        {strings.drivers.edit}
      </Button>
      {driver.active ? (
        <Button
          variant="danger"
          busy={busy}
          onClick={onDeactivate}
          aria-label={`${strings.drivers.deactivate} ${driver.name}`}
        >
          {strings.drivers.deactivate}
        </Button>
      ) : (
        <Button
          variant="secondary"
          busy={busy}
          onClick={onReactivate}
          aria-label={`${strings.drivers.reactivate} ${driver.name}`}
        >
          {strings.drivers.reactivate}
        </Button>
      )}
    </div>
  );
}
