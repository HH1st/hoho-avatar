import WebSocket from "ws";
import { AsyncQueue } from "./async-queue.mjs";

/** Three-loop backend runtime for one browser ↔ Realtime session. */
export class VuiRuntime {
  #inputIngress = new AsyncQueue();
  #processInput = new AsyncQueue();
  #backendEvents = new AsyncQueue();
  #output = new AsyncQueue();
  #generation = 0;
  #outputActive = false;
  #activeResponseGeneration;
  #responseGenerations = new Map();
  #stopped = false;

  constructor(client, backend) {
    this.client = client;
    this.backend = backend;
  }

  async run() {
    this.client.on("message", (data, isBinary) => {
      if (!isBinary) this.#inputIngress.push(data.toString());
    });
    this.backend.on("message", (data, isBinary) => {
      if (!isBinary) this.#backendEvents.push(data.toString());
    });
    this.client.once("close", () => this.stop());
    this.client.once("error", () => this.stop());
    this.backend.once("close", () => this.stop());
    this.backend.once("error", (error) => {
      this.#output.push({ type: "error", message: error.message });
      this.stop(false);
    });

    await this.#sendClient({ type: "gateway.ready" });
    await Promise.all([this.#inputLoop(), this.#processLoop(), this.#outputLoop()]);
  }

  stop(discardOutput = true) {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#inputIngress.close(true);
    this.#processInput.close(true);
    this.#backendEvents.close(true);
    this.#output.close(discardOutput);
    if (this.backend.readyState === WebSocket.OPEN || this.backend.readyState === WebSocket.CONNECTING) this.backend.close();
  }

  async #inputLoop() {
    while (true) {
      const next = await this.#inputIngress.next();
      if (next.done) return;
      let event;
      try { event = JSON.parse(next.value); } catch { continue; }
      switch (event.type) {
        case "session.configure":
          this.#processInput.push({
            type: "session.configure",
            instructions: typeof event.instructions === "string" ? event.instructions : undefined,
            voice: typeof event.voice === "string" ? event.voice : undefined,
          });
          break;
        case "input.audio":
          if (typeof event.audio === "string" && event.audio) this.#processInput.push({ type: "audio", audio: event.audio });
          break;
        case "input.text":
          if (typeof event.text === "string" && event.text.trim()) this.#processInput.push({ type: "text", text: event.text.trim() });
          break;
        case "interrupt":
          this.#processInput.push({ type: "interrupt" }, true);
          break;
      }
    }
  }

  #processLoop() {
    return Promise.all([this.#processInputs(), this.#processBackend()]).then(() => undefined);
  }

  async #processInputs() {
    while (true) {
      const next = await this.#processInput.next();
      if (next.done) return;
      const event = next.value;
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
  }

  async #processBackend() {
    while (true) {
      const next = await this.#backendEvents.next();
      if (next.done) return;
      let event;
      try { event = JSON.parse(next.value); } catch { continue; }
      switch (event.type) {
        case "session.updated":
          this.#output.push({ type: "session.ready" });
          break;
        case "response.created": {
          const responseId = event.response?.id ?? event.response_id;
          if (responseId) this.#responseGenerations.set(responseId, this.#generation);
          this.#activeResponseGeneration = this.#generation;
          this.#outputActive = true;
          this.#output.push({ type: "response.started", generation: this.#generation });
          break;
        }
        case "response.output_audio.delta":
          if (event.delta) this.#output.push({ type: "output.audio.delta", audio: event.delta, generation: this.#eventGeneration(event) });
          break;
        case "response.output_audio_transcript.delta":
        case "response.output_text.delta":
          if (event.delta) this.#output.push({ type: "output.transcript.delta", delta: event.delta, generation: this.#eventGeneration(event) });
          break;
        case "input_audio_buffer.speech_started":
          this.#invalidateOutput();
          this.#output.push({ type: "input.speech.started", generation: this.#generation });
          break;
        case "input_audio_buffer.speech_stopped":
          this.#output.push({ type: "input.speech.stopped", generation: this.#generation });
          break;
        case "response.done": {
          const responseId = event.response?.id ?? event.response_id;
          const generation = this.#eventGeneration(event);
          if (responseId) this.#responseGenerations.delete(responseId);
          if (generation === this.#generation) this.#outputActive = false;
          if (this.#activeResponseGeneration === generation) this.#activeResponseGeneration = undefined;
          this.#output.push({ type: "response.done", generation });
          break;
        }
        case "error":
          this.#output.push({ type: "error", message: event.error?.message ?? "Realtime request failed" });
          break;
      }
    }
  }

  async #outputLoop() {
    while (true) {
      const next = await this.#output.next();
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
    this.#output.push({ type: "output.interrupted", generation: this.#generation });
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
