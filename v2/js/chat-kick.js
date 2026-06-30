(function () {
  window.Chat = window.Chat || {};

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
        }) || nick === Chat.info.channel;

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
      };

      Chat.write(nick, info, content);
    },

    clearKickReconnectTimer: function () {
      if (Chat.info.kickReconnectTimer) {
        clearTimeout(Chat.info.kickReconnectTimer);
        Chat.info.kickReconnectTimer = null;
      }
    },

    scheduleKickReconnect: function (chatroomId) {
      if (Chat.info.kickManualClose) return;

      Chat.clearKickReconnectTimer();

      var attempt = Chat.info.kickReconnectAttempts;
      var delay = Math.min(
        Chat.info.kickReconnectMaxDelay,
        Chat.info.kickReconnectBaseDelay * Math.pow(2, attempt),
      );

      // Tiny jitter so reconnects don't all spam the server.
      delay += Math.floor(Math.random() * 1000);

      Chat.info.kickReconnectAttempts += 1;

      console.warn(
        "jChat Kick: Reconnecting in " +
          Math.round(delay / 1000) +
          "s. Attempt " +
          Chat.info.kickReconnectAttempts +
          ".",
      );

      Chat.info.kickReconnectTimer = setTimeout(function () {
        Chat.connectKick(chatroomId, true);
      }, delay);
    },

    normalizeKickChannel: function (channel) {
      if (channel === undefined || channel === null || channel === false) {
        return null;
      }

      var slug = String(channel).trim();

      // Allow &kick=true / &kick=1 / &kick=same to mean "same as Twitch channel".
      if (/^(true|1|yes|same|channel|twitch)$/i.test(slug)) {
        slug = Chat.info.channel;
      }

      if (!slug) return null;

      slug = slug
        .replace(/^@+/, "")
        .replace(/^https?:\/\/(www\.)?kick\.com\//i, "")
        .replace(/^popout\//i, "")
        .replace(/\/chat$/i, "")
        .split(/[/?#]/)[0]
        .trim()
        .toLowerCase();

      return slug || null;
    },

    findKickChatroomId: function (payload) {
      function toId(value) {
        var id = parseInt(value, 10);
        return Number.isNaN(id) ? null : id;
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

    resolveKickChatroomId: function (channel) {
      var slug = Chat.normalizeKickChannel(channel);
      var deferred = $.Deferred();

      if (!slug) {
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

      function tryEndpoint(index) {
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

        $.ajax({
          url: url,
          method: "GET",
          dataType: "json",
          timeout: 10000,
        })
          .done(function (res) {
            var chatroomId = Chat.findKickChatroomId(res);

            if (chatroomId) {
              Chat.info.kickRoomId = chatroomId;
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
            errors.push({
              url: url,
              status: status,
              error: error,
              httpStatus: xhr && xhr.status,
            });

            tryEndpoint(index + 1);
          });
      }

      tryEndpoint(0);

      return deferred.promise();
    },

    connectKickChannel: function (channel) {
      var slug = Chat.normalizeKickChannel(channel);

      if (!slug) {
        console.warn("jChat Kick: Missing Kick channel slug.");
        return;
      }

      Chat.resolveKickChatroomId(slug)
        .done(function (chatroomId) {
          Chat.connectKick(chatroomId);
        })
        .fail(function (err) {
          console.warn(
            "jChat Kick: Failed to auto-resolve channel. Use kick_room as fallback.",
            err,
          );
        });
    },

    connectKick: function (chatroomId, isReconnect) {
      if (!chatroomId || Number.isNaN(chatroomId)) {
        console.warn("jChat Kick: Missing or invalid kick_room parameter.");
        return;
      }

      Chat.clearKickReconnectTimer();

      if (!isReconnect) {
        Chat.info.kickReconnectAttempts = 0;
      }

      Chat.info.kickManualClose = false;

      // Avoid duplicate Kick sockets if connectKick is called twice.
      if (
        Chat.info.kickSocket &&
        (Chat.info.kickSocket.readyState === WebSocket.OPEN ||
          Chat.info.kickSocket.readyState === WebSocket.CONNECTING)
      ) {
        Chat.info.kickManualClose = true;

        try {
          Chat.info.kickSocket.close();
        } catch (err) {
          console.warn("jChat Kick: Failed to close existing socket.", err);
        }

        Chat.info.kickManualClose = false;
      }

      console.log(
        "jChat Kick: " +
          (isReconnect ? "Reconnecting" : "Connecting") +
          " to chatroom " +
          chatroomId,
      );

      var socket = new WebSocket(Chat.info.kickPusherUrl);
      Chat.info.kickSocket = socket;

      var subscribed = false;
      var channelName = "chatrooms." + chatroomId + ".v2";

      function subscribe() {
        if (subscribed || socket.readyState !== WebSocket.OPEN) return;

        socket.send(
          JSON.stringify({
            event: "pusher:subscribe",
            data: {
              auth: "",
              channel: channelName,
            },
          }),
        );

        subscribed = true;
        Chat.info.kickReconnectAttempts = 0;

        console.log("jChat Kick: Subscribed to " + channelName);
      }

      socket.onopen = function () {
        console.log("jChat Kick: WebSocket open");
      };

      socket.onmessage = function (event) {
        var packet;

        try {
          packet = JSON.parse(event.data);
        } catch (err) {
          console.warn("jChat Kick: Failed to parse packet.", err);
          return;
        }

        if (packet.event === "pusher:connection_established") {
          subscribe();
          return;
        }

        if (packet.event === "pusher:ping") {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ event: "pusher:pong" }));
          }

          return;
        }

        if (packet.event === "pusher:error") {
          console.warn("jChat Kick: Pusher error.", packet);
          return;
        }

        if (!packet.event || packet.event.indexOf("App\\Events\\") !== 0)
          return;

        var data;

        try {
          data =
            typeof packet.data === "string"
              ? JSON.parse(packet.data)
              : packet.data;
        } catch (err) {
          console.warn("jChat Kick: Failed to parse event data.", err, packet);
          return;
        }

        if (packet.event === "App\\Events\\ChatMessageEvent") {
          Chat.writeKick(data);
          return;
        }

        if (
          packet.event === "App\\Events\\ChatMessageDeletedEvent" ||
          Chat.isKickDeleteEvent(packet.event)
        ) {
          Chat.deleteKickMessage(data);
          return;
        }
      };

      socket.onerror = function (err) {
        console.warn("jChat Kick: WebSocket error.", err);
      };

      socket.onclose = function (event) {
        subscribed = false;

        if (Chat.info.kickSocket === socket) {
          Chat.info.kickSocket = null;
        }

        if (Chat.info.kickManualClose) {
          console.log("jChat Kick: WebSocket closed manually.");
          return;
        }

        console.warn(
          "jChat Kick: Disconnected. Code: " +
            event.code +
            ", reason: " +
            (event.reason || "none"),
        );

        Chat.scheduleKickReconnect(chatroomId);
      };
    },
  });
})();
