import { Heading } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/_practice/assessments/$assessmentId")({ component: Assessment });

// A placeholder until #89 and #93 build this screen.
function Assessment() {
  return <Heading level={1}>Assessment</Heading>;
}
