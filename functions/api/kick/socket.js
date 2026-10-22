function error(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return error("A WebSocket upgrade is required.", 426);
  }
  if (request.headers.get("Origin") !== url.origin) return error("Origin not allowed.", 403);
  const region = url.searchParams.get("region");
  if (!/^[a-z]{2}-[a-z]+-[1-9]$/.test(region || "")) return error("Invalid Kick region.", 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://realtime." + region + ".platform.kick.com/connection/websocket", {
      headers: { Upgrade: "websocket", Origin: "https://kick.com" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status === 101 && response.webSocket) return response;
    if (response.body) await response.body.cancel();
    return error("Kick WebSocket upgrade failed.", 502);
  } catch (_) {
    return error("Kick WebSocket connection unavailable.", 502);
  } finally {
    clearTimeout(timer);
  }
}
