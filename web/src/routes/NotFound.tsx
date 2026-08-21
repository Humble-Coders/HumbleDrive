import { Link } from "react-router-dom";
import { strings } from "../strings";
import { PageHeader, EmptyState, Button } from "../components/ui";

export function NotFound() {
  return (
    <>
      <PageHeader title={strings.notFound.title} />
      <EmptyState
        title={strings.notFound.title}
        body={strings.notFound.body}
        action={
          <Link to="/trips">
            <Button variant="secondary">{strings.notFound.back}</Button>
          </Link>
        }
      />
    </>
  );
}
