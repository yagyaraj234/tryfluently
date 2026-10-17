import { DefaultChatTransport, type ChatAddToolOutputFunction, type ChatInit, type UIMessage } from "ai";

/**
 * Options for `useChat` against one of the API's chat routes (Written Assessment, Lesson, text Roleplay).
 * The server keeps the history, so each request sends only the newest message as `{ message }`. Seed `messages`
 * with the stored transcript to resume. Nothing is sent automatically: answer a Step with `answerStep`.
 */
export const chatOptions = (api: string, messages: UIMessage[], fetch?: typeof globalThis.fetch): ChatInit<UIMessage> => ({
  messages,
  transport: new DefaultChatTransport({
    api,
    fetch,
    prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages.at(-1) } }),
  }),
});

type ChatHelpers = { addToolOutput: ChatAddToolOutputFunction<UIMessage>; sendMessage: () => Promise<void> };

/**
 * Answers a Step (a tool part of the last assistant message) and sends that message back. The answer becomes
 * the tool output: `{ answer }` for text, or `{ recordingId }` for a recorded answer.
 *
 * Sent explicitly rather than with `sendAutomaticallyWhen`: a Lesson's last message ends with server tools
 * (giveFeedback, endLesson) that are all complete, which would otherwise be sent again.
 */
export async function answerStep(chat: ChatHelpers, step: { type: string; toolCallId: string }, output: string | { recordingId: string }) {
  await chat.addToolOutput({
    tool: step.type.replace(/^tool-/, ""),
    toolCallId: step.toolCallId,
    output: typeof output === "string" ? { answer: output } : output,
  });
  await chat.sendMessage();
}
