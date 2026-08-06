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

function getBrowserHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/130.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: "CONSENT=YES+1",
  };
}

function isVideoId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || ""));
}

function getVideoIdFromUrl(value) {
  if (!value) {
    return null;
  }

  try {
    var url = new URL(value, "https://www.youtube.com");
    var hostname = url.hostname.toLowerCase();
    var videoId = null;

    if (hostname === "youtu.be" || hostname.slice(-9) === ".youtu.be") {
      videoId = url.pathname.match(/^\/([a-zA-Z0-9_-]{11})(?:\/|$)/);
      return videoId ? videoId[1] : null;
    }

    if (hostname !== "youtube.com" && hostname.slice(-12) !== ".youtube.com") {
      return null;
    }

    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
      return isVideoId(videoId) ? videoId : null;
    }

    videoId = url.pathname.match(/^\/live\/([a-zA-Z0-9_-]{11})(?:\/|$)/);

    return videoId ? videoId[1] : null;
  } catch (err) {
    return null;
  }
}

function extractJsonObject(source, markerIndex) {
  var start = source.indexOf("{", markerIndex);

  if (start === -1) {
    return null;
  }

  var depth = 0;
  var inString = false;
  var escaped = false;

  for (var i = start; i < source.length; i++) {
    var character = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth++;
      continue;
    }

    if (character === "}") {
      depth--;

      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function extractInitialPlayerResponse(html) {
  var markerPattern =
    /(?:var\s+ytInitialPlayerResponse|window\s*\[\s*["']ytInitialPlayerResponse["']\s*\]|ytInitialPlayerResponse)\s*=/g;
  var marker;

  while ((marker = markerPattern.exec(html))) {
    var json = extractJsonObject(html, marker.index + marker[0].length);

    if (!json) {
      continue;
    }

    try {
      return JSON.parse(json);
    } catch (err) {
      // Try the next known assignment.
    }
  }

  return null;
}

function getHtmlAttribute(tag, name) {
  var pattern = new RegExp(
    "\\b" + name + "\\s*=\\s*(?:\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\s>]+))",
    "i",
  );
  var match = tag.match(pattern);

  return match ? match[1] || match[2] || match[3] || "" : null;
}

function getMetadataVideoId(html) {
  var tags = html.match(/<(?:link|meta)\b[^>]*>/gi) || [];

  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    var rel = String(getHtmlAttribute(tag, "rel") || "").toLowerCase();
    var property = String(
      getHtmlAttribute(tag, "property") || getHtmlAttribute(tag, "name") || "",
    ).toLowerCase();
    var pageUrl = null;

    if (/(?:^|\s)canonical(?:\s|$)/.test(rel)) {
      pageUrl = getHtmlAttribute(tag, "href");
    } else if (property === "og:url") {
      pageUrl = getHtmlAttribute(tag, "content");
    }

    var videoId = getVideoIdFromUrl(pageUrl);

    if (videoId) {
      return videoId;
    }
  }

  return null;
}

function getRawHtmlVideoId(html) {
  var match = html.match(
    /"videoDetails"\s*:\s*\{\s*"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
  );

  return match ? match[1] : null;
}

function getPlayerVideoId(playerResponse) {
  var videoId =
    playerResponse &&
    playerResponse.videoDetails &&
    playerResponse.videoDetails.videoId;

  return isVideoId(videoId) ? videoId : null;
}

function getLiveStreamabilityVideoId(playerResponse) {
  var videoId =
    playerResponse &&
    playerResponse.playabilityStatus &&
    playerResponse.playabilityStatus.liveStreamability &&
    playerResponse.playabilityStatus.liveStreamability
      .liveStreamabilityRenderer &&
    playerResponse.playabilityStatus.liveStreamability.liveStreamabilityRenderer
      .videoId;

  return isVideoId(videoId) ? videoId : null;
}

function getCandidateVideoId(responseUrl, playerResponse, html) {
  return (
    getVideoIdFromUrl(responseUrl) ||
    getPlayerVideoId(playerResponse) ||
    getLiveStreamabilityVideoId(playerResponse) ||
    getMetadataVideoId(html) ||
    getRawHtmlVideoId(html)
  );
}

function getStructuredLiveStatus(playerResponse, videoId) {
  if (!playerResponse || typeof playerResponse !== "object") {
    return null;
  }

  var playerVideoId = getPlayerVideoId(playerResponse);
  var streamabilityVideoId = getLiveStreamabilityVideoId(playerResponse);

  if (playerVideoId !== videoId && streamabilityVideoId !== videoId) {
    return null;
  }

  var videoDetails = playerResponse.videoDetails || {};
  var playabilityStatus = playerResponse.playabilityStatus || {};
  var microformatRenderer =
    playerResponse.microformat &&
    playerResponse.microformat.playerMicroformatRenderer;
  var liveBroadcastDetails =
    microformatRenderer && microformatRenderer.liveBroadcastDetails;

  if (
    liveBroadcastDetails &&
    typeof liveBroadcastDetails.isLiveNow === "boolean"
  ) {
    return liveBroadcastDetails.isLiveNow;
  }

  if (playabilityStatus.status === "LIVE_STREAM_OFFLINE") {
    return false;
  }

  if (videoDetails.isLiveContent === false) {
    return false;
  }

  var liveStreamability = playabilityStatus.liveStreamability;

  if (
    videoDetails.isLiveContent === true &&
    liveStreamability &&
    typeof liveStreamability === "object" &&
    Object.keys(liveStreamability).length > 0
  ) {
    return true;
  }

  return null;
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
      headers: getBrowserHeaders(),
      redirect: "follow",
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
    var playerResponse = extractInitialPlayerResponse(html);

    if (!playerResponse) {
      console.warn(
        "[youtube-live] Structured player data could not be parsed from the live page.",
      );
    }

    var videoId = getCandidateVideoId(response.url, playerResponse, html);
    console.log("[youtube-live] Resolution result:", {
      finalUrl: response.url,
      hasPlayerResponse: Boolean(playerResponse),
      playerVideoId: getPlayerVideoId(playerResponse),
      streamabilityVideoId: getLiveStreamabilityVideoId(playerResponse),
      metadataVideoId: getMetadataVideoId(html),
      selectedVideoId: videoId,
    });

    if (!videoId) {
      console.warn("[youtube-live] No candidate video ID was found.");

      return jsonResponse({
        live: false,
      });
    }

    var live = getStructuredLiveStatus(playerResponse, videoId);

    if (live === null) {
      var watchResponse = await fetch(
        "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId),
        {
          headers: getBrowserHeaders(),
          redirect: "follow",
        },
      );

      if (!watchResponse.ok) {
        return jsonResponse(
          {
            error: "YouTube returned an unexpected response.",
          },
          502,
        );
      }

      var watchHtml = await watchResponse.text();
      var watchPlayerResponse = extractInitialPlayerResponse(watchHtml);

      if (!watchPlayerResponse) {
        console.warn(
          "[youtube-live] Structured player data could not be parsed from the watch page.",
        );
      }

      live = getStructuredLiveStatus(watchPlayerResponse, videoId);
    }

    if (live !== true) {
      console.warn(
        "[youtube-live] Candidate video " +
          videoId +
          " was found but is not currently live.",
      );

      return jsonResponse({
        live: false,
      });
    }

    return jsonResponse({
      live: true,
      videoId: videoId,
    });
  } catch (err) {
    console.warn(
      "[youtube-live] Failed to inspect the YouTube live page:",
      err && err.message ? err.message : String(err),
    );

    return jsonResponse(
      {
        error: "Could not inspect the YouTube live page.",
      },
      502,
    );
  }
}
