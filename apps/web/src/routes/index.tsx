import {
  Faq,
  FinalCta,
  floatChips,
  GoalsStrip,
  HowItWorks,
  MarketingColumn,
  MarketingHero,
  MarketingShell,
  ProductFrame,
  ReportMock,
  RoadmapPeekMock,
  RoleplayMock,
} from "@fluently/ui";
import { createFileRoute, isRedirect, Link, redirect } from "@tanstack/react-router";
import { AssessmentSection } from "../components/landing/AssessmentSection";
import { MoreWaysSection } from "../components/landing/MoreWaysSection";
import { RoadmapSection } from "../components/landing/RoadmapSection";
import { RoleplaySection } from "../components/landing/RoleplaySection";
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
          label="Fluently preview: a Roleplay, an Assessment Report and a Roadmap"
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

      <AssessmentSection />

      <RoadmapSection />

      <RoleplaySection />

      <MoreWaysSection />

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
