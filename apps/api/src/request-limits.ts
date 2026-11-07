import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./app";

export const PAID_REQUESTS_PER_MINUTE = 60;
export const PAID_REQUESTS_IN_FLIGHT = 4;

export function requestLimits(now: () => Date) {
  // shortcut: guards cover one API instance, move claims and rate windows to Postgres before scaling out.
  const windows = new Map<string, { until: number; count: number }>();
  const active = new Map<string, number>();
  const conversations = new Map<string, { count: number; exclusive: boolean }>();
  const pending = new Set<Promise<void>>();
  const middleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    const userId = c.var.user.id;
    const path = c.req.path.replace(/\/$/, "");
    const turn = path.match(/^\/api\/(?:assessments|roleplays|lessons)\/([^/]+)\/(chat|call|end|finish)$/);
    const starting = c.req.method === "POST" && path === "/api/assessments";
    let key: string | undefined;
    if (turn) {
      try {
        key = `${userId}:${decodeURIComponent(turn[1]!)}`;
      } catch {
        return c.json({ error: "Invalid conversation id" }, 400);
      }
    }
    const exclusive = turn?.[2] === "chat" || turn?.[2] === "call";
    const previous = key ? conversations.get(key) : undefined;
    if (previous && (previous.exclusive || exclusive))
      return c.json({ error: "A turn is still in progress. Try again when it finishes." }, 409);

    const paid =
      path === "/api/pronunciation" ||
      (c.req.method === "POST" && /^\/api\/billing\/(checkout|portal|cancel)$/.test(path)) ||
      (c.req.method === "POST" &&
        (starting ||
          path === "/api/roadmap" ||
          /\/(chat|call|end|finish|recordings|confirm|answer|analyse|retry|next|outline|start|preparation)$/.test(
            path,
          )));
    if (paid) {
      const at = now().getTime();
      for (const [id, window] of windows) {
        if (window.until > at) break;
        windows.delete(id);
      }
      const window = windows.get(userId) ?? { until: at + 60_000, count: 0 };
      if (window.count >= PAID_REQUESTS_PER_MINUTE || (active.get(userId) ?? 0) >= PAID_REQUESTS_IN_FLIGHT) {
        c.header("Retry-After", String(Math.max(1, Math.ceil((window.until - at) / 1000))));
        return c.json({ error: "Too many AI requests. Please wait before trying again." }, 429);
      }
      window.count++;
      windows.set(userId, window);
      active.set(userId, (active.get(userId) ?? 0) + 1);
    }
    if (key) conversations.set(key, { count: (previous?.count ?? 0) + 1, exclusive });
    const held = new Set(key ? [key] : []);
    c.set("claimConversation", (id) => {
      const key = `${userId}:${id}`;
      if (held.has(key)) return true;
      const previous = conversations.get(key);
      if (previous?.exclusive) return false;
      conversations.set(key, { count: (previous?.count ?? 0) + 1, exclusive: false });
      held.add(key);
      return true;
    });
    let released = false;
    let responseDone = false;
    let tasks = 0;
    const done = Promise.withResolvers<void>();
    pending.add(done.promise);
    const release = () => {
      if (released || !responseDone || tasks) return;
      released = true;
      if (paid) {
        const left = active.get(userId)! - 1;
        if (left) active.set(userId, left);
        else active.delete(userId);
      }
      for (const key of held) {
        const state = conversations.get(key)!;
        if (--state.count === 0) conversations.delete(key);
      }
      pending.delete(done.promise);
      done.resolve();
    };
    c.set("retainAiTask", (task) => {
      tasks++;
      const settled = () => {
        tasks--;
        release();
      };
      void task.then(settled, settled);
    });
    const finishResponse = () => {
      responseDone = true;
      release();
    };
    let streaming = false;
    let cancelling = false;
    try {
      await next();
      if (c.res.body && c.res.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = c.res.body.getReader();
        c.res = new Response(
          new ReadableStream({
            async pull(controller) {
              try {
                const chunk = await reader.read();
                if (cancelling) return;
                if (chunk.done) {
                  finishResponse();
                  controller.close();
                } else controller.enqueue(chunk.value);
              } catch (error) {
                if (cancelling) return;
                finishResponse();
                controller.error(error);
              }
            },
            async cancel(reason) {
              cancelling = true;
              try {
                await reader.cancel(reason);
              } finally {
                finishResponse();
              }
            },
          }),
          c.res,
        );
        streaming = true;
      }
    } finally {
      if (!streaming) finishResponse();
    }
  };
  return Object.assign(middleware, {
    async drain() {
      while (pending.size) await Promise.all([...pending]);
    },
  });
}
