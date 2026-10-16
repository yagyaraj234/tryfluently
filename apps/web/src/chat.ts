import { DefaultChatTransport, type ChatAddToolOutputFunction, type ToolUIPart, type UIMessage } from "ai";

/**
 * A `useChat` transport for the streaming chat endpoints (Lessons, Written Assessment, text Roleplay).
 * It sends only the newest message as `{ message }`: the server keeps the history.
 */
export const chatTransport = (api: string, fetch?: typeof globalThis.fetch) =>
  new DefaultChatTransport<UIMessage>({
    api,
    fetch,
    prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages.at(-1) } }),
  });

type ChatHelpers = { addToolOutput: ChatAddToolOutputFunction<UIMessage>; sendMessage: () => Promise<void> };

/**
 * Answers the Step waiting in the last assistant message: the answer becomes the tool output
 * (`{ answer }`, or `{ recordingId }` for a recorded one) and that message is sent back.
 */
export async function answerStep(chat: ChatHelpers, step: ToolUIPart, output: string | { recordingId: string }) {
  await chat.addToolOutput({
    tool: step.type.slice("tool-".length),
    toolCallId: step.toolCallId,
    output: typeof output === "string" ? { answer: output } : output,
  });
  await chat.sendMessage();
}
