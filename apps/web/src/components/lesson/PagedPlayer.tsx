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
  type GlossaryTerm,
  type PageQuestion,
  type SpeechControl,
  type PageResult,
} from "@fluently/ui";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSpeech } from "../../hooks/speech";
import { api } from "../../lib/api";
import { lessonPagesQuery } from "../../lib/lessons";
import { PagedComplete } from "./PagedComplete";
import { PagedReview } from "./PagedReview";
import { lessonXp, type Lesson } from "./lesson";

export type PageData = {
  page: number;
  status: "pending" | "ready" | "failed";
  question: "pending" | "ready" | "failed";
  questionData?: PageQuestion;
  result?: PageResult;
  title?: string;
  body?: string;
  example?: string | null;
  keyTerms?: string[];
  glossary?: GlossaryTerm[];
  vocab?: { term: string; meaning: string };
  block?: string;
};
export type PagedData = {
  id: string;
  preparation: "failed" | "preparing" | "ready" | null;
  currentPage: number;
  status: "abandoned" | "completed" | "in_progress";
  pages: PageData[];
};

/** Wraps the speaking Block with the browser's speech recognition. Recordings stay in browser memory until the Lesson is left. */
export function SpeakingBlock(props: {
  question: PageQuestion;
  result?: PageResult;
  pending: boolean;
  onSubmit: (answer: unknown) => void;
  onRetry: () => void;
  kept: string | undefined;
  keep: (url: string) => void;
}) {
  const { onRetry, kept, keep, ...block } = props;
  const speech = useSpeech((text) => block.onSubmit(text), keep, kept);
  const control: SpeechControl = { ...speech, onRetry };
  return <PageBlock {...block} speech={control} />;
}

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
  const [reviewing, setReviewing] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const page = pages[index];
  // Replay URLs for spoken answers, by Page. Only this browser holds the audio; the URLs are freed on leaving.
  const recordings = useRef(new Map<number, string>());
  useEffect(() => {
    const kept = recordings.current;
    return () => {
      for (const url of kept.values()) URL.revokeObjectURL(url);
      kept.clear();
    };
  }, []);

  // Move focus to the new Page, but not on the first render so the browser keeps its own starting point.
  // Scroll to the top ourselves: letting focus scroll leaves the new Page's title under the sticky header.
  useEffect(() => {
    if (first.current) return void (first.current = false);
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
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
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Your answer couldn't be saved. Try again.");
      }
      return (await response.json()) as unknown as PageResult;
    },
    // A failed check still saved the answer, so reload to show it with its retry button.
    onError: () => queryClient.invalidateQueries(lessonPagesQuery(lesson.id)),
    onSuccess: (result) =>
      queryClient.setQueryData(
        pagesQuery.queryKey!,
        (old: PagedData | undefined) =>
          old && { ...old, pages: old.pages.map((p) => (p.page === index ? { ...p, result } : p)) },
      ),
  });

  const analyse = useMutation({
    mutationFn: async (at: number) => {
      const response = await api().api.lessons[":id"].pages[":index{[0-9]+}"].analyse.$post({
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
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Your Lesson couldn't be finished. Try again.");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await router.invalidate();
    },
  });

  const answered = pages.filter((p) => p.result).length;
  // Vocabulary cards can't be wrong, so they don't count towards the score (the server leaves them out too).
  const graded = pages.filter((p) => p.result?.verdict && p.result.block !== "vocabCard");
  const correct = graded.filter((p) => p.result?.verdict === "correct").length;
  if (lesson.status === "completed")
    return reviewing && recap > 0 ? (
      <PagedReview pages={pages} onClose={() => setReviewing(false)} />
    ) : (
      <PagedComplete
        lessonId={lesson.id}
        xpGained={lessonXp(answered)}
        correct={correct}
        graded={graded.length}
        onReview={recap > 0 ? () => setReviewing(true) : undefined}
      />
    );

  // Questions are written only after every Page, so when another Page failed this one's question never arrives.
  const stuck = data!.preparation === "failed" && page?.question === "pending";
  const broken = !page
    ? false
    : page.status === "failed" || (hasQuestion(page) && (page.question === "failed" || stuck));
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
          {retry.isError && <span>{retry.error.message}</span>}
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
        <ReadingCard
          title={page.title ?? ""}
          body={page.body ?? ""}
          example={page.example}
          keyTerms={page.keyTerms}
          glossary={page.glossary}
        />
        {hasQuestion(page) &&
          (page.question === "ready" && page.questionData ? (
            page.questionData.block === "speakPrompt" ? (
              <SpeakingBlock
                key={index}
                question={page.questionData}
                result={page.result}
                pending={answer.isPending}
                onSubmit={(value) => answer.mutate(value)}
                onRetry={() => analyse.mutate(index)}
                kept={recordings.current.get(index)}
                keep={(url) => recordings.current.set(index, url)}
              />
            ) : (
              <PageBlock
                key={index}
                question={page.questionData}
                result={page.result}
                pending={answer.isPending}
                onSubmit={(value) => answer.mutate(value)}
              />
            )
          ) : (
            <QuestionSkeleton />
          ))}
        {analyse.isError && <Notice tone="error">{analyse.error.message}</Notice>}
        {answer.isError && !page.result && <Notice tone="error">{answer.error.message}</Notice>}
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
