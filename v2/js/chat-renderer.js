(function () {
  window.Chat = window.Chat || {};

  var renderGeneration = 0;
  var pendingBatches = [];

  function queuedLineElement(line) {
    var template = document.createElement("template");
    template.innerHTML = line;
    return template.content.firstElementChild;
  }

  function discardPendingLines(matches) {
    function keep(line) {
      var element = queuedLineElement(line);
      return element && !matches(element);
    }
    Chat.info.lines = Chat.info.lines.filter(keep);
    pendingBatches.forEach(function (batch) {
      batch.lines = batch.lines.filter(keep);
    });
  }

  function insertLines(batch) {
    if (batch.generation !== renderGeneration) return;
    var $lines = $(batch.lines.join(""));
    $("#chat_container").append($lines);
    $lines.each(function () { Chat.activateRenderedGifs(this); });
    Chat.cleanupRenderedLines();
  }

  $.extend(Chat, {
    removeRenderedLines: function ($lines) {
      $lines.each(function () { Chat.releaseGifMedia(this); });
      $lines.stop(true, false).remove();
    },

    resetRenderedMessages: function () {
      renderGeneration++;
      Chat.info.lines = [];
      pendingBatches.forEach(function (batch) {
        batch.$animation.stop(true, false).remove();
      });
      pendingBatches = [];
      Chat.removeRenderedLines($("#chat_container .chat_line"));
      $("#chat_container").empty();
    },

    clearChat: function (nick, platform) {
      platform = platform || "twitch";
      function matches(element) {
        return (
          element.getAttribute("data-platform") === platform &&
          (!nick || String(element.getAttribute("data-nick")).toLowerCase() === String(nick).toLowerCase())
        );
      }
      discardPendingLines(matches);
      Chat.removeRenderedLines($("#chat_container .chat_line").filter(function () {
        return matches(this);
      }));
    },

    clearMessage: function (id) {
      if (!id) return;
      id = String(id);
      Chat.info.deletedMessages[id] = Date.now();
      function matches(element) { return element.getAttribute("data-id") === id; }
      discardPendingLines(matches);
      Chat.removeRenderedLines($("#chat_container .chat_line").filter(function () {
        return matches(this);
      }));

      var cutoff = Date.now() - 10 * 60 * 1000;
      Object.keys(Chat.info.deletedMessages).forEach(function (messageId) {
        if (Chat.info.deletedMessages[messageId] < cutoff) {
          delete Chat.info.deletedMessages[messageId];
        }
      });
    },

    cleanupRenderedLines: function () {
      var $lines = $("#chat_container .chat_line");

      $lines.each(function () {
        var rect = this.getBoundingClientRect();

        if (rect.bottom < -20) {
          Chat.removeRenderedLines($(this));
        }
      });

      $lines = $("#chat_container .chat_line");

      while ($lines.length > 60) {
        Chat.removeRenderedLines($lines.eq(0));
        $lines = $("#chat_container .chat_line");
      }
    },

    update: setInterval(function () {
      if (Chat.info.lines.length > 0) {
        var batch = { lines: Chat.info.lines, generation: renderGeneration };
        Chat.info.lines = [];

        if (Chat.info.animate) {
          var $auxDiv = $("<div></div>", { class: "hidden" }).appendTo(
            "#chat_container",
          );
          $auxDiv.append(batch.lines.join(""));
          var auxHeight = $auxDiv.height();
          $auxDiv.remove();

          batch.$animation = $("<div></div>");
          pendingBatches.push(batch);
          $("#chat_container").append(batch.$animation);
          batch.$animation.animate({ height: auxHeight }, 150, function () {
            $(this).remove();
            pendingBatches = pendingBatches.filter(function (pending) { return pending !== batch; });
            insertLines(batch);
          });
        } else {
          insertLines(batch);
        }
      } else if (Chat.info.fade) {
        var messageTime = $(".chat_line").eq(0).data("time");
        if ((Date.now() - messageTime) / 1000 >= Chat.info.fade) {
          $(".chat_line")
            .eq(0)
            .fadeOut(function () {
              Chat.removeRenderedLines($(this));
            });
        }
      }
    }, 200),

    write: function (nick, info, message) {
      if (info) {
        var platform = info.platform || "twitch";
        if (!Chat.isPlatformEnabled(platform)) return;
        if (
          Chat.isUserBlocked(nick) ||
          Chat.isUserBlocked(info["display-name"])
        ) {
          return;
        }
        if (!Chat.info.showBots && Chat.info.bots.includes(String(nick).toLowerCase())) return;
        if (Chat.info.hideCommands && /^!.+/.test(message)) return;
        if (info.id && Chat.info.deletedMessages[info.id.toString()]) return;
        var $chatLine = $("<div></div>");
        $chatLine.addClass("chat_line");
        $chatLine.attr("data-nick", nick);
        $chatLine.attr("data-time", Date.now());
        $chatLine.attr("data-id", info.id);
        $chatLine.attr("data-platform", platform);

        if (platform === "twitch" && info["user-id"]) {
          $chatLine.attr("data-user-id", String(info["user-id"]));
        }

        if (info.previewFfzUserBadge) {
          $chatLine.attr("data-preview-ffz-user-badge", "true");
        }

        var $userInfo = $("<span></span>");
        $userInfo.addClass("user_info");

        Chat.appendPlatformBadge($userInfo, info.platform);

        // Writing badges
        if (
          Chat.shouldRenderNormalBadges() &&
          typeof info.badges === "string"
        ) {
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

            var userBadges =
              platform === "twitch" && (!Chat.info.preview || info.previewFfzUserBadge)
                ? Chat.getFfzUserBadges(info["user-id"]).slice()
                : [];

            if (platform === "twitch" && Array.isArray(Chat.info.userBadges[nick])) {
              userBadges = userBadges.concat(Chat.info.userBadges[nick]);
            }

            userBadges.forEach((badge) => {
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

        if (platform === "twitch") Chat.applySevenTvNamePaint($username, info["user-id"]);

        $userInfo.append($username);

        // Writing message
        var $message = $("<span></span>");
        $message.addClass("message");
        if (/^\x01ACTION [\s\S]*\x01$/.test(message)) {
          $message.css("color", color);
          // Preserve body whitespace until after positional replacements.
          message = message.slice(8, -1);
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
            if (!twitchEmote[0] || !twitchEmote[1]) return;
            var indexes = twitchEmote[1].split(",")[0].split("-");
            if (!/^\d+$/.test(indexes[0]) || !/^\d+$/.test(indexes[1])) return;
            var emoteCode = Array.from(message).slice(Number(indexes[0]), Number(indexes[1]) + 1).join("");
            if (!emoteCode) return;
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

        var replacementKeys = Object.keys(replacements);
        replacementKeys.sort(function (a, b) {
          return b.length - a.length;
        });

        var bits = parseInt(info.bits, 10) || 0;
        var parsed = false;
        function renderMessageText(text) {
          text = escapeHtml(text);

          if (bits > 0) {
            for (const cheerType of Object.entries(Chat.info.cheers)) {
              var regex = new RegExp(cheerType[0] + "\\d+\\s*", "ig");
              if (text.search(regex) > -1) {
                text = text.replace(regex, "");

                if (!parsed) {
                  var closest = 1;
                  for (const cheerTier of Object.keys(cheerType[1])
                    .map(Number)
                    .sort((a, b) => a - b)) {
                    if (bits >= cheerTier) closest = cheerTier;
                    else break;
                  }
                  text =
                    '<img class="cheer_emote" src="' +
                    cheerType[1][closest].image +
                    '" /><span class="cheer_bits" style="color: ' +
                    cheerType[1][closest].color +
                    ';">' +
                    bits +
                    "</span> " +
                    text;
                  parsed = true;
                }
              }
            }
          }

          replacementKeys.forEach((replacementKey) => {
            var regex = new RegExp(
              "(?<!\\S)(" + escapeRegExp(replacementKey) + ")(?!\\S)",
              "g",
            );
            text = text.replace(regex, replacements[replacementKey]);
          });

          if (Chat.info.emojiStyle === "twemoji") {
            text = twemoji.parse(text, {
              base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
              folder: "svg",
              ext: ".svg",
            });
          }
          return text;
        }

        var gifRanges = Chat.getNativeGifRanges(info, message);
        if (!gifRanges.length) {
          $message.html(renderMessageText(message));
        } else {
          var cursor = 0;
          gifRanges.forEach(function (range) {
            $message.append(renderMessageText(message.slice(cursor, range.start)));
            $message.append(Chat.createGifPlaceholder(range));
            cursor = range.end;
          });
          $message.append(renderMessageText(message.slice(cursor)));
        }

        // Writing zero-width emotes
        const messageNodes = $message.children();
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
