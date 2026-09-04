import WebSocket from "ws";
import { AsyncQueue } from "./async-queue.mjs";

/** Three-loop backend runtime for one browser ↔ Realtime session. */
export class VuiRuntime {
  #inputQueue = new AsyncQueue();
  #outputQueue = new AsyncQueue();
  #generation = 0;
  #outputActive = false;
  #activeResponseGeneration;
  #responseGenerations = new Map();
  #stopped = false;
  #finishInputLoop;

  constructor(client, backend) {
    this.client = client;
    this.backend = backend;
  }

  async run() {
    await this.#sendClient({ type: "gateway.ready" });
    await Promise.all([this.#inputLoop(), this.#processLoop(), this.#outputLoop()]);
  }

  stop(discardOutput = true) {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#inputQueue.close(true);
    this.#outputQueue.close(discardOutput);
    this.#finishInputLoop?.();
    this.#finishInputLoop = undefined;
    if (this.backend.readyState === WebSocket.OPEN || this.backend.readyState === WebSocket.CONNECTING) this.backend.close();
  }

  #inputLoop() {
    return new Promise((resolve) => {
      this.#finishInputLoop = resolve;
      const finish = () => {
        this.stop();
      };
      this.client.on("message", (data, isBinary) => {
        if (isBinary) return;
        let event;
        try { event = JSON.parse(data.toString()); } catch { return; }
        const normalized = this.#normalizeClientInput(event);
        if (normalized) this.#inputQueue.push(normalized, normalized.type === "interrupt");
      });
      this.backend.on("message", (data, isBinary) => {
        if (isBinary) return;
        try {
          this.#inputQueue.push({ source: "backend", event: JSON.parse(data.toString()) });
        } catch { /* Ignore malformed backend events. */ }
      });
      this.client.once("close", finish);
      this.client.once("error", finish);
      this.backend.once("close", finish);
      this.backend.once("error", (error) => {
        this.#outputQueue.push({ type: "error", message: error.message });
        this.stop(false);
        resolve();
      });
    });
  }

  async #processLoop() {
    while (true) {
      const next = await this.#inputQueue.next();
      if (next.done) return;
      const input = next.value;
      if (input.source === "backend") this.#processBackendEvent(input.event);
      else this.#processClientInput(input);
    }
  }

  #processClientInput(event) {
      if (event.type === "session.configure") {
        this.#sendBackend({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["audio"],
            instructions: event.instructions ?? "You are a concise, friendly voice companion. Respond naturally and briefly.",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24_000 },
                turn_detection: { type: "server_vad", create_response: true, interrupt_response: false },
              },
              output: { format: { type: "audio/pcm", rate: 24_000 }, voice: event.voice ?? "cedar" },
            },
          },
        });
      } else if (event.type === "audio") {
        this.#sendBackend({ type: "input_audio_buffer.append", audio: event.audio });
      } else if (event.type === "text") {
        if (this.#outputActive) this.#invalidateOutput();
        this.#sendBackend({
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text: event.text }] },
        });
        this.#sendBackend({ type: "response.create" });
      } else {
        this.#invalidateOutput();
      }
  }

  #processBackendEvent(event) {
      switch (event.type) {
        case "session.updated":
          this.#outputQueue.push({ type: "session.ready" });
          break;
        case "response.created": {
          const responseId = event.response?.id ?? event.response_id;
          if (responseId) this.#responseGenerations.set(responseId, this.#generation);
          this.#activeResponseGeneration = this.#generation;
          this.#outputActive = true;
          this.#outputQueue.push({ type: "response.started", generation: this.#generation });
          break;
        }
        case "response.output_audio.delta":
          if (event.delta) this.#outputQueue.push({ type: "output.audio.delta", audio: event.delta, generation: this.#eventGeneration(event) });
          break;
        case "response.output_audio_transcript.delta":
        case "response.output_text.delta":
          if (event.delta) this.#outputQueue.push({ type: "output.transcript.delta", delta: event.delta, generation: this.#eventGeneration(event) });
          break;
        case "input_audio_buffer.speech_started":
          this.#invalidateOutput();
          this.#outputQueue.push({ type: "input.speech.started", generation: this.#generation });
          break;
        case "input_audio_buffer.speech_stopped":
          this.#outputQueue.push({ type: "input.speech.stopped", generation: this.#generation });
          break;
        case "response.done": {
          const responseId = event.response?.id ?? event.response_id;
          const generation = this.#eventGeneration(event);
          if (responseId) this.#responseGenerations.delete(responseId);
          if (generation === this.#generation) this.#outputActive = false;
          if (this.#activeResponseGeneration === generation) this.#activeResponseGeneration = undefined;
          this.#outputQueue.push({ type: "response.done", generation });
          break;
        }
        case "error":
          this.#outputQueue.push({ type: "error", message: event.error?.message ?? "Realtime request failed" });
          break;
      }
  }

  async #outputLoop() {
    while (true) {
      const next = await this.#outputQueue.next();
      if (next.done) return;
      const event = next.value;
      if ("generation" in event && event.generation !== this.#generation) continue;
      const { generation: _, ...publicEvent } = event;
      await this.#sendClient(publicEvent);
    }
  }

  #invalidateOutput() {
    this.#generation += 1;
    if (this.#outputActive) this.#sendBackend({ type: "response.cancel" });
    this.#outputActive = false;
    this.#activeResponseGeneration = undefined;
    this.#outputQueue.push({ type: "output.interrupted", generation: this.#generation });
  }

  #normalizeClientInput(event) {
    switch (event.type) {
      case "session.configure":
        return {
          source: "client",
          type: "session.configure",
          instructions: typeof event.instructions === "string" ? event.instructions : undefined,
          voice: typeof event.voice === "string" ? event.voice : undefined,
        };
      case "input.audio":
        return typeof event.audio === "string" && event.audio
          ? { source: "client", type: "audio", audio: event.audio }
          : undefined;
      case "input.text":
        return typeof event.text === "string" && event.text.trim()
          ? { source: "client", type: "text", text: event.text.trim() }
          : undefined;
      case "interrupt":
        return { source: "client", type: "interrupt" };
      default:
        return undefined;
    }
  }

  #eventGeneration(event) {
    const responseId = event.response_id ?? event.response?.id;
    if (responseId) return this.#responseGenerations.get(responseId) ?? -1;
    return this.#activeResponseGeneration ?? this.#generation;
  }

  #sendBackend(event) {
    if (this.backend.readyState === WebSocket.OPEN) this.backend.send(JSON.stringify(event));
  }

  #sendClient(event) {
    if (this.client.readyState !== WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.client.send(JSON.stringify(event), (error) => error ? reject(error) : resolve());
    });
  }
}
