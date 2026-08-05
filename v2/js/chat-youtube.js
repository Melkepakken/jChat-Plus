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

          throw new Error(message);
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
    youtubePolling: false,
    youtubeMessageQueue: [],
    youtubeQueueTimer: null,
    youtubeQueueWindowRatio: 0.8,
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
        "test-" +
          Date.now() +
          "-" +
          Math.random().toString(36).slice(2);

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

      if (!handle || Chat.info.preview) {
        return;
      }

      Chat.stopYouTubePolling();

      console.log("jChat YouTube: Resolving @" + handle);

      requestJson(
        "/api/youtube/live?handle=" + encodeURIComponent(handle),
      )
        .then(function (liveData) {
          if (!liveData.live || !liveData.videoId) {
            console.log("jChat YouTube: @" + handle + " is not live");
            return;
          }

          Chat.info.youtubeVideoId = liveData.videoId;

          return Chat.bootstrapYouTubeChat(liveData.videoId);
        })
        .catch(function (err) {
          console.error(
            "jChat YouTube: Could not resolve live broadcast",
            err,
          );
        });
    },

    bootstrapYouTubeChat: function (videoId) {
      return requestJson(
        "/api/youtube/chat?video=" + encodeURIComponent(videoId),
      )
        .then(function (chatData) {
          var feed = String(chatData.feed || "").toLowerCase();

          if (feed !== "live chat" && feed !== "all chat") {
            throw new Error(
              "YouTube did not return the unfiltered chat feed.",
            );
          }

          if (!chatData.session || !chatData.continuation) {
            throw new Error(
              "YouTube chat bootstrap data was incomplete.",
            );
          }

          Chat.info.youtubeSession = chatData.session;
          Chat.info.youtubeContinuation = chatData.continuation;

          console.log(
            "jChat YouTube: Connected to " +
              chatData.feed +
              " for video " +
              videoId,
          );

          Chat.scheduleYouTubePoll(chatData.timeoutMs);
        })
        .catch(function (err) {
          console.error(
            "jChat YouTube: Could not start live chat",
            err,
          );
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

          if (!chatData.continuation) {
            throw new Error(
              "YouTube returned no next continuation.",
            );
          }

          Chat.info.youtubeContinuation =
            chatData.continuation;

          Chat.queueYouTubeMessages(
            chatData.messages,
            chatData.timeoutMs,
          );

          Chat.scheduleYouTubePoll(chatData.timeoutMs);
        })
        .catch(function (err) {
          Chat.info.youtubePolling = false;

          console.error(
            "jChat YouTube: Live chat polling stopped",
            err,
          );
        });
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
        Chat.info.youtubeMessageQueue[
          Chat.info.youtubeMessageQueue.length - 1
        ];
      var batchStart = lastQueued
        ? Math.max(now, lastQueued.releaseAt + 50)
        : now;

      messages.forEach(function (message, index) {
        var slotStart = index * slotLength;
        var slotPadding = slotLength * 0.18;
        var earliest = slotStart + slotPadding;
        var latest =
          slotStart + slotLength - slotPadding;
        var randomizedOffset =
          earliest + Math.random() * (latest - earliest);

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

        var queued =
          Chat.info.youtubeMessageQueue.shift();

        if (queued) {
          Chat.writeYouTubeMessage(queued.message);
        }

        Chat.drainYouTubeMessageQueue();
      }, wait);
    },

    stopYouTubePolling: function () {
      if (Chat.info.youtubePollTimer) {
        clearTimeout(Chat.info.youtubePollTimer);
      }

      if (Chat.info.youtubeQueueTimer) {
        clearTimeout(Chat.info.youtubeQueueTimer);
      }

      Chat.info.youtubePollTimer = null;
      Chat.info.youtubeQueueTimer = null;
      Chat.info.youtubeMessageQueue = [];
      Chat.info.youtubePolling = false;
      Chat.info.youtubeSession = null;
      Chat.info.youtubeContinuation = null;
      Chat.info.youtubeVideoId = null;
    },
  });
})();
