import { cva } from "class-variance-authority";

const verdictTag = cva("inline-flex items-center rounded-full px-3 py-1 text-caption font-bold", {
  variants: {
    verdict: {
      correct: "bg-correct-tint text-correct",
      almost: "bg-almost-tint text-almost",
      incorrect: "bg-incorrect-tint text-incorrect",
    },
  },
});

const verdictWords = { correct: "Correct", almost: "Almost", incorrect: "Incorrect" };

export type VerdictTagProps = {
  verdict: keyof typeof verdictWords;
};

export function VerdictTag({ verdict }: VerdictTagProps) {
  return <span className={verdictTag({ verdict })}>{verdictWords[verdict]}</span>;
}
