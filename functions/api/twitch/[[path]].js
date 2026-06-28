let cachedToken = null;
let tokenExpiresAt = 0;

const ALLOWED_PATHS = new Set([
  "users",
  "chat/badges/global",
  "chat/badges",
  "bits/cheermotes",
]);

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function getTwitchAppToken(env) {
  const now = Date.now();

  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    throw new Error("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET.");
  }

  const body = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Twitch token request failed: " + text);
  }

  const data = await response.json();

  cachedToken = data.access_token;
  tokenExpiresAt = now + Math.max(0, (data.expires_in - 300) * 1000);

  return cachedToken;
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

  try {
    const token = await getTwitchAppToken(env);

    const incomingUrl = new URL(request.url);
    const twitchUrl = new URL("https://api.twitch.tv/helix/" + path);

    incomingUrl.searchParams.forEach((value, key) => {
      twitchUrl.searchParams.append(key, value);
    });

    const twitchResponse = await fetch(twitchUrl.toString(), {
      headers: {
        Authorization: "Bearer " + token,
        "Client-Id": env.TWITCH_CLIENT_ID,
      },
    });

    const text = await twitchResponse.text();

    return new Response(text, {
      status: twitchResponse.status,
      headers: {
        "Content-Type":
          twitchResponse.headers.get("Content-Type") || "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Twitch proxy failed.",
        message: err && err.message ? err.message : String(err),
      },
      500,
    );
  }
}