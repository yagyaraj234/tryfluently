import { Heading } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/_practice/lessons/$lessonId")({ component: Lesson });

// A placeholder until #91 builds this screen.
function Lesson() {
  return <Heading level={1}>Lesson</Heading>;
}
