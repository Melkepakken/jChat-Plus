function jsonResponse(body, status) {
  return new Response(JSON.stringify(body, null, 2), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
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

function getMessageText(message) {
  if (!message || !Array.isArray(message.runs)) {
    return "";
  }

  return message.runs
    .map(function (run) {
      return run && typeof run.text === "string" ? run.text : "";
    })
    .join("");
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
    var message = getMessageText(renderer.message);

    if (!displayName || !message) {
      return;
    }

    messages.push({
      id: renderer.id || null,
      userId: renderer.authorExternalChannelId || null,
      displayName: displayName,
      message: message,
    });
  });

  return messages;
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
    };
  }

  var types = [
    "invalidationContinuationData",
    "timedContinuationData",
    "reloadContinuationData",
  ];

  for (var i = 0; i < continuations.length; i++) {
    for (var j = 0; j < types.length; j++) {
      var data = continuations[i][types[j]];

      if (data && data.continuation) {
        return {
          continuation: data.continuation,
          timeoutMs: typeof data.timeoutMs === "number" ? data.timeoutMs : null,
        };
      }
    }
  }

  return {
    continuation: null,
    timeoutMs: null,
  };
}

function buildPollHeaders(session) {
  var headers = {
    "User-Agent": getBrowserHeaders()["User-Agent"],
    "Content-Type": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: "CONSENT=YES+1",
    "X-YouTube-Client-Version": session.clientVersion,
  };

  if (session.clientName) {
    headers["X-YouTube-Client-Name"] = String(session.clientName);
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

async function fetchChatBatch(session, continuation) {
  var pollUrl =
    "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat" +
    "?prettyPrint=false&key=" +
    encodeURIComponent(session.apiKey);

  var pollResponse = await fetch(pollUrl, {
    method: "POST",
    headers: buildPollHeaders(session),
    body: JSON.stringify({
      context: session.context,
      continuation: continuation,
    }),
  });

  if (!pollResponse.ok) {
    throw new Error(
      "YouTube chat request failed with HTTP " + pollResponse.status + ".",
    );
  }

  var pollData = await pollResponse.json();
  var liveChatContinuation =
    pollData &&
    pollData.continuationContents &&
    pollData.continuationContents.liveChatContinuation;

  if (!liveChatContinuation) {
    throw new Error("YouTube live-chat response was missing.");
  }

  var next = extractNextContinuation(liveChatContinuation.continuations);

  if (!next.continuation) {
    throw new Error("YouTube returned no next continuation.");
  }

  return {
    messages: parseTextMessages(liveChatContinuation.actions),
    deletedMessageIds: parseDeletedMessageIds(liveChatContinuation.actions),
    continuation: next.continuation,
    timeoutMs: next.timeoutMs || 1000,
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

  var chatUrl =
    "https://www.youtube.com/live_chat?is_popout=1&hl=en&v=" +
    encodeURIComponent(videoId);

  try {
    var pageResponse = await fetch(chatUrl, {
      headers: getBrowserHeaders(),
    });

    if (!pageResponse.ok) {
      return jsonResponse(
        {
          error: "YouTube returned an unexpected chat-page response.",
        },
        502,
      );
    }

    var html = await pageResponse.text();
    var initialData = extractInitialData(html);
    var filterRenderer = findChatFilterRenderer(initialData);
    var unfilteredChat = findUnfilteredChat(filterRenderer);

    if (!unfilteredChat) {
      return jsonResponse(
        {
          error: "The unfiltered YouTube chat feed was not found.",
        },
        502,
      );
    }

    var apiKey = extractStringField(html, "INNERTUBE_API_KEY");
    var clientVersion = extractStringField(html, "INNERTUBE_CLIENT_VERSION");
    var clientName = extractNumberField(html, "INNERTUBE_CONTEXT_CLIENT_NAME");
    var innertubeContext = extractInnertubeContext(html);

    if (!apiKey || !clientVersion || !innertubeContext) {
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
    };

    var firstBatch = await fetchChatBatch(session, unfilteredChat.continuation);

    return jsonResponse({
      videoId: videoId,
      feed: unfilteredChat.title,
      session: session,
      continuation: firstBatch.continuation,
      timeoutMs: firstBatch.timeoutMs,
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Could not retrieve YouTube live chat.",
        message: err && err.message ? err.message : String(err),
      },
      502,
    );
  }
}

export async function onRequestPost(context) {
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

    var batch = await fetchChatBatch(session, continuation);

    return jsonResponse({
      messages: batch.messages,
      deletedMessageIds: batch.deletedMessageIds,
      continuation: batch.continuation,
      timeoutMs: batch.timeoutMs,
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Could not retrieve YouTube live chat.",
        message: err && err.message ? err.message : String(err),
      },
      502,
    );
  }
}
