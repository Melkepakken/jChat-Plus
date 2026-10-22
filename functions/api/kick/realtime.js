const API_ROOT = "https://web.kick.com/api/v1/realtime/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readRequestBody(request) {
  const limit = 1024;
  if (Number(request.headers.get("Content-Length")) > limit) {
    if (request.body) await request.body.cancel();
    return null;
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limit);
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return new TextDecoder().decode(buffer.subarray(0, size));
      if (value.byteLength > limit - size) {
        await reader.cancel();
        return null;
      }
      buffer.set(value, size);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

async function kickRequest(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(API_ROOT + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error("Kick connection service unavailable.");
      error.upstreamStatus = response.status;
      throw error;
    }
    const result = await response.json();
    if (!result || !result.data) throw new Error("Invalid Kick connection response.");
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}

async function guestToken(clientId) {
  const result = await kickRequest("auth/connection", { client_id: clientId });
  if (typeof result.token !== "string" || !result.token || result.token.length > 16384) {
    throw new Error("Invalid Kick guest token.");
  }
  return result.token;
}

function connectionConfig(connection) {
  const credentials = connection && connection.credentials;
  if (!credentials) return null;
  if (connection.provider === "centrifugo") {
    const url = new URL(credentials.url);
    if (url.protocol !== "wss:" || url.username || url.password || url.port ||
        !/^realtime\.[a-z]{2}-[a-z]+-[1-9]\.platform\.kick\.com$/.test(url.hostname) ||
        url.pathname !== "/connection/websocket" || url.search || url.hash) return null;
    return { provider: "centrifugo", url: "/api/kick/socket?region=" + url.hostname.split(".")[1] };
  }
  if (connection.provider === "pusher" &&
      /^[a-z0-9]{10,64}$/.test(credentials.app_key) &&
      /^[a-z]{2,3}[0-9]?$/.test(credentials.cluster)) {
    return {
      provider: "pusher",
      url: "wss://ws-" + credentials.cluster + ".pusher.com/app/" +
        credentials.app_key + "?protocol=7&client=js&version=8.4.0-rc2&flash=false",
    };
  }
  return null;
}

export async function onRequest(context) {
  const request = context.request;
  if (request.method !== "POST") return json({ error: "Use POST for Kick connection requests." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Origin not allowed." }, 403);

  let input;
  try {
    const body = await readRequestBody(request);
    if (body === null) return json({ error: "Request too large." }, 413);
    input = JSON.parse(body);
  } catch (_) {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (!input || !UUID.test(input.clientId) ||
      !["connect", "refresh"].includes(input.action) ||
      (input.channelId != null && (!Number.isSafeInteger(input.channelId) || input.channelId <= 0))) {
    return json({ error: "Invalid Kick connection request." }, 400);
  }

  try {
    if (input.action === "refresh") return json({ token: await guestToken(input.clientId) });
    const path = input.channelId ? "channels/" + input.channelId + "/chat/connection" : "connection";
    const descriptor = await kickRequest(path, {
      client: { id: input.clientId, type: "web" },
      capabilities: { accepted_providers: [{ provider: "centrifugo" }, { provider: "pusher" }] },
    });
    if (descriptor.mode !== "websocket" || !Array.isArray(descriptor.connections)) {
      throw new Error("Unsupported Kick connection mode.");
    }
    const config = descriptor.connections.map(connectionConfig).find(Boolean);
    if (!config) throw new Error("Unsupported Kick connection provider.");
    if (config.provider === "centrifugo") config.token = await guestToken(input.clientId);
    return json(config);
  } catch (error) {
    console.warn("jChat Kick: connection helper failed.", {
      status: error.upstreamStatus || null,
      type: error.name,
    });
    return json({ error: "Kick connection service unavailable. Please retry shortly." }, 502);
  }
}
