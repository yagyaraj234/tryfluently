import { ChatBubbles, Feature, MarketingPanel } from "@fluently/ui";
import { ChatCircle, Check, Microphone } from "@phosphor-icons/react";

export function RoleplaySection() {
  return (
    <Feature
      id="roleplay"
      pill="Roleplay"
      title="Practise the conversation, then see what to fix"
      description="The AI plays the other person and stays in character. When it ends, you get feedback that shows what to say instead, with a recording of how it sounds."
      points={[
        {
          icon: Microphone,
          title: "Questions that follow your answer",
          body: "The other person responds to what you said.",
        },
        {
          icon: Check,
          title: "Corrections you can hear",
          body: "Play the reference pronunciation for any word or phrase.",
        },
      ]}
    >
      <MarketingPanel
        label="A Roleplay exchange and the Debrief correction that follows"
        top={
          <>
            <ChatCircle aria-hidden weight="fill" />
            Stays in character
          </>
        }
        bottom={
          <>
            <Check aria-hidden />
            Feedback when it ends
          </>
        }
      >
        <ChatBubbles />
      </MarketingPanel>
    </Feature>
  );
}
