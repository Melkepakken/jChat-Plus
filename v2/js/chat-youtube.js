(function () {
  window.Chat = window.Chat || {};

  function requestJson(url, options) {
    return fetch(url, options || {}).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var message =
            data && (data.message || data.error)
              ? data.message || data.error
              : "YouTube request failed.";
          var error = new Error(message);

          error.status = response.status;
          error.code = data && data.code ? data.code : null;

          throw error;
        }

        return data;
      });
    });
  }

  function getPollDelay(value) {
    var delay = parseInt(value, 10);

    if (Number.isNaN(delay)) {
      return 1000;
    }

    return Math.max(500, delay);
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

    if (Chat.info.youtubeDisabled || !value) {
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

  $.extend(Chat.info, {
    youtubeOption: youtubeOption,
    youtubeDisabled: youtubeDisabled,
    youtubeHandle: false,
    youtubeDirectVideoId: youtubeDirectVideoId,
    youtubeDirectVideoPending: Boolean(youtubeDirectVideoId),
    youtubeActiveSource: null,
    youtubeVideoId: null,
    youtubeSession: null,
    youtubeContinuation: null,
    youtubePollTimer: null,
    youtubeResolveTimer: null,
    youtubePolling: false,
    youtubeResolving: false,
    youtubeConnectionLost: false,
    youtubeReconnectDelay: 5000,
    youtubeDiscoveryDelay: 30000,
    youtubeMessageQueue: [],
    youtubeQueueTimer: null,
    youtubeQueueWindowRatio: 0.8,
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

    writeYouTubeMessage: function (data) {
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

      Chat.write(nick, info, message);
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
        Chat.info.youtubeSession
      ) {
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

      console.log("jChat YouTube: Resolving @" + handle);

      requestJson("/api/youtube/live?handle=" + encodeURIComponent(handle))
        .then(function (liveData) {
          Chat.info.youtubeResolving = false;

          if (!liveData.live || !liveData.videoId) {
            console.log("jChat YouTube: @" + handle + " is not live");
            Chat.scheduleYouTubeResolve(Chat.info.youtubeDiscoveryDelay);
            return;
          }

          Chat.info.youtubeVideoId = liveData.videoId;

          Chat.bootstrapYouTubeChat(liveData.videoId, "handle");
        })
        .catch(function (err) {
          Chat.info.youtubeResolving = false;

          console.warn(
            "jChat YouTube: Live broadcast lookup failed, retrying",
            err,
          );

          Chat.scheduleYouTubeResolve(Chat.info.youtubeReconnectDelay);
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

      if (Chat.info.youtubeResolveTimer) {
        clearTimeout(Chat.info.youtubeResolveTimer);
      }

      Chat.info.youtubeResolveTimer = setTimeout(function () {
        Chat.info.youtubeResolveTimer = null;
        Chat.connectYouTube();
      }, getPollDelay(delay));
    },

    bootstrapYouTubeChat: function (videoId, source) {
      Chat.info.youtubeActiveSource =
        source || Chat.info.youtubeActiveSource || "video";

      return requestJson(
        "/api/youtube/chat?video=" + encodeURIComponent(videoId),
      )
        .then(function (chatData) {
          var feed = String(chatData.feed || "").toLowerCase();

          if (feed !== "live chat" && feed !== "all chat") {
            throw new Error("YouTube did not return the unfiltered chat feed.");
          }

          if (!chatData.session || !chatData.continuation) {
            throw new Error("YouTube chat bootstrap data was incomplete.");
          }

          Chat.info.youtubeSession = chatData.session;
          Chat.info.youtubeContinuation = chatData.continuation;
          Chat.info.youtubeRecentMessageIds = {};
          Chat.info.youtubeRecentMessageOrder = [];

          console.log(
            "jChat YouTube: Connected to " +
              chatData.feed +
              " for video " +
              videoId,
          );

          Chat.scheduleYouTubePoll(chatData.timeoutMs);
        })
        .catch(function (err) {
          if (err && err.code === "youtube_chat_ended") {
            Chat.handleYouTubeChatEnded();
            return;
          }

          console.warn(
            "jChat YouTube: Could not start live chat, retrying",
            err,
          );

          Chat.resetYouTubeConnection(true);
          Chat.scheduleYouTubeResolve(Chat.info.youtubeReconnectDelay);
        });
    },

    scheduleYouTubePoll: function (delay) {
      if (Chat.info.youtubePollTimer) {
        clearTimeout(Chat.info.youtubePollTimer);
      }

      Chat.info.youtubePollTimer = setTimeout(function () {
        Chat.pollYouTubeChat();
      }, getPollDelay(delay));
    },

    pollYouTubeChat: function () {
      if (
        Chat.info.youtubePolling ||
        !Chat.info.youtubeSession ||
        !Chat.info.youtubeContinuation
      ) {
        return;
      }

      Chat.info.youtubePolling = true;

      requestJson("/api/youtube/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: Chat.info.youtubeSession,
          continuation: Chat.info.youtubeContinuation,
        }),
      })
        .then(function (chatData) {
          Chat.info.youtubePolling = false;

          if (Chat.info.youtubeConnectionLost) {
            console.log("jChat YouTube: Connection restored");
            Chat.info.youtubeConnectionLost = false;
          }

          if (!chatData.continuation) {
            var endedError = new Error(
              "YouTube returned no next continuation.",
            );

            endedError.code = "youtube_chat_ended";

            throw endedError;
          }

          Chat.info.youtubeContinuation = chatData.continuation;

          Chat.queueYouTubeMessages(
            Chat.filterNewYouTubeMessages(chatData.messages),
            chatData.timeoutMs,
          );

          if (Array.isArray(chatData.deletedMessageIds)) {
            chatData.deletedMessageIds.forEach(function (messageId) {
              Chat.removeYouTubeMessage(messageId);
            });
          }

          Chat.scheduleYouTubePoll(chatData.timeoutMs);
        })
        .catch(function (err) {
          Chat.info.youtubePolling = false;

          if (err && err.code === "youtube_chat_ended") {
            Chat.handleYouTubeChatEnded();
            return;
          }

          Chat.info.youtubeConnectionLost = true;

          console.warn(
            "jChat YouTube: Poll failed, retrying in 5 seconds",
            err,
          );

          Chat.scheduleYouTubePoll(Chat.info.youtubeReconnectDelay);
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
          var messageId = String(message.id);

          if (Chat.info.youtubeRecentMessageIds[messageId]) {
            return false;
          }

          Chat.info.youtubeRecentMessageIds[messageId] = true;
          Chat.info.youtubeRecentMessageOrder.push(messageId);

          while (
            Chat.info.youtubeRecentMessageOrder.length >
            Chat.info.youtubeRecentMessageLimit
          ) {
            var oldestId = Chat.info.youtubeRecentMessageOrder.shift();

            delete Chat.info.youtubeRecentMessageIds[oldestId];
          }
        }

        return Chat.shouldShowYouTubeMessage(message);
      });
    },

    handleYouTubeChatEnded: function () {
      var endedSource = Chat.info.youtubeActiveSource;

      console.log("jChat YouTube: Live chat ended");

      if (endedSource === "video") {
        Chat.info.youtubeDirectVideoPending = false;
      }

      Chat.resetYouTubeConnection(true);
      Chat.info.youtubeActiveSource = null;

      Chat.scheduleYouTubeResolve(Chat.info.youtubeDiscoveryDelay);
    },

    removeYouTubeMessage: function (messageId) {
      if (!messageId) {
        return;
      }

      var fullMessageId = "youtube:" + messageId;

      Chat.clearMessage(fullMessageId);

      var originalLength = Chat.info.youtubeMessageQueue.length;

      Chat.info.youtubeMessageQueue = Chat.info.youtubeMessageQueue.filter(
        function (queued) {
          return !(queued && queued.message && queued.message.id === messageId);
        },
      );

      if (
        Chat.info.youtubeMessageQueue.length !== originalLength &&
        Chat.info.youtubeQueueTimer
      ) {
        clearTimeout(Chat.info.youtubeQueueTimer);
        Chat.info.youtubeQueueTimer = null;
        Chat.drainYouTubeMessageQueue();
      }
    },

    queueYouTubeMessages: function (messages, timeoutMs) {
      if (!Array.isArray(messages) || !messages.length) {
        return;
      }

      var pollDelay = getPollDelay(timeoutMs);
      var releaseWindow = Math.max(
        1000,
        pollDelay * Chat.info.youtubeQueueWindowRatio,
      );
      var slotLength = releaseWindow / messages.length;
      var now = Date.now();
      var lastQueued =
        Chat.info.youtubeMessageQueue[Chat.info.youtubeMessageQueue.length - 1];
      var batchStart = lastQueued
        ? Math.max(now, lastQueued.releaseAt + 50)
        : now;

      messages.forEach(function (message, index) {
        var slotStart = index * slotLength;
        var slotPadding = slotLength * 0.18;
        var earliest = slotStart + slotPadding;
        var latest = slotStart + slotLength - slotPadding;
        var randomizedOffset = earliest + Math.random() * (latest - earliest);

        Chat.info.youtubeMessageQueue.push({
          message: message,
          releaseAt: batchStart + randomizedOffset,
        });
      });

      Chat.drainYouTubeMessageQueue();
    },

    drainYouTubeMessageQueue: function () {
      if (
        Chat.info.youtubeQueueTimer ||
        !Chat.info.youtubeMessageQueue.length
      ) {
        return;
      }

      var next = Chat.info.youtubeMessageQueue[0];
      var wait = Math.max(0, next.releaseAt - Date.now());

      Chat.info.youtubeQueueTimer = setTimeout(function () {
        Chat.info.youtubeQueueTimer = null;

        var queued = Chat.info.youtubeMessageQueue.shift();

        if (queued) {
          Chat.writeYouTubeMessage(queued.message);
        }

        Chat.drainYouTubeMessageQueue();
      }, wait);
    },

    resetYouTubeConnection: function (keepQueue) {
      if (Chat.info.youtubePollTimer) {
        clearTimeout(Chat.info.youtubePollTimer);
      }

      Chat.info.youtubePollTimer = null;
      Chat.info.youtubePolling = false;
      Chat.info.youtubeSession = null;
      Chat.info.youtubeContinuation = null;
      Chat.info.youtubeVideoId = null;

      if (!keepQueue) {
        if (Chat.info.youtubeQueueTimer) {
          clearTimeout(Chat.info.youtubeQueueTimer);
        }

        Chat.info.youtubeQueueTimer = null;
        Chat.info.youtubeMessageQueue = [];
      }
    },

    stopYouTubePolling: function () {
      if (Chat.info.youtubeResolveTimer) {
        clearTimeout(Chat.info.youtubeResolveTimer);
      }

      Chat.info.youtubeResolveTimer = null;
      Chat.info.youtubeResolving = false;
      Chat.info.youtubeConnectionLost = false;

      Chat.resetYouTubeConnection(false);

      Chat.info.youtubeRecentMessageIds = {};
      Chat.info.youtubeRecentMessageOrder = [];
      Chat.info.youtubeActiveSource = null;
      Chat.info.youtubeDirectVideoPending = Boolean(
        Chat.info.youtubeDirectVideoId,
      );
    },
  });
})();
