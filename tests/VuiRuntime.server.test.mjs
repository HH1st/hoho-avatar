import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { VuiRuntime } from "../server/vui-runtime.mjs";

class FakeSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  sent = [];
  close = vi.fn(() => { this.readyState = WebSocket.CLOSED; });

  send(data, callback) {
    this.sent.push(JSON.parse(String(data)));
    callback?.();
  }

  emitJson(event) {
    this.emit("message", Buffer.from(JSON.stringify(event)), false);
  }
}

async function waitFor(assertion) {
  await vi.waitFor(assertion, { timeout: 500 });
}

describe("backend VuiRuntime", () => {
  it("runs input, bidirectional processing, and output independently", async () => {
    const client = new FakeSocket();
    const backend = new FakeSocket();
    const runtime = new VuiRuntime(client, backend);
    const running = runtime.run();
    await waitFor(() => expect(client.sent).toContainEqual({ type: "gateway.ready" }));

    client.emitJson({ type: "session.configure", voice: "marin", instructions: "Be concise." });
    await waitFor(() => expect(backend.sent.some((event) => event.type === "session.update")).toBe(true));
    const update = backend.sent.find((event) => event.type === "session.update");
    expect(update.session.audio.output.voice).toBe("marin");
    expect(update.session.audio.input.turn_detection.interrupt_response).toBe(false);

    backend.emitJson({ type: "session.updated" });
    await waitFor(() => expect(client.sent).toContainEqual({ type: "session.ready" }));

    client.emitJson({ type: "input.text", text: "hello" });
    await waitFor(() => expect(backend.sent.some((event) => event.type === "response.create")).toBe(true));

    runtime.stop();
    await running;
  });

  it("owns interruption and rejects stale backend output", async () => {
    const client = new FakeSocket();
    const backend = new FakeSocket();
    const runtime = new VuiRuntime(client, backend);
    const running = runtime.run();
    await waitFor(() => expect(client.sent).toContainEqual({ type: "gateway.ready" }));

    backend.emitJson({ type: "response.created", response: { id: "response-1" } });
    await waitFor(() => expect(client.sent).toContainEqual({ type: "response.started" }));
    client.emitJson({ type: "interrupt" });
    await waitFor(() => expect(client.sent).toContainEqual({ type: "output.interrupted" }));
    expect(backend.sent).toContainEqual({ type: "response.cancel" });

    backend.emitJson({ type: "response.output_audio.delta", response_id: "response-1", delta: "stale-audio" });
    backend.emitJson({ type: "input_audio_buffer.speech_stopped" });
    await waitFor(() => expect(client.sent).toContainEqual({ type: "input.speech.stopped" }));
    expect(client.sent.some((event) => event.audio === "stale-audio")).toBe(false);

    runtime.stop();
    await running;
  });
});
