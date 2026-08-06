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

function extractInitialData(html) {
  var markerPattern =
    /(?:var\s+ytInitialData|window\s*\[\s*["']ytInitialData["']\s*\]|ytInitialData)\s*=/g;
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

function extractStringField(source, key) {
  var pattern = new RegExp('"' + key + '"\\s*:\\s*"([^"\\\\]+)"');
  var match = source.match(pattern);

  return match ? match[1] : null;
}

function extractInnertubeContext(html) {
  var markerIndex = html.indexOf('"INNERTUBE_CONTEXT"');

  if (markerIndex === -1) {
    return null;
  }

  var json = extractJsonObject(html, markerIndex);

  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
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

function getNestedVideoId(renderer) {
  if (!renderer || typeof renderer !== "object") {
    return null;
  }

  if (isVideoId(renderer.videoId)) {
    return renderer.videoId;
  }

  var navigationVideoId =
    renderer.navigationEndpoint &&
    renderer.navigationEndpoint.watchEndpoint &&
    renderer.navigationEndpoint.watchEndpoint.videoId;

  if (isVideoId(navigationVideoId)) {
    return navigationVideoId;
  }

  var stack = [renderer];

  while (stack.length) {
    var value = stack.pop();

    if (!value || typeof value !== "object") {
      continue;
    }

    var watchVideoId = value.watchEndpoint && value.watchEndpoint.videoId;

    if (isVideoId(watchVideoId)) {
      return watchVideoId;
    }

    var commandUrl =
      value.commandMetadata &&
      value.commandMetadata.webCommandMetadata &&
      value.commandMetadata.webCommandMetadata.url;
    var commandVideoId = getVideoIdFromUrl(commandUrl);

    if (commandVideoId) {
      return commandVideoId;
    }

    if (Array.isArray(value)) {
      for (var i = value.length - 1; i >= 0; i--) {
        stack.push(value[i]);
      }

      continue;
    }

    var keys = Object.keys(value);

    for (var j = keys.length - 1; j >= 0; j--) {
      stack.push(value[keys[j]]);
    }
  }

  return null;
}

function collectStringValues(value, result) {
  if (typeof value === "string") {
    result.push(value);
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      collectStringValues(value[i], result);
    }

    return;
  }

  var keys = Object.keys(value);

  for (var j = 0; j < keys.length; j++) {
    collectStringValues(value[keys[j]], result);
  }
}

function inspectLiveSignalText(value, state, allowPlainLive) {
  var strings = [];
  collectStringValues(value, strings);

  for (var i = 0; i < strings.length; i++) {
    var text = strings[i].replace(/\s+/g, " ").trim().toUpperCase();

    if (!text) {
      continue;
    }

    if (/\b(?:UPCOMING|PREMIERE|SCHEDULED|STREAMED|ENDED)\b/.test(text)) {
      state.disqualified = true;
    }

    if (
      /\bWATCHING\b/.test(text) ||
      /\bLIVE NOW\b/.test(text) ||
      /\bIS LIVE\b/.test(text) ||
      (allowPlainLive && text === "LIVE")
    ) {
      state.live = true;
    }
  }
}

function inspectLiveSignalStyle(style, state) {
  var normalized = String(style || "").toUpperCase();

  if (/(?:^|_)(?:UPCOMING|PREMIERE|SCHEDULED)$/.test(normalized)) {
    state.disqualified = true;
  }

  if (/(?:^|_)LIVE(?:_NOW)?$/.test(normalized)) {
    state.live = true;
  }
}

function inspectAccessibilityLiveSignal(value, state) {
  var strings = [];
  collectStringValues(value, strings);

  for (var i = 0; i < strings.length; i++) {
    var text = strings[i].replace(/\s+/g, " ").trim().toUpperCase();

    if (/\b(?:UPCOMING|PREMIERE|SCHEDULED|STREAMED|ENDED)\b/.test(text)) {
      state.disqualified = true;
    }

    if (/\bLIVE NOW\b/.test(text) || /\bIS LIVE\b/.test(text)) {
      state.live = true;
    }
  }
}

function hasStrongLiveSignal(renderer) {
  var state = {
    live: false,
    disqualified: false,
  };
  var stack = [renderer];

  while (stack.length) {
    var value = stack.pop();

    if (!value || typeof value !== "object") {
      continue;
    }

    if (Array.isArray(value)) {
      for (var i = value.length - 1; i >= 0; i--) {
        stack.push(value[i]);
      }

      continue;
    }

    var keys = Object.keys(value);

    for (var j = keys.length - 1; j >= 0; j--) {
      var key = keys[j];
      var child = value[key];

      if (
        key === "thumbnailOverlayTimeStatusRenderer" ||
        key === "metadataBadgeRenderer" ||
        /(?:overlay|badge)/i.test(key)
      ) {
        inspectLiveSignalStyle(
          child && (child.style || child.badgeStyle),
          state,
        );
        inspectLiveSignalText(child, state, true);
      } else if (/viewCountText$/i.test(key)) {
        inspectLiveSignalText(child, state, false);
      } else if (/accessibility/i.test(key)) {
        inspectAccessibilityLiveSignal(child, state);
      }

      stack.push(child);
    }
  }

  return state.live && !state.disqualified;
}

function findLiveRendererCandidates(root) {
  if (!root || typeof root !== "object") {
    return [];
  }

  var rendererKeys = {
    videoRenderer: true,
    gridVideoRenderer: true,
    compactVideoRenderer: true,
    lockupViewModel: true,
  };
  var candidates = [];
  var seen = {};
  var stack = [root];

  function addRenderer(renderer) {
    var videoId = getNestedVideoId(renderer);

    if (!videoId || seen[videoId] || !hasStrongLiveSignal(renderer)) {
      return;
    }

    seen[videoId] = true;
    candidates.push(videoId);
  }

  while (stack.length) {
    var value = stack.pop();

    if (!value || typeof value !== "object") {
      continue;
    }

    if (Array.isArray(value)) {
      for (var i = value.length - 1; i >= 0; i--) {
        stack.push(value[i]);
      }

      continue;
    }

    var keys = Object.keys(value);

    for (var j = keys.length - 1; j >= 0; j--) {
      var key = keys[j];
      var child = value[key];

      if (rendererKeys[key]) {
        addRenderer(child);
      } else if (key === "watchEndpoint") {
        addRenderer(value);
      }

      stack.push(child);
    }
  }

  return candidates;
}

function getText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value.simpleText === "string") {
    return value.simpleText;
  }

  if (Array.isArray(value.runs)) {
    return value.runs
      .map(function (run) {
        return run && typeof run.text === "string" ? run.text : "";
      })
      .join("");
  }

  return "";
}

function findSelectedLiveTabBrowseEndpoint(root) {
  if (!root || typeof root !== "object") {
    return null;
  }

  var stack = [root];

  while (stack.length) {
    var value = stack.pop();

    if (!value || typeof value !== "object") {
      continue;
    }

    var tab = value.tabRenderer;

    if (tab && tab.selected === true) {
      var title = getText(tab.title).trim().toLowerCase();
      var identifier = String(tab.tabIdentifier || "").toLowerCase();
      var endpoint = tab.endpoint || tab.navigationEndpoint;
      var browseEndpoint = endpoint && endpoint.browseEndpoint;

      if (
        (title === "live" || identifier === "live") &&
        browseEndpoint &&
        typeof browseEndpoint.browseId === "string" &&
        browseEndpoint.browseId &&
        typeof browseEndpoint.params === "string" &&
        browseEndpoint.params
      ) {
        return {
          browseId: browseEndpoint.browseId,
          params: browseEndpoint.params,
        };
      }
    }

    if (Array.isArray(value)) {
      for (var i = value.length - 1; i >= 0; i--) {
        stack.push(value[i]);
      }

      continue;
    }

    var keys = Object.keys(value);

    for (var j = keys.length - 1; j >= 0; j--) {
      stack.push(value[keys[j]]);
    }
  }

  return null;
}

async function fetchLiveTabBrowseData(html, browseEndpoint) {
  var apiKey = extractStringField(html, "INNERTUBE_API_KEY");
  var clientVersion = extractStringField(html, "INNERTUBE_CLIENT_VERSION");
  var innertubeContext = extractInnertubeContext(html);

  if (!apiKey || !clientVersion || !innertubeContext) {
    throw new Error("YouTube Innertube configuration was incomplete.");
  }

  var headers = getBrowserHeaders();
  headers.Accept = "*/*";
  headers["Content-Type"] = "application/json";
  headers["X-YouTube-Client-Version"] = clientVersion;

  var response = await fetch(
    "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&key=" +
      encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: headers,
      redirect: "follow",
      body: JSON.stringify({
        context: innertubeContext,
        browseId: browseEndpoint.browseId,
        params: browseEndpoint.params,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      "YouTube browse request failed with HTTP " + response.status + ".",
    );
  }

  return response.json();
}

function getCandidateResolution(
  responseUrl,
  playerResponse,
  initialDataVideoId,
  browseVideoId,
  html,
) {
  var candidates = [
    { videoId: getVideoIdFromUrl(responseUrl), source: "redirect_url" },
    { videoId: getPlayerVideoId(playerResponse), source: "player_response" },
    {
      videoId: getLiveStreamabilityVideoId(playerResponse),
      source: "live_streamability",
    },
    { videoId: initialDataVideoId, source: "initial_data" },
    { videoId: browseVideoId, source: "innertube_browse" },
    { videoId: getMetadataVideoId(html), source: "metadata" },
    { videoId: getRawHtmlVideoId(html), source: "raw_html" },
  ];

  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i].videoId) {
      return candidates[i];
    }
  }

  return {
    videoId: null,
    source: "none",
  };
}

function getDiagnosticUrl(value) {
  try {
    var url = new URL(value);
    var videoId = getVideoIdFromUrl(url.href);

    url.search = videoId && url.pathname === "/watch" ? "?v=" + videoId : "";
    url.hash = "";

    return url.href;
  } catch (err) {
    return null;
  }
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
    var initialData = extractInitialData(html);

    if (!playerResponse) {
      console.warn(
        "[youtube-live] Structured player data could not be parsed from the live page.",
      );
    }

    var initialDataCandidates = findLiveRendererCandidates(initialData);
    var initialDataVideoId = initialDataCandidates[0] || null;
    var browseVideoId = null;
    var higherPriorityVideoId =
      getVideoIdFromUrl(response.url) ||
      getPlayerVideoId(playerResponse) ||
      getLiveStreamabilityVideoId(playerResponse);

    if (!higherPriorityVideoId && !initialDataVideoId) {
      var liveTabBrowseEndpoint =
        findSelectedLiveTabBrowseEndpoint(initialData);

      if (liveTabBrowseEndpoint) {
        var browseData = await fetchLiveTabBrowseData(
          html,
          liveTabBrowseEndpoint,
        );
        var browseCandidates = findLiveRendererCandidates(browseData);
        browseVideoId = browseCandidates[0] || null;
      }
    }

    var resolution = getCandidateResolution(
      response.url,
      playerResponse,
      initialDataVideoId,
      browseVideoId,
      html,
    );
    var videoId = resolution.videoId;

    console.log("[youtube-live] Resolution result:", {
      finalUrl: getDiagnosticUrl(response.url),
      hasPlayerResponse: Boolean(playerResponse),
      hasInitialData: Boolean(initialData),
      initialDataCandidateCount: initialDataCandidates.length,
      selectedInitialDataVideoId: initialDataVideoId,
      selectedSource: resolution.source,
      selectedVideoId: videoId,
    });

    if (!videoId) {
      console.warn("[youtube-live] No candidate video ID was found.");

      return jsonResponse({
        live: false,
      });
    }

    var requiresWatchVerification =
      resolution.source === "initial_data" ||
      resolution.source === "innertube_browse";
    var live = requiresWatchVerification
      ? null
      : getStructuredLiveStatus(playerResponse, videoId);

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
    console.warn("[youtube-live] Failed to inspect YouTube live data.");

    return jsonResponse(
      {
        error: "Could not inspect the YouTube live page.",
      },
      502,
    );
  }
}
