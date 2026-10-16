import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type ChatInit, type UIMessage } from "ai";

/**
 * Options for `useChat` against one of the API's chat routes (Written Assessment, Lesson, text Roleplay).
 * The server keeps the history, so each request sends only the newest message as `{ message }`. Seed `messages`
 * with the stored transcript to resume. Once every Step in the last assistant message is answered, it is sent.
 */
export const chatOptions = (api: string, messages: UIMessage[], fetch?: typeof globalThis.fetch): ChatInit<UIMessage> => ({
  messages,
  transport: new DefaultChatTransport({
    api,
    fetch,
    prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages.at(-1) } }),
  }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
});

type AddToolOutput = (output: { tool: string; toolCallId: string; output: unknown }) => unknown;

/** Answers a Step (a tool part of the last assistant message) with the Learner's text. */
export const answerStep = (addToolOutput: AddToolOutput, step: { type: string; toolCallId: string }, answer: string) =>
  addToolOutput({ tool: step.type.replace(/^tool-/, ""), toolCallId: step.toolCallId, output: { answer } });
