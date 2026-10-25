// The landing page's words, in one place. The page renders them, and the structured data, llms.txt and
// sitemap are built from the same objects, so what crawlers and AI assistants read can't drift from the page.

export const site = {
  name: "Fluently",
  title: "Fluently | AI English Coach for Speaking and Writing",
  description:
    "Practise English speaking and writing with an AI coach. Take a 10-minute assessment, then follow a Roadmap of short Lessons and conversation practice.",
  summary:
    "Fluently is an AI coach that helps people speak and write English. It assesses how a learner speaks and writes, then builds a Roadmap of Lessons and Roleplays that changes with their answers. English today, with more languages planned.",
};

export const freeAccess = {
  includes: [
    "Written Assessments, a personalised Roadmap, text Lessons and text Roleplays during beta.",
    "10 live voice minutes per month, shared by Voice Assessments and voice Roleplays. Both sides of the call and silence count. Resets on the first at 00:00 UTC.",
    "Recorded Lesson answers have a separate 30-minute daily cap in your Profile timezone, with up to 3 minutes per uploaded clip. Reference Pronunciation is separate from live voice minutes.",
  ],
  afterLimit:
    "When live voice minutes run out, keep practising by text, wait for the monthly reset, or email us to request more credits during beta. Extra credits are not automatic.",
  pricing:
    "No paid plan is available yet. Future pricing is undecided. Beta access and limits may change; any paid offer will show its price before you choose it. No automatic charge.",
};

export const faqs = [
  {
    question: "How long is the assessment?",
    answer: "Up to 10 minutes. It is a conversation, not an exam. Your report is prepared after you finish.",
  },
  {
    question: "Do I have to speak?",
    answer:
      "No. You can take a Voice Assessment or a Written Assessment. Voice estimates spoken fluency. Written estimates grammar and vocabulary; it does not measure spoken fluency.",
  },
  {
    question: "What is free, and what happens when I reach the limit?",
    answer: [...freeAccess.includes, freeAccess.afterLimit, freeAccess.pricing].join(" "),
  },
  {
    question: "Are the levels certified or the results guaranteed?",
    answer:
      "No. CEFR levels are AI estimates based on a short sample of your answers, not an official test or certificate. Feedback can be inaccurate. We do not promise a particular level or time to improve. Product previews are illustrative examples, not learner testimonials.",
  },
  {
    question: "What happens to my voice recordings?",
    answer:
      "Fluently does not store raw learner audio on its servers. Live voice and uploaded recordings are processed by voice providers; transcripts and feedback are saved with your account. Browser speech recognition may use your browser provider. Delete your account from Profile to remove linked learning records. Provider retention and backups are separate; see Privacy or contact us for details.",
  },
];

/** Public pages, for the sitemap. Signed-in screens are not listed. */
export const publicPaths = ["/", "/sign-up", "/demo", "/privacy", "/terms", "/contact"];
