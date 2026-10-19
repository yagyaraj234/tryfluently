import {
  ChatBubbles,
  Faq,
  Feature,
  FeatureTrio,
  FinalCta,
  floatChips,
  GoalsStrip,
  HowItWorks,
  LevelCard,
  MarketingColumn,
  MarketingHero,
  MarketingPanel,
  MarketingShell,
  ProductFrame,
  ReportMock,
  RoadmapPeekMock,
  RoleplayMock,
  UnitRow,
} from "@impromptu/ui";
import { ChartBar, Check, ChatCircle, FileText, Flame, Microphone, Path, Sparkle } from "@phosphor-icons/react";
import { createFileRoute, isRedirect, Link, redirect } from "@tanstack/react-router";
import { faqs, site } from "../content/landing";
import { api } from "../lib/api";
import { siteOrigin } from "../lib/site";

const nav = [
  { label: "How it works", href: "#how" },
  { label: "Assessment", href: "#assessment" },
  { label: "Roadmap", href: "#roadmap" },
  { label: "Roleplay", href: "#roleplay" },
  { label: "FAQ", href: "#faq" },
];

/** Structured data for search engines and AI assistants, built from the same words as the page. */
function structuredData(origin: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${origin}/#org`, name: site.name, url: origin },
      {
        "@type": "WebSite",
        "@id": `${origin}/#site`,
        name: site.name,
        url: origin,
        description: site.description,
        publisher: { "@id": `${origin}/#org` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        name: site.name,
        url: origin,
        description: site.summary,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        inLanguage: "en",
        audience: {
          "@type": "Audience",
          audienceType: "Anyone who wants to communicate better in English",
        },
        featureList: [
          "Voice or written English assessment of up to 10 minutes",
          "CEFR level (A1 to C2) for fluency, grammar and vocabulary",
          "Adaptive Roadmap of Units and Lessons",
          "Roleplays that stay in character, with a Debrief",
          "Reference pronunciation for words and corrections",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ],
  };
}

export const Route = createFileRoute("/")({
  // Signed-in Learners go to Home. Anyone else (and crawlers) get the page, even when the API is down.
  beforeLoad: async () => {
    try {
      if ((await api().api.me.$get()).ok) throw redirect({ to: "/home" });
    } catch (error) {
      if (isRedirect(error)) throw error;
    }
  },
  head: () => {
    const origin = siteOrigin();
    return {
      meta: [
        { title: site.title },
        { name: "description", content: site.description },
        { name: "robots", content: "index, follow, max-image-preview:large" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: site.name },
        { property: "og:title", content: site.title },
        { property: "og:description", content: site.description },
        { property: "og:url", content: `${origin}/` },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: site.title },
        { name: "twitter:description", content: site.description },
      ],
      links: [{ rel: "canonical", href: `${origin}/` }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(structuredData(origin)) }],
    };
  },
  component: Landing,
});

function Landing() {
  const start = <Link to="/sign-up" />;
  return (
    <MarketingShell
      links={nav}
      home={<Link to="/" />}
      start={start}
      startLabel="Start free"
      footerText="An AI coach for speaking and writing English."
    >
      <MarketingHero
        badge="AI language coach"
        title="Lessons that change"
        emphasis="as you do."
        description="Say exactly what you mean, in English. Talk or type, and get feedback on every answer."
        cta={start}
        ctaLabel="Start your free assessment"
        note="Voice or written. No card needed."
      >
        <ProductFrame
          label="Impromptu preview: a Roleplay, an Assessment Report and a Roadmap"
          chips={[floatChips.streak, floatChips.xp]}
        >
          <RoleplayMock />
          <MarketingColumn>
            <ReportMock />
            <RoadmapPeekMock />
          </MarketingColumn>
        </ProductFrame>
      </MarketingHero>

      <GoalsStrip label="Whatever you want English for" goals={["Work", "Study", "Travel", "Everyday life"]} />

      <HowItWorks
        id="how"
        title="Three steps to your first Lesson"
        steps={[
          {
            title: "Set a Goal",
            body: "Choose what you want to use English for. Add details about your work or daily life so Lessons use your own examples.",
          },
          {
            title: "Take the Assessment",
            body: "Talk or type for up to 10 minutes. Your coach scores fluency, grammar and vocabulary.",
          },
          { title: "Follow your Roadmap", body: "Short Lessons and Roleplays. Each one uses how you did in the last." },
        ]}
      />

      <Feature
        id="assessment"
        pill="Assessment"
        title="See where you stand in 10 minutes"
        description="Have a short conversation by voice or text. Impromptu scores your fluency, grammar and vocabulary on the A1 to C2 scale."
        points={[
          {
            icon: ChartBar,
            title: "Your level and what to fix",
            body: "A CEFR level for each skill, plus the specific mistakes to correct first.",
          },
          {
            icon: Microphone,
            title: "Voice or written",
            body: "Speak if you want fluency measured. Type if you are somewhere quiet.",
          },
        ]}
      >
        <MarketingPanel
          label="Skill levels on the A1 to C2 scale with a target for each skill"
          top={
            <>
              <Sparkle aria-hidden weight="fill" />
              Target set for your Goal
            </>
          }
          bottom={
            <>
              <Check aria-hidden />
              Takes up to 10 minutes
            </>
          }
        >
          <LevelCard skill="Fluency" current="B1" target="B2" />
          <LevelCard skill="Grammar" current="B2" target="B2" />
          <LevelCard skill="Vocabulary" current="B1" target="C1" />
        </MarketingPanel>
      </Feature>

      <Feature
        id="roadmap"
        flip
        pill="Roadmap"
        title="A Roadmap that changes as you improve"
        description="Your Roadmap is a list of Units, each made of short Lessons. Your coach builds each Lesson from how you did in the last one, so you skip what you already know."
        points={[
          {
            icon: Path,
            title: "Mastered after two Lessons",
            body: "A Unit is mastered when you hit its goal in two Lessons in a row.",
          },
          {
            icon: ChatCircle,
            title: "Voice and text Steps",
            body: "Each Lesson mixes speaking and writing prompts with feedback on every response.",
          },
        ]}
      >
        <MarketingPanel
          road
          label="A Roadmap with one mastered Unit, one in progress and one up next"
          top={
            <>
              <Sparkle aria-hidden weight="fill" />
              Updated after every Lesson
            </>
          }
        >
          <UnitRow
            state="done"
            index={1}
            title="Introducing yourself"
            detail="Mastered in 2 Lessons"
            status="Mastered"
          />
          <UnitRow
            state="now"
            index={2}
            title="Past tense for everyday stories"
            detail="Lesson 2 of 3"
            status="In progress"
            progress
          />
          <UnitRow
            state="next"
            index={3}
            title="Telling a story about your week"
            detail="Conversation Unit"
            status="Up next"
          />
        </MarketingPanel>
      </Feature>

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

      <FeatureTrio
        id="more"
        title="More ways to practise"
        items={[
          {
            icon: FileText,
            title: "Bring your own context",
            body: "Tell Impromptu about your work or situation. It turns that into a short brief and uses it in every Lesson.",
          },
          {
            icon: Microphone,
            title: "Hear the correct pronunciation",
            body: "Tap any vocabulary card or correction to play it.",
          },
          {
            icon: Flame,
            title: "Keep the streak",
            body: "Short daily Lessons earn XP and build a Streak, so ten minutes a day adds up.",
          },
        ]}
      />

      <Faq id="faq" title="Questions before you start" items={faqs} />

      <FinalCta
        title="Your next conversation gets easier"
        description="Start with the free assessment and get a Roadmap based on how you speak."
        cta={start}
        ctaLabel="Start your free assessment"
      />
    </MarketingShell>
  );
}
