(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
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
})();