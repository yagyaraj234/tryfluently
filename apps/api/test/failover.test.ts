import { describe, expect, test } from "bun:test";
import { failover } from "../src/failover";
import type { Provider, Realtime } from "../src/realtime";

// A provider that records which calls reached it, and can be made to fail at the start.
function provider(name: Provider) {
  const p: Realtime & { down: boolean; starts: number; closes: ((failed?: boolean) => unknown)[]; joined: string[] } = {
    down: false,
    starts: 0,
    closes: [],
    joined: [],
    async createCall() {
      p.starts++;
      if (p.down) throw new Error(`${name} is down`);
      return { callId: `${name}_${p.starts}`, provider: name };
    },
    attach(_, { onClose }) {
      p.closes.push(onClose);
      return { send() {}, async hangup() {} };
    },
    join(callId) {
      p.joined.push(callId);
      return { message() {}, close() {} };
    },
  };
  return p;
}

function setup(primary: Provider = "openai") {
  let at = 0;
  const openai = provider("openai");
  const rime = provider("rime");
  const realtime = failover({ openai, rime }, primary, () => at);
  const start = async (avoid?: Provider) => (await realtime.createCall("sdp", {}, avoid)).provider;
  return { openai, rime, realtime, start, wait: (ms: number) => (at += ms) };
}

describe("provider failover", () => {
  test("calls go to the primary", async () => {
    expect(await setup("openai").start()).toBe("openai");
    expect(await setup("rime").start()).toBe("rime");
  });

  test("a primary that fails to start a call hands it to the other, and goes last for five minutes", async () => {
    const { openai, start, wait } = setup();
    openai.down = true;
    expect(await start()).toBe("rime");
    openai.down = false;
    expect(await start()).toBe("rime");
    expect(openai.starts).toBe(1);
    wait(5 * 60_000);
    expect(await start()).toBe("openai");
  });

  test("when both fail, the call fails", async () => {
    const { openai, rime, start } = setup();
    openai.down = rime.down = true;
    await expect(start()).rejects.toThrow("rime is down");
  });

  test("a resumed call tries the other provider first, without tripping the one it dropped from", async () => {
    const { start } = setup();
    expect(await start("openai")).toBe("rime");
    expect(await start()).toBe("openai");
  });

  test("a provider's failed close trips it; a normal close doesn't", async () => {
    const { rime, realtime, start } = setup("rime");
    const attach = async () =>
      realtime.attach((await realtime.createCall("sdp", {})).callId, { onEvent() {}, onClose() {} });
    await attach();
    await rime.closes[0]!(false);
    expect(await start()).toBe("rime");
    await attach();
    await rime.closes.at(-1)!(true);
    expect(await start()).toBe("openai");
  });

  test("the browser joins the provider that owns the call", async () => {
    const { rime, realtime } = setup("rime");
    const { callId } = await realtime.createCall("sdp", {});
    realtime.join!(callId, { send() {}, close() {} });
    expect(rime.joined).toEqual([callId]);
    expect(realtime.join!("rime_unknown", { send() {}, close() {} })).toBeUndefined();
  });
});
