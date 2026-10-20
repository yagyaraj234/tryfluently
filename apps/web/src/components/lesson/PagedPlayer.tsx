import {
  Button,
  Cluster,
  Heading,
  Notice,
  PageBlock,
  PageDots,
  QuestionSkeleton,
  ReadingCard,
  Stack,
  Text,
  type PageQuestion,
  type PageResult,
} from "@impromptu/ui";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { lessonPagesQuery } from "../../lib/lessons";
import { PagedComplete } from "./PagedComplete";
import { lessonXp, type Lesson } from "./lesson";

type PageData = {
  page: number;
  status: "pending" | "ready" | "failed";
  question: "pending" | "ready" | "failed";
  questionData?: PageQuestion;
  result?: PageResult;
  title?: string;
  body?: string;
  example?: string | null;
  block?: string;
};
type PagedData = {
  id: string;
  preparation: "failed" | "preparing" | "ready" | null;
  currentPage: number;
  status: "abandoned" | "completed" | "in_progress";
  pages: PageData[];
};

const hasQuestion = (p: PageData) => p.block !== undefined && p.block !== "reading";

/** Shows a paged Lesson one Page at a time. It opens on the Page the Learner left and polls until every Page and question has arrived. */
export function PagedPlayer({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const initialData = {
    id: lesson.id,
    preparation: lesson.preparation,
    currentPage: lesson.currentPage,
    status: lesson.status,
    pages: lesson.material,
  } as unknown as PagedData;
  // The API types are looser than what the player needs (it narrows Block and result shapes), so the options are retyped once here.
  const pagesQuery = lessonPagesQuery(lesson.id) as unknown as UseQueryOptions<PagedData>;
  const { data } = useQuery({ ...pagesQuery, initialData });
  const pages = data!.pages;
  const recap = pages.length;
  const [index, setIndex] = useState(Math.min(lesson.currentPage, recap));
  const heading = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const page = pages[index];

  // Move focus to the new Page, but not on the first render so the browser keeps its own starting point.
  useEffect(() => {
    if (first.current) first.current = false;
    else heading.current?.focus();
  }, [index]);

  const go = (to: number) => {
    setIndex(to);
    // Fire and forget: losing this only means resuming one Page earlier.
    void api().api.lessons[":id"].page.$patch({ param: { id: lesson.id }, json: { page: to } });
  };

  const answer = useMutation({
    mutationFn: async (value: unknown) => {
      const response = await api().api.lessons[":id"].pages[":index{[0-9]+}"].answer.$post({
        param: { id: lesson.id, index: String(index) },
        json: { answer: value },
      });
      if (!response.ok) throw new Error("Your answer couldn't be saved. Try again.");
      return (await response.json()) as unknown as PageResult;
    },
    onSuccess: (result) =>
      queryClient.setQueryData(
        pagesQuery.queryKey!,
        (old: PagedData | undefined) =>
          old && { ...old, pages: old.pages.map((p) => (p.page === index ? { ...p, result } : p)) },
      ),
  });

  const retry = useMutation({
    mutationFn: async () => {
      const response = await api().api.lessons[":id"].retry.$post({ param: { id: lesson.id } });
      if (!response.ok) throw new Error("We couldn't retry your Lesson.");
    },
    onSuccess: () => queryClient.invalidateQueries(lessonPagesQuery(lesson.id)),
  });

  const finish = useMutation({
    mutationFn: async () => {
      const response = await api().api.lessons[":id"].finish.$post({ param: { id: lesson.id } });
      if (!response.ok) throw new Error("Your Lesson couldn't be finished. Try again.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await router.invalidate();
    },
  });

  const answered = pages.filter((p) => p.result).length;
  const graded = pages.filter((p) => p.result?.verdict);
  const correct = graded.filter((p) => p.result?.verdict === "correct").length;
  if (lesson.status === "completed")
    return (
      <PagedComplete lessonId={lesson.id} xpGained={lessonXp(answered)} correct={correct} graded={graded.length} />
    );

  const broken = !page ? false : page.status === "failed" || (hasQuestion(page) && page.question === "failed");
  const ready = Boolean(page && page.status === "ready" && (!hasQuestion(page) || page.result));

  let body;
  if (index === recap)
    body = (
      <Stack gap={4}>
        <Heading level={2}>Nice work</Heading>
        <Text>
          {graded.length
            ? `You got ${correct} of ${graded.length} checked questions right.`
            : "You reached the end of this Lesson."}
        </Text>
        {finish.isError && <Notice tone="error">{finish.error.message}</Notice>}
        <Button disabled={finish.isPending} onClick={() => finish.mutate()}>
          {finish.isPending ? "Finishing…" : "Finish Lesson"}
        </Button>
      </Stack>
    );
  else if (broken)
    body = (
      <Notice tone="error">
        <Stack gap={3}>
          <span>This page couldn't be written.</span>
          <div>
            <Button size="sm" disabled={retry.isPending} onClick={() => retry.mutate()}>
              Try again
            </Button>
          </div>
        </Stack>
      </Notice>
    );
  else if (!page || page.status !== "ready") body = <QuestionSkeleton />;
  else
    body = (
      <Stack gap={4}>
        <ReadingCard title={page.title ?? ""} body={page.body ?? ""} example={page.example} />
        {hasQuestion(page) &&
          (page.question === "ready" && page.questionData ? (
            <PageBlock
              key={index}
              question={page.questionData}
              result={page.result}
              pending={answer.isPending}
              onSubmit={(value) => answer.mutate(value)}
            />
          ) : (
            <QuestionSkeleton />
          ))}
        {answer.isError && <Notice tone="error">{answer.error.message}</Notice>}
      </Stack>
    );

  return (
    <Stack gap={6}>
      <PageDots current={index} total={recap + 1} />
      <div ref={heading} tabIndex={-1} aria-label={index === recap ? "Recap" : `Page ${index + 1} of ${recap}`}>
        {body}
      </div>
      <Cluster justify="between">
        <Button variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>
          Back
        </Button>
        {index < recap && (
          <Button disabled={!ready} onClick={() => go(index + 1)}>
            {index === recap - 1 ? "Recap" : "Next"}
          </Button>
        )}
      </Cluster>
    </Stack>
  );
}
