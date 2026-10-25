import {
  Button,
  Card,
  LessonNav,
  Heading,
  LessonFrame,
  LoadingState,
  Notice,
  PageBlock,
  PageDots,
  PollyWalking,
  QuestionSkeleton,
  ReadingCard,
  Stack,
  Text,
  TextArea,
  type PageQuestion,
  type PageResult,
} from "@fluently/ui";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
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
type QuizData = PagedData & { quiz: QuizItem[]; practice: "preparing" | "failed" | null; learnMore: boolean };

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialData = {
    id: lesson.id,
    preparation: lesson.preparation,
    currentPage: lesson.currentPage,
    status: lesson.status,
    pages: lesson.material,
    quiz: lesson.quiz,
    practice: lesson.practice,
    learnMore: "learnMore" in lesson && lesson.learnMore,
  } as unknown as QuizData;
  const pagesQuery = lessonPagesQuery(lesson.id) as unknown as UseQueryOptions<QuizData>;
  const { data } = useQuery({ ...pagesQuery, initialData });
  const { pages, quiz, practice, learnMore } = data!;
  // The Quiz comes after the last Page, where version 2 Lessons have their recap.
  const quizAt = pages.length;
  // A Learner who left at the choice comes back to the results and choice, wherever they had stepped back to.
  const quizDone = quiz.length > 0 && quiz.every((q) => q.result);
  const [index, setIndex] = useState(quizDone ? quizAt : Math.min(lesson.currentPage, quizAt));
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

  // Practice more, or trying a failed Practice Round again.
  const practise = useMutation({
    mutationFn: async () => {
      const response = await api().api.lessons[":id"].practice.$post({ param: { id: lesson.id } });
      if (!response.ok) throw await errorOf(response, "We couldn't start your Practice Round. Try again.");
    },
    onSuccess: () => queryClient.invalidateQueries(lessonPagesQuery(lesson.id)),
  });

  // Learn more: completes this Lesson and opens the Follow-up Lesson inserted right after it.
  const [askingNote, setAskingNote] = useState(false);
  const [note, setNote] = useState("");
  const follow = useMutation({
    mutationFn: async () => {
      const response = await api().api.lessons[":id"]["learn-more"].$post({
        param: { id: lesson.id },
        json: note.trim() ? { note: note.trim() } : {},
      });
      if (!response.ok) throw await errorOf(response, "We couldn't start your Follow-up Lesson. Try again.");
      return (await response.json()) as { id: string };
    },
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries();
      await navigate({ to: "/lessons/$lessonId", params: { lessonId: id } });
    },
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

  // The Quiz is round 0; each Practice Round is answered and shown on its own.
  const round = current?.round ?? Math.max(0, ...quiz.map((q) => q.round));
  const inRound = quiz.filter((q) => q.round === round);
  const roundName = round ? `Practice Round ${round}` : "Quiz";
  const resultsOf = (items: QuizItem[], title: string) => (
    <Stack gap={4}>
      <Heading level={2}>{title}</Heading>
      <Text>{`You got ${quizScore(items).correct} of ${quizScore(items).graded} right.`}</Text>
      {items.map((item, i) => (
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
      <LessonFrame
        actions={
          <Button raised fullWidth variant="secondary" onClick={() => setReviewing(false)}>
            Back to summary
          </Button>
        }
      >
        {resultsOf(quiz, "Your answers")}
      </LessonFrame>
    ) : (
      <PagedComplete
        lessonId={lesson.id}
        xpGained={lessonXp(quiz.filter((q) => q.result).length)}
        {...quizScore(quiz)}
        onReview={quiz.length ? () => setReviewing(true) : undefined}
      />
    );

  const page = pages[index];
  // Page 1 still being written (a Follow-up Lesson opens straight away): the same wait as starting from the Roadmap.
  const writing = page?.status !== "ready" && page?.status !== "failed" && data!.preparation !== "failed";
  if (index === 0 && writing)
    return <LoadingState title={lesson.title} description={lesson.objective} mascot={<PollyWalking />} />;
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
    else if (practice === "preparing") body = <QuestionSkeleton label="Writing your Practice Round" />;
    else if (current)
      body = (
        <Stack gap={4}>
          {round > 0 && <Heading level={2}>{roundName}</Heading>}
          <Text tone="muted">{`Question ${inRound.indexOf(current) + 1} of ${inRound.length}`}</Text>
          {question(current)}
          {answer.isError && <Notice tone="error">{answer.error.message}</Notice>}
        </Stack>
      );
    else
      body = (
        <Stack gap={4}>
          {resultsOf(inRound, `${roundName} results`)}
          <Card>
            <Stack gap={3}>
              <Heading level={2}>What's next?</Heading>
              {practice === "failed" && (
                <Notice tone="error">
                  <Stack gap={3}>
                    <span>Your Practice Round couldn't be written.</span>
                    <div>
                      <Button size="sm" disabled={practise.isPending} onClick={() => practise.mutate()}>
                        Try again
                      </Button>
                    </div>
                  </Stack>
                </Notice>
              )}
              {practise.isError && <Notice tone="error">{practise.error.message}</Notice>}
              {finish.isError && <Notice tone="error">{finish.error.message}</Notice>}
              {practice !== "failed" && (
                <Button variant="secondary" disabled={practise.isPending} onClick={() => practise.mutate()}>
                  Practice more
                </Button>
              )}
              {learnMore &&
                (askingNote ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      follow.mutate();
                    }}
                  >
                    <Stack gap={3}>
                      <TextArea
                        label="What confused you? (optional)"
                        description="Your next Lesson goes over this again from a different angle."
                        value={note}
                        onValueChange={setNote}
                        maxLength={500}
                      />
                      {follow.isError && <Notice tone="error">{follow.error.message}</Notice>}
                      <Button type="submit" disabled={follow.isPending}>
                        {follow.isPending ? "Starting…" : "Start the Follow-up Lesson"}
                      </Button>
                    </Stack>
                  </form>
                ) : (
                  <Button variant="secondary" onClick={() => setAskingNote(true)}>
                    Learn more
                  </Button>
                ))}
              <Button
                disabled={finish.isPending || follow.isPending || practise.isPending}
                onClick={() => finish.mutate()}
              >
                {finish.isPending ? "Finishing…" : "Next lesson"}
              </Button>
            </Stack>
          </Card>
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
    <LessonFrame
      actions={
        <LessonNav
          back={
            <Button raised fullWidth variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>
              Back
            </Button>
          }
          next={
            index < quizAt && (
              <Button raised fullWidth disabled={page?.status !== "ready"} onClick={() => go(index + 1)}>
                {index === quizAt - 1 ? "Start the Quiz" : "Next"}
              </Button>
            )
          }
        />
      }
    >
      <PageDots current={index} total={quizAt + 1} last="Quiz" />
      <div ref={heading} tabIndex={-1} aria-label={index === quizAt ? "Quiz" : `Page ${index + 1} of ${quizAt}`}>
        {body}
      </div>
    </LessonFrame>
  );
}
