import { PageHeader, EmptyState } from "../components/ui";
import { strings } from "../strings";

/**
 * A page that is routed and styled but not yet built.
 *
 * It names the ticket that fills it, so an empty screen reads as "not built
 * yet" rather than "broken" — which matters while five of these are live at
 * once.
 */
export function Stub({ title, note }: { title: string; note: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title={strings.placeholder.comingSoon} body={note} />
    </>
  );
}
