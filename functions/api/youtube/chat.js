var YOUTUBE_CHAT_CONNECTOR_VERSION = "1";

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-JChat-Chat-Version": YOUTUBE_CHAT_CONNECTOR_VERSION,
    },
  });
}

var YOUTUBE_BOOTSTRAP_LOOKBACK_MS = 30 * 1000;
var YOUTUBE_BOOTSTRAP_MAX_AGE_MS = 60 * 1000;
var YOUTUBE_BOOTSTRAP_FUTURE_TOLERANCE_MS = 60 * 1000;
var YOUTUBE_CHAT_REQUEST_TIMEOUT_MS = 15 * 1000;
var YOUTUBE_WARNING_SUPPRESSION_MS = 60 * 1000;
var YOUTUBE_MAX_WARNING_ENTRIES = 128;
var youtubeWarningDeadlines = new Map();

function shouldLogChatWarning(operation, videoId, warning) {
  var now = Date.now();

  youtubeWarningDeadlines.forEach(function (deadline, key) {
    if (deadline <= now) {
      youtubeWarningDeadlines.delete(key);
    }
  });

  var validatedVideoId = typeof videoId === "string" &&
    /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
  var key = JSON.stringify([
    operation,
    validatedVideoId,
    warning.stage,
    warning.code || "poll_error",
    warning.status,
    warning.attempt || null,
    warning.contentType || null,
    Boolean(warning.html),
    Boolean(warning.softBlock),
    Boolean(warning.retryable),
    Boolean(warning.timedOut),
    warning.apiKeyFound,
    warning.clientVersionFound,
    warning.contextFound,
  ]);

  if (youtubeWarningDeadlines.get(key) > now) {
    return false;
  }

  while (youtubeWarningDeadlines.size >= YOUTUBE_MAX_WARNING_ENTRIES) {
    youtubeWarningDeadlines.delete(youtubeWarningDeadlines.keys().next().value);
  }

  // Suppressed repeats never extend the original warning's deadline.
  youtubeWarningDeadlines.set(key, now + YOUTUBE_WARNING_SUPPRESSION_MS);
  return true;
}

function readClientVersion(request) {
  var value;

  try {
    value = request && request.headers &&
      request.headers.get("X-JChat-Client-Version");
  } catch (err) {
    return null;
  }

  var version = typeof value === "string" ? value.trim() : "";

  return version.length <= 32 &&
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)
    ? version
    : null;
}

function diagnosticContentType(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  var mediaType = value.split(";", 1)[0].trim().toLowerCase();

  return [
    "application/json",
    "application/xhtml+xml",
    "application/octet-stream",
    "text/html",
    "text/plain",
  ].indexOf(mediaType) !== -1
    ? mediaType
    : "other";
}

function diagnosticRetryAfter(value) {
  if (typeof value !== "string") {
    return null;
  }

  var input = value.trim();

  if (/^\d{1,10}$/.test(input)) {
    return input;
  }

  if (
    /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(input)
  ) {
    var timestamp = Date.parse(input);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toUTCString()
      : null;
  }

  return null;
}

function logChatFailure(context, operation, videoId, details, error) {
  var pollError = error && error.name === "YouTubePollError" ? error : null;
  var pollStages = [
    "fetch",
    "timeout",
    "read",
    "http",
    "content_type",
    "parse",
    "response_shape",
    "continuation",
  ];
  var source = pollError || details;
  var warning = {
    operation: operation,
    stage: pollError && pollStages.indexOf(pollError.stage) !== -1
      ? pollError.stage
      : details.stage,
    code: pollError ? "poll_error" : details.code,
    status: Number.isInteger(source.status) &&
      source.status >= 100 && source.status <= 599
      ? source.status
      : null,
    videoId: typeof videoId === "string" &&
      /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      ? videoId
      : null,
    clientVersion: readClientVersion(context && context.request),
    connectorVersion: YOUTUBE_CHAT_CONNECTOR_VERSION,
  };

  if (source.contentType) {
    warning.contentType = diagnosticContentType(source.contentType);
  }

  if (typeof details.timedOut === "boolean" || pollError) {
    warning.timedOut = pollError
      ? pollError.stage === "timeout"
      : details.timedOut;
  }

  if (pollError) {
    warning.html = Boolean(pollError.html);
    warning.softBlock = Boolean(pollError.softBlock);
    warning.retryable = Boolean(pollError.retryable);
  }

  ["apiKeyFound", "clientVersionFound", "contextFound"].forEach(function (key) {
    if (typeof details[key] === "boolean") {
      warning[key] = details[key];
    }
  });

  if (!shouldLogChatWarning(operation, warning.videoId, warning)) {
    return;
  }

  console.warn(
    operation === "bootstrap_get"
      ? "[youtube-chat] Bootstrap failed"
      : "[youtube-chat] Poll failed",
    warning,
  );
}

function createYouTubeRequestDeadline() {
  var controller = new AbortController();
  var timeout = setTimeout(function () {
    controller.abort();
  }, YOUTUBE_CHAT_REQUEST_TIMEOUT_MS);

  return {
    controller: controller,
    timeout: timeout,
  };
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

function extractJsonObject(source, marker) {
  var markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

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

function extractInitialData(html) {
  var markers = [
    "var ytInitialData =",
    'window["ytInitialData"] =',
    "ytInitialData =",
  ];

  for (var i = 0; i < markers.length; i++) {
    var json = extractJsonObject(html, markers[i]);

    if (!json) continue;

    try {
      return JSON.parse(json);
    } catch (err) {
      // Try the next known marker.
    }
  }

  return null;
}

function extractStringField(source, key) {
  var pattern = new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"');
  var match = source.match(pattern);

  return match ? match[1] : null;
}

function extractNumberField(source, key) {
  var pattern = new RegExp('"' + key + '"\\s*:\\s*(\\d+)');
  var match = source.match(pattern);

  return match ? match[1] : null;
}

function findChatFilterRenderer(root) {
  var stack = [root];

  while (stack.length) {
    var value = stack.pop();

    if (!value || typeof value !== "object") {
      continue;
    }

    if (
      value.sortFilterSubMenuRenderer &&
      Array.isArray(value.sortFilterSubMenuRenderer.subMenuItems)
    ) {
      return value.sortFilterSubMenuRenderer;
    }

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        stack.push(value[i]);
      }

      continue;
    }

    var keys = Object.keys(value);

    for (var j = 0; j < keys.length; j++) {
      stack.push(value[keys[j]]);
    }
  }

  return null;
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

function getFilterContinuation(item) {
  if (item && item.continuation && item.continuation.reloadContinuationData) {
    return item.continuation.reloadContinuationData.continuation || null;
  }

  return null;
}

function findUnfilteredChat(filterRenderer) {
  if (!filterRenderer || !Array.isArray(filterRenderer.subMenuItems)) {
    return null;
  }

  for (var i = 0; i < filterRenderer.subMenuItems.length; i++) {
    var item = filterRenderer.subMenuItems[i];
    var title = getText(item.title);
    var normalizedTitle = title.toLowerCase();

    if (normalizedTitle !== "live chat" && normalizedTitle !== "all chat") {
      continue;
    }

    var continuation = getFilterContinuation(item);

    if (continuation) {
      return {
        title: title,
        continuation: continuation,
      };
    }
  }

  return null;
}

function extractInnertubeContext(html) {
  var contextJson = extractJsonObject(html, '"INNERTUBE_CONTEXT"');

  if (!contextJson) {
    return null;
  }

  try {
    return JSON.parse(contextJson);
  } catch (err) {
    return null;
  }
}

function getYouTubeEmojiToken(value) {
  var input = String(value || "youtube-emoji");
  var hash = 0;

  for (var i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }

  return "youtube_emote_" + (hash >>> 0).toString(36);
}

function getYouTubeEmojiLabel(emoji) {
  if (
    emoji &&
    emoji.image &&
    emoji.image.accessibility &&
    emoji.image.accessibility.accessibilityData &&
    typeof emoji.image.accessibility.accessibilityData.label === "string"
  ) {
    return emoji.image.accessibility.accessibilityData.label;
  }

  if (
    emoji &&
    Array.isArray(emoji.shortcuts) &&
    typeof emoji.shortcuts[0] === "string"
  ) {
    return emoji.shortcuts[0];
  }

  return "";
}

function getYouTubeEmojiImage(emoji) {
  var thumbnails =
    emoji && emoji.image && Array.isArray(emoji.image.thumbnails)
      ? emoji.image.thumbnails
      : [];

  var best = null;

  thumbnails.forEach(function (thumbnail) {
    if (
      !thumbnail ||
      typeof thumbnail.url !== "string" ||
      !/^https:\/\//i.test(thumbnail.url)
    ) {
      return;
    }

    var size =
      (parseInt(thumbnail.width, 10) || 0) *
      (parseInt(thumbnail.height, 10) || 0);

    if (!best || size >= best.size) {
      best = {
        url: thumbnail.url,
        size: size,
      };
    }
  });

  return best ? best.url : null;
}

function parseMessageContent(message) {
  var result = {
    message: "",
    emotes: {},
  };

  if (!message || !Array.isArray(message.runs)) {
    return result;
  }

  var parts = [];

  message.runs.forEach(function (run) {
    if (!run) {
      return;
    }

    if (typeof run.text === "string") {
      parts.push(run.text);
      return;
    }

    var emoji = run.emoji;

    if (!emoji) {
      return;
    }

    if (emoji.isCustomEmoji) {
      var image = getYouTubeEmojiImage(emoji);
      var label = getYouTubeEmojiLabel(emoji);
      var token = getYouTubeEmojiToken(emoji.emojiId || image || label);

      if (!image) {
        if (label) {
          parts.push(label);
        }

        return;
      }

      result.emotes[token] = {
        image: image,
        label: label,
      };

      parts.push(" " + token + " ");
      return;
    }

    if (typeof emoji.emojiId === "string") {
      parts.push(emoji.emojiId);
      return;
    }

    var fallbackLabel = getYouTubeEmojiLabel(emoji);

    if (fallbackLabel) {
      parts.push(fallbackLabel);
    }
  });

  result.message = parts
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return result;
}

function parseTextMessages(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  var messages = [];

  actions.forEach(function (action) {
    var renderer =
      action &&
      action.addChatItemAction &&
      action.addChatItemAction.item &&
      action.addChatItemAction.item.liveChatTextMessageRenderer;

    if (!renderer) {
      return;
    }

    var displayName = getText(renderer.authorName).trim();
    var parsedMessage = parseMessageContent(renderer.message);
    var timestampUsec = Number(renderer.timestampUsec);
    var publishedAtMs = Number.isFinite(timestampUsec) && timestampUsec > 0
      ? Math.floor(timestampUsec / 1000)
      : null;

    if (!displayName || !parsedMessage.message) {
      return;
    }

    messages.push({
      id: renderer.id || null,
      userId: renderer.authorExternalChannelId || null,
      displayName: displayName,
      message: parsedMessage.message,
      emotes: parsedMessage.emotes,
      publishedAtMs: publishedAtMs,
    });
  });

  return messages;
}

function filterRecentBootstrapMessages(
  messages,
  bootstrapStartedAtMs,
  processedAtMs,
) {
  if (!Array.isArray(messages)) {
    return [];
  }

  var oldestPublishedAtMs = Math.max(
    bootstrapStartedAtMs - YOUTUBE_BOOTSTRAP_LOOKBACK_MS,
    processedAtMs - YOUTUBE_BOOTSTRAP_MAX_AGE_MS,
  );
  var newestPublishedAtMs =
    processedAtMs + YOUTUBE_BOOTSTRAP_FUTURE_TOLERANCE_MS;

  return messages.filter(function (message) {
    return Boolean(
      message &&
        typeof message.publishedAtMs === "number" &&
        Number.isFinite(message.publishedAtMs) &&
        message.publishedAtMs >= oldestPublishedAtMs &&
        message.publishedAtMs <= newestPublishedAtMs,
    );
  });
}

function parseDeletedMessageIds(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  var deletedMessageIds = [];
  var seen = {};

  actions.forEach(function (action) {
    var messageId =
      action &&
      action.removeChatItemAction &&
      action.removeChatItemAction.targetItemId;

    if (!messageId || seen[messageId]) {
      return;
    }

    seen[messageId] = true;
    deletedMessageIds.push(messageId);
  });

  return deletedMessageIds;
}

function extractNextContinuation(continuations) {
  if (!Array.isArray(continuations)) {
    return {
      continuation: null,
      timeoutMs: null,
      ended: false,
    };
  }

  var ended = false;

  for (var i = 0; i < continuations.length; i++) {
    var continuationItem = continuations[i];

    if (
      continuationItem &&
      typeof continuationItem === "object" &&
      continuationItem.playerSeekContinuationData &&
      !Array.isArray(continuationItem.playerSeekContinuationData) &&
      typeof continuationItem.playerSeekContinuationData === "object" &&
      typeof continuationItem.playerSeekContinuationData.continuation ===
        "string" &&
      continuationItem.playerSeekContinuationData.continuation
    ) {
      // This known seek marker is explicit finished-chat evidence. Missing or
      // unfamiliar continuation shapes remain recoverable below.
      ended = true;
    }
  }

  var types = [
    "invalidationContinuationData",
    "timedContinuationData",
    "reloadContinuationData",
  ];

  for (var j = 0; j < continuations.length; j++) {
    var item = continuations[j];

    if (!item || typeof item !== "object") {
      continue;
    }

    for (var k = 0; k < types.length; k++) {
      var data = item[types[k]];

      if (data && data.continuation) {
        return {
          continuation: data.continuation,
          timeoutMs: typeof data.timeoutMs === "number" ? data.timeoutMs : null,
          ended: false,
        };
      }
    }
  }

  return {
    continuation: null,
    timeoutMs: null,
    ended: ended,
  };
}

function buildPollHeaders(session) {
  var headers = {
    "User-Agent": getBrowserHeaders()["User-Agent"],
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: "CONSENT=YES+1",
    Origin: "https://www.youtube.com",
    "X-YouTube-Client-Version": session.clientVersion,
  };

  if (session.clientName) {
    headers["X-YouTube-Client-Name"] = String(session.clientName);
  }

  var videoId =
    typeof session.videoId === "string" ? session.videoId.trim() : "";

  if (videoId) {
    headers.Referer =
      "https://www.youtube.com/live_chat?is_popout=1&hl=en&v=" +
      encodeURIComponent(videoId);
  }

  var visitorData =
    session.context &&
    session.context.client &&
    typeof session.context.client.visitorData === "string"
      ? session.context.client.visitorData
      : "";

  if (visitorData.trim()) {
    headers["X-Goog-Visitor-Id"] = visitorData;
  }

  return headers;
}

function isValidSession(session) {
  return Boolean(
    session &&
    typeof session.apiKey === "string" &&
    session.apiKey &&
    typeof session.clientVersion === "string" &&
    session.clientVersion &&
    session.context &&
    typeof session.context === "object",
  );
}

function createChatEndedError() {
  var error = new Error("YouTube live chat ended.");
  error.code = "youtube_chat_ended";

  return error;
}

function waitForPollRetry(delay) {
  return new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}

function getPollRetryDelay(attempt, softBlock) {
  var retryDelays = softBlock ? [1500, 3500] : [300, 900];

  return retryDelays[attempt - 1];
}

function isRetryablePollStatus(status) {
  return [429, 500, 502, 503, 504].indexOf(status) !== -1;
}

function isJsonContentType(contentType) {
  var mediaType = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  return /[\/+]json$/.test(mediaType);
}

function looksLikeHtml(contentType, body) {
  return Boolean(
    /\btext\/html\b/i.test(String(contentType || "")) ||
      /^\s*<(?:!doctype\s+html|html\b|head\b|body\b)/i.test(
        String(body || ""),
      ),
  );
}

function isYouTubeSoftBlock(status, contentType, body) {
  if (
    status !== 403 ||
    isJsonContentType(contentType) ||
    !looksLikeHtml(contentType, body)
  ) {
    return false;
  }

  var html = String(body || "");

  return Boolean(
    /<title>\s*Sorry(?:\.{3}|\u2026)\s*<\/title>/i.test(html) ||
      /\b(?:automated queries|unusual traffic from your computer network)\b/i.test(
        html,
      ),
  );
}

function getVisitorData(session) {
  var visitorData =
    session &&
    session.context &&
    session.context.client &&
    typeof session.context.client.visitorData === "string"
      ? session.context.client.visitorData
      : "";

  return visitorData;
}

function redactDiagnosticSecret(value, secret) {
  var result = value;

  if (typeof secret !== "string" || !secret) {
    return result;
  }

  var variants = [secret];

  try {
    variants.push(encodeURIComponent(secret));
  } catch (err) {
    // The unencoded value is still redacted below.
  }

  variants.forEach(function (variant) {
    if (variant) {
      result = result.split(variant).join("[redacted]");
    }
  });

  return result;
}

function sanitizePollDiagnostic(value, session, continuation, maxLength) {
  var sanitized = String(value || "");
  var secrets = [
    session && session.apiKey,
    continuation,
    getVisitorData(session),
  ];

  secrets.forEach(function (secret) {
    sanitized = redactDiagnosticSecret(sanitized, secret);
  });

  sanitized = sanitized.replace(
    /((?:"|')?(?:key|api[_-]?key|continuation|visitor(?:data|[_-]?id))(?:"|')?\s*(?:=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s,;&<>]+)/gi,
    "$1[redacted]",
  );

  return sanitized.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function createPollError(message, details) {
  var error = new Error(message);

  error.name = "YouTubePollError";
  error.stage = details.stage;
  error.status = details.status;
  error.contentType = details.contentType;
  error.retryAfter = details.retryAfter;
  error.html = Boolean(details.html);
  error.softBlock = Boolean(details.softBlock);
  error.bodyPrefix = details.bodyPrefix || "";
  error.retryable = Boolean(details.retryable);

  return error;
}

function logPollFailure(event, error, attempt, session, continuation, operation) {
  var warning = {
    event: event,
    attempt: attempt,
    status:
      error && typeof error.status === "number" ? error.status : null,
    contentType:
      error && error.contentType
        ? diagnosticContentType(
            sanitizePollDiagnostic(error.contentType, session, continuation, 100),
          )
        : null,
    retryAfter:
      error && error.retryAfter
        ? diagnosticRetryAfter(
            sanitizePollDiagnostic(error.retryAfter, session, continuation, 100),
          )
        : null,
    html: Boolean(error && error.html),
    softBlock: Boolean(error && error.softBlock),
    error: sanitizePollDiagnostic(
      error && error.message ? error.message : "YouTube chat poll failed.",
      session,
      continuation,
      160,
    ),
    stage: error && error.stage ? error.stage : "unknown",
  };

  if (shouldLogChatWarning(operation, session.videoId, warning)) {
    console.warn(warning);
  }
}

async function fetchPollData(session, continuation, pollUrl, requestBody) {
  var deadline = createYouTubeRequestDeadline();
  var pollResponse;
  var responseBody;

  try {
    pollResponse = await fetch(pollUrl, {
      method: "POST",
      headers: buildPollHeaders(session),
      body: requestBody,
      signal: deadline.controller.signal,
    });
    responseBody = await pollResponse.text();
  } catch (err) {
    var timedOut = deadline.controller.signal.aborted;
    var failedStatus = pollResponse ? pollResponse.status : null;
    var failedContentType = pollResponse
      ? pollResponse.headers.get("Content-Type") || null
      : null;
    var failedRetryAfter = pollResponse
      ? pollResponse.headers.get("Retry-After") || null
      : null;
    var failureMessage = "YouTube chat network request failed.";
    var failureStage = "fetch";

    if (timedOut) {
      failureMessage = "YouTube chat request timed out.";
      failureStage = "timeout";
    } else if (pollResponse) {
      failureMessage = "YouTube chat response body could not be read.";
      failureStage = "read";
    }

    throw createPollError(failureMessage, {
      stage: failureStage,
      status: failedStatus,
      contentType: failedContentType,
      retryAfter: failedRetryAfter,
      html: false,
      bodyPrefix: "",
      retryable:
        timedOut ||
        !pollResponse ||
        pollResponse.ok ||
        isRetryablePollStatus(failedStatus),
    });
  } finally {
    clearTimeout(deadline.timeout);
  }

  var status = pollResponse.status;
  var contentType = pollResponse.headers.get("Content-Type") || null;
  var retryAfter = pollResponse.headers.get("Retry-After") || null;

  var html = looksLikeHtml(contentType, responseBody);
  var softBlock = isYouTubeSoftBlock(status, contentType, responseBody);
  var bodyPrefix = sanitizePollDiagnostic(
    responseBody,
    session,
    continuation,
    200,
  );

  if (!pollResponse.ok) {
    throw createPollError(
      "YouTube chat request failed with HTTP " + status + ".",
      {
        stage: "http",
        status: status,
        contentType: contentType,
        retryAfter: retryAfter,
        html: html,
        softBlock: softBlock,
        bodyPrefix: bodyPrefix,
        retryable: isRetryablePollStatus(status) || softBlock,
      },
    );
  }

  if (html) {
    throw createPollError("YouTube chat returned an HTML response.", {
      stage: "content_type",
      status: status,
      contentType: contentType,
      retryAfter: retryAfter,
      html: true,
      bodyPrefix: bodyPrefix,
      retryable: true,
    });
  }

  var trimmedBody = responseBody.trim();
  var bodyStart = trimmedBody.charAt(0);
  var canSniffJson =
    !contentType && (bodyStart === "{" || bodyStart === "[");

  if (!isJsonContentType(contentType) && !canSniffJson) {
    throw createPollError("YouTube chat returned a non-JSON response.", {
      stage: "content_type",
      status: status,
      contentType: contentType,
      retryAfter: retryAfter,
      html: false,
      bodyPrefix: bodyPrefix,
      retryable: true,
    });
  }

  try {
    return JSON.parse(responseBody);
  } catch (err) {
    throw createPollError("YouTube chat returned invalid JSON.", {
      stage: "parse",
      status: status,
      contentType: contentType,
      retryAfter: retryAfter,
      html: false,
      bodyPrefix: bodyPrefix,
      retryable: true,
    });
  }
}

async function fetchChatBatch(session, continuation, operation) {
  var pollUrl =
    "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat" +
    "?prettyPrint=false&key=" +
    encodeURIComponent(session.apiKey);
  var requestBody = JSON.stringify({
    context: session.context,
    continuation: continuation,
  });
  var pollData;

  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      pollData = await fetchPollData(
        session,
        continuation,
        pollUrl,
        requestBody,
      );
      break;
    } catch (err) {
      logPollFailure(
        "youtube_chat_poll_attempt_failed",
        err,
        attempt,
        session,
        continuation,
        operation,
      );

      if (!err || !err.retryable || attempt === 3) {
        throw err;
      }

      await waitForPollRetry(
        getPollRetryDelay(attempt, Boolean(err && err.softBlock)),
      );
    }
  }

  var liveChatContinuation =
    pollData &&
    pollData.continuationContents &&
    pollData.continuationContents.liveChatContinuation;

  if (!liveChatContinuation) {
    throw createPollError("YouTube live-chat response was missing.", {
      stage: "response_shape",
      status: null,
    });
  }

  var next = extractNextContinuation(liveChatContinuation.continuations);

  if (next.ended) {
    throw createChatEndedError();
  }

  if (!next.continuation) {
    throw createPollError("YouTube returned no recognized next continuation.", {
      stage: "continuation",
      status: null,
    });
  }

  return {
    messages: parseTextMessages(liveChatContinuation.actions),
    deletedMessageIds: parseDeletedMessageIds(liveChatContinuation.actions),
    continuation: next.continuation,
    timeoutMs: next.timeoutMs || 1000,
    processedAtMs: Date.now(),
  };
}

export async function onRequestGet(context) {
  var requestUrl = new URL(context.request.url);
  var videoId = String(requestUrl.searchParams.get("video") || "").trim();

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return jsonResponse(
      {
        error: "Missing or invalid YouTube video ID.",
      },
      400,
    );
  }

  var bootstrapStartedAtMs = Date.now();

  var chatUrl =
    "https://www.youtube.com/live_chat?is_popout=1&hl=en&v=" +
    encodeURIComponent(videoId);
  var diagnostic = {
    stage: "chat_page_fetch",
    code: "network_error",
    status: null,
  };

  try {
    var deadline = createYouTubeRequestDeadline();
    var pageResponse;
    var html;

    try {
      pageResponse = await fetch(chatUrl, {
        headers: getBrowserHeaders(),
        signal: deadline.controller.signal,
      });

      diagnostic.status = pageResponse.status;
      diagnostic.contentType = pageResponse.headers.get("Content-Type");

      if (!pageResponse.ok) {
        diagnostic.stage = "chat_page_http";
        diagnostic.code = "http_error";
        logChatFailure(context, "bootstrap_get", videoId, diagnostic);
        return jsonResponse(
          {
            error: "YouTube returned an unexpected chat-page response.",
          },
          502,
        );
      }

      diagnostic.stage = "chat_page_read";
      diagnostic.code = "body_read_error";
      html = await pageResponse.text();
    } catch (err) {
      diagnostic.timedOut = deadline.controller.signal.aborted;

      if (diagnostic.timedOut) {
        diagnostic.code = "request_timeout";
      }

      throw err;
    } finally {
      clearTimeout(deadline.timeout);
    }

    diagnostic = {
      stage: "initial_data",
      code: "initial_data_missing",
      status: pageResponse.status,
    };
    var initialData = extractInitialData(html);

    if (initialData) {
      diagnostic.stage = "chat_filter";
      diagnostic.code = "chat_filter_missing";
    }

    var filterRenderer = findChatFilterRenderer(initialData);

    if (filterRenderer) {
      diagnostic.stage = "unfiltered_chat";
      diagnostic.code = "unfiltered_chat_missing";
    }

    var unfilteredChat = findUnfilteredChat(filterRenderer);

    if (!unfilteredChat) {
      logChatFailure(context, "bootstrap_get", videoId, diagnostic);
      return jsonResponse(
        {
          error: "The unfiltered YouTube chat feed was not found.",
        },
        502,
      );
    }

    diagnostic.stage = "innertube_config";
    diagnostic.code = "config_incomplete";
    var apiKey = extractStringField(html, "INNERTUBE_API_KEY");
    var clientVersion = extractStringField(html, "INNERTUBE_CLIENT_VERSION");
    var clientName = extractNumberField(html, "INNERTUBE_CONTEXT_CLIENT_NAME");
    var innertubeContext = extractInnertubeContext(html);

    if (!apiKey || !clientVersion || !innertubeContext) {
      diagnostic.apiKeyFound = Boolean(apiKey);
      diagnostic.clientVersionFound = Boolean(clientVersion);
      diagnostic.contextFound = Boolean(innertubeContext);
      logChatFailure(context, "bootstrap_get", videoId, diagnostic);
      return jsonResponse(
        {
          error: "YouTube Innertube configuration was incomplete.",
        },
        502,
      );
    }

    var session = {
      apiKey: apiKey,
      clientVersion: clientVersion,
      clientName: clientName,
      context: innertubeContext,
      videoId: videoId,
    };

    diagnostic = { stage: "initial_batch", code: "unexpected_error" };
    var firstBatch = await fetchChatBatch(
      session,
      unfilteredChat.continuation,
      "bootstrap_get",
    );

    return jsonResponse({
      videoId: videoId,
      feed: unfilteredChat.title,
      session: session,
      messages: filterRecentBootstrapMessages(
        firstBatch.messages,
        bootstrapStartedAtMs,
        firstBatch.processedAtMs,
      ),
      seenMessageIds: firstBatch.messages
        .map(function (message) {
          return message && message.id ? String(message.id) : null;
        })
        .filter(Boolean),
      deletedMessageIds: firstBatch.deletedMessageIds,
      continuation: firstBatch.continuation,
      timeoutMs: firstBatch.timeoutMs,
      processedAtMs: firstBatch.processedAtMs,
    });
  } catch (err) {
    var ended = err && err.code === "youtube_chat_ended";

    if (!ended) {
      logChatFailure(context, "bootstrap_get", videoId, diagnostic, err);
    }

    return jsonResponse(
      {
        error: ended
          ? "YouTube live chat ended."
          : "Could not retrieve YouTube live chat.",
        code: ended ? "youtube_chat_ended" : "youtube_chat_error",
        message: err && err.message ? err.message : String(err),
      },
      ended ? 410 : 502,
    );
  }
}

export async function onRequestPost(context) {
  var diagnostic = { stage: "request_read", code: "unexpected_error" };
  var diagnosticVideoId = null;

  try {
    var body = await context.request.json();
    var session = body && body.session;
    var continuation =
      body && typeof body.continuation === "string" ? body.continuation : "";

    if (!isValidSession(session) || !continuation) {
      return jsonResponse(
        {
          error: "Missing or invalid YouTube chat session.",
        },
        400,
      );
    }

    diagnosticVideoId = typeof session.videoId === "string" &&
      /^[a-zA-Z0-9_-]{11}$/.test(session.videoId)
      ? session.videoId
      : null;
    diagnostic = { stage: "poll_batch", code: "unexpected_error" };
    var batch = await fetchChatBatch(session, continuation, "continuation_post");

    return jsonResponse({
      messages: batch.messages,
      deletedMessageIds: batch.deletedMessageIds,
      continuation: batch.continuation,
      timeoutMs: batch.timeoutMs,
      processedAtMs: batch.processedAtMs,
    });
  } catch (err) {
    var ended = err && err.code === "youtube_chat_ended";

    if (!ended) {
      logChatFailure(
        context,
        "continuation_post",
        diagnosticVideoId,
        diagnostic,
        err,
      );
    }

    return jsonResponse(
      {
        error: ended
          ? "YouTube live chat ended."
          : "Could not retrieve YouTube live chat.",
        code: ended ? "youtube_chat_ended" : "youtube_chat_error",
        message: err && err.message ? err.message : String(err),
      },
      ended ? 410 : 502,
    );
  }
}
