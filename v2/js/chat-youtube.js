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

  $.extend(Chat.info, {
    youtubeHandle:
      "youtube" in $.QueryString
        ? String($.QueryString.youtube || "")
            .trim()
            .replace(/^@+/, "")
        : false,
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

    writeYouTubeMessage: function (data) {
      if (!data) return;

      var displayName = String(data.displayName || "")
        .trim()
        .replace(/^@+/, "");
      var message = String(data.message || "");

      if (!displayName || !message) return;

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
      var handle = Chat.info.youtubeHandle;

      if (
        !handle ||
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

          Chat.bootstrapYouTubeChat(liveData.videoId);
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
      if (!Chat.info.youtubeHandle || Chat.info.preview) {
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

    bootstrapYouTubeChat: function (videoId) {
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
        if (!message || !message.id) {
          return true;
        }

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

        return true;
      });
    },

    handleYouTubeChatEnded: function () {
      console.log("jChat YouTube: Live chat ended");

      Chat.resetYouTubeConnection(true);
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
    },
  });
})();
