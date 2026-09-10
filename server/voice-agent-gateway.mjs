import { createServer } from "node:http";
import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import WebSocket, { WebSocketServer } from "ws";
import { runGatewaySession } from "./gateway-session.mjs";

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

async function createAzureSocket(signal) {
  const accessToken = await credential.getToken("https://cognitiveservices.azure.com/.default", { abortSignal: signal });
  signal.throwIfAborted();
  if (!accessToken?.token) throw new Error("Managed Identity did not return an Azure OpenAI access token");
  return new WebSocket(azureRealtimeUrl(), {
    headers: { Authorization: `Bearer ${accessToken.token}` },
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
clients.on("connection", (client) => {
  void runGatewaySession(client, createAzureSocket).catch((error) => {
    console.error("Voice session cleanup failed:", error.message);
    client.terminate();
  });
});

server.listen(port, host, () => {
  console.log(`Voice Agent gateway listening on http://${host}:${port}`);
  console.log(`Azure Realtime target: ${domain}${apiPath} (deployment: ${deployment})`);
  console.log(`Authentication: ${allowDeveloperCredential ? "Azure CLI (development)" : "Managed Identity"}`);
});

export async function closeGateway() {
  for (const client of clients.clients) client.terminate();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
