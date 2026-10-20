import { AnswerBox, ChatTurn, FillGapStep, RewriteStep, StepFeedback, StepHeader, VocabCardStep } from "@impromptu/ui";
import { answered, Example, sample } from "./shared";

const verdicts = ["correct", "almost", "incorrect"] as const;

export function StepsSection() {
  return (
    <Example title="Lesson Steps">
      <StepHeader
        type="Vocabulary"
        question="Use this word in your own sentence."
        progress={{ position: 2, total: 7 }}
      />
      <VocabCardStep
        word="clarify"
        meaning="Make something easier to understand."
        example="Could you clarify the next step?"
        onHearIt={sample}
        onAnswer={answered}
      />
      <StepHeader type="Fill the gap" question="Choose the missing words." />
      <FillGapStep sentence="I ___ here since 2023." choices={["work", "have worked", "working"]} onAnswer={answered} />
      <FillGapStep sentence="Yesterday I ___ a client." onAnswer={answered} />
      <FillGapStep sentence="Yesterday I ___ a client." answered="called" onAnswer={answered} />
      <StepHeader type="Rewrite" question="Make this sentence clearer." />
      <RewriteStep sentence="I make a tool for team." onAnswer={answered} />
      <AnswerBox label="Pending answer" pending onAnswer={answered} />
      {verdicts.map((verdict) => (
        <StepFeedback
          key={verdict}
          verdict={verdict}
          answer="I work here since 2023."
          corrected="I've worked here since 2023."
          explanation="Use present perfect for something that started in the past and continues now."
          onNext={sample}
          onHearIt={sample}
        />
      ))}
      <ChatTurn from="coach" name="Interviewer">
        Tell me about a project you enjoyed.
      </ChatTurn>
      <ChatTurn from="learner">I built a tool for my team.</ChatTurn>
    </Example>
  );
}
