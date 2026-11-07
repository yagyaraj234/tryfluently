import {
  Faq,
  MarketingCaption,
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
import { FreeSection } from "../components/landing/FreeSection";
import { TrustSection } from "../components/landing/TrustSection";
import { PublicLinks } from "../components/landing/PublicLinks";
import { RoadmapSection } from "../components/landing/RoadmapSection";
import { RoleplaySection } from "../components/landing/RoleplaySection";
import { assessmentTiming, faqs, site } from "../content/landing";
import { publicNavigation } from "../components/landing/PublicPage";
import { api } from "../lib/api";
import { publicPageHead, siteOrigin } from "../lib/site";

function structuredData(origin: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#org`,
        name: site.name,
        url: `${origin}/`,
        logo: `${origin}/favicon.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#site`,
        name: site.name,
        url: `${origin}/`,
        description: site.description,
        publisher: { "@id": `${origin}/#org` },
        inLanguage: "en",
      },
      {
        "@type": "WebPage",
        "@id": `${origin}/#page`,
        url: `${origin}/`,
        name: site.title,
        description: site.description,
        isPartOf: { "@id": `${origin}/#site` },
        mainEntity: { "@id": `${origin}/#app` },
        inLanguage: "en",
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${origin}${site.image}`,
          width: 1200,
          height: 630,
          caption: site.imageAlt,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#app`,
        name: site.name,
        url: `${origin}/`,
        description: site.summary,
        publisher: { "@id": `${origin}/#org` },
        image: `${origin}${site.image}`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        inLanguage: "en",
        audience: {
          "@type": "Audience",
          audienceType: "Anyone who wants to communicate better in English",
        },
        featureList: [
          assessmentTiming,
          "Estimated CEFR levels for measured skills; written Assessments do not measure spoken fluency",
          "Stable Roadmap outlines with Lesson content adapted to earlier practice",
          "Roleplays that stay in character, with a Debrief",
          "Reference pronunciation for words and corrections",
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${origin}/#faq`,
        isPartOf: { "@id": `${origin}/#page` },
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
      ...publicPageHead("/", site.title, site.description),
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(structuredData(origin)).replace(/</g, "\\u003c") },
      ],
    };
  },
  component: Landing,
});

function Landing() {
  const start = <Link to="/sign-up" />;
  return (
    <MarketingShell
      links={publicNavigation}
      home={<Link to="/" />}
      start={start}
      startLabel="Start free"
      footerText="An AI coach for speaking and writing English."
      footerLinks={<PublicLinks />}
    >
      <MarketingHero
        badge="AI English coach · Start free"
        title="Speak English confidently"
        emphasis="with lessons built around you."
        description="Practise work calls, interviews and everyday conversations. Get feedback on your English and Lessons shaped by your Goals."
        cta={start}
        ctaLabel="Start your free assessment"
        note="Start free. 25 live voice minutes/month. No card needed."
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

      <MarketingCaption>
        Illustrative product previews. Your feedback and Roadmap will depend on your answers.
      </MarketingCaption>

      <GoalsStrip label="Whatever you want English for" goals={["Work", "Study", "Travel", "Everyday life"]} />

      <HowItWorks
        id="how"
        title="Your path to daily practice"
        steps={[
          {
            title: "Set a Goal",
            body: "Work, study or daily life: choose what you want to practise.",
          },
          {
            title: "Take the Assessment",
            body: assessmentTiming,
          },
          { title: "Follow your Roadmap", body: "Short Lessons and Roleplays. Each one uses how you did in the last." },
        ]}
      />

      <AssessmentSection />

      <RoadmapSection />

      <RoleplaySection />

      <TrustSection />

      <FreeSection />

      <Faq id="faq" title="Questions before you start" items={faqs} />

      <FinalCta
        title="Make time for your next conversation"
        description="Start with a Voice or Written Assessment and get a Roadmap based on your answers. Start free, with clear daily Lesson and live voice limits."
        cta={start}
        ctaLabel="Start your free assessment"
      />
    </MarketingShell>
  );
}
