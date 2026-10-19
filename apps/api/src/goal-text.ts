/** The Learner's Goal statement and Brief as one prompt block. Empty when neither exists. */
export function goalText({ statement, brief }: { statement: string | null; brief: string | null }) {
  return [statement && `Goal: ${statement}`, brief].filter(Boolean).join("\n");
}
