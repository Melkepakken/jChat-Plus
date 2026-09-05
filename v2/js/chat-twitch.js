(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    connect: function (channel) {
      if (
        Chat.info.preview ||
        !Chat.isPlatformEnabled("twitch") ||
        Chat.info.twitchStarted
      ) return;
      channel = window.jChatPlatformSettings.normalizeTwitchChannel(channel);
      if (!channel) return;
      Chat.info.twitchStarted = true;
      var generation = Chat.info.startupGeneration;
      function active() {
        return generation === Chat.info.startupGeneration &&
          Chat.isPlatformEnabled("twitch");
      }

      var title = $(document).prop("title");
      $(document).prop("title", title + Chat.info.channel);
      console.log("jChat: Connecting to IRC server...");
      var socket = new ReconnectingWebSocket(
        "wss://irc-ws.chat.twitch.tv",
        "irc",
        { reconnectInterval: 2000 },
      );
      Chat.info.twitchSocket = socket;

      socket.onopen = function () {
        if (!active()) {
          socket.close();
          return;
        }
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
        if (!active() || !data || typeof data.data !== "string") return;
        data.data.split("\r\n").forEach((line) => {
          if (!line) return;
          var message;
          try {
            message = window.parseIRC(line);
          } catch (err) {
            return;
          }
          if (!message || !message.command) return;

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
              Chat.clearChat(message.params[1], "twitch");
              return;
            case "PRIVMSG":
              if (
                typeof message.prefix !== "string" || !message.prefix ||
                message.params[0] !== "#" + channel || !message.params[1]
              )
                return;
              var nick = message.prefix.split("@")[0].split("!")[0];

              if (
                message.params[1].toLowerCase() === "!reloadchat" &&
                typeof message.tags.badges === "string"
              ) {
                var reloadFlag = false;

                message.tags.badges.split(",").forEach((badge) => {
                  badge = badge.split("/");
                  if (
                    badge[0] === "moderator" ||
                    badge[0] === "broadcaster"
                  ) {
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
                if (Chat.info.bots.includes(String(nick).toLowerCase()))
                  return;
              }

              if (Chat.isUserBlocked(nick)) return;

              function writeTwitchMessage() {
                var info = $.extend({}, message.tags, {
                  platform: "twitch",
                });

                Chat.write(nick, info, message.params[1]);
              }

              if (
                (!Chat.info.hideBadges &&
                  Chat.shouldRenderNormalBadges() &&
                  Chat.info.bttvBadges &&
                  Chat.info.seventvBadges &&
                  Chat.info.chatterinoBadges &&
                  Chat.info.ffzapBadges &&
                  Chat.shouldLoadUserBadges(nick, message.tags["user-id"])) ||
                Chat.shouldLoadSevenTvNamePaint(message.tags["user-id"])
              ) {
                Chat.loadUserBadges(nick, message.tags["user-id"]);
              }

              writeTwitchMessage();
              return;
          }
        });
      };
      Chat.load();
    },
  });
})();
