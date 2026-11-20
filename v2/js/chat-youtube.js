(function () {
  window.Chat = window.Chat || {};

  var YOUTUBE_REQUEST_TIMEOUT_MS = 60000;
  var YOUTUBE_MAX_TIMER_DELAY_MS = 2147483647;
  var YOUTUBE_CHAT_UNAVAILABLE_RETRY_DELAY_MS = 300000;
  var YOUTUBE_DISCOVERY_FAILURE_DELAYS = [15000, 30000, 60000, 120000, 300000];
  var YOUTUBE_BOOTSTRAP_RETRY_DELAYS = [5000, 15000];
  var YOUTUBE_RECOVERY_DELAYS = [
    5000,
    15000,
    30000,
    60000,
    120000,
    300000,
  ];
  var YOUTUBE_DIRECT_PROBE_FAILURE_DELAYS = [60000, 120000, 300000];
  var YOUTUBE_DIRECT_SAME_VIDEO_PROBE_DELAY_MS = 300000;
  var YOUTUBE_CHAT_ENDPOINT = "/api/youtube/chat";
  var retryDeadlines = new Map();
  var disabledChatVideos = new Set();

  function validRetryDelay(value, maxDelay) {
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 1000 &&
      value <= (maxDelay || YOUTUBE_MAX_TIMER_DELAY_MS)
      ? Math.ceil(value)
      : null;
  }

  function retryAfterHeaderDelay(value, maxDelay) {
    var input = String(value || "").trim();

    if (!input) {
      return null;
    }

    if (/^\d+$/.test(input)) {
      return validRetryDelay(Number(input) * 1000, maxDelay);
    }

    var retryAt = Date.parse(input);

    return Number.isFinite(retryAt)
      ? validRetryDelay(retryAt - Date.now(), maxDelay)
      : null;
  }

  function responseRetryDelay(retryAfterMs, retryAfterHeader, maxDelay) {
    var bodyDelay = validRetryDelay(retryAfterMs, maxDelay);
    var headerDelay = retryAfterHeaderDelay(retryAfterHeader, maxDelay);

    if (bodyDelay === null) {
      return headerDelay;
    }

    if (headerDelay === null) {
      return bodyDelay;
    }

    return Math.max(bodyDelay, headerDelay);
  }

  function remainingRetryDelay(key) {
    return Math.max(0, (retryDeadlines.get(key) || 0) - Date.now());
  }

  function rememberRetryDelay(deadlines, key, delay) {
    if (delay > 0) deadlines.set(key, Math.max(deadlines.get(key) || 0, Date.now() + delay));
  }

  function requestChat(url, options) {
    var deadlines = retryDeadlines;
    return requestJson(url, options).catch(function (error) {
      if (error.code !== "youtube_chat_unavailable" && error.code !== "youtube_chat_ended") {
        var delay = responseRetryDelay(error.retryAfterMs, error.retryAfter, Number.MAX_SAFE_INTEGER) ||
          (error.status === 429 ? 30000 : 0);
        rememberRetryDelay(deadlines, YOUTUBE_CHAT_ENDPOINT, delay);
      }
      throw error;
    });
  }

  function requestDiscovery(handle, controller) {
    var deadlines = retryDeadlines;
    var key = handle.toLowerCase();
    return requestJson("/api/youtube/live?handle=" + encodeURIComponent(handle), null, controller)
      .then(validatedDiscoveryResponse)
      .then(function (discovery) {
        rememberRetryDelay(deadlines, key, discovery.retryAfterMs);
        return discovery;
      })
      .catch(function (error) {
        var delay = responseRetryDelay(error.retryAfterMs, error.retryAfter, Number.MAX_SAFE_INTEGER);
        rememberRetryDelay(deadlines, key, delay);
        throw error;
      });
  }

  function setYouTubeTimer(field, callback, delay) {
    clearTimeout(Chat.info[field]);
    var remaining = getPollDelay(delay);
    function arm() {
      var step = Math.min(remaining, YOUTUBE_MAX_TIMER_DELAY_MS);
      remaining -= step;
      Chat.info[field] = setTimeout(remaining > 0 ? arm : function () {
        Chat.info[field] = null;
        callback();
      }, step);
    }
    arm();
  }

  function attachRetryAfterHeader(data, retryAfterHeader) {
    if (!data || typeof data !== "object" || !retryAfterHeader) {
      return;
    }

    Object.defineProperty(data, "_youtubeRetryAfter", {
      configurable: true,
      enumerable: false,
      value: retryAfterHeader,
    });
  }

  function requestJson(url, options, requestController) {
    var controller = requestController || new AbortController();
    var requestHeaders = Object.assign(
      {},
      (options && options.headers) || {},
      {
        "X-JChat-Client-Version": Chat.version,
      },
    );
    var requestOptions = Object.assign({}, options || {}, {
      headers: requestHeaders,
      signal: controller.signal,
    });
    var timedOut = false;
    var timeoutId = setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, YOUTUBE_REQUEST_TIMEOUT_MS);
    var request = fetch(url, requestOptions).then(function (response) {
      var contentType = String(
        response.headers.get("Content-Type") || "",
      ).trim();
      var retryAfterHeader = response.headers.get("Retry-After");

      return response.text().then(function (body) {
        var mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
        var trimmedBody = body.trim();
        var bodyStart = trimmedBody.charAt(0);
        var shouldParseJson =
          /[\/+]json$/.test(mediaType) ||
          (!contentType && (bodyStart === "{" || bodyStart === "["));

        if (!shouldParseJson) {
          var nonJsonError = new Error(
            "YouTube endpoint returned HTTP " +
              response.status +
              " with a non-JSON response.",
          );

          nonJsonError.status = response.status;
          nonJsonError.retryAfter = retryAfterHeader;

          throw nonJsonError;
        }

        var data;

        try {
          data = JSON.parse(body);
        } catch (err) {
          var parseError = new Error(
            "YouTube endpoint returned HTTP " +
              response.status +
              " with invalid JSON.",
          );

          parseError.status = response.status;
          parseError.retryAfter = retryAfterHeader;

          throw parseError;
        }

        if (!response.ok) {
          var message =
            data && (data.message || data.error)
              ? data.message || data.error
              : "YouTube request failed.";
          var error = new Error(message);

          error.status = response.status;
          error.code =
            data && typeof data.code !== "undefined" ? data.code : null;
          error.reason = data && data.reason;
          error.retryAfterMs =
            data && typeof data.retryAfterMs !== "undefined"
              ? data.retryAfterMs
              : null;
          error.retryAfter = retryAfterHeader;

          throw error;
        }

        attachRetryAfterHeader(data, retryAfterHeader);
        return data;
      });
    });

    return request.then(
      function (data) {
        clearTimeout(timeoutId);
        return data;
      },
      function (err) {
        clearTimeout(timeoutId);

        if (timedOut) {
          var timeoutError = new Error("YouTube request timed out.");

          timeoutError.code = "youtube_request_timeout";
          throw timeoutError;
        }

        throw err;
      },
    );
  }

  function getPollDelay(value) {
    var delay = parseInt(value, 10);

    if (Number.isNaN(delay)) {
      return 1000;
    }

    return Math.max(500, delay);
  }

  var YOUTUBE_IMMEDIATE_BATCH_LIMIT = 3;
  var YOUTUBE_MAX_DELIVERY_SPACING_MS = 250;
  var YOUTUBE_DELIVERY_WINDOW_RATIO = 0.8;

  function getYouTubeDeliverySpacing(messageCount, timeoutMs) {
    if (messageCount <= YOUTUBE_IMMEDIATE_BATCH_LIMIT) {
      return 0;
    }

    var continuationTimeout = parseInt(timeoutMs, 10);

    if (Number.isNaN(continuationTimeout) || continuationTimeout < 0) {
      continuationTimeout = 1000;
    }

    return Math.min(
      YOUTUBE_MAX_DELIVERY_SPACING_MS,
      (continuationTimeout * YOUTUBE_DELIVERY_WINDOW_RATIO) /
        (messageCount - 1),
    );
  }

  function getYouTubeVideoId(value) {
    var input = String(value || "").trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input;
    }

    try {
      var url = new URL(
        /^https?:\/\//i.test(input) ? input : "https://" + input,
      );
      var hostname = url.hostname.toLowerCase();
      var videoId = null;

      if (hostname === "youtu.be") {
        videoId = url.pathname.split("/").filter(Boolean)[0];
      } else if (
        hostname === "youtube.com" ||
        hostname === "www.youtube.com" ||
        hostname === "m.youtube.com"
      ) {
        videoId = url.searchParams.get("v");

        if (!videoId) {
          var parts = url.pathname.split("/").filter(Boolean);

          if (
            parts[0] === "live" ||
            parts[0] === "embed" ||
            parts[0] === "shorts"
          ) {
            videoId = parts[1];
          }
        }
      }

      return /^[a-zA-Z0-9_-]{11}$/.test(videoId || "") ? videoId : null;
    } catch (err) {
      return null;
    }
  }

  function normalizeYouTubeHandle(value) {
    var input = String(value || "").trim();

    if (!input) {
      return null;
    }

    try {
      var url = new URL(
        /^https?:\/\//i.test(input) ? input : "https://" + input,
      );
      var hostname = url.hostname.toLowerCase();

      if (
        hostname === "youtube.com" ||
        hostname === "www.youtube.com" ||
        hostname === "m.youtube.com"
      ) {
        var match = url.pathname.match(/^\/@([^/?#]+)/);

        if (match) {
          input = match[1];
        }
      }
    } catch (err) {
      // Treat the value as a plain handle.
    }

    input = input.replace(/^@+/, "");

    return /^[a-zA-Z0-9._-]+$/.test(input) ? input : null;
  }

  function isSameChannelAlias(value) {
    return /^(true|1|yes|same|channel|kick)$/i.test(String(value || "").trim());
  }

  function isYouTubeDisabled(value) {
    return /^(false|0|no|off|disabled)$/i.test(String(value || "").trim());
  }

  function getConfiguredYouTubeHandle() {
    var value = Chat.info.youtubeOption;

    if (
      Chat.info.youtubeDisabled ||
      Chat.info.youtubeHandleUnavailable ||
      !value
    ) {
      return null;
    }

    if (!isSameChannelAlias(value)) {
      return normalizeYouTubeHandle(value);
    }

    var kickChannel = Chat.info.kickChannel;

    if (
      kickChannel !== false &&
      kickChannel !== null &&
      kickChannel !== undefined
    ) {
      var normalizedKick = String(kickChannel).trim();

      if (
        normalizedKick &&
        !/^(true|1|yes|same|channel|twitch|kick)$/i.test(normalizedKick)
      ) {
        return normalizeYouTubeHandle(normalizedKick);
      }
    }

    return normalizeYouTubeHandle(Chat.info.channel);
  }

  function markYouTubeHandleUnavailable() {
    if (Chat.info.youtubeHandleUnavailable) {
      return;
    }

    // Keep this page-lifetime decision across connection resets and stops.
    Chat.info.youtubeHandleUnavailable = true;
    Chat.info.youtubeHandle = false;

    console.warn(
      "jChat YouTube: Channel unavailable for automatic discovery; disabled until reload",
    );
  }

  function skipDisabledChat(videoId, source) {
    if (!disabledChatVideos.has(videoId)) {
      disabledChatVideos.add(videoId);
      console.warn("jChat YouTube: Chat is disabled for video " + videoId +
        ". Skipping this video until you reload the overlay.");
    }
    Chat.info.youtubeFailedHandleBootstrap = null;
    Chat.resetYouTubeConnection();
    Chat.info.youtubeActiveSource = null;
    if (source === "video") {
      Chat.info.youtubeDirectVideoPending = false;
      Chat.connectYouTube();
    } else {
      Chat.scheduleYouTubeResolve(YOUTUBE_CHAT_UNAVAILABLE_RETRY_DELAY_MS);
    }
  }

  function validatedDiscoveryResponse(data) {
    function invalidResponse() {
      var error = new Error("YouTube discovery returned an invalid response.");

      if (data && typeof data === "object") {
        error.retryAfterMs = data.retryAfterMs;
        error.retryAfter = data._youtubeRetryAfter;
      }

      throw error;
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      invalidResponse();
    }

    if (data.live === false) {
      return {
        live: false,
        retryAfterMs: responseRetryDelay(
          data.retryAfterMs,
          data._youtubeRetryAfter,
          Number.MAX_SAFE_INTEGER,
        ),
      };
    }

    if (
      data.live === true &&
      /^[a-zA-Z0-9_-]{11}$/.test(data.videoId || "")
    ) {
      return { live: true, videoId: data.videoId };
    }

    invalidResponse();
  }

  function nextDiscoveryFailureDelay(handle) {
    var failureIndex = Math.min(
      Chat.info.youtubeDiscoveryFailureCount,
      YOUTUBE_DISCOVERY_FAILURE_DELAYS.length - 1,
    );
    var fallbackDelay = YOUTUBE_DISCOVERY_FAILURE_DELAYS[failureIndex];

    Chat.info.youtubeDiscoveryFailureCount = Math.min(
      Chat.info.youtubeDiscoveryFailureCount + 1,
      YOUTUBE_DISCOVERY_FAILURE_DELAYS.length,
    );

    return remainingRetryDelay(handle.toLowerCase()) || fallbackDelay;
  }

  function nextDirectProbeFailureDelay(handle) {
    var failureIndex = Math.min(
      Chat.info.youtubeDirectProbeFailureCount,
      YOUTUBE_DIRECT_PROBE_FAILURE_DELAYS.length - 1,
    );
    var fallbackDelay = YOUTUBE_DIRECT_PROBE_FAILURE_DELAYS[failureIndex];

    Chat.info.youtubeDirectProbeFailureCount = Math.min(
      Chat.info.youtubeDirectProbeFailureCount + 1,
      YOUTUBE_DIRECT_PROBE_FAILURE_DELAYS.length,
    );

    return remainingRetryDelay(handle.toLowerCase()) || fallbackDelay;
  }

  function isCurrentDirectRecovery(recoveryGeneration, videoId, handle) {
    return (
      recoveryGeneration === Chat.info.youtubeDirectRecoveryGeneration &&
      !Chat.info.preview &&
      Chat.info.youtubeDirectVideoPending &&
      Chat.info.youtubeDirectVideoId === videoId &&
      Chat.info.youtubeActiveSource === "video" &&
      getConfiguredYouTubeHandle() === handle
    );
  }

  var youtubeOptionProvided = "youtube" in $.QueryString;
  var youtubeOption = youtubeOptionProvided
    ? String($.QueryString.youtube || "").trim()
    : false;
  var youtubeDisabled =
    youtubeOptionProvided && isYouTubeDisabled(youtubeOption);
  var youtubeDirectVideoId =
    !youtubeDisabled && "youtube_video" in $.QueryString
      ? getYouTubeVideoId($.QueryString.youtube_video)
      : null;
  var youtubeDebug =
    "youtube_debug" in $.QueryString &&
    String($.QueryString.youtube_debug || "").trim().toLowerCase() === "true";

  $.extend(Chat.info, {
    youtubeOption: youtubeOption,
    youtubeDisabled: youtubeDisabled,
    youtubeHandle: false,
    youtubeHandleUnavailable: false,
    youtubeDirectVideoId: youtubeDirectVideoId,
    youtubeDirectVideoPending: Boolean(youtubeDirectVideoId),
    youtubeActiveSource: null,
    youtubeVideoId: null,
    youtubeSession: null,
    youtubeContinuation: null,
    youtubePollTimer: null,
    youtubeResolveTimer: null,
    youtubePendingDeliveries: [],
    youtubeDeliveryTimer: null,
    youtubeConnectionGeneration: 0,
    youtubePolling: false,
    youtubeResolving: false,
    youtubeConnectionLost: false,
    youtubePollFailureCount: 0,
    youtubeDiscoveryFailureCount: 0,
    youtubeBootstrapFailureCount: 0,
    youtubeFailedHandleBootstrap: null,
    youtubeEndedVideoId: null,
    youtubeDirectProbeAllowedAt: 0,
    youtubeDirectProbeFailureCount: 0,
    youtubeDirectProbeInFlight: false,
    youtubeDirectProbeController: null,
    youtubeDirectRecoveryGeneration: 0,
    youtubeReconnectDelay: 5000,
    youtubeDiscoveryDelay: 30000,
    youtubeDebug: youtubeDebug,
    youtubePendingLatency: {},
    youtubeLatencyObserver: null,
    youtubeRecentVideoId: null,
    youtubeRecentMessageIds: {},
    youtubeRecentMessageOrder: [],
    youtubeRecentMessageLimit: 300,
  });

  $.extend(Chat, {
    getYouTubeNameColor: function (name) {
      var value = String(name || "youtube")
        .trim()
        .toLowerCase();

      var hash = 0;

      for (var i = 0; i < value.length; i++) {
        // Based on Datagutt's BetterYTL username colour hashing.
        // This is effectively: hash * 31 + the current character.
        hash = value.charCodeAt(i) + ((hash << 5) - hash);

        hash |= 0;
      }

      var hue = ((hash % 360) + 360) % 360;

      return "hsl(" + hue + ", 75%, 60%)";
    },

    getYouTubeDisplayName: function (value) {
      return String(value || "")
        .trim()
        .replace(/^@+/, "");
    },

    shouldShowYouTubeMessage: function (data) {
      if (!data) {
        return false;
      }

      var displayName = Chat.getYouTubeDisplayName(data.displayName);
      var nick = displayName.toLowerCase();
      var message = String(data.message || "");

      if (!displayName || !message) {
        return false;
      }

      if (Chat.isUserBlocked(nick) || Chat.isUserBlocked(displayName)) {
        return false;
      }

      if (!Chat.info.showBots && Chat.info.bots.includes(nick)) {
        return false;
      }

      if (Chat.info.hideCommands && /^!.+/.test(message)) {
        return false;
      }

      return true;
    },

    registerYouTubeEmotes: function (emotes) {
      if (!emotes || typeof emotes !== "object") {
        return;
      }

      Object.keys(emotes).forEach(function (token) {
        var emote = emotes[token];

        if (
          !token ||
          !emote ||
          typeof emote.image !== "string" ||
          !/^https:\/\//i.test(emote.image)
        ) {
          return;
        }

        Chat.info.emotes[token] = {
          image: emote.image,
          zeroWidth: false,
          youtube: true,
          label: typeof emote.label === "string" ? emote.label : "",
        };
      });
    },

    writeYouTubeMessage: function (data, timing) {
      if (!data) return;

      if (!Chat.shouldShowYouTubeMessage(data)) {
        return;
      }

      var displayName = Chat.getYouTubeDisplayName(data.displayName);
      var message = String(data.message || "");

      Chat.registerYouTubeEmotes(data.emotes);

      var nick = displayName.toLowerCase();
      var safeDisplayName = $("<div>").text(displayName).html();
      var messageId =
        data.id ||
        "test-" + Date.now() + "-" + Math.random().toString(36).slice(2);

      var info = {
        id: "youtube:" + messageId,
        "display-name": safeDisplayName,
        "user-id": data.userId ? "youtube:" + data.userId : null,
        color: Chat.getYouTubeNameColor(displayName),
        badges: null,
        emotes: null,
        mod: "0",
        bits: "0",
        platform: "youtube",
      };

      if (Chat.info.deletedMessages[info.id]) {
        return;
      }

      if (Chat.info.youtubeDebug && timing) {
        Chat.trackYouTubeLatency(data, timing, info.id, Date.now());
      }

      Chat.write(nick, info, message);
    },

    debugYouTubeLatency: function (timing, renderedAtMs) {
      if (
        !Chat.info.youtubeDebug ||
        !timing ||
        !window.console ||
        typeof window.console.debug !== "function"
      ) {
        return;
      }

      function elapsed(start, end) {
        return typeof start === "number" && typeof end === "number"
          ? end - start
          : null;
      }

      window.console.debug("jChat YouTube latency", {
        event: "youtube_message_latency",
        messageId: timing.messageId,
        source: timing.source,
        publishedAtMs: timing.publishedAtMs,
        upstreamProcessedAtMs: timing.upstreamProcessedAtMs,
        browserArrivedAtMs: timing.browserArrivedAtMs,
        renderQueuedAtMs: timing.renderQueuedAtMs,
        renderedAtMs: renderedAtMs,
        publicationToArrivalMs: elapsed(
          timing.publishedAtMs,
          timing.browserArrivedAtMs,
        ),
        arrivalToRenderQueueMs: elapsed(
          timing.browserArrivedAtMs,
          timing.renderQueuedAtMs,
        ),
        arrivalToRenderMs: elapsed(
          timing.browserArrivedAtMs,
          renderedAtMs,
        ),
      });
    },

    captureYouTubeRenderedLine: function (line) {
      if (!Chat.info.youtubeDebug) {
        return;
      }

      var container = document.getElementById("chat_container");

      if (!line || !container || !container.contains(line)) {
        return;
      }

      var messageId = line.getAttribute("data-id");
      var timing = Chat.info.youtubePendingLatency[messageId];

      if (!timing) {
        return;
      }

      delete Chat.info.youtubePendingLatency[messageId];
      Chat.debugYouTubeLatency(timing, Date.now());
    },

    ensureYouTubeLatencyObserver: function () {
      if (!Chat.info.youtubeDebug) {
        return false;
      }

      if (Chat.info.youtubeLatencyObserver) {
        return true;
      }

      var container = document.getElementById("chat_container");

      if (!container || typeof window.MutationObserver !== "function") {
        return false;
      }

      Chat.info.youtubeLatencyObserver = new window.MutationObserver(
        function (mutations) {
          mutations.forEach(function (mutation) {
            Array.prototype.forEach.call(
              mutation.addedNodes || [],
              function (node) {
                if (!node || node.nodeType !== 1) {
                  return;
                }

                if (node.matches && node.matches(".chat_line")) {
                  Chat.captureYouTubeRenderedLine(node);
                }

                if (node.querySelectorAll) {
                  Array.prototype.forEach.call(
                    node.querySelectorAll(".chat_line"),
                    Chat.captureYouTubeRenderedLine,
                  );
                }
              },
            );
          });
        },
      );

      Chat.info.youtubeLatencyObserver.observe(container, {
        childList: true,
        subtree: true,
      });

      return true;
    },

    trackYouTubeLatency: function (
      data,
      timing,
      messageId,
      renderQueuedAtMs,
    ) {
      if (!Chat.info.youtubeDebug || !timing || !messageId) {
        return;
      }

      var publishedAtMs =
        typeof data.publishedAtMs === "number" &&
        Number.isFinite(data.publishedAtMs)
          ? data.publishedAtMs
          : null;
      var upstreamProcessedAtMs =
        typeof timing.processedAtMs === "number" &&
        Number.isFinite(timing.processedAtMs)
          ? timing.processedAtMs
          : null;
      var browserArrivedAtMs =
        typeof timing.arrivedAtMs === "number" &&
        Number.isFinite(timing.arrivedAtMs)
          ? timing.arrivedAtMs
          : null;
      var latency = {
        messageId: messageId,
        source: timing.source || "poll",
        publishedAtMs: publishedAtMs,
        upstreamProcessedAtMs: upstreamProcessedAtMs,
        browserArrivedAtMs: browserArrivedAtMs,
        renderQueuedAtMs: renderQueuedAtMs,
      };

      if (!Chat.ensureYouTubeLatencyObserver()) {
        Chat.debugYouTubeLatency(latency, null);
        return;
      }

      var pendingIds = Object.keys(Chat.info.youtubePendingLatency);

      while (pendingIds.length >= Chat.info.youtubeRecentMessageLimit) {
        delete Chat.info.youtubePendingLatency[pendingIds.shift()];
      }

      Chat.info.youtubePendingLatency[messageId] = latency;
    },

    connectYouTube: function () {
      var directVideoId = Chat.info.youtubeDirectVideoPending
        ? Chat.info.youtubeDirectVideoId
        : null;
      var handle = getConfiguredYouTubeHandle();

      Chat.info.youtubeHandle = handle || false;

      if (
        (!directVideoId && !handle) ||
        Chat.info.preview ||
        Chat.info.youtubeResolving ||
        Chat.info.youtubeDirectProbeInFlight ||
        Chat.info.youtubeSession
      ) {
        return;
      }

      var remaining = directVideoId ? 0 : remainingRetryDelay(handle.toLowerCase());
      if (remaining > 0) {
        Chat.scheduleYouTubeResolve(remaining);
        return;
      }

      if (Chat.info.youtubeResolveTimer) {
        clearTimeout(Chat.info.youtubeResolveTimer);
        Chat.info.youtubeResolveTimer = null;
      }

      Chat.info.youtubeResolving = true;

      if (directVideoId) {
        Chat.info.youtubeResolving = false;
        Chat.info.youtubeActiveSource = "video";
        Chat.info.youtubeVideoId = directVideoId;

        console.log(
          "jChat YouTube: Connecting directly to video " + directVideoId,
        );

        Chat.bootstrapYouTubeChat(directVideoId, "video");
        return;
      }

      Chat.info.youtubeActiveSource = "handle";
      var connectionGeneration = Chat.info.youtubeConnectionGeneration;

      console.log("jChat YouTube: Resolving @" + handle);

      requestDiscovery(handle)
        .then(function (discovery) {
          if (
            connectionGeneration !== Chat.info.youtubeConnectionGeneration
          ) {
            return;
          }

          Chat.info.youtubeResolving = false;
          Chat.info.youtubeDiscoveryFailureCount = 0;

          if (!discovery.live) {
            console.log("jChat YouTube: @" + handle + " is not live");
            Chat.scheduleYouTubeResolve(
              discovery.retryAfterMs || Chat.info.youtubeDiscoveryDelay,
            );
            return;
          }

          if (discovery.videoId === Chat.info.youtubeEndedVideoId) {
            Chat.scheduleYouTubeResolve(Chat.info.youtubeDiscoveryDelay);
            return;
          }
          var failed = Chat.info.youtubeFailedHandleBootstrap;
          var sameVideo = failed && failed.videoId === discovery.videoId;
          if (sameVideo && failed.retryAt > Date.now()) {
            Chat.scheduleYouTubeResolve(Math.min(failed.retryAt - Date.now(), Chat.info.youtubeDiscoveryDelay));
            return;
          }
          Chat.info.youtubeVideoId = discovery.videoId;
          Chat.bootstrapYouTubeChat(discovery.videoId, "handle", sameVideo ? failed.attempt : 0);
        })
        .catch(function (err) {
          if (
            connectionGeneration !== Chat.info.youtubeConnectionGeneration
          ) {
            return;
          }

          Chat.info.youtubeResolving = false;

          if (err && err.code === "youtube_channel_unavailable") {
            markYouTubeHandleUnavailable();
            Chat.resetYouTubeConnection();
            Chat.info.youtubeActiveSource = null;
            return;
          }

          var retryDelay = nextDiscoveryFailureDelay(handle);

          console.warn(
            "jChat YouTube: Live broadcast lookup failed, retrying",
            err,
          );

          Chat.scheduleYouTubeResolve(retryDelay);
        });
    },

    scheduleYouTubeResolve: function (delay) {
      var hasDirectVideo = Boolean(
        Chat.info.youtubeDirectVideoPending && Chat.info.youtubeDirectVideoId,
      );
      var handle = getConfiguredYouTubeHandle();

      if ((!hasDirectVideo && !handle) || Chat.info.preview) {
        return;
      }

      setYouTubeTimer("youtubeResolveTimer", Chat.connectYouTube, delay);
    },

    scheduleYouTubeBootstrap: function (
      videoId,
      source,
      retryAttempt,
      delay,
      probeAtRetry,
    ) {
      var normalizedVideoId = getYouTubeVideoId(videoId);

      if (
        !normalizedVideoId ||
        (source !== "handle" && source !== "video") ||
        Chat.info.preview
      ) {
        return;
      }

      var connectionGeneration = Chat.info.youtubeConnectionGeneration;

      setYouTubeTimer("youtubeResolveTimer", function () {
        if (
          connectionGeneration !== Chat.info.youtubeConnectionGeneration ||
          Chat.info.preview ||
          Chat.info.youtubeSession ||
          (source === "video" &&
            (!Chat.info.youtubeDirectVideoPending ||
              Chat.info.youtubeDirectVideoId !== normalizedVideoId))
        ) {
          return;
        }

        Chat.bootstrapYouTubeChat(normalizedVideoId, source, retryAttempt);
        if (probeAtRetry) Chat.probeYouTubeFallback(normalizedVideoId);
      }, delay);
    },

    clearYouTubeDirectRecovery: function () {
      if (Chat.info.youtubeDirectProbeController) {
        Chat.info.youtubeDirectProbeController.abort();
      }

      Chat.info.youtubeDirectProbeAllowedAt = 0;
      Chat.info.youtubeDirectProbeFailureCount = 0;
      Chat.info.youtubeDirectProbeInFlight = false;
      Chat.info.youtubeDirectProbeController = null;
      Chat.info.youtubeDirectRecoveryGeneration++;
    },

    probeYouTubeFallback: function (videoId) {
      var normalizedVideoId = getYouTubeVideoId(videoId);
      var handle = getConfiguredYouTubeHandle();

      if (
        !normalizedVideoId ||
        !handle ||
        Chat.info.preview ||
        !Chat.info.youtubeDirectVideoPending ||
        Chat.info.youtubeDirectVideoId !== normalizedVideoId ||
        Chat.info.youtubeDirectProbeInFlight ||
        remainingRetryDelay(handle.toLowerCase()) > 0 ||
        Date.now() < Chat.info.youtubeDirectProbeAllowedAt
      ) {
        return;
      }

      var recoveryGeneration = Chat.info.youtubeDirectRecoveryGeneration;
      var probeController = new AbortController();
      Chat.info.youtubeDirectProbeInFlight = true;
      Chat.info.youtubeDirectProbeController = probeController;

      console.log(
        "jChat YouTube: Direct chat could not start; checking fallback @" +
          handle,
      );

      requestDiscovery(handle, probeController)
        .then(function (discovery) {
          if (
            !isCurrentDirectRecovery(
              recoveryGeneration,
              normalizedVideoId,
              handle,
            )
          ) {
            return;
          }

          Chat.info.youtubeDirectProbeInFlight = false;
          Chat.info.youtubeDirectProbeController = null;

          if (discovery.live && discovery.videoId !== normalizedVideoId && !disabledChatVideos.has(discovery.videoId)) {
            console.log(
              "jChat YouTube: Fallback handle found a different live video; switching",
            );

            Chat.info.youtubeDirectVideoPending = false;
            Chat.clearYouTubeDirectRecovery();
            Chat.bootstrapYouTubeChat(discovery.videoId, "handle");
            return;
          }

          Chat.info.youtubeDirectProbeFailureCount = 0;

          if (discovery.live) {
            Chat.info.youtubeDirectProbeAllowedAt =
              Date.now() + YOUTUBE_DIRECT_SAME_VIDEO_PROBE_DELAY_MS;

            console.log(
              "jChat YouTube: Fallback handle has no other usable chat; keeping direct video",
            );
            return;
          }

          var retryDelay = discovery.retryAfterMs;

          if (retryDelay === null) {
            retryDelay = nextDirectProbeFailureDelay(handle);
          }

          Chat.info.youtubeDirectProbeAllowedAt = Date.now() + retryDelay;

          console.log(
            "jChat YouTube: Fallback handle is offline; keeping direct video",
          );
        })
        .catch(function (err) {
          if (
            !isCurrentDirectRecovery(
              recoveryGeneration,
              normalizedVideoId,
              handle,
            )
          ) {
            return;
          }

          Chat.info.youtubeDirectProbeInFlight = false;
          Chat.info.youtubeDirectProbeController = null;

          if (err && err.code === "youtube_channel_unavailable") {
            markYouTubeHandleUnavailable();
            Chat.clearYouTubeDirectRecovery();
            return;
          }

          var retryDelay = nextDirectProbeFailureDelay(handle);
          Chat.info.youtubeDirectProbeAllowedAt = Date.now() + retryDelay;

          console.warn(
            "jChat YouTube: Fallback handle lookup failed; keeping direct video",
            err,
          );
        });
    },

    bootstrapYouTubeChat: function (videoId, source, retryAttempt) {
      var bootstrapAttempt =
        Number.isInteger(retryAttempt) && retryAttempt >= 0
          ? retryAttempt
          : 0;
      var activeSource =
        source || Chat.info.youtubeActiveSource || "video";
      if (disabledChatVideos.has(videoId)) {
        skipDisabledChat(videoId, activeSource);
        return;
      }
      var preserveDirectRecovery =
        activeSource === "video" &&
        Chat.info.youtubeDirectVideoPending &&
        Chat.info.youtubeDirectVideoId === getYouTubeVideoId(videoId);

      Chat.resetYouTubeConnection(preserveDirectRecovery);
      Chat.info.youtubeVideoId = videoId;
      Chat.info.youtubeBootstrapFailureCount = bootstrapAttempt;
      var connectionGeneration = Chat.info.youtubeConnectionGeneration;

      Chat.info.youtubeActiveSource = activeSource;

      var remaining = remainingRetryDelay(YOUTUBE_CHAT_ENDPOINT);
      if (remaining > 0) {
        Chat.scheduleYouTubeBootstrap(videoId, activeSource, bootstrapAttempt, remaining);
        return;
      }

      return requestChat(
        YOUTUBE_CHAT_ENDPOINT + "?video=" + encodeURIComponent(videoId),
        { headers: { "X-JChat-Accept-Chat-State": "disabled" } },
      )
        .then(function (chatData) {
          if (
            connectionGeneration !== Chat.info.youtubeConnectionGeneration
          ) {
            return;
          }

          if (chatData && chatData.chatState === "disabled" && chatData.videoId === videoId) {
            skipDisabledChat(videoId, activeSource);
            return;
          }

          var timing = Chat.info.youtubeDebug
            ? {
                source: "bootstrap",
                processedAtMs: chatData.processedAtMs,
                arrivedAtMs: Date.now(),
              }
            : null;
          var feed = String(chatData.feed || "").toLowerCase();

          if (feed !== "live chat" && feed !== "all chat") {
            throw new Error("YouTube did not return the unfiltered chat feed.");
          }

          if (!chatData.session || !chatData.continuation) {
            throw new Error("YouTube chat bootstrap data was incomplete.");
          }

          Chat.info.youtubeSession = chatData.session;
          Chat.info.youtubeContinuation = chatData.continuation;

          if (Chat.info.youtubeRecentVideoId !== videoId) {
            Chat.info.youtubeRecentVideoId = videoId;
            Chat.info.youtubeRecentMessageIds = {};
            Chat.info.youtubeRecentMessageOrder = [];
          }

          var bootstrapMessages = Chat.filterNewYouTubeMessages(
            chatData.messages,
          );

          Chat.rememberYouTubeMessageIds(chatData.seenMessageIds);

          Chat.writeYouTubeMessages(
            bootstrapMessages,
            timing,
            chatData.timeoutMs,
          );

          if (Array.isArray(chatData.deletedMessageIds)) {
            chatData.deletedMessageIds.forEach(function (messageId) {
              Chat.removeYouTubeMessage(messageId);
            });
          }

          Chat.info.youtubePollFailureCount = 0;
          Chat.info.youtubeBootstrapFailureCount = 0;
          Chat.info.youtubeFailedHandleBootstrap = null;
          Chat.info.youtubeConnectionLost = false;

          if (activeSource === "video") {
            Chat.clearYouTubeDirectRecovery();
          }

          console.log(
            "jChat YouTube: Connected to " +
              chatData.feed +
              " for video " +
              videoId,
          );

          Chat.scheduleYouTubePoll(chatData.timeoutMs);
        })
        .catch(function (err) {
          if (
            connectionGeneration !== Chat.info.youtubeConnectionGeneration
          ) {
            return;
          }

          if (err && err.code === "youtube_chat_ended") {
            Chat.handleYouTubeChatEnded();
            return;
          }

          if (err && err.code === "youtube_chat_unavailable") {
            if (err.reason === "chat_disabled") {
              skipDisabledChat(videoId, activeSource);
              return;
            }
            var unavailableDelay = responseRetryDelay(
              err.retryAfterMs,
              err.retryAfter,
            );

            if (unavailableDelay === null) {
              unavailableDelay = YOUTUBE_CHAT_UNAVAILABLE_RETRY_DELAY_MS;
            }

            if (activeSource === "video" && preserveDirectRecovery) {
              Chat.resetYouTubeConnection(true);
              Chat.info.youtubeBootstrapFailureCount = bootstrapAttempt;
              Chat.scheduleYouTubeBootstrap(
                videoId,
                activeSource,
                bootstrapAttempt,
                unavailableDelay,
              );
              Chat.probeYouTubeFallback(videoId);
            } else {
              Chat.resetYouTubeConnection();
              Chat.scheduleYouTubeResolve(unavailableDelay);
            }

            return;
          }

          var upstreamDelay = remainingRetryDelay(YOUTUBE_CHAT_ENDPOINT);
          if (activeSource === "video" && preserveDirectRecovery) {
            var directFailureIndex = Math.min(
              bootstrapAttempt,
              YOUTUBE_RECOVERY_DELAYS.length - 1,
            );
            var nextAttempt = Math.min(
              bootstrapAttempt + 1,
              YOUTUBE_RECOVERY_DELAYS.length,
            );
            var retryDelay =
              Math.max(upstreamDelay, YOUTUBE_RECOVERY_DELAYS[directFailureIndex]);

            console.warn(
              "jChat YouTube: Direct chat bootstrap failed; retrying same video",
              err,
            );

            Chat.resetYouTubeConnection(true);
            Chat.info.youtubeBootstrapFailureCount = nextAttempt;
            Chat.scheduleYouTubeBootstrap(
              videoId,
              activeSource,
              nextAttempt,
              retryDelay,
              nextAttempt >= 3 && upstreamDelay > 0,
            );

            if (nextAttempt >= 3 && !upstreamDelay) {
              Chat.probeYouTubeFallback(videoId);
            }

            return;
          }

          if (
            activeSource === "handle" &&
            bootstrapAttempt < YOUTUBE_BOOTSTRAP_RETRY_DELAYS.length
          ) {
            var nextAttempt = bootstrapAttempt + 1;
            var retryDelay =
              Math.max(upstreamDelay, YOUTUBE_BOOTSTRAP_RETRY_DELAYS[bootstrapAttempt]);

            console.warn(
              "jChat YouTube: Could not start live chat, retrying the same video",
              err,
            );

            Chat.resetYouTubeConnection();
            Chat.info.youtubeBootstrapFailureCount = nextAttempt;
            Chat.scheduleYouTubeBootstrap(
              videoId,
              activeSource,
              nextAttempt,
              retryDelay,
            );
            return;
          }

          console.warn(
            "jChat YouTube: Could not start live chat, retrying",
            err,
          );

          var resolveDelay = Chat.info.youtubeReconnectDelay;
          if (activeSource === "handle") {
            if (bootstrapAttempt > YOUTUBE_BOOTSTRAP_RETRY_DELAYS.length) {
              resolveDelay = YOUTUBE_RECOVERY_DELAYS[bootstrapAttempt - 1];
            }
            Chat.info.youtubeFailedHandleBootstrap = {
              videoId: videoId,
              attempt: Math.min(bootstrapAttempt + 1, YOUTUBE_RECOVERY_DELAYS.length),
              retryAt: Date.now() + resolveDelay,
            };
            resolveDelay = Math.min(resolveDelay, Chat.info.youtubeDiscoveryDelay);
          }
          Chat.resetYouTubeConnection();
          Chat.scheduleYouTubeResolve(Math.max(upstreamDelay, resolveDelay));
        });
    },

    scheduleYouTubePoll: function (delay) {
      setYouTubeTimer("youtubePollTimer", Chat.pollYouTubeChat, delay);
    },

    pollYouTubeChat: function () {
      if (
        Chat.info.youtubePolling ||
        !Chat.info.youtubeSession ||
        !Chat.info.youtubeContinuation
      ) {
        return;
      }

      var remaining = remainingRetryDelay(YOUTUBE_CHAT_ENDPOINT);
      if (remaining > 0) {
        Chat.scheduleYouTubePoll(remaining);
        return;
      }

      Chat.info.youtubePolling = true;
      var connectionGeneration = Chat.info.youtubeConnectionGeneration;
      var session = Chat.info.youtubeSession;
      var continuation = Chat.info.youtubeContinuation;

      requestChat(YOUTUBE_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: session,
          continuation: continuation,
        }),
      })
        .then(function (chatData) {
          if (
            connectionGeneration !== Chat.info.youtubeConnectionGeneration
          ) {
            return;
          }

          var timing = Chat.info.youtubeDebug
            ? {
                source: "poll",
                processedAtMs: chatData.processedAtMs,
                arrivedAtMs: Date.now(),
              }
            : null;
          if (!chatData || !chatData.continuation) {
            throw new Error(
              "YouTube returned incomplete live chat poll data.",
            );
          }

          Chat.info.youtubeContinuation = chatData.continuation;

          Chat.writeYouTubeMessages(
            Chat.filterNewYouTubeMessages(chatData.messages),
            timing,
            chatData.timeoutMs,
          );

          if (Array.isArray(chatData.deletedMessageIds)) {
            chatData.deletedMessageIds.forEach(function (messageId) {
              Chat.removeYouTubeMessage(messageId);
            });
          }

          Chat.info.youtubePolling = false;
          Chat.info.youtubePollFailureCount = 0;

          if (Chat.info.youtubeConnectionLost) {
            console.log("jChat YouTube: Connection restored");
            Chat.info.youtubeConnectionLost = false;
          }

          Chat.scheduleYouTubePoll(chatData.timeoutMs);
        })
        .catch(function (err) {
          if (
            connectionGeneration !== Chat.info.youtubeConnectionGeneration
          ) {
            return;
          }

          Chat.info.youtubePolling = false;

          if (err && err.code === "youtube_chat_ended") {
            Chat.handleYouTubeChatEnded();
            return;
          }

          Chat.info.youtubeConnectionLost = true;
          var upstreamDelay = remainingRetryDelay(YOUTUBE_CHAT_ENDPOINT);
          Chat.info.youtubePollFailureCount++;

          if (Chat.info.youtubePollFailureCount >= 2) {
            var videoId = Chat.info.youtubeVideoId;
            var source = Chat.info.youtubeActiveSource;

            console.warn(
              "jChat YouTube: Poll failed twice, refreshing the chat session",
              err,
            );

            if (videoId && upstreamDelay) {
              Chat.resetYouTubeConnection(source === "video");
              Chat.scheduleYouTubeBootstrap(videoId, source, 0, upstreamDelay);
            } else if (videoId) {
              Chat.bootstrapYouTubeChat(videoId, source);
            } else {
              Chat.resetYouTubeConnection();
              Chat.scheduleYouTubeResolve(Math.max(upstreamDelay, Chat.info.youtubeReconnectDelay));
            }

            return;
          }

          console.warn(
            "jChat YouTube: Poll failed, retrying",
            err,
          );

          Chat.scheduleYouTubePoll(Math.max(upstreamDelay, Chat.info.youtubeReconnectDelay));
        });
    },

    filterNewYouTubeMessages: function (messages) {
      if (!Array.isArray(messages)) {
        return [];
      }

      return messages.filter(function (message) {
        if (!message) {
          return false;
        }

        if (message.id) {
          if (!Chat.rememberYouTubeMessageId(message.id)) {
            return false;
          }
        }

        return Chat.shouldShowYouTubeMessage(message);
      });
    },

    rememberYouTubeMessageId: function (messageId) {
      if (!messageId) {
        return true;
      }

      var normalizedId = String(messageId);

      if (Chat.info.youtubeRecentMessageIds[normalizedId]) {
        return false;
      }

      Chat.info.youtubeRecentMessageIds[normalizedId] = true;
      Chat.info.youtubeRecentMessageOrder.push(normalizedId);

      while (
        Chat.info.youtubeRecentMessageOrder.length >
        Chat.info.youtubeRecentMessageLimit
      ) {
        var oldestId = Chat.info.youtubeRecentMessageOrder.shift();

        delete Chat.info.youtubeRecentMessageIds[oldestId];
      }

      return true;
    },

    rememberYouTubeMessageIds: function (messageIds) {
      if (!Array.isArray(messageIds)) {
        return;
      }

      messageIds.forEach(function (messageId) {
        Chat.rememberYouTubeMessageId(messageId);
      });
    },

    handleYouTubeChatEnded: function () {
      var endedSource = Chat.info.youtubeActiveSource;
      Chat.info.youtubeEndedVideoId = Chat.info.youtubeVideoId;
      Chat.info.youtubeFailedHandleBootstrap = null;

      console.log("jChat YouTube: Live chat ended");

      if (endedSource === "video") {
        Chat.info.youtubeDirectVideoPending = false;
      }

      Chat.resetYouTubeConnection();
      Chat.info.youtubeActiveSource = null;

      Chat.scheduleYouTubeResolve(Chat.info.youtubeDiscoveryDelay);
    },

    removeYouTubeMessage: function (messageId) {
      if (!messageId) {
        return;
      }

      var fullMessageId = "youtube:" + messageId;

      if (Chat.info.youtubeDebug) {
        delete Chat.info.youtubePendingLatency[fullMessageId];
      }
      Chat.clearMessage(fullMessageId);

      var originalLength = Chat.info.youtubePendingDeliveries.length;

      Chat.info.youtubePendingDeliveries =
        Chat.info.youtubePendingDeliveries.filter(function (delivery) {
          return !(
            delivery &&
            delivery.message &&
            String(delivery.message.id) === String(messageId)
          );
        });

      if (Chat.info.youtubePendingDeliveries.length !== originalLength) {
        if (Chat.info.youtubeDeliveryTimer) {
          clearTimeout(Chat.info.youtubeDeliveryTimer);
          Chat.info.youtubeDeliveryTimer = null;
        }

        Chat.drainYouTubeDeliveries();
      }
    },

    writeYouTubeMessages: function (messages, timing, timeoutMs) {
      if (!Array.isArray(messages) || !messages.length) {
        return;
      }

      var hasPendingDeliveries = Boolean(
        Chat.info.youtubePendingDeliveries.length ||
          Chat.info.youtubeDeliveryTimer,
      );

      if (messages.length <= YOUTUBE_IMMEDIATE_BATCH_LIMIT) {
        messages.forEach(function (message) {
          Chat.writeYouTubeMessage(message, timing);
        });
        return;
      }

      var spacing = getYouTubeDeliverySpacing(messages.length, timeoutMs);
      var now = Date.now();
      var lastDelivery =
        Chat.info.youtubePendingDeliveries[
          Chat.info.youtubePendingDeliveries.length - 1
        ];
      var batchStart = lastDelivery
        ? Math.max(now, lastDelivery.releaseAt + spacing)
        : now;
      var firstQueuedIndex = 0;

      if (
        !hasPendingDeliveries &&
        messages.length > YOUTUBE_IMMEDIATE_BATCH_LIMIT
      ) {
        Chat.writeYouTubeMessage(messages[0], timing);
        firstQueuedIndex = 1;
      }

      for (var i = firstQueuedIndex; i < messages.length; i++) {
        Chat.info.youtubePendingDeliveries.push({
          message: messages[i],
          timing: timing,
          releaseAt: batchStart + i * spacing,
        });
      }

      Chat.drainYouTubeDeliveries();
    },

    drainYouTubeDeliveries: function () {
      if (
        Chat.info.youtubeDeliveryTimer ||
        !Chat.info.youtubePendingDeliveries.length
      ) {
        return;
      }

      var nextDelivery = Chat.info.youtubePendingDeliveries[0];
      var wait = Math.max(0, nextDelivery.releaseAt - Date.now());

      Chat.info.youtubeDeliveryTimer = setTimeout(function () {
        Chat.info.youtubeDeliveryTimer = null;

        var delivery = Chat.info.youtubePendingDeliveries.shift();

        if (delivery) {
          Chat.writeYouTubeMessage(delivery.message, delivery.timing);
        }

        Chat.drainYouTubeDeliveries();
      }, wait);
    },

    clearYouTubeDeliveries: function () {
      if (Chat.info.youtubeDeliveryTimer) {
        clearTimeout(Chat.info.youtubeDeliveryTimer);
      }

      Chat.info.youtubeDeliveryTimer = null;
      Chat.info.youtubePendingDeliveries = [];
    },

    resetYouTubeConnection: function (preserveDirectRecovery) {
      Chat.info.youtubeConnectionGeneration++;

      if (Chat.info.youtubeResolveTimer) {
        clearTimeout(Chat.info.youtubeResolveTimer);
      }

      if (Chat.info.youtubePollTimer) {
        clearTimeout(Chat.info.youtubePollTimer);
      }

      Chat.info.youtubeResolveTimer = null;
      Chat.info.youtubePollTimer = null;
      Chat.info.youtubeResolving = false;
      Chat.info.youtubePolling = false;
      Chat.info.youtubePollFailureCount = 0;
      Chat.info.youtubeDiscoveryFailureCount = 0;
      Chat.info.youtubeBootstrapFailureCount = 0;
      Chat.info.youtubeSession = null;
      Chat.info.youtubeContinuation = null;
      Chat.info.youtubeVideoId = null;
      Chat.clearYouTubeDeliveries();

      if (!preserveDirectRecovery) {
        Chat.clearYouTubeDirectRecovery();
      }
    },

    stopYouTubePolling: function () {
      retryDeadlines = new Map();
      Chat.info.youtubeEndedVideoId = null;
      Chat.info.youtubeFailedHandleBootstrap = null;
      if (Chat.info.youtubeResolveTimer) {
        clearTimeout(Chat.info.youtubeResolveTimer);
      }

      Chat.info.youtubeResolveTimer = null;
      Chat.info.youtubeResolving = false;
      Chat.info.youtubeConnectionLost = false;

      Chat.resetYouTubeConnection();

      Chat.info.youtubeRecentVideoId = null;
      Chat.info.youtubeRecentMessageIds = {};
      Chat.info.youtubeRecentMessageOrder = [];
      Chat.info.youtubePendingLatency = {};

      if (Chat.info.youtubeLatencyObserver) {
        Chat.info.youtubeLatencyObserver.disconnect();
        Chat.info.youtubeLatencyObserver = null;
      }

      Chat.info.youtubeActiveSource = null;
    },
  });
})();
