(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    cleanupRenderedLines: function () {
      var $lines = $(".chat_line");

      $lines.each(function () {
        var rect = this.getBoundingClientRect();

        if (rect.bottom < -20) {
          $(this).remove();
        }
      });

      $lines = $(".chat_line");

      while ($lines.length > 60) {
        $lines.eq(0).remove();
        $lines = $(".chat_line");
      }
    },

    update: setInterval(function () {
      if (Chat.info.lines.length > 0) {
        var lines = Chat.info.lines.join("");

        if (Chat.info.animate) {
          var $auxDiv = $("<div></div>", { class: "hidden" }).appendTo(
            "#chat_container",
          );
          $auxDiv.append(lines);
          var auxHeight = $auxDiv.height();
          $auxDiv.remove();

          var $animDiv = $("<div></div>");
          $("#chat_container").append($animDiv);
          $animDiv.animate({ height: auxHeight }, 150, function () {
            $(this).remove();
            $("#chat_container").append(lines);
          });
        } else {
          $("#chat_container").append(lines);
        }
        Chat.info.lines = [];
        var linesToDelete = $(".chat_line").length - 100;
        while (linesToDelete > 0) {
          $(".chat_line").eq(0).remove();
          linesToDelete--;
        }

        Chat.cleanupRenderedLines();
      } else if (Chat.info.fade) {
        var messageTime = $(".chat_line").eq(0).data("time");
        if ((Date.now() - messageTime) / 1000 >= Chat.info.fade) {
          $(".chat_line")
            .eq(0)
            .fadeOut(function () {
              $(this).remove();
            });
        }
      }
    }, 200),

    write: function (nick, info, message) {
      if (info) {
        if (
          Chat.isUserBlocked(nick) ||
          Chat.isUserBlocked(info["display-name"])
        ) {
          return;
        }
        if (info.id && Chat.info.deletedMessages[info.id.toString()]) return;
        var $chatLine = $("<div></div>");
        $chatLine.addClass("chat_line");
        $chatLine.attr("data-nick", nick);
        $chatLine.attr("data-time", Date.now());
        $chatLine.attr("data-id", info.id);
        var $userInfo = $("<span></span>");
        $userInfo.addClass("user_info");

        // Writing badges
        if (typeof info.badges === "string") {
          var badgeTags = info.badges.split(",");

          if (Chat.info.hideBadges) {
            badgeTags.forEach((badge) => {
              badge = badge.split("/");
              var badgeData = Chat.info.badges[badge[0] + ":" + badge[1]];
              Chat.appendChatBadge($userInfo, badgeData);
            });
          } else {
            var badges = [];
            const priorityBadges = [
              "predictions",
              "admin",
              "global_mod",
              "staff",
              "twitchbot",
              "broadcaster",
              "moderator",
              "vip",
              "kick",
            ];

            badgeTags.forEach((badge) => {
              badge = badge.split("/");
              var badgeData = Chat.info.badges[badge[0] + ":" + badge[1]];
              var priority = priorityBadges.includes(badge[0]) ? true : false;

              if (!badgeData) return;

              badges.push({
                description: badge[0],
                data: badgeData,
                priority: priority,
              });
            });

            var $modBadge;

            badges.forEach((badge) => {
              if (badge.priority) {
                var $badge = Chat.appendChatBadge($userInfo, badge.data);
                if (badge.description === "moderator") $modBadge = $badge;
              }
            });

            if (Chat.info.userBadges[nick]) {
              Chat.info.userBadges[nick].forEach((badge) => {
                var $badge = Chat.appendChatBadge($userInfo, badge);

                if (
                  $badge &&
                  badge.description === "Bot" &&
                  info.mod === "1" &&
                  $modBadge
                ) {
                  $badge.css("background-color", "rgb(0, 173, 3)");
                  $modBadge.remove();
                }
              });
            }

            badges.forEach((badge) => {
              if (!badge.priority) {
                Chat.appendChatBadge($userInfo, badge.data);
              }
            });
          }
        }

        // Writing username
        var $username = $("<span></span>");
        $username.addClass("nick");
        var color;

        if (Chat.info.nicknameColor) {
          color = Chat.info.nicknameColor;

          if (/^[0-9a-f]{3,8}$/i.test(color)) {
            color = "#" + color;
          }
        } else if (typeof info.color === "string") {
          if (tinycolor(info.color).getBrightness() <= 50) {
            color = tinycolor(info.color).lighten(30).toString();
          } else {
            color = info.color;
          }
        } else {
          const twitchColors = [
            "#FF0000",
            "#0000FF",
            "#008000",
            "#B22222",
            "#FF7F50",
            "#9ACD32",
            "#FF4500",
            "#2E8B57",
            "#DAA520",
            "#D2691E",
            "#5F9EA0",
            "#1E90FF",
            "#FF69B4",
            "#8A2BE2",
            "#00FF7F",
          ];

          color = twitchColors[nick.charCodeAt(0) % twitchColors.length];
        }

        $username.css("color", color);
        $username.html(info["display-name"] ? info["display-name"] : nick);

        Chat.applySevenTvNamePaint($username, info["user-id"]);

        $userInfo.append($username);

        // Writing message
        var $message = $("<span></span>");
        $message.addClass("message");
        if (/^\x01ACTION.*\x01$/.test(message)) {
          $message.css("color", color);
          message = message
            .replace(/^\x01ACTION/, "")
            .replace(/\x01$/, "")
            .trim();
          $userInfo.append("<span>&nbsp;</span>");
        } else {
          $userInfo.append('<span class="colon">:</span>');
        }
        $chatLine.append($userInfo);

        // Replacing emotes and cheers
        var replacements = {};
        if (typeof info.emotes === "string") {
          info.emotes.split("/").forEach((emoteData) => {
            var twitchEmote = emoteData.split(":");
            var indexes = twitchEmote[1].split(",")[0].split("-");
            var emojis = new RegExp("[\u1000-\uFFFF]+", "g");
            var aux = message.replace(emojis, " ");
            var emoteCode = aux.substr(indexes[0], indexes[1] - indexes[0] + 1);
            replacements[emoteCode] =
              '<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/' +
              twitchEmote[0] +
              '/default/dark/3.0" />';
          });
        }

        Object.entries(Chat.info.emotes).forEach((emote) => {
          if (message.search(escapeRegExp(emote[0])) > -1) {
            if (emote[1].upscale)
              replacements[emote[0]] =
                '<img class="emote upscale" src="' + emote[1].image + '" />';
            else if (emote[1].zeroWidth)
              replacements[emote[0]] =
                '<img class="emote" data-zw="true" src="' +
                emote[1].image +
                '" />';
            else
              replacements[emote[0]] =
                '<img class="emote" src="' + emote[1].image + '" />';
          }
        });

        message = escapeHtml(message);

        if (info.bits && parseInt(info.bits) > 0) {
          var bits = parseInt(info.bits);
          var parsed = false;
          for (cheerType of Object.entries(Chat.info.cheers)) {
            var regex = new RegExp(cheerType[0] + "\\d+\\s*", "ig");
            if (message.search(regex) > -1) {
              message = message.replace(regex, "");

              if (!parsed) {
                var closest = 1;
                for (cheerTier of Object.keys(cheerType[1])
                  .map(Number)
                  .sort((a, b) => a - b)) {
                  if (bits >= cheerTier) closest = cheerTier;
                  else break;
                }
                message =
                  '<img class="cheer_emote" src="' +
                  cheerType[1][closest].image +
                  '" /><span class="cheer_bits" style="color: ' +
                  cheerType[1][closest].color +
                  ';">' +
                  bits +
                  "</span> " +
                  message;
                parsed = true;
              }
            }
          }
        }

        var replacementKeys = Object.keys(replacements);
        replacementKeys.sort(function (a, b) {
          return b.length - a.length;
        });

        replacementKeys.forEach((replacementKey) => {
          var regex = new RegExp(
            "(?<!\\S)(" + escapeRegExp(replacementKey) + ")(?!\\S)",
            "g",
          );
          message = message.replace(regex, replacements[replacementKey]);
        });

        if (Chat.info.emojiStyle === "twemoji") {
          message = twemoji.parse(message, {
            base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
            folder: "svg",
            ext: ".svg",
          });
        }
        $message.html(message);

        // Writing zero-width emotes
        messageNodes = $message.children();
        messageNodes.each(function (i) {
          if (
            i != 0 &&
            $(this).data("zw") &&
            ($(messageNodes[i - 1]).hasClass("emote") ||
              $(messageNodes[i - 1]).hasClass("emoji")) &&
            !$(messageNodes[i - 1]).data("zw")
          ) {
            var $container = $("<span></span>");
            $container.addClass("zero-width_container");
            $(this).addClass("zero-width");
            $(this).before($container);
            $container.append(messageNodes[i - 1], this);
          }
        });
        $message.html($message.html().trim());
        $chatLine.append($message);
        Chat.info.lines.push($chatLine.wrap("<div>").parent().html());
      }
    },
  });
})();
