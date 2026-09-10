import WebSocket from "ws";
import { VuiRuntime } from "./vui-runtime.mjs";

function closeUpstream(socket) {
  if (!socket) return;
  // Closing a CONNECTING ws emits an error asynchronously.
  socket.once("error", () => {});
  if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
  else if (socket.readyState === WebSocket.OPEN) socket.close();
}

export function waitForSocket(socket, signal, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      socket.off("open", opened);
      socket.off("error", failed);
      socket.off("close", closed);
      socket.off("unexpected-response", unexpected);
      signal.removeEventListener("abort", cancelled);
      if (error) { closeUpstream(socket); reject(error); }
      else resolve();
    };
    const opened = () => finish();
    const failed = (error) => finish(error);
    const closed = () => finish(new Error("Azure Realtime closed before session setup"));
    const cancelled = () => finish(new DOMException("Session cancelled", "AbortError"));
    const unexpected = (_request, response) => {
      response.resume();
      finish(new Error(`Azure Realtime handshake failed with HTTP ${response.statusCode}`));
    };
    socket.once("open", opened);
    socket.once("error", failed);
    socket.once("close", closed);
    socket.once("unexpected-response", unexpected);
    signal.addEventListener("abort", cancelled, { once: true });
    timer = setTimeout(() => finish(new Error("Azure Realtime handshake timed out")), timeoutMs);
    if (signal.aborted) cancelled();
    else if (socket.readyState === WebSocket.OPEN) opened();
    else if (socket.readyState === WebSocket.CLOSED) closed();
  });
}

/** Teardown applies even while credentials or the upstream handshake are pending. */
export async function runGatewaySession(client, connectUpstream) {
  const abort = new AbortController();
  let upstream;
  let runtime;
  const cancel = () => { abort.abort(); runtime?.stop(); };
  client.once("close", cancel);
  client.once("error", cancel);
  try {
    if (client.readyState !== WebSocket.OPEN) return;
    upstream = await connectUpstream(abort.signal);
    if (abort.signal.aborted || client.readyState !== WebSocket.OPEN) return;
    await waitForSocket(upstream, abort.signal);
    if (abort.signal.aborted || client.readyState !== WebSocket.OPEN) return;
    runtime = new VuiRuntime(client, upstream);
    await runtime.run();
  } catch (error) {
    if (!abort.signal.aborted && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: runtime ? "error" : "gateway.error", message: error instanceof Error ? error.message : "Voice session failed" }));
    }
  } finally {
    client.off("close", cancel);
    client.off("error", cancel);
    runtime?.stop();
    closeUpstream(upstream);
    if (client.readyState === WebSocket.OPEN) client.close(1000, "Voice session ended");
  }
}
