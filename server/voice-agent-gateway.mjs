import { createServer } from "node:http";
import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import WebSocket, { WebSocketServer } from "ws";

const port = Number(process.env.VOICE_AGENT_PORT ?? 8787);
const host = process.env.VOICE_AGENT_HOST ?? "127.0.0.1";
const domain = requireEnvironment("AZURE_OPENAI_DOMAIN");
const apiPath = process.env.AZURE_OPENAI_REALTIME_PATH ?? "/openai/v1/realtime";
const deployment = requireEnvironment("AZURE_OPENAI_REALTIME_DEPLOYMENT");
const clientId = process.env.AZURE_CLIENT_ID;
const allowDeveloperCredential = process.env.AZURE_USE_DEFAULT_CREDENTIAL === "1";
const configuredOrigins = process.env.VOICE_AGENT_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
const credential = allowDeveloperCredential
  ? new AzureCliCredential()
  : new ManagedIdentityCredential(clientId);

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Copy .env.example to .env and configure your Azure OpenAI resource.`);
  return value;
}

function azureRealtimeUrl() {
  const url = new URL(`wss://${domain}${apiPath}`);
  url.searchParams.set("model", deployment);
  return url.href;
}

async function createAzureSocket() {
  const accessToken = await credential.getToken("https://cognitiveservices.azure.com/.default");
  if (!accessToken?.token) throw new Error("Managed Identity did not return an Azure OpenAI access token");
  return new WebSocket(azureRealtimeUrl(), {
    headers: { Authorization: `Bearer ${accessToken.token}` },
  });
}

function waitForAzureSocket(socket, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`Azure Realtime handshake timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("open", handleOpen);
      socket.off("error", handleError);
      socket.off("unexpected-response", handleUnexpectedResponse);
    };
    const handleOpen = () => { cleanup(); resolve(); };
    const handleError = (error) => { cleanup(); reject(error); };
    const handleUnexpectedResponse = (_request, response) => {
      cleanup();
      reject(new Error(`Azure Realtime handshake failed with HTTP ${response.statusCode}`));
    };
    socket.once("open", handleOpen);
    socket.once("error", handleError);
    socket.once("unexpected-response", handleUnexpectedResponse);
  });
}

const server = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, deployment, authentication: allowDeveloperCredential ? "azure-cli" : "managed-identity" }));
    return;
  }
  response.writeHead(404).end();
});

function originAllowed(origin) {
  if (!origin) return false;
  if (configuredOrigins?.length) return configuredOrigins.includes(origin);
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

const clients = new WebSocketServer({
  server,
  path: "/voice-agent",
  verifyClient: ({ origin }, done) => done(originAllowed(origin), 403, "Origin is not allowed"),
});
clients.on("connection", async (client) => {
  let upstream;
  const closeBoth = (code = 1011, reason = "Voice Agent connection closed") => {
    if (client.readyState === WebSocket.OPEN) client.close(code, reason);
    if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) upstream.close();
  };

  try {
    upstream = await createAzureSocket();
    await waitForAzureSocket(upstream);
  } catch (error) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "gateway.error", message: error instanceof Error ? error.message : "Azure authentication failed" }));
    }
    closeBoth(1011, "Azure authentication failed");
    return;
  }

  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "gateway.ready" }));
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  upstream.on("error", (error) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "gateway.error", message: error.message }));
  });
  upstream.on("close", (code) => closeBoth(code === 1000 ? 1000 : 1011, "Azure Realtime disconnected"));
  client.on("message", (data, isBinary) => {
    if (upstream?.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
  });
  client.on("close", () => {
    if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) upstream.close();
  });
  client.on("error", () => upstream?.close());
});

server.listen(port, host, () => {
  console.log(`Voice Agent gateway listening on http://${host}:${port}`);
  console.log(`Azure Realtime target: ${domain}${apiPath} (deployment: ${deployment})`);
  console.log(`Authentication: ${allowDeveloperCredential ? "Azure CLI (development)" : "Managed Identity"}`);
});
