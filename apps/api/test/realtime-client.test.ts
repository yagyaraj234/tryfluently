import { expect, mock, spyOn, test } from "bun:test";
import { openaiRealtime } from "../src/realtime";

test("confirmed provider hangup closes the sideband without reentering its disconnect handler", async () => {
  const disconnected = mock(async () => {});
  const socket = {
    onclose: null as (() => void) | null,
    close: mock(() => socket.onclose?.()),
  };
  const websocket = globalThis.WebSocket;
  globalThis.WebSocket = mock(() => socket) as unknown as typeof WebSocket;
  const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
  try {
    const sideband = openaiRealtime("test-key").attach("rtc_test", { onEvent() {}, onClose: disconnected });
    await sideband.hangup();
    expect(request.mock.calls[0]![0]).toBe("https://api.openai.com/v1/realtime/calls/rtc_test/hangup");
    expect(request.mock.calls[0]![1]).toMatchObject({ method: "POST" });
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(disconnected).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
    globalThis.WebSocket = websocket;
  }
});

test.each([404, 409, 503])("provider %s is not mistaken for confirmed call teardown", async (status) => {
  const disconnected = mock(async () => {});
  const socket = { onclose: null as (() => void) | null, close: mock(() => {}) };
  const websocket = globalThis.WebSocket;
  globalThis.WebSocket = mock(() => socket) as unknown as typeof WebSocket;
  const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response("unconfirmed", { status }));
  try {
    const sideband = openaiRealtime("test-key").attach("rtc_test", { onEvent() {}, onClose: disconnected });
    await expect(sideband.hangup()).rejects.toThrow(`OpenAI Realtime hangup ${status}: unconfirmed`);
    expect(socket.close).not.toHaveBeenCalled();
    socket.onclose?.();
    await Promise.resolve();
    expect(disconnected).toHaveBeenCalledTimes(1);
  } finally {
    request.mockRestore();
    globalThis.WebSocket = websocket;
  }
});
