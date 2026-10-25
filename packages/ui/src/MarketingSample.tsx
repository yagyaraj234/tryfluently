import { useEffect, useRef, useState, type ReactElement } from "react";
import { Button } from "./Button";
import { Notice } from "./Notice";

const questions = [
  {
    prompt: "A colleague asks: How long have you worked here? Choose the natural reply.",
    options: ["I work here since two years.", "I’ve worked here for two years."],
    correct: 1,
    explanation:
      "Use the present perfect for something that started in the past and continues now. Use ‘for’ with a duration: ‘for two years’. Use ‘since’ with a starting point: ‘since 2024’.",
  },
  {
    prompt: "You need more time on a project. Which reply gives your colleague a clear next step?",
    options: [
      "Could we move the deadline to Friday? I need another day to finish the review.",
      "It is not possible. You must wait.",
    ],
    correct: 0,
    explanation:
      "A polite request, a specific date and a short reason help the other person respond. The second reply gives no timeline and can sound abrupt.",
  },
];

export function MarketingSample({ start }: { start: ReactElement }) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<number>();
  const practice = useRef<HTMLDivElement>(null);
  const question = questions[step];

  useEffect(() => {
    practice.current?.focus();
  }, [step]);

  return (
    <>
      <p className="text-sm text-muted">
        Scripted examples of practice and feedback, not a live AI conversation or an Assessment. No CEFR level is
        calculated. Answers stay on this page and reset when you leave.
      </p>
      <div ref={practice} tabIndex={-1} className="grid gap-5 rounded-3xl border border-line bg-paper p-6 sm:p-8">
        {question ? (
          <>
            <p className="text-sm font-semibold text-primary">
              Question {step + 1} of {questions.length}
            </p>
            <fieldset className="grid gap-3" disabled={answer !== undefined}>
              <legend className="mb-4 text-xl font-semibold">{question.prompt}</legend>
              {question.options.map((option, index) => (
                <Button key={option} variant="secondary" fullWidth onClick={() => setAnswer(index)}>
                  {option}
                </Button>
              ))}
            </fieldset>
            <div aria-live="polite" aria-atomic="true">
              {answer !== undefined && (
                <Notice tone="info">
                  <strong>{answer === question.correct ? "That works well." : "Here’s a more natural option."}</strong>
                  <p>{question.options[question.correct]}</p>
                  <p>{question.explanation}</p>
                </Notice>
              )}
            </div>
            {answer !== undefined && (
              <Button
                onClick={() => {
                  setStep(step + 1);
                  setAnswer(undefined);
                }}
              >
                {step === questions.length - 1 ? "Finish sample" : "Next question"}
              </Button>
            )}
          </>
        ) : (
          <div className="grid gap-4" role="status">
            <h2 className="text-2xl font-bold">You’ve finished the sample</h2>
            <p className="text-muted">
              With an account, your Assessment and Goals shape your Roadmap. This sample does not measure your English
              level or save progress.
            </p>
            <Button render={start}>Start your free assessment</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStep(0);
                setAnswer(undefined);
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
