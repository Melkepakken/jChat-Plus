(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    isPreviewKickEnabled: function () {
      return Chat.info.kickRoomId || Chat.info.kickChannel !== false;
    },

    loadPreviewKickAssets: function (callback) {
      if (!Chat.info.preview || !Chat.isPreviewKickEnabled()) {
        if (callback) callback();
        return;
      }

      if (Chat.info.kickRoomId) {
        if (callback) callback();
        return;
      }

      var slug = Chat.normalizeKickChannel(Chat.info.kickChannel);

      if (!slug) {
        if (callback) callback();
        return;
      }

      Chat.resolveKickChatroomId(slug).always(function () {
        if (callback) callback();
      });
    },

    previewMessages: window.jChatPlusPreviewMessages || [],

    shouldShowPreviewMessage: function (item) {
      if (!item) {
        return false;
      }

      if (item.platform === "kick") {
        if (!Chat.isPreviewKickEnabled()) {
          return false;
        }

        var sender = item.data && item.data.sender ? item.data.sender : {};

        if (
          Chat.isUserBlocked(sender.slug) ||
          Chat.isUserBlocked(sender.username)
        ) {
          return false;
        }
      } else {
        var displayName = item.info && item.info["display-name"];

        if (Chat.isUserBlocked(item.nick) || Chat.isUserBlocked(displayName)) {
          return false;
        }
      }

      if (!Chat.info.showBots && item.bot) {
        return false;
      }

      if (Chat.info.hideCommands && item.command) {
        return false;
      }

      return true;
    },

    getPreviewMessageKey: function (item) {
      if (!item) {
        return "";
      }

      if (item.platform === "kick") {
        var sender = item.data && item.data.sender ? item.data.sender : {};

        return [
          "kick",
          sender.slug || sender.username || "",
          item.data ? item.data.content || "" : "",
        ].join(":");
      }

      return ["twitch", item.nick || "", item.message || ""].join(":");
    },

    pickPreviewMessage: function () {
      if (!Chat.previewMessages || !Chat.previewMessages.length) {
        return null;
      }

      var attempts = Math.max(8, Chat.previewMessages.length * 4);
      var fallback = null;

      for (var i = 0; i < attempts; i++) {
        var candidate =
          Chat.previewMessages[
            Math.floor(Math.random() * Chat.previewMessages.length)
          ];

        if (!Chat.shouldShowPreviewMessage(candidate)) {
          continue;
        }

        if (!fallback) {
          fallback = candidate;
        }

        var key = Chat.getPreviewMessageKey(candidate);

        if (key !== Chat.info.previewLastMessageKey) {
          return candidate;
        }
      }

      return fallback;
    },

    getRandomPreviewDelay: function () {
      var roll = Math.random();

      function randomBetween(min, max) {
        return Math.floor(min + Math.random() * (max - min + 1));
      }

      if (roll < Chat.info.previewBurstChance) {
        return randomBetween(120, 320);
      }

      if (roll > 1 - Chat.info.previewPauseChance) {
        return randomBetween(1600, 2800);
      }

      return randomBetween(Chat.info.previewMinDelay, Chat.info.previewMaxDelay);
    },

    scheduleNextPreviewMessage: function (delay) {
      window.clearTimeout(Chat.info.previewTimer);

      Chat.info.previewTimer = window.setTimeout(
        function () {
          Chat.writePreviewMessage(function () {
            Chat.cleanupRenderedLines();
            Chat.scheduleNextPreviewMessage();
          });
        },
        typeof delay === "number" && isFinite(delay)
          ? delay
          : Chat.getRandomPreviewDelay(),
      );
    },

    writePreviewMessage: function (callback) {
      if (!Chat.previewMessages || !Chat.previewMessages.length) {
        if (callback) callback();
        return;
      }

      var item = Chat.pickPreviewMessage();

      if (!item) {
        if (callback) callback();
        return;
      }

      Chat.info.previewIndex++;
      Chat.info.previewLastMessageKey = Chat.getPreviewMessageKey(item);

      if (item.platform === "kick") {
        var kickData = $.extend(true, {}, item.data);

        kickData.id = "preview-kick-" + Date.now() + "-" + Chat.info.previewIndex;

        Chat.writeKick(kickData);

        if (callback) callback();
        return;
      }

      var info = $.extend({}, item.info);

      info.id = "preview-twitch-" + Date.now() + "-" + Chat.info.previewIndex;

      function writeTwitchPreviewMessage() {
        Chat.write(item.nick, info, item.message);

        if (callback) callback();
      }

      if (
        (!Chat.info.hideBadges &&
          !Chat.info.hideAllBadges &&
          Chat.info.bttvBadges &&
          Chat.info.seventvBadges &&
          Chat.info.chatterinoBadges &&
          Chat.info.ffzapBadges &&
          Chat.shouldLoadUserBadges(item.nick, info["user-id"])) ||
        Chat.shouldLoadSevenTvNamePaint(info["user-id"])
      ) {
        var originalFfzUserBadges = Chat.info.ffzUserBadges;

        if (Chat.info.preview && !item.ffzUserBadge) {
          Chat.info.ffzUserBadges = false;
        }

        Chat.loadUserBadges(item.nick, info["user-id"]).always(function () {
          Chat.info.ffzUserBadges = originalFfzUserBadges;
          writeTwitchPreviewMessage();
        });

        return;
      }

      writeTwitchPreviewMessage();
    },

    seedPreviewMessages: function () {
      window.clearTimeout(Chat.info.previewSeedTimer);

      Chat.info.previewSeedTimer = window.setTimeout(function () {
        Chat.writePreviewMessage(function () {
          Chat.cleanupRenderedLines();
          Chat.scheduleNextPreviewMessage();
        });
      }, 150);
    },

    startPreview: function () {
      Chat.info.lines = [];
      Chat.info.previewLastMessageKey = null;
      $("#chat_container").empty();

      window.clearTimeout(Chat.info.previewSeedTimer);
      window.clearTimeout(Chat.info.previewTimer);

      Chat.seedPreviewMessages();
    },

    applyPreviewQuery: function (query) {
      var params = new URLSearchParams(query || "");

      function truthy(name) {
        return params.has(name) && /^(1|true|yes)$/i.test(params.get(name));
      }

      Chat.info.size = params.has("size") ? parseInt(params.get("size"), 10) : 3;
      Chat.info.font = params.has("font") ? parseInt(params.get("font"), 10) : 0;
      Chat.info.stroke = params.has("stroke")
        ? parseInt(params.get("stroke"), 10)
        : false;
      Chat.info.shadow = params.has("shadow")
        ? parseInt(params.get("shadow"), 10)
        : false;

      Chat.info.animate = truthy("animate");
      Chat.info.showBots = truthy("bots");
      Chat.info.hideCommands = truthy("hide_commands");
      Chat.info.hideBadges = truthy("hide_badges");
      Chat.info.hideAllBadges = params.has("hide_all_badges");
      Chat.info.smallCaps = truthy("small_caps");

      Chat.info.fade = params.has("fade")
        ? parseInt(params.get("fade"), 10)
        : false;

      Chat.info.nicknameColor = params.get("cN") || false;
      Chat.info.seventvNamePaints = truthy("seventv_paints");
      Chat.info.emojiStyle =
        params.has("emoji") && params.get("emoji").toLowerCase() === "native"
          ? "native"
          : "twemoji";
      Chat.info.kickRoomId =
        params.has("kick_room") &&
        !Number.isNaN(parseInt(params.get("kick_room"), 10))
          ? parseInt(params.get("kick_room"), 10)
          : false;

      Chat.info.kickChannel = params.has("kick")
        ? params.get("kick")
        : params.has("kick_channel")
          ? params.get("kick_channel")
          : false;
      Chat.info.blockedUsers = params.has("block")
        ? Chat.normalizeBlockedUsers(params.get("block"))
        : false;
      Chat.applyStaticStyles();

      if (Chat.info.preview) {
        Chat.info.lines = [];
        Chat.info.previewIndex = 0;
        Chat.info.previewLastMessageKey = null;
        $("#chat_container").empty();

        window.clearTimeout(Chat.info.previewSeedTimer);
        window.clearTimeout(Chat.info.previewTimer);

        Chat.loadPreviewKickAssets(function () {
          Chat.seedPreviewMessages();
        });
      }
    },
  });
})();