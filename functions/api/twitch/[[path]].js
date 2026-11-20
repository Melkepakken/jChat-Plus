let cachedToken = null;
let pendingToken = null;
const TWITCH_REQUEST_TIMEOUT_MS = 10000;

const ALLOWED_PATHS = new Set([
  "users",
  "chat/badges/global",
  "chat/badges",
  "bits/cheermotes",
]);

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

async function fetchTwitch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TWITCH_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const rateHeaders = {};
    for (const name of ["Retry-After", "Ratelimit-Limit", "Ratelimit-Remaining", "Ratelimit-Reset"]) {
      const value = response.headers.get(name);
      if (value !== null) rateHeaders[name] = value;
    }
    return {
      status: response.status, ok: response.ok, rateHeaders,
      contentType: response.headers.get("Content-Type") || "application/json",
      body: await response.text(),
    };
  } catch (err) {
    const timedOut = controller.signal.aborted;
    const error = new Error(timedOut ? "Twitch request timed out." : "Could not reach Twitch.");
    error.status = timedOut ? 504 : 502;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestTwitchToken(env) {
  const body = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const response = await fetchTwitch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const error = new Error("Twitch token request failed.");
    error.status = response.status === 429 || response.status === 503 ? response.status : 502;
    error.rateHeaders = response.rateHeaders;
    throw error;
  }

  const data = JSON.parse(response.body);
  if (!data || typeof data.access_token !== "string" || !data.access_token.trim() ||
      !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new Error("Twitch returned an invalid token.");
  }
  const ttl = data.expires_in * 1000;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + ttl - Math.min(360000, ttl / 10),
  };
  return cachedToken;
}

function getTwitchAppToken(context) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken;
  if (!pendingToken) {
    pendingToken = requestTwitchToken(context.env).finally(() => { pendingToken = null; });
    if (context.waitUntil) context.waitUntil(pendingToken.catch(() => {}));
  }
  return pendingToken;
}

function normalizePath(pathParam) {
  if (Array.isArray(pathParam)) {
    return pathParam.join("/");
  }

  return String(pathParam || "").replace(/^\/+|\/+$/g, "");
}

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const path = normalizePath(params.path);

  if (!ALLOWED_PATHS.has(path)) {
    return jsonResponse(
      {
        error: "Unsupported Twitch endpoint.",
        path,
      },
      404,
    );
  }

  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    return jsonResponse({ error: "Twitch proxy failed.", message: "Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET." }, 500);
  }

  try {
    const incomingUrl = new URL(request.url);
    const twitchUrl = new URL("https://api.twitch.tv/helix/" + path);

    incomingUrl.searchParams.forEach((value, key) => {
      twitchUrl.searchParams.append(key, value);
    });

    let twitchResponse;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getTwitchAppToken(context);
      twitchResponse = await fetchTwitch(twitchUrl.toString(), {
        headers: {
          Authorization: "Bearer " + token.value,
          "Client-Id": env.TWITCH_CLIENT_ID,
        },
      });
      if (twitchResponse.status !== 401) break;
      if (cachedToken === token) cachedToken = null;
    }

    return new Response(twitchResponse.body || null, {
      status: twitchResponse.status,
      headers: {
        "Content-Type": twitchResponse.contentType,
        "Cache-Control": twitchResponse.ok ? "public, max-age=60" : "no-store",
        ...twitchResponse.rateHeaders,
      },
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Twitch proxy failed.",
        message: err instanceof SyntaxError ? "Twitch returned invalid token data." : err.message,
      },
      err.status || 502,
      err.rateHeaders,
    );
  }
}
