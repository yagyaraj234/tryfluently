// The landing page's words, in one place. The page renders them, and the structured data, llms.txt and
// sitemap are built from the same objects, so what crawlers and AI assistants read can't drift from the page.

export const site = {
  name: "Fluently",
  title: "Fluently | AI English Coach for Speaking and Writing",
  description:
    "Practise English speaking and writing with an AI coach. Start a free assessment, then follow adaptive Lessons and Roleplays for real conversations.",
  summary:
    "Fluently is an AI English coach for speaking and writing. Practise with voice or text, get feedback, and follow Lessons and Roleplays that adapt to your answers.",
  image: "/og-image.png",
  imageAlt: "Fluently: Your English. Your pace. An AI coach for speaking, writing and real conversations.",
};

export const faqs = [
  { question: "What is Fluently?", answer: site.summary },
  {
    question: "How long is the assessment?",
    answer: "Up to 10 minutes. It is a conversation, not an exam. Your Assessment Report is prepared after you finish.",
  },
  {
    question: "Do I have to speak?",
    answer:
      "No. You can take a Voice Assessment or a Written Assessment. Voice measures fluency and gives you speaking practice. Written works anywhere.",
  },
  {
    question: "What is a Goal?",
    answer:
      "A Goal is the situation you want English for, such as work conversations or everyday fluency. Your Goal sets your target level and the Roleplays you get.",
  },
  {
    question: "Who is Fluently for?",
    answer:
      "Anyone who wants to communicate better in English, whether for work, study or everyday life. You choose a Goal and Fluently builds Lessons around it.",
  },
  {
    question: "What happens after the assessment?",
    answer:
      "You get an Assessment Report with scores and CEFR levels for grammar and vocabulary, plus fluency when you take a Voice Assessment. Your Roadmap is built from the Report, and each Lesson adapts to how you did in the one before.",
  },
  {
    question: "What do the CEFR levels mean?",
    answer:
      "CEFR is the Common European Framework of Reference for Languages. It describes language ability from A1 (beginner) to C2 (proficient). Fluently uses AI to estimate your level for practice guidance; this is not an official language certificate.",
  },
  {
    question: "What is a Roleplay?",
    answer:
      "A Roleplay is a Lesson where the AI plays someone else, such as a colleague or a new friend, and stays in character. When it ends you get feedback with corrections and a recording of how the correct phrase sounds.",
  },
];

/** Public pages, for the sitemap. Signed-in screens are not listed. */
export const publicPaths = ["/", "/sign-up"];
