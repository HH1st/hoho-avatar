import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import WebSocket from "ws";
import { runGatewaySession, waitForSocket } from "../server/gateway-session.mjs";

class Socket extends EventEmitter {
  readyState = WebSocket.OPEN;
  send = vi.fn((_data, callback) => callback?.());
  close = vi.fn(() => { this.readyState = WebSocket.CLOSED; });
  terminate = vi.fn(() => { this.readyState = WebSocket.CLOSED; });
}

describe("gateway session lifetime", () => {
  it("aborts credential retrieval and closes a socket returned after the browser leaves", async () => {
    const client = new Socket();
    const upstream = new Socket();
    upstream.readyState = WebSocket.CONNECTING;
    let finish;
    let signal;
    const running = runGatewaySession(client, (value) => { signal = value; return new Promise((resolve) => { finish = resolve; }); });
    client.readyState = WebSocket.CLOSED;
    client.emit("close");
    expect(signal.aborted).toBe(true);
    finish(upstream);
    await running;
    expect(upstream.terminate).toHaveBeenCalledOnce();
    expect(client.send).not.toHaveBeenCalled();
    expect(client.listenerCount("close")).toBe(0);
  });

  it("cancels an in-progress upstream handshake", async () => {
    const client = new Socket();
    const upstream = new Socket();
    upstream.readyState = WebSocket.CONNECTING;
    const running = runGatewaySession(client, async () => upstream);
    await Promise.resolve();
    client.emit("close");
    await running;
    expect(upstream.terminate).toHaveBeenCalledOnce();
    expect(upstream.listenerCount("open")).toBe(0);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("times out a silent upstream and removes handshake listeners", async () => {
    vi.useFakeTimers();
    try {
      const upstream = new Socket();
      upstream.readyState = WebSocket.CONNECTING;
      const pending = waitForSocket(upstream, new AbortController().signal, 50);
      const rejected = expect(pending).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(50);
      await rejected;
      expect(upstream.terminate).toHaveBeenCalledOnce();
      expect(upstream.listenerCount("open")).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("reports authentication failure and closes the browser connection", async () => {
    const client = new Socket();
    await runGatewaySession(client, async () => { throw new Error("Authentication failed"); });
    expect(JSON.parse(client.send.mock.calls[0][0])).toEqual({ type: "gateway.error", message: "Authentication failed" });
    expect(client.close).toHaveBeenCalledOnce();
  });
});
