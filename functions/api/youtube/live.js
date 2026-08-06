function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeHandle(value) {
  var handle = String(value || "")
    .trim()
    .replace(/^@+/, "");

  if (!handle || !/^[a-zA-Z0-9._-]+$/.test(handle)) {
    return null;
  }

  return handle;
}

function getVideoId(html) {
  var match = html.match(
    /"videoDetails"\s*:\s*\{\s*"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
  );

  return match ? match[1] : null;
}

export async function onRequestGet(context) {
  var requestUrl = new URL(context.request.url);
  var handle = normalizeHandle(requestUrl.searchParams.get("handle"));

  if (!handle) {
    return jsonResponse(
      {
        error: "Missing or invalid YouTube handle.",
      },
      400,
    );
  }

  var youtubeLiveUrl =
    "https://www.youtube.com/@" + encodeURIComponent(handle) + "/live";

  try {
    var response = await fetch(youtubeLiveUrl, {
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      return jsonResponse(
        {
          error: "YouTube returned an unexpected response.",
        },
        502,
      );
    }

    var html = await response.text();
    var videoId = getVideoId(html);
    var live = Boolean(
      videoId && /"isLiveNow"\s*:\s*true/.test(html),
    );

    if (!live) {
      return jsonResponse({
        live: false,
      });
    }

    return jsonResponse({
      live: true,
      videoId: videoId,
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Could not inspect the YouTube live page.",
      },
      502,
    );
  }
}