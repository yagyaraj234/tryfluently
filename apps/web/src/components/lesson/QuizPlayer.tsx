import {
  Button,
  Card,
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
} from "@fluently/ui";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { lessonPagesQuery } from "../../lib/lessons";
import { PagedComplete } from "./PagedComplete";
import { SpeakingBlock, type PagedData } from "./PagedPlayer";
import { lessonXp, type Lesson } from "./lesson";

export type QuizItem = {
  index: number;
  page: number | null;
  round: number;
  questionData: PageQuestion;
  result?: PageResult;
};
type QuizData = PagedData & { quiz: QuizItem[] };

const errorOf = async (response: { json: () => Promise<unknown> }, fallback: string) =>
  new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback);

/** Right answers out of the checked ones. Spoken answers still being analysed have no verdict yet and are left out. */
export function quizScore(items: QuizItem[]) {
  const graded = items.filter((q) => q.result?.verdict);
  return { correct: graded.filter((q) => q.result?.verdict === "correct").length, graded: graded.length };
}

/**
 * A Lesson of content version 3: Pages that only teach, then the Quiz one question at a time with no feedback in
 * between, then every result together. It opens where the Learner left off and polls until everything has arrived.
 */
export function QuizPlayer({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const initialData = {
    id: lesson.id,
    preparation: lesson.preparation,
    currentPage: lesson.currentPage,
    status: lesson.status,
    pages: lesson.material,
    quiz: lesson.quiz,
  } as unknown as QuizData;
  const pagesQuery = lessonPagesQuery(lesson.id) as unknown as UseQueryOptions<QuizData>;
  const { data } = useQuery({ ...pagesQuery, initialData });
  const { pages, quiz } = data!;
  // The Quiz comes after the last Page, where version 2 Lessons have their recap.
  const quizAt = pages.length;
  const [index, setIndex] = useState(Math.min(lesson.currentPage, quizAt));
  const [reviewing, setReviewing] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const recordings = useRef(new Map<number, string>());
  useEffect(() => {
    const kept = recordings.current;
    return () => {
      for (const url of kept.values()) URL.revokeObjectURL(url);
      kept.clear();
    };
  }, []);

  const current = quiz.find((q) => !q.result);
  // Focus the new Page or question, but not on the first render so the browser keeps its own starting point.
  useEffect(() => {
    if (first.current) return void (first.current = false);
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [index, current?.index]);

  const go = (to: number) => {
    setIndex(to);
    // Fire and forget: losing this only means resuming one Page earlier.
    void api().api.lessons[":id"].page.$patch({ param: { id: lesson.id }, json: { page: to } });
  };

  const answer = useMutation({
    mutationFn: async ({ at, value }: { at: number; value: unknown }) => {
      const response = await api().api.lessons[":id"].quiz[":index{[0-9]+}"].answer.$post({
        param: { id: lesson.id, index: String(at) },
        json: { answer: value },
      });
      if (!response.ok) throw await errorOf(response, "Your answer couldn't be saved. Try again.");
      return (await response.json()) as unknown as PageResult;
    },
    // A failed check still saved the answer, so reload: the Quiz moves on and the results offer the retry.
    onError: () => queryClient.invalidateQueries(lessonPagesQuery(lesson.id)),
    onSuccess: (result, { at }) =>
      queryClient.setQueryData(
        pagesQuery.queryKey!,
        (old: QuizData | undefined) =>
          old && { ...old, quiz: old.quiz.map((q) => (q.index === at ? { ...q, result } : q)) },
      ),
  });

  const analyse = useMutation({
    mutationFn: async (at: number) => {
      const response = await api().api.lessons[":id"].quiz[":index{[0-9]+}"].analyse.$post({
        param: { id: lesson.id, index: String(at) },
      });
      if (!response.ok) throw new Error("We couldn't check your speech. Try again.");
    },
    onSuccess: () => queryClient.invalidateQueries(lessonPagesQuery(lesson.id)),
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
      if (!response.ok) throw await errorOf(response, "Your Lesson couldn't be finished. Try again.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await router.invalidate();
    },
  });

  const question = (item: QuizItem, result?: PageResult) => {
    const props = {
      question: item.questionData,
      result,
      pending: answer.isPending && answer.variables?.at === item.index,
      onSubmit: (value: unknown) => answer.mutate({ at: item.index, value }),
    };
    return item.questionData.block === "speakPrompt" ? (
      <SpeakingBlock
        key={item.index}
        {...props}
        onRetry={() => analyse.mutate(item.index)}
        kept={recordings.current.get(item.index)}
        keep={(url) => recordings.current.set(item.index, url)}
      />
    ) : (
      <PageBlock key={item.index} {...props} />
    );
  };

  const results = (
    <Stack gap={4}>
      <Heading level={2}>Quiz results</Heading>
      <Text>{`You got ${quizScore(quiz).correct} of ${quizScore(quiz).graded} right.`}</Text>
      {quiz.map((item, i) => (
        <Card key={item.index}>
          <Stack gap={3}>
            <Text tone="muted">{`Question ${i + 1}`}</Text>
            {question(item, item.result)}
          </Stack>
        </Card>
      ))}
      {analyse.isError && <Notice tone="error">{analyse.error.message}</Notice>}
    </Stack>
  );

  if (lesson.status === "completed")
    return reviewing ? (
      <Stack gap={6}>
        {results}
        <Button variant="secondary" onClick={() => setReviewing(false)}>
          Back to summary
        </Button>
      </Stack>
    ) : (
      <PagedComplete
        lessonId={lesson.id}
        xpGained={lessonXp(quiz.filter((q) => q.result).length)}
        {...quizScore(quiz)}
        onReview={quiz.length ? () => setReviewing(true) : undefined}
      />
    );

  const page = pages[index];
  const failed = (
    <Notice tone="error">
      <Stack gap={3}>
        <span>{index === quizAt ? "Your Quiz couldn't be written." : "This page couldn't be written."}</span>
        {retry.isError && <span>{retry.error.message}</span>}
        <div>
          <Button size="sm" disabled={retry.isPending} onClick={() => retry.mutate()}>
            Try again
          </Button>
        </div>
      </Stack>
    </Notice>
  );

  let body;
  if (index === quizAt) {
    if (!quiz.length && (data!.preparation === "failed" || pages.some((p) => p.question === "failed"))) body = failed;
    else if (!quiz.length) body = <QuestionSkeleton label="Getting your Quiz ready" />;
    else if (current)
      body = (
        <Stack gap={4}>
          <Text tone="muted">{`Question ${quiz.indexOf(current) + 1} of ${quiz.length}`}</Text>
          {question(current)}
          {answer.isError && <Notice tone="error">{answer.error.message}</Notice>}
        </Stack>
      );
    else
      body = (
        <Stack gap={4}>
          {results}
          {finish.isError && <Notice tone="error">{finish.error.message}</Notice>}
          <Button disabled={finish.isPending} onClick={() => finish.mutate()}>
            {finish.isPending ? "Finishing…" : "Finish Lesson"}
          </Button>
        </Stack>
      );
  } else if (page?.status === "failed") body = failed;
  else if (!page || page.status !== "ready") body = <QuestionSkeleton label="Getting this page ready" />;
  else
    body = (
      <ReadingCard
        title={page.title ?? ""}
        body={page.body ?? ""}
        example={page.example}
        keyTerms={page.keyTerms}
        glossary={page.glossary}
        vocab={page.vocab}
      />
    );

  return (
    <Stack gap={6}>
      <PageDots current={index} total={quizAt + 1} last="Quiz" />
      <div ref={heading} tabIndex={-1} aria-label={index === quizAt ? "Quiz" : `Page ${index + 1} of ${quizAt}`}>
        {body}
      </div>
      <Cluster justify="between">
        <Button variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>
          Back
        </Button>
        {index < quizAt && (
          <Button disabled={page?.status !== "ready"} onClick={() => go(index + 1)}>
            {index === quizAt - 1 ? "Start the Quiz" : "Next"}
          </Button>
        )}
      </Cluster>
    </Stack>
  );
}
