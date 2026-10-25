import {
  Button,
  Cluster,
  PageBlock,
  PageDots,
  ReadingCard,
  Stack,
  Text,
  type GlossaryTerm,
  type PageQuestion,
  type PageResult,
} from "@fluently/ui";
import { useState } from "react";

type ReviewPage = {
  page: number;
  status: "pending" | "ready" | "failed";
  questionData?: PageQuestion;
  result?: PageResult;
  title?: string;
  body?: string;
  example?: string | null;
  keyTerms?: string[];
  glossary?: GlossaryTerm[];
};

/** Read-only walk through a finished paged Lesson: each Page with the Learner's saved answer. Nothing here writes to the API. */
export function PagedReview({ pages, onClose }: { pages: ReviewPage[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const page = pages[index]!;
  return (
    <Stack gap={6}>
      <PageDots current={index} total={pages.length} />
      <div aria-label={`Page ${index + 1} of ${pages.length}`}>
        {page.status === "ready" ? (
          <Stack gap={4}>
            <ReadingCard
              title={page.title ?? ""}
              body={page.body ?? ""}
              example={page.example}
              keyTerms={page.keyTerms}
              glossary={page.glossary}
            />
            {page.questionData &&
              (page.result ? (
                <PageBlock
                  key={index}
                  question={page.questionData}
                  result={page.result}
                  pending={false}
                  onSubmit={() => {}}
                />
              ) : (
                <Text tone="muted">You didn't answer this one.</Text>
              ))}
          </Stack>
        ) : (
          <Text tone="muted">This page wasn't written.</Text>
        )}
      </div>
      <Cluster justify="between">
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Back
        </Button>
        <Button disabled={index === pages.length - 1} onClick={() => setIndex(index + 1)}>
          Next
        </Button>
      </Cluster>
      <Button variant="secondary" onClick={onClose}>
        Back to summary
      </Button>
    </Stack>
  );
}
