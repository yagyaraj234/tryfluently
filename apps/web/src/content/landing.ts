// The landing page's words, in one place. The page renders them, and the structured data, llms.txt and
// sitemap are built from the same objects, so what crawlers and AI assistants read can't drift from the page.

export const site = {
  name: "Impromptu",
  title: "Impromptu | AI English Coach for Speaking and Writing",
  description:
    "Practise English speaking and writing with an AI coach. Take a 10-minute assessment, then follow a Roadmap of short Lessons and conversation practice.",
  summary:
    "Impromptu is an AI coach that helps people speak and write English. It assesses how a learner speaks and writes, then builds a Roadmap of Lessons and Roleplays that changes with their answers. English today, with more languages planned.",
};

export const faqs = [
  {
    question: "How long is the assessment?",
    answer: "Up to 10 minutes. It is a conversation, not an exam, and your report is ready when you finish.",
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
    question: "Who is Impromptu for?",
    answer:
      "Anyone who wants to communicate better in English, whether for work, study or everyday life. You choose a Goal and Impromptu builds Lessons around it.",
  },
  {
    question: "What happens after the assessment?",
    answer:
      "You get an Assessment Report with a score and CEFR level for fluency, grammar and vocabulary, plus a Roadmap of Units built from it. Your coach then builds each Lesson from how you did in the one before.",
  },
  {
    question: "What is a Roleplay?",
    answer:
      "A Roleplay is a Lesson where the AI plays someone else, such as a colleague or a new friend, and stays in character. When it ends you get feedback with corrections and a recording of how the correct phrase sounds.",
  },
];

/** Public pages, for the sitemap. Signed-in screens are not listed. */
export const publicPaths = ["/", "/sign-up"];
