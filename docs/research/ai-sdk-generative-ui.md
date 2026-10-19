# AI SDK generative UI across TanStack Start and a Hono API

**Historical research (2026-10-15).** Current Step tools and answer handling live in `apps/api/src/steps.ts`; the browser transport lives in `apps/web/src/lib/chat.ts`. The sketch below records the original proposal and is not a copyable current implementation.

Research for issue #4. Checked 2026-10-15 against `ai@7.0.141` (npm `latest`), `@ai-sdk/react@4.0.145`, `hono@4.13.13`, `@tanstack/react-start@1.169.2`.

## Question

How should the AI SDK stream generative UI (structured objects or tool calls rendered as React components) from `apps/api` (Bun + Hono) to `apps/web` (TanStack Start)? Which primitives should we use, do streaming endpoints work with Hono RPC types, and what are the TanStack Start caveats?

## Answer

Use **`useChat` + `streamText` with one tool per Step type**. Each Step (vocab card, fill-the-gap, and so on) is a tool whose input schema is the Step's content. The client renders `message.parts` of type `tool-<stepName>` as React components and switches on `part.state`. Interactive Steps are tools **without `execute`**. The learner's answer goes back with `addToolOutput`, and `sendAutomaticallyWhen` requests the next Step. Hono serves the stream as a plain `Response` (`createUIMessageStreamResponse`). The route stays on the Hono RPC client with a typed request body, but its response is `unknown` to RPC. That doesn't matter, because `useChat` parses the stream and the Step types come from the AI SDK's `UIMessage` generics. Skip `streamObject` (deprecated) and AI SDK RSC (experimental, needs React Server Components).

## 1. Which AI SDK primitives

### Version facts (v7)

- The current major is AI SDK 7: `ai@7.0.141` is the npm `latest` tag, and v6 and v5 now ship under the `ai-v6` and `ai-v5` tags (`npm view ai dist-tags`). The React hooks are in `@ai-sdk/react@4`.
- `streamObject` is deprecated in v7. Its type declaration says `@deprecated Use streamText with an output setting instead.` (`ai@7.0.141` `dist/index.d.ts`). The docs for `useObject` show the server using `streamText({ output: Output.object({ schema }) })` (https://ai-sdk.dev/docs/ai-sdk-ui/object-generation).
- `useObject` is now a stable export. `experimental_useObject` is kept as a deprecated alias (`@ai-sdk/react@4.0.145` `dist/index.d.ts`: `@deprecated Use useObject instead.`).
- The `streamText` result methods `toUIMessageStreamResponse`, `toTextStreamResponse` and similar are deprecated. Use the top-level helpers instead: `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })` (https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0).
- Other v7 renames we will hit: `system` becomes `instructions`, `stepCountIs` becomes `isStepCount`, `onFinish` becomes `onEnd`, and `fullStream` becomes `stream`. System messages inside `messages` are rejected by default (https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0).
- AI SDK RSC (`streamUI`, `createStreamableUI`) is "currently experimental", and the docs recommend AI SDK UI for production (https://ai-sdk.dev/docs/ai-sdk-rsc/overview). It depends on React Server Components, so it doesn't fit a separate Hono API.

### Option comparison

| Primitive                                                                                      | What it gives                                                                                                                                                                                                                                                                                                                                                     | Fit for Steps                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `streamText` + tools, `useChat`                                                                | Typed `tool-<name>` parts with a lifecycle (`input-streaming`, `input-available`, `output-available`, `output-error`, plus approval states), message history, client-side tools, `addToolOutput` (https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces, https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage; states from `ai@7.0.141` `dist/index.d.ts`) | **Best.** A lesson is a turn-based conversation: Step, then answer, then next Step. The model picks which Step type to show next.                                                                                                                                     |
| `streamText` + `output: Output.object`, `useObject`                                            | One partial object that streams in (`object`, `submit`, `isLoading`, `stop`, `error`) over a text stream (`createTextStreamResponse` + `toTextStream`) (https://ai-sdk.dev/docs/ai-sdk-ui/object-generation)                                                                                                                                                      | Good for one-shot generation with no history, such as a lesson summary. It has no message history and no tool lifecycle, so we would rebuild both for Steps.                                                                                                          |
| Custom data parts (`createUIMessageStream`, `writer.write({ type: 'data-<name>', id, data })`) | Server-pushed typed parts. Writing to the same `id` updates the part in place. `transient: true` parts reach only `onData` (https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data)                                                                                                                                                                                     | Useful alongside tools for progress or status, such as "generating step 3 of 8" or a score update. Not a replacement for tools.                                                                                                                                       |
| `useChat` with a custom `ChatTransport`                                                        | Swap HTTP for something else. The interface is `sendMessages(...)` and `reconnectToStream(...)`, both returning `ReadableStream<UIMessageChunk>` (`ai@7.0.141` `dist/index.d.ts`, `interface ChatTransport`). v7 also ships `DirectChatTransport` and WebSocket transport types (same file).                                                                      | Not needed. `DefaultChatTransport` already accepts `api`, `headers`, `credentials`, `body`, `prepareSendMessagesRequest` (https://ai-sdk.dev/docs/ai-sdk-ui/transport) and a custom `fetch` (`HttpChatTransportInitOptions.fetch` in `ai@7.0.141` `dist/index.d.ts`). |

### Why tools map well onto Steps

- Tool parts are typed as `tool-${toolName}`, and each part carries `input` and `output` (https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces).
- Tool inputs stream while the model generates them, in the `input-streaming` state. So a vocab card can render its word and definition as they arrive, not after the whole Step finishes (https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage).
- The docs list three kinds of tools: "Automatically executed server-side tools", "Automatically executed client-side tools", and "Tools that require user interaction". The last kind has no `execute`. The client supplies the result with `addToolOutput({ tool, toolCallId, output })` (or `state: 'output-error'` with `errorText`). `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` resubmits once every tool result is in (https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage). For us, that is "learner answered the fill-the-gap, fetch the next Step".
- Server-side `execute` is still the right place to persist a Step with Drizzle before the client sees it, if we want Steps saved on generation rather than on answer.
- `streamText`'s `stopWhen` defaults to one step. The TanStack Start guide raises it with `isStepCount(5)` so the model can continue after tool results (https://ai-sdk.dev/docs/getting-started/tanstack-start). For "one Step per request", keep the default.

### Provider-agnostic caveats (OpenAI and Gemini)

- OpenAI: `openai('model-id')` uses the Responses API by default. Strict JSON schema is on by default (`strictJsonSchema` defaults to `true`), and "optional schema properties are not supported. You need to change Zod `.nullish()` and `.optional()` to `.nullable()`" (https://ai-sdk.dev/providers/ai-sdk-providers/openai).
- Gemini: "for tool calling they [structured outputs] are required". "The Google Generative AI API supports a subset of JSON Schema", and very large or deeply nested schemas may be rejected with "Request contains an invalid argument" (https://ai-sdk.dev/providers/ai-sdk-providers/google). v7 renamed `createGoogleGenerativeAI` to `createGoogle`, and the old names remain as deprecated aliases (https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0).
- So keep Step schemas flat: every field required, `.nullable()` instead of `.optional()`, and no deep nesting. One schema then works on both providers.

## 2. Hono RPC and streaming endpoints

- AI SDK's own Hono example returns `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })` straight from a Hono handler (https://ai-sdk.dev/cookbook/api-servers/hono). Hono's `streamSSE` and `streamText` helpers aren't needed, because the AI SDK builds the `Response` itself.
- Hono RPC infers output types from handlers "returning `c.json()`" (https://hono.dev/docs/guides/rpc). The docs don't say what happens with a raw `Response`. I compiled a probe with `hono@4.13.13`, `ai@7.0.141` and `@hono/zod-validator` under `tsc --strict` to find out:
  - A `.post('/chat', zValidator('json', schema), c => createUIMessageStreamResponse(...))` route **does** appear on `hc<AppType>` as `client.chat.$post`.
  - The `json` input is type-checked. An unknown key raised `TS2353`.
  - `res.body` is `ReadableStream | null`, `res.json()` returns `unknown`, and `InferResponseType<typeof client.chat.$post>` is unknown/untyped.
  - `client.chat.$url()` returns a typed `URL`.
- Conclusion: RPC types the request and the path, not the stream. Nothing is lost, because the stream's types (`UIMessage<Metadata, DataParts, InferUITools<typeof stepTools>>`) come from the AI SDK, not Hono. `InferUITools`, `UIMessage` and `dataPartSchemas`/`messageMetadataSchema` on `Chat` are all in `ai@7.0.141` `dist/index.d.ts`.
- Wiring: point `DefaultChatTransport({ api })` at `client.lesson.chat.$url().toString()`. `$url()` needs an absolute base URL passed to `hc`, because a relative base like `/` throws (https://hono.dev/docs/guides/rpc). `DefaultChatTransport` also takes a custom `fetch` if we ever want auth logic shared with the `hc` client (`ai@7.0.141` `HttpChatTransportInitOptions`).
- The body `useChat` sends is `{ id, messages, trigger, messageId, ...body }` (https://ai-sdk.dev/docs/ai-sdk-ui/transport). Validate it on the server. `zValidator` handles the envelope, and `validateUIMessages` (exported from `ai@7.0.141`) handles the messages against the tool schemas.
- Errors: once a stream has started, errors thrown inside it don't reach Hono's `onError` (https://hono.dev/docs/helpers/streaming). The AI SDK masks error messages in the UI stream by default, and the Hono cookbook shows exposing them via `onError` (https://ai-sdk.dev/cookbook/api-servers/hono).
- Monorepo typing: set `"strict": true` in both tsconfigs. If IDE speed suffers, precompile the client type (`hcWithType`) with `tsc` (https://hono.dev/docs/guides/rpc).

## 3. TanStack Start caveats

- Nothing in the streaming path needs Start-specific code. `useChat` is a plain React hook, and the AI SDK's own TanStack Start guide uses it unchanged (https://ai-sdk.dev/docs/getting-started/tanstack-start).
- **Cross-origin.** If `apps/web` and `apps/api` run on different origins, add Hono's `cors()` before the routes with `origin` set to the web origin and `credentials: true` (https://hono.dev/docs/middleware/builtin/cors). Also set `credentials: 'include'` on `DefaultChatTransport` (https://ai-sdk.dev/docs/ai-sdk-ui/transport).
- **Same-origin alternative.** Start server routes are `createFileRoute(path)({ server: { handlers: { POST: ({ request }) => Response } } })`. A splat file such as `routes/api/$.ts` captures every subpath (https://tanstack.com/start/latest/docs/framework/react/guide/server-routes). Forwarding `request` to the Hono app's `fetch` would serve the API under the web origin with no CORS. This is my inference from the two APIs; neither doc shows it. The docs list method-specific handler keys, so the splat route needs one key per method.
- Use server routes, not server functions, for the stream. TanStack's docs say "Use server routes for public APIs or endpoints that intentionally support cross-origin requests" (https://tanstack.com/start/latest/docs/framework/react/guide/server-functions). The AI SDK guide also uses a server route (https://ai-sdk.dev/docs/getting-started/tanstack-start). Either way, the API lives in Hono for us.
- **SSR.** A speaking coach will use browser-only APIs (microphone, audio). A route's `ssr: false` (or `'data-only'`) skips server rendering of the component for routes that need them (https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr).

## Recommended shape (sketch, not compiled)

```ts
// apps/api: tools shared by type with the web app
export const stepTools = {
  vocabCard: tool({
    description: "Show a vocabulary card",
    inputSchema: z.object({ word: z.string(), definition: z.string(), example: z.string() }),
  }),
  fillGap: tool({
    description: "Ask a fill-the-gap question",
    inputSchema: z.object({ sentence: z.string(), answer: z.string() }),
  }), // no execute: client answers
};
export type LessonMessage = UIMessage<never, never, InferUITools<typeof stepTools>>;

const app = new Hono().post(
  "/lesson/chat",
  zValidator("json", z.object({ messages: z.array(z.unknown()) })),
  async (c) => {
    const messages = await validateUIMessages<LessonMessage>({
      messages: c.req.valid("json").messages,
      tools: stepTools,
    });
    const result = streamText({
      model,
      instructions,
      tools: stepTools,
      messages: await convertToModelMessages(messages),
    });
    return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
  },
);
```

```tsx
// apps/web
const { messages, addToolOutput } = useChat<LessonMessage>({
  transport: new DefaultChatTransport({ api: client.lesson.chat.$url().toString(), credentials: "include" }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
});
// render: part.type === 'tool-vocabCard' -> <VocabCard {...part.input} />, and so on; switch on part.state
```

`model` is picked per environment, for example `openai(...)` or `google(...)`. The rest of the code doesn't change.

## Open points

- Whether to persist each Step in a tool's server `execute` or in `onEnd` after the stream. This depends on the DB schema in `packages/db`.
- Whether `validateUIMessages` should take the full message history from the client or only the new message, with history rebuilt server-side from the DB (`prepareSendMessagesRequest` can trim what is sent: https://ai-sdk.dev/docs/ai-sdk-ui/transport).
