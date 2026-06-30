(function ($) {
  // Thanks to BrunoLM (https://stackoverflow.com/a/3855394)
  $.QueryString = (function (paramsArray) {
    let params = {};

    for (let i = 0; i < paramsArray.length; ++i) {
      let param = paramsArray[i].split("=", 2);

      if (param.length !== 2) continue;

      params[param[0]] = decodeURIComponent(param[1].replace(/\+/g, " "));
    }

    return params;
  })(window.location.search.substr(1).split("&"));
})(jQuery);

window.Chat = window.Chat || {};

$.extend(true, Chat, {
  info: {
    channel: null,
    preview:
      "preview" in $.QueryString
        ? /^(1|true|yes)$/i.test($.QueryString.preview)
        : false,
    previewTimer: null,
    previewSeedTimer: null,
    previewIndex: 0,
    previewLastMessageKey: null,
    previewMinDelay: 220,
    previewMaxDelay: 1200,
    previewBurstChance: 0.22,
    previewPauseChance: 0.07,
    kickRoomId:
      "kick_room" in $.QueryString &&
      !Number.isNaN(parseInt($.QueryString.kick_room, 10))
        ? parseInt($.QueryString.kick_room, 10)
        : false,

    kickChannel:
      "kick" in $.QueryString
        ? $.QueryString.kick
        : "kick_channel" in $.QueryString
          ? $.QueryString.kick_channel
          : false,
    kickPusherUrl:
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false",
    kickSocket: null,
    kickReconnectTimer: null,
    kickReconnectAttempts: 0,
    kickReconnectBaseDelay: 1000,
    kickReconnectMaxDelay: 30000,
    kickManualClose: false,
    animate:
      "animate" in $.QueryString
        ? $.QueryString.animate.toLowerCase() === "true"
        : false,
    showBots:
      "bots" in $.QueryString
        ? $.QueryString.bots.toLowerCase() === "true"
        : false,
    hideCommands:
      "hide_commands" in $.QueryString
        ? $.QueryString.hide_commands.toLowerCase() === "true"
        : false,
    hideBadges:
      "hide_badges" in $.QueryString
        ? $.QueryString.hide_badges.toLowerCase() === "true"
        : false,
    hideAllBadges: "hide_all_badges" in $.QueryString,
    nicknameColor: "cN" in $.QueryString ? $.QueryString.cN : false,
    emojiStyle:
      "emoji" in $.QueryString && $.QueryString.emoji.toLowerCase() === "native"
        ? "native"
        : "twemoji",
    ffzRoomBadges:
      "ffz_room_badges" in $.QueryString
        ? $.QueryString.ffz_room_badges.toLowerCase() === "true"
        : false,
    ffzUserBadges:
      "ffz_user_badges" in $.QueryString
        ? /^(1|true|yes)$/i.test($.QueryString.ffz_user_badges)
        : false,

    ffzUserBadgeCache: {},
    fade: "fade" in $.QueryString ? parseInt($.QueryString.fade) : false,
    size: "size" in $.QueryString ? parseInt($.QueryString.size) : 3,
    font: "font" in $.QueryString ? parseInt($.QueryString.font) : 0,
    stroke: "stroke" in $.QueryString ? parseInt($.QueryString.stroke) : false,
    shadow: "shadow" in $.QueryString ? parseInt($.QueryString.shadow) : false,
    smallCaps:
      "small_caps" in $.QueryString
        ? $.QueryString.small_caps.toLowerCase() === "true"
        : false,
    emotes: {},
    kickEmotes: {},
    badges: {},
    kickBadges: {},
    kickSubscriberBadges: {},
    userBadges: {},
    ffzapBadges: null,
    bttvBadges: null,
    seventvBadges: null,
    seventvBadgeCache: {},
    seventvPaintCache: {},
    seventvBadgeRequests: {},
    seventvNamePaints:
      "seventv_paints" in $.QueryString
        ? /^(1|true|yes)$/i.test($.QueryString.seventv_paints)
        : false,
    chatterinoBadges: null,
    cheers: {},
    lines: [],
    deletedMessages: {},
    blockedUsers:
      "block" in $.QueryString
        ? $.QueryString.block.toLowerCase().split(",")
        : false,
    bots: Array.isArray(window.jChatPlusBots) ? window.jChatPlusBots : [],
  },

  normalizeBlockedUsers: function (value) {
    if (!value) {
      return false;
    }

    var users = String(value)
      .toLowerCase()
      .split(",")
      .map(function (user) {
        return user.trim();
      })
      .filter(Boolean);

    return users.length ? users : false;
  },

  isUserBlocked: function (value) {
    if (!Chat.info.blockedUsers || !value) {
      return false;
    }

    return Chat.info.blockedUsers.includes(String(value).toLowerCase());
  },

  clearChat: function (nick) {
    setTimeout(function () {
      $(".chat_line[data-nick=" + nick + "]").remove();
    }, 200);
  },

  clearMessage: function (id) {
    if (!id) return;

    id = id.toString();
    Chat.info.deletedMessages[id] = Date.now();

    // Remove from the pending line queue too, in case the line has not hit the DOM yet.
    var escapedId = $("<div>").text(id).html();
    Chat.info.lines = Chat.info.lines.filter(function (line) {
      return line.indexOf('data-id="' + escapedId + '"') === -1;
    });

    setTimeout(function () {
      $(".chat_line")
        .filter(function () {
          return $(this).attr("data-id") === id;
        })
        .remove();
    }, 200);

    // Prevent the deleted-message cache from growing forever.
    var cutoff = Date.now() - 10 * 60 * 1000;
    Object.keys(Chat.info.deletedMessages).forEach(function (messageId) {
      if (Chat.info.deletedMessages[messageId] < cutoff) {
        delete Chat.info.deletedMessages[messageId];
      }
    });
  },

  connect: function (channel) {
    Chat.info.channel = channel;
    var title = $(document).prop("title");
    $(document).prop("title", title + Chat.info.channel);

    if (!Chat.info.preview) {
      if (Chat.info.kickRoomId) {
        Chat.connectKick(Chat.info.kickRoomId);
      } else if (Chat.info.kickChannel !== false) {
        Chat.connectKickChannel(Chat.info.kickChannel);
      }
    }

    Chat.load(function () {
      console.log("jChat: Connecting to IRC server...");
      var socket = new ReconnectingWebSocket(
        "wss://irc-ws.chat.twitch.tv",
        "irc",
        { reconnectInterval: 2000 },
      );

      socket.onopen = function () {
        console.log("jChat: Connected");
        socket.send("PASS blah\r\n");
        socket.send(
          "NICK justinfan" + Math.floor(Math.random() * 99999) + "\r\n",
        );
        socket.send("CAP REQ :twitch.tv/commands twitch.tv/tags\r\n");
        socket.send("JOIN #" + Chat.info.channel + "\r\n");
      };

      socket.onclose = function () {
        console.log("jChat: Disconnected");
      };

      socket.onmessage = function (data) {
        data.data.split("\r\n").forEach((line) => {
          if (!line) return;
          var message = window.parseIRC(line);
          if (!message.command) return;

          switch (message.command) {
            case "PING":
              socket.send("PONG " + message.params[0]);
              return;
            case "JOIN":
              console.log("jChat: Joined channel #" + Chat.info.channel);
              return;
            case "CLEARMSG":
              if (message.tags)
                Chat.clearMessage(message.tags["target-msg-id"]);
              return;
            case "CLEARCHAT":
              if (message.params[1]) Chat.clearChat(message.params[1]);
              return;
            case "PRIVMSG":
              if (message.params[0] !== "#" + channel || !message.params[1])
                return;
              var nick = message.prefix.split("@")[0].split("!")[0];

              if (
                message.params[1].toLowerCase() === "!reloadchat" &&
                typeof message.tags.badges === "string"
              ) {
                var reloadFlag = false;

                message.tags.badges.split(",").forEach((badge) => {
                  badge = badge.split("/");
                  if (badge[0] === "moderator" || badge[0] === "broadcaster") {
                    reloadFlag = true;
                    return;
                  }
                });

                if (reloadFlag) {
                  location.reload();
                  return;
                }
              }

              if (Chat.info.hideCommands) {
                if (/^!.+/.test(message.params[1])) return;
              }

              if (!Chat.info.showBots) {
                if (Chat.info.bots.includes(nick)) return;
              }

              if (Chat.info.blockedUsers) {
                if (Chat.info.blockedUsers.includes(nick)) return;
              }

              function writeTwitchMessage() {
                Chat.write(nick, message.tags, message.params[1]);
              }

              if (
                (!Chat.info.hideBadges &&
                  !Chat.info.hideAllBadges &&
                  Chat.info.bttvBadges &&
                  Chat.info.seventvBadges &&
                  Chat.info.chatterinoBadges &&
                  Chat.info.ffzapBadges &&
                  Chat.shouldLoadUserBadges(nick, message.tags["user-id"])) ||
                Chat.shouldLoadSevenTvNamePaint(message.tags["user-id"])
              ) {
                Chat.loadUserBadges(nick, message.tags["user-id"]).always(
                  writeTwitchMessage,
                );
                return;
              }

              writeTwitchMessage();
              return;
          }
        });
      };
    });
  },
});

$(document).ready(function () {
  Chat.connect(
    $.QueryString.channel ? $.QueryString.channel.toLowerCase() : "giambaj",
  );
});

window.addEventListener("message", function (event) {
  if (event.origin !== window.location.origin) {
    return;
  }

  var data = event.data || {};

  if (data.type !== "jchat_plus_preview_settings") {
    return;
  }

  if (!Chat.info.preview) {
    return;
  }

  Chat.applyPreviewQuery(data.query);
});
