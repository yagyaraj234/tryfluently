import { Popover } from "@base-ui/react/popover";
import { cva } from "class-variance-authority";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { ChoiceChips } from "./ChoiceChips";
import { Cluster } from "./Cluster";
import { Heading } from "./Heading";
import { Notice } from "./Notice";
import { Skeleton } from "./Skeleton";
import { SpeakAnswer, speechNote, type SpeakResult, type SpeechControl } from "./SpeakAnswer";
import { Spinner } from "./Spinner";
import { Stack } from "./Stack";
import { Text } from "./Text";
import { TextArea } from "./TextArea";
import { TextField } from "./TextField";
import { VerdictTag } from "./VerdictTag";

/** What a Learner is shown for a Page's question: never the answer key. */
export type PageQuestion =
  | { block: "vocabCard"; term: string }
  | { block: "fillGap"; prompt: string }
  | { block: "multipleChoice"; prompt: string; options: string[] }
  | { block: "matchPairs"; prompt: string; left: string[]; right: string[] }
  | { block: "reorder"; prompt: string; items: string[] }
  | { block: "rewrite" | "speakPrompt"; prompt: string };

/** What the server sends back once an answer is saved. `verdict` is null for Blocks that are not graded yet. */
export type PageResult = {
  block: PageQuestion["block"];
  answer: unknown;
  verdict: "correct" | "almost" | "incorrect" | null;
  correctAnswer: unknown;
  explanation: string | null;
  /** Spoken answers only: whether the written feedback is still being made. */
  analysis?: "analysing" | "done" | "failed";
};

const dot = cva("block size-3 rounded-full border border-line-strong", {
  variants: { state: { done: "bg-primary border-primary", current: "bg-ink border-ink", todo: "bg-paper" } },
});

/** One dot per Page, plus one for the recap. */
export function PageDots({ current, total }: { current: number; total: number }) {
  return (
    <ol aria-label={`Page ${current + 1} of ${total}`} className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <li
          key={i}
          aria-current={i === current ? "step" : undefined}
          className={dot({ state: i < current ? "done" : i === current ? "current" : "todo" })}
        >
          <span className="sr-only">{i === total - 1 ? "Recap" : `Page ${i + 1}`}</span>
        </li>
      ))}
    </ol>
  );
}

export type GlossaryTerm = { term: string; definition: string };

/** A word the Learner may not know: dotted underline, and its definition in a popover on tap, click or Enter. */
function Glossary({ term, children }: { term: GlossaryTerm; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger className="cursor-help underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-overlay" sideOffset={6}>
          <Popover.Popup className="max-w-xs rounded-xl border border-line bg-paper p-3 text-body text-ink shadow-card">
            {term.definition}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text with the first use of each Key Term in bold and each Glossary Term marked. `marked` spans the whole Page. */
function withTerms(text: string, keyTerms: string[], glossary: GlossaryTerm[], marked: Set<string>) {
  const terms = [...keyTerms, ...glossary.map((g) => g.term)].sort((a, b) => b.length - a.length);
  if (!terms.length) return text;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${terms.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return text.split(pattern).map((part, i) => {
    const key = part.toLowerCase();
    if (i % 2 === 0 || marked.has(key)) return part;
    marked.add(key);
    const entry = glossary.find((g) => g.term.toLowerCase() === key);
    return entry ? (
      <Glossary key={i} term={entry}>
        {part}
      </Glossary>
    ) : (
      <strong key={i}>{part}</strong>
    );
  });
}

/** Blank lines split paragraphs; a run of lines starting with "- " is a bullet list. */
function FormattedBody({ body, keyTerms, glossary }: { body: string; keyTerms: string[]; glossary: GlossaryTerm[] }) {
  const marked = new Set<string>();
  const show = (text: string) => withTerms(text, keyTerms, glossary, marked);
  const runs: { bullets: boolean; lines: string[] }[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    let last: (typeof runs)[number] | undefined;
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const bullets = line.startsWith("- ");
      const text = bullets ? line.slice(2) : line;
      if (last?.bullets === bullets) last.lines.push(text);
      else runs.push((last = { bullets, lines: [text] }));
    }
  }
  return runs.map((run, i) =>
    run.bullets ? (
      <ul key={i} className="list-disc space-y-1 pl-6 text-body leading-relaxed text-ink">
        {run.lines.map((line, j) => (
          <li key={j}>{show(line)}</li>
        ))}
      </ul>
    ) : (
      <p key={i} className="text-body leading-relaxed text-ink">
        {show(run.lines.join(" "))}
      </p>
    ),
  );
}

export function ReadingCard({
  title,
  body,
  example,
  keyTerms,
  glossary = [],
}: {
  title: string;
  body: string;
  example?: string | null;
  /** Pages written before Key Terms existed have none and keep their plain reading. */
  keyTerms?: string[];
  glossary?: GlossaryTerm[];
}) {
  return (
    <Card>
      <Stack gap={4}>
        <Heading level={2}>{title}</Heading>
        {keyTerms ? (
          <FormattedBody body={body} keyTerms={keyTerms} glossary={glossary} />
        ) : (
          <p className="whitespace-pre-line text-body leading-relaxed text-ink">{body}</p>
        )}
        {example && (
          <blockquote className="rounded-2xl border border-line bg-subtle p-4 text-body text-ink">{example}</blockquote>
        )}
      </Stack>
    </Card>
  );
}

/** A short placeholder while the question is still being written. */
export function QuestionSkeleton() {
  return (
    <Card>
      <div role="status" aria-label="Getting your question ready" className="flex flex-col gap-3">
        <Skeleton shape="text" size="title" />
        <Skeleton shape="block" size={10} />
      </div>
    </Card>
  );
}

const correctWords = (r: PageResult): ReactNode => {
  const a = r.correctAnswer;
  if (Array.isArray(a)) {
    return typeof a[0] === "string"
      ? (a as string[]).join(" ")
      : (a as { left: string; right: string }[]).map((p) => `${p.left} → ${p.right}`).join(", ");
  }
  return String(a);
};

/** The result shown the moment an answer is saved: verdict, the right answer and the written explanation. */
function Feedback({ result, question }: { result: PageResult; question: PageQuestion }) {
  if (result.verdict === null && question.block === "rewrite") return null; // TextAnswer shows the waiting and retry states.
  if (result.verdict === null)
    return (
      <div role="status">
        <Text tone="muted">Your answer is saved.</Text>
      </div>
    );
  const right =
    question.block === "multipleChoice" && typeof result.correctAnswer === "number"
      ? question.options[result.correctAnswer]
      : correctWords(result);
  return (
    <div role="status">
      <Card size="sm">
        <Stack gap={2}>
          <div>
            <VerdictTag verdict={result.verdict} />
          </div>
          {question.block !== "vocabCard" && result.verdict !== "correct" && (
            <Text>
              <strong>{question.block === "rewrite" ? "Corrected version:" : "Correct answer:"}</strong> {right}
            </Text>
          )}
          {result.explanation && <Text tone="muted">{result.explanation}</Text>}
        </Stack>
      </Card>
    </div>
  );
}

type BlockProps<Q extends PageQuestion> = {
  question: Q;
  result?: PageResult;
  pending: boolean;
  onSubmit: (answer: unknown) => void;
  /** Browser speech recognition for speaking Pages. Without it (or when it can't work) speaking Pages take typed answers. */
  speech?: SpeechControl;
};

function Check({
  pending,
  disabled,
  label = "Check answer",
}: {
  pending: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Checking…" : label}
    </Button>
  );
}

function VocabCard({ question, result, pending, onSubmit }: BlockProps<Extract<PageQuestion, { block: "vocabCard" }>>) {
  return (
    <Stack gap={4}>
      <Card>
        <Stack gap={3}>
          <Text size="label" tone="muted">
            New word
          </Text>
          <Heading level={3}>{question.term}</Heading>
          {result && <Text>{String(result.correctAnswer)}</Text>}
        </Stack>
      </Card>
      {result ? (
        result.explanation && (
          <div role="status">
            <Text tone="muted">{result.explanation}</Text>
          </div>
        )
      ) : (
        <Button variant="secondary" disabled={pending} onClick={() => onSubmit("seen")}>
          Show meaning
        </Button>
      )}
    </Stack>
  );
}

function FillGap({ question, result, pending, onSubmit }: BlockProps<Extract<PageQuestion, { block: "fillGap" }>>) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending && value.trim()) onSubmit(value.trim());
  };
  return (
    <form onSubmit={submit}>
      <Stack gap={4}>
        <Text size="title">{question.prompt}</Text>
        <TextField
          label="Your answer"
          value={result ? String(result.answer) : value}
          onValueChange={setValue}
          disabled={Boolean(result)}
          maxLength={500}
          autoComplete="off"
        />
        {!result && <Check pending={pending} disabled={!value.trim()} />}
      </Stack>
    </form>
  );
}

function MultipleChoice({
  question,
  result,
  pending,
  onSubmit,
}: BlockProps<Extract<PageQuestion, { block: "multipleChoice" }>>) {
  const [picked, setPicked] = useState<string | null>(null);
  const value = result ? String(result.answer) : picked;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending && picked !== null) onSubmit(Number(picked));
  };
  return (
    <form onSubmit={submit}>
      <Stack gap={4}>
        <Text size="title">{question.prompt}</Text>
        <ChoiceChips
          label="Pick one answer"
          layout="cards"
          disabled={Boolean(result)}
          options={question.options.map((label, i) => ({ value: String(i), label }))}
          value={value}
          onValueChange={setPicked}
        />
        {!result && <Check pending={pending} disabled={picked === null} />}
      </Stack>
    </form>
  );
}

function MatchPairs({
  question,
  result,
  pending,
  onSubmit,
}: BlockProps<Extract<PageQuestion, { block: "matchPairs" }>>) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const given = result
    ? Object.fromEntries((result.answer as { left: string; right: string }[]).map((p) => [p.left, p.right]))
    : picks;
  const complete = question.left.every((l) => picks[l]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending && complete) onSubmit(question.left.map((left) => ({ left, right: picks[left]! })));
  };
  return (
    <form onSubmit={submit}>
      <Stack gap={5}>
        <Text size="title">{question.prompt}</Text>
        {question.left.map((left) => (
          <ChoiceChips
            key={left}
            label={left}
            disabled={Boolean(result)}
            options={question.right.map((r) => ({ value: r, label: r }))}
            value={given[left] ?? null}
            onValueChange={(right) => setPicks((p) => ({ ...p, [left]: right }))}
          />
        ))}
        {!result && <Check pending={pending} disabled={!complete} />}
      </Stack>
    </form>
  );
}

/** Tap the pieces in order. Tap a placed piece to take it back. */
function Reorder({ question, result, pending, onSubmit }: BlockProps<Extract<PageQuestion, { block: "reorder" }>>) {
  const [order, setOrder] = useState<number[]>([]);
  const placed = result ? (result.answer as string[]) : order.map((i) => question.items[i]!);
  const left = question.items.flatMap((item, i) => (order.includes(i) ? [] : [{ item, i }]));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending && order.length === question.items.length) onSubmit(placed);
  };
  return (
    <form onSubmit={submit}>
      <Stack gap={4}>
        <Text size="title">{question.prompt}</Text>
        <Stack gap={2}>
          <Text size="label" tone="muted">
            Your order
          </Text>
          <Cluster>
            {placed.length === 0 && <Text tone="muted">Tap the pieces below in order.</Text>}
            {placed.map((item, n) => (
              <Button
                key={`${item}-${n}`}
                type="button"
                variant="secondary"
                disabled={Boolean(result)}
                aria-label={`${n + 1}. ${item}. Tap to take it back`}
                onClick={() => setOrder((o) => o.filter((_, j) => j !== n))}
              >
                {item}
              </Button>
            ))}
          </Cluster>
        </Stack>
        {!result && (
          <Stack gap={2}>
            <Text size="label" tone="muted">
              Pieces left
            </Text>
            <Cluster>
              {left.map(({ item, i }) => (
                <Button key={i} type="button" variant="secondary" onClick={() => setOrder((o) => [...o, i])}>
                  {item}
                </Button>
              ))}
            </Cluster>
            <Check pending={pending} disabled={left.length > 0} />
          </Stack>
        )}
      </Stack>
    </form>
  );
}

/** Rewrite and speaking prompts: a text answer. A rewrite is checked by the server (spinner, then feedback, or a retry if the check failed). */
function TextAnswer({
  question,
  result,
  pending,
  onSubmit,
  speech,
}: BlockProps<Extract<PageQuestion, { block: "rewrite" | "speakPrompt" }>>) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending && value.trim()) onSubmit(value.trim());
  };
  const note = question.block === "speakPrompt" && speech ? speechNote(speech.status) : undefined;
  return (
    <form onSubmit={submit}>
      <Stack gap={4}>
        <Text size="title">{question.prompt}</Text>
        {note && !result && <Text tone="muted">{note}</Text>}
        <TextArea
          label={question.block === "rewrite" ? "Your version" : "Your answer"}
          value={result ? String(result.answer) : value}
          onValueChange={setValue}
          disabled={Boolean(result)}
          maxLength={2000}
        />
        {question.block === "rewrite" && pending && (
          <Cluster gap={2}>
            <Spinner label="Checking your answer" />
            <Text tone="muted">Checking your answer…</Text>
          </Cluster>
        )}
        {question.block === "rewrite" && result?.verdict === null && !pending && (
          <Notice tone="error">
            <Stack gap={3}>
              <span>Your answer is saved, but we couldn't check it just now.</span>
              <div>
                <Button type="button" size="sm" onClick={() => onSubmit(result.answer)}>
                  Try again
                </Button>
              </div>
            </Stack>
          </Notice>
        )}
        {!result && question.block === "rewrite" && !pending && (
          <Check pending={pending} disabled={!value.trim()} label="Check answer" />
        )}
        {!result && question.block !== "rewrite" && (
          <Check pending={pending} disabled={!value.trim()} label="Save answer" />
        )}
      </Stack>
    </form>
  );
}

/** The interactive Block for one Page. Key it by Page so each Page starts fresh. */
export function PageBlock(props: BlockProps<PageQuestion>) {
  const { question, result } = props;
  let block: ReactNode;
  switch (question.block) {
    case "vocabCard":
      block = <VocabCard {...props} question={question} />;
      break;
    case "fillGap":
      block = <FillGap {...props} question={question} />;
      break;
    case "multipleChoice":
      block = <MultipleChoice {...props} question={question} />;
      break;
    case "matchPairs":
      block = <MatchPairs {...props} question={question} />;
      break;
    case "reorder":
      block = <Reorder {...props} question={question} />;
      break;
    case "speakPrompt":
      block =
        props.speech && (result || !speechNote(props.speech.status)) ? (
          <SpeakAnswer
            prompt={question.prompt}
            speech={props.speech}
            result={result as SpeakResult | undefined}
            pending={props.pending}
          />
        ) : (
          <TextAnswer {...props} question={question} />
        );
      break;
    default:
      block = <TextAnswer {...props} question={question} />;
  }
  return (
    <Card>
      <Stack gap={5}>
        {block}
        {result && question.block !== "vocabCard" && !(question.block === "speakPrompt" && props.speech) && (
          <Feedback result={result} question={question} />
        )}
      </Stack>
    </Card>
  );
}
