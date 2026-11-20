(function () {
  window.Chat = window.Chat || {};
  var channelLookup = null;

  $.extend(Chat, {
    isKickDeleteEvent: function (eventName) {
      if (!eventName) return false;

      return (
        /delete|deleted|remove|removed/i.test(eventName) &&
        /message|chat/i.test(eventName)
      );
    },

    findKickDeletedMessageId: function (data) {
      if (!data) return null;

      var candidates = [
        data.id,
        data.message_id,
        data.messageId,
        data.chat_message_id,
        data.chatMessageId,
        data.target_msg_id,
        data.targetMessageId,
        data.deletedMessage && data.deletedMessage.id,
        data.deleted_message && data.deleted_message.id,
        data.message && data.message.id,
        data.chatMessage && data.chatMessage.id,
        data.chat_message && data.chat_message.id,
        data.target && data.target.id,
      ];

      var visibleIds = $(".chat_line")
        .map(function () {
          return $(this).attr("data-id");
        })
        .get();

      for (var i = 0; i < candidates.length; i++) {
        if (!candidates[i]) continue;

        var candidate = candidates[i].toString();

        if (visibleIds.includes(candidate)) {
          return candidate;
        }
      }

      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j]) return candidates[j].toString();
      }

      return null;
    },

    deleteKickMessage: function (data) {
      if (!data) return;

      var messageId = Chat.findKickDeletedMessageId(data);

      if (!messageId) {
        console.warn(
          "jChat Kick: Delete event did not include a usable message id.",
          data,
        );
        return;
      }

      console.log("jChat Kick: Deleting message " + messageId);
      Chat.clearMessage(messageId);
    },

    parseKickEmotes: function (message) {
      if (message === undefined || message === null) {
        return "";
      }

      message = String(message);

      message = message.replace(
        /\[emote:(\d+):([^\]]+)\]/g,
        function (match, id, name) {
          var token = "kick_emote_" + id;

          Chat.info.emotes[token] = {
            image: "https://files.kick.com/emotes/" + id + "/fullsize",
            zeroWidth: false,
          };

          // Important: add spaces around the internal token.
          // Without this, repeated Kick emotes become:
          // kick_emote_1kick_emote_1kick_emote_1
          return " " + token + " ";
        },
      );

      return message.replace(/[ \t]{2,}/g, " ").trim();
    },

    isReloadChatCommand: function (message) {
      return (
        String(message || "")
          .trim()
          .toLowerCase() === "!reloadchat"
      );
    },

    isKickReloadAllowed: function (data) {
      var sender = data && data.sender ? data.sender : {};
      var identity = sender.identity || {};
      var badges = [];

      if (Array.isArray(identity.badges)) {
        badges = badges.concat(identity.badges);
      }

      if (Array.isArray(identity.badges_v2)) {
        badges = badges.concat(identity.badges_v2);
      }

      if (Array.isArray(identity.badgesV2)) {
        badges = badges.concat(identity.badgesV2);
      }

      return badges.some(function (badge) {
        var type = Chat.getKickBadgeType(badge);

        return type === "broadcaster" || type === "moderator";
      });
    },

    writeKick: function (data) {
      var rawKickMessage = data && data.content ? String(data.content) : "";

      if (Chat.isReloadChatCommand(rawKickMessage)) {
        if (Chat.isKickReloadAllowed(data)) {
          console.log(
            "jChat Kick: !reloadchat accepted from",
            data.sender && data.sender.username,
          );
          window.location.reload();
          return;
        }

        console.log(
          "jChat Kick: !reloadchat ignored from non-mod/non-broadcaster",
          data.sender && data.sender.username,
        );
        return;
      }
      if (!data || !data.sender) return;

      var sender = data.sender;
      var identity = sender.identity || {};

      var nick = (sender.slug || sender.username || "kick-user").toLowerCase();
      var displayName = sender.username || nick;
      var content = data.content || "";
      var badges = Chat.getKickBadgesFromData(data);
      if (
        "debug_kick_badges" in $.QueryString &&
        $.QueryString.debug_kick_badges.toLowerCase() === "true"
      ) {
        Chat.debugKickBadgePayload(data, badges);
      }

      content = Chat.parseKickEmotes(content);

      var isMod = badges.some(function (badge) {
        return Chat.getKickBadgeType(badge) === "moderator";
      });

      var isBroadcaster =
        badges.some(function (badge) {
          return Chat.getKickBadgeType(badge) === "broadcaster";
        }) || nick === Chat.info.kickChannel;

      if (content.toLowerCase() === "!reloadchat" && (isBroadcaster || isMod)) {
        location.reload();
        return;
      }

      if (Chat.info.hideCommands && /^!.+/.test(content)) return;

      if (
        !Chat.info.showBots &&
        Chat.info.bots.includes(String(nick).toLowerCase())
      )
        return;

      if (Chat.isUserBlocked(nick)) return;

      var color = identity.color;
      if (
        typeof color === "string" &&
        color.length > 0 &&
        color.charAt(0) !== "#"
      ) {
        color = "#" + color;
      }

      var info = {
        id: data.id || "kick-" + Date.now() + "-" + Math.random(),
        badges: Chat.registerKickBadges(badges),
        color: color || undefined,
        "display-name": displayName,
        emotes: null,
        mod: isMod ? "1" : "0",
        bits: "0",
        platform: "kick",
      };

      Chat.write(nick, info, content);
    },

    normalizeKickChannel: function (channel, literal) {
      if (!literal && /^(true|1|yes|same|channel|twitch)$/i.test(String(channel || "").trim())) {
        return window.jChatPlatformSettings.normalizeKickChannel(Chat.info.channel, true);
      }
      return window.jChatPlatformSettings.normalizeKickChannel(channel, literal);
    },

    findKickChatroomId: function (payload) {
      function toId(value) {
        var id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
        return Number.isSafeInteger(id) && id > 0 ? id : null;
      }

      function fromChatroomObject(obj) {
        if (!obj || typeof obj !== "object") return null;

        return (
          toId(obj.id) || toId(obj.chatroom_id) || toId(obj.chatroomId) || null
        );
      }

      function walk(node, depth) {
        if (!node || depth > 7) return null;

        if (Array.isArray(node)) {
          for (var i = 0; i < node.length; i++) {
            var arrayResult = walk(node[i], depth + 1);
            if (arrayResult) return arrayResult;
          }

          return null;
        }

        if (typeof node !== "object") return null;

        if (node.chatroom) {
          var chatroomResult = fromChatroomObject(node.chatroom);
          if (chatroomResult) return chatroomResult;
        }

        var directResult =
          toId(node.chatroom_id) || toId(node.chatroomId) || null;

        if (directResult) return directResult;

        for (var key in node) {
          if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

          var result = walk(node[key], depth + 1);
          if (result) return result;
        }

        return null;
      }

      return walk(payload, 0);
    },

    resolveKickChatroomId: function (channel, literal, lookup) {
      var slug = Chat.normalizeKickChannel(channel, literal);
      var deferred = $.Deferred();

      if (!slug || Chat.info.preview || !Chat.isPlatformEnabled("kick")) {
        deferred.reject("Missing Kick channel slug.");
        return deferred.promise();
      }

      var endpoints = [
        "https://kick.com/api/v2/channels/" + encodeURIComponent(slug),
        "https://kick.com/api/v1/channels/" + encodeURIComponent(slug),
        "https://kick.com/api/v1/channels/" +
          encodeURIComponent(slug) +
          "/chat",
      ];

      var errors = [];
      var generation = Chat.info.startupGeneration;
      function active() {
        return (!lookup || channelLookup === lookup) && generation === Chat.info.startupGeneration &&
          !Chat.info.preview && Chat.isPlatformEnabled("kick");
      }

      function tryEndpoint(index) {
        if (!active()) { deferred.reject("Kick startup cancelled."); return; }
        if (index >= endpoints.length) {
          deferred.reject({
            slug: slug,
            message: "Could not resolve Kick chatroom ID.",
            errors: errors,
          });

          return;
        }

        var url = endpoints[index];

        console.log("jChat Kick: Resolving " + slug + " via " + url);

        var request = $.ajax({
          url: url,
          method: "GET",
          dataType: "json",
          timeout: 10000,
        });
        if (lookup) lookup.request = request;
        request
          .done(function (res) {
            if (!active()) { deferred.reject("Kick startup cancelled."); return; }
            var chatroomId = Chat.findKickChatroomId(res);

            if (chatroomId) {
              Chat.info.kickRoomId = chatroomId;
              Chat.info.kickChannelId = Number.isSafeInteger(res.id) && res.id > 0 ? res.id : null;
              Chat.cacheKickSubscriberBadgesFromChannel(res);

              console.log(
                "jChat Kick: Resolved " + slug + " to chatroom " + chatroomId,
              );

              deferred.resolve(chatroomId, res);
              return;
            }

            errors.push({
              url: url,
              reason: "No chatroom ID found in response.",
              response: res,
            });

            tryEndpoint(index + 1);
          })
          .fail(function (xhr, status, error) {
            if (!active()) { deferred.reject("Kick startup cancelled."); return; }
            var httpStatus = xhr && xhr.status;
            var hint = xhr && xhr.getResponseHeader && xhr.getResponseHeader("Retry-After");
            var retryAfter = /^\d{1,10}$/.test(hint) ? Number(hint) * 1000 :
              (/ GMT$/.test(hint) ? Date.parse(hint) - Date.now() : 0);
            errors.push({
              url: url,
              status: status,
              error: error,
              httpStatus: httpStatus,
            });

            if (httpStatus === 429 || retryAfter > 0) {
              deferred.reject({
                slug: slug,
                message: "Could not resolve Kick chatroom ID.",
                errors: errors,
                retryAfterMs: retryAfter > 0 ? retryAfter : 30000,
              });
              return;
            }
            tryEndpoint(index + 1);
          });
      }

      tryEndpoint(0);

      return deferred.promise();
    },

    stopKickChannelLookup: function () {
      var lookup = channelLookup;
      channelLookup = null;
      Chat.info.kickChannelStarted = false;
      if (!lookup) return;
      clearTimeout(lookup.timer);
      if (lookup.request && lookup.request.abort) lookup.request.abort();
    },

    connectKickChannel: function (channel, literal) {
      if (Chat.info.preview || !Chat.isPlatformEnabled("kick") || Chat.info.kickChannelStarted) return;
      var slug = Chat.normalizeKickChannel(channel, literal);

      if (!slug) {
        console.warn("jChat Kick: Missing Kick channel slug.");
        return;
      }

      Chat.info.kickChannelStarted = true;
      var generation = Chat.info.startupGeneration;
      var lookup = { delay: 5000, timer: null, request: null };
      channelLookup = lookup;

      function active() {
        return channelLookup === lookup && generation === Chat.info.startupGeneration &&
          !Chat.info.preview && Chat.isPlatformEnabled("kick");
      }

      function retryIn(remaining) {
        var step = Math.min(remaining, 2147483647);
        lookup.timer = setTimeout(function () {
          if (!active()) return;
          if (remaining > step) retryIn(remaining - step);
          else resolveChannel();
        }, step);
      }

      function resolveChannel() {
        if (!active()) return;
        Chat.resolveKickChatroomId(slug, true, lookup)
          .done(function (chatroomId) {
            if (!active()) return;
            channelLookup = null;
            Chat.connectKick(chatroomId);
          })
          .fail(function (err) {
            if (!active()) return;
            if (!err.retryAfterMs && err.errors && err.errors.every(function (item) {
              return item.httpStatus === 404 || item.httpStatus === 410;
            })) {
              channelLookup = null;
              console.warn("jChat Kick: Channel not found. Check the channel name or use kick_room.");
              return;
            }
            var delay = Math.max(lookup.delay + Math.floor(Math.random() * 1000), err.retryAfterMs || 0);
            lookup.delay = Math.min(lookup.delay * 2, 300000);
            lookup.request = null;
            console.warn("jChat Kick: Channel lookup failed. Retrying in " + Math.ceil(delay / 1000) + "s.");
            retryIn(delay);
          });
      }
      resolveChannel();
    },
  });
})();
