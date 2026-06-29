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

  loadEmotes: function (channelID) {
    Chat.info.emotes = {};
    // Load BTTV, FFZ and 7TV emotes
    ["emotes/global", "users/twitch/" + encodeURIComponent(channelID)].forEach(
      (endpoint) => {
        $.getJSON(
          "https://api.betterttv.net/3/cached/frankerfacez/" + endpoint,
        ).done(function (res) {
          res.forEach((emote) => {
            if (emote.images["4x"]) {
              var imageUrl = emote.images["4x"];
              var upscale = false;
            } else {
              var imageUrl = emote.images["2x"] || emote.images["1x"];
              var upscale = true;
            }
            Chat.info.emotes[emote.code] = {
              id: emote.id,
              image: imageUrl,
              upscale: upscale,
            };
          });
        });
      },
    );

    ["emotes/global", "users/twitch/" + encodeURIComponent(channelID)].forEach(
      (endpoint) => {
        $.getJSON("https://api.betterttv.net/3/cached/" + endpoint).done(
          function (res) {
            if (!Array.isArray(res)) {
              res = res.channelEmotes.concat(res.sharedEmotes);
            }
            res.forEach((emote) => {
              Chat.info.emotes[emote.code] = {
                id: emote.id,
                image: "https://cdn.betterttv.net/emote/" + emote.id + "/3x",
                zeroWidth: [
                  "5e76d338d6581c3724c0f0b2",
                  "5e76d399d6581c3724c0f0b8",
                  "567b5b520e984428652809b6",
                  "5849c9a4f52be01a7ee5f79d",
                  "567b5c080e984428652809ba",
                  "567b5dc00e984428652809bd",
                  "58487cc6f52be01a7ee5f205",
                  "5849c9c8f52be01a7ee5f79e",
                ].includes(emote.id), // "5e76d338d6581c3724c0f0b2" => cvHazmat, "5e76d399d6581c3724c0f0b8" => cvMask, "567b5b520e984428652809b6" => SoSnowy, "5849c9a4f52be01a7ee5f79d" => IceCold, "567b5c080e984428652809ba" => CandyCane, "567b5dc00e984428652809bd" => ReinDeer, "58487cc6f52be01a7ee5f205" => SantaHat, "5849c9c8f52be01a7ee5f79e" => TopHat
              };
            });
          },
        );
      },
    );

    $.getJSON("https://7tv.io/v3/emote-sets/global").done(function (res) {
      if (!res || !res.emotes) return;

      res.emotes.forEach((emote) => {
        if (!emote.data || !emote.data.host || !emote.data.host.files) return;

        var files = emote.data.host.files;
        var file = files[files.length - 1];

        Chat.info.emotes[emote.name] = {
          id: emote.id,
          image: "https:" + emote.data.host.url + "/" + file.name,
          zeroWidth: emote.data.flags === 256,
        };
      });
    });

    $.getJSON("https://7tv.io/v3/users/twitch/" + encodeURIComponent(channelID))
      .done(function (res) {
        if (!res || !res.emote_set || !res.emote_set.emotes) return;

        res.emote_set.emotes.forEach((emote) => {
          if (!emote.data || !emote.data.host || !emote.data.host.files) return;

          var files = emote.data.host.files;
          var file = files[files.length - 1];

          Chat.info.emotes[emote.name] = {
            id: emote.id,
            image: "https:" + emote.data.host.url + "/" + file.name,
            zeroWidth: emote.data.flags === 256,
          };
        });
      })
      .fail(function () {
        console.warn("jChat: Failed to load 7TV channel emotes.");
      });
  },

  load: function (callback) {
    Chat.twitchApi("/users", {
      login: Chat.info.channel,
    }).done(function (res) {
      if (!res.data || !res.data[0]) {
        console.warn(
          "jChat: Twitch user not found for channel " + Chat.info.channel,
        );
        return;
      }

      Chat.info.channelID = res.data[0].id;
      Chat.loadEmotes(Chat.info.channelID);

      // Load CSS
      Chat.applyStaticStyles();

      // Load badges
      Chat.twitchApi("/chat/badges/global").done(function (global) {
        if (global.data) {
          global.data.forEach((badgeSet) => {
            badgeSet.versions.forEach((version) => {
              Chat.info.badges[badgeSet.set_id + ":" + version.id] =
                version.image_url_4x;
            });
          });
        }

        Chat.twitchApi("/chat/badges", {
          broadcaster_id: Chat.info.channelID,
        }).done(function (channel) {
          if (channel.data) {
            channel.data.forEach((badgeSet) => {
              badgeSet.versions.forEach((version) => {
                Chat.info.badges[badgeSet.set_id + ":" + version.id] =
                  version.image_url_4x;
              });
            });
          }

          if (Chat.info.ffzRoomBadges) {
            $.getJSON(
              "https://api.frankerfacez.com/v1/_room/id/" +
                encodeURIComponent(Chat.info.channelID),
            )
              .done(function (res) {
                if (!res || !res.room) return;

                if (res.room.moderator_badge) {
                  Chat.info.badges["moderator:1"] =
                    "https://cdn.frankerfacez.com/room-badge/mod/" +
                    Chat.info.channel +
                    "/4/rounded";
                }

                if (res.room.vip_badge) {
                  Chat.info.badges["vip:1"] =
                    "https://cdn.frankerfacez.com/room-badge/vip/" +
                    Chat.info.channel +
                    "/4";
                }
              })
              .fail(function () {
                console.warn(
                  "jChat: No FFZ room badges found for channel " +
                    Chat.info.channel +
                    ". This is fine.",
                );
              });
          }
        });
      });

      // Load users badges
      if (!Chat.info.hideBadges && !Chat.info.hideAllBadges) {
        $.getJSON("https://api.ffzap.com/v1/supporters")
          .done(function (res) {
            Chat.info.ffzapBadges = res;
          })
          .fail(function () {
            Chat.info.ffzapBadges = [];
          });
        $.getJSON("https://api.betterttv.net/3/cached/badges")
          .done(function (res) {
            Chat.info.bttvBadges = res;
          })
          .fail(function () {
            Chat.info.bttvBadges = [];
          });

        Chat.info.seventvBadges = [];

        $.getJSON("https://api.chatterino.com/badges")
          .done(function (res) {
            Chat.info.chatterinoBadges = res.badges;
          })
          .fail(function () {
            Chat.info.chatterinoBadges = [];
          });
      }

      // Load cheers images
      Chat.twitchApi("/bits/cheermotes", {
        broadcaster_id: Chat.info.channelID,
      })
        .done(function (res) {
          if (!res.data) {
            console.warn("jChat: No cheermote data returned.");
            return;
          }

          res.data.forEach((action) => {
            Chat.info.cheers[action.prefix] = {};

            action.tiers.forEach((tier) => {
              var image =
                tier.images &&
                tier.images.dark &&
                tier.images.dark.animated &&
                (tier.images.dark.animated["4"] ||
                  tier.images.dark.animated["3"] ||
                  tier.images.dark.animated["2"] ||
                  tier.images.dark.animated["1"]);

              Chat.info.cheers[action.prefix][tier.min_bits] = {
                image: image,
                color: tier.color,
              };
            });
          });
        })
        .fail(function (err) {
          console.warn("jChat: Failed to load cheermotes.", err);
        });

      if (Chat.info.preview) {
        Chat.loadPreviewKickAssets(function () {
          Chat.startPreview();
        });
        return;
      }

      if (callback) {
        callback(true);
      }
    });
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
