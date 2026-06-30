(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    hasUserBadgeUrl: function (nick, url) {
      var badges = Chat.info.userBadges[nick];

      if (!Array.isArray(badges) || !url) {
        return false;
      }

      return badges.some(function (badge) {
        return badge && badge.url === url;
      });
    },

    shouldLoadUserBadges: function (nick, userId) {
      if (!nick) {
        return false;
      }

      if (!Chat.info.userBadges[nick]) {
        return true;
      }

      userId = String(userId || "");

      if (/^\d+$/.test(userId)) {
        var cachedSevenTvBadge = Chat.info.seventvBadgeCache[userId];

        if (cachedSevenTvBadge && cachedSevenTvBadge.url) {
          return !Chat.hasUserBadgeUrl(nick, cachedSevenTvBadge.url);
        }

        if (
          !Object.prototype.hasOwnProperty.call(
            Chat.info.seventvBadgeCache,
            userId,
          ) &&
          !Chat.info.seventvBadgeRequests[userId]
        ) {
          return true;
        }
      }

      return false;
    },

    addUserBadge: function (nick, userBadge) {
      if (!nick || !userBadge || !userBadge.url) return;

      if (!Array.isArray(Chat.info.userBadges[nick])) {
        Chat.info.userBadges[nick] = [];
      }

      var exists = Chat.info.userBadges[nick].some(function (existing) {
        return (
          existing.description === userBadge.description &&
          existing.url === userBadge.url
        );
      });

      if (!exists) {
        Chat.info.userBadges[nick].push(userBadge);
      }
    },

    loadUserBadges: function (nick, userId) {
      if (!Array.isArray(Chat.info.userBadges[nick])) {
        Chat.info.userBadges[nick] = [];
      }

      var normalizedNick = String(nick || "").toLowerCase();
      var normalizedUserId = String(userId || "");
      var requests = [];

      function waitFor(request) {
        var done = $.Deferred();

        request.always(function () {
          done.resolve();
        });

        return done.promise();
      }

      if (Chat.info.ffzUserBadges) {
        var ffzRequest = $.getJSON(
          "https://api.frankerfacez.com/v1/user/" + encodeURIComponent(nick),
        ).done(function (res) {
          if (!res || !res.badges) return;

          var userBadgeIds =
            res.user && Array.isArray(res.user.badges)
              ? res.user.badges.map(function (id) {
                  return String(id);
                })
              : Object.keys(res.badges);

          userBadgeIds.forEach(function (badgeId) {
            var badge = res.badges[String(badgeId)];

            if (!badge) return;

            var badgeUrl =
              badge.image || badge.alpha_image || badge.svg || badge.url;

            if (!badgeUrl) return;

            if (badgeUrl.indexOf("//") === 0) {
              badgeUrl = "https:" + badgeUrl;
            }

            Chat.addUserBadge(nick, {
              description:
                badge.title ||
                badge.name ||
                badge.tooltip ||
                "FrankerFaceZ Badge",
              url: badgeUrl,
              color: badge.color || false,
            });
          });
        });

        requests.push(waitFor(ffzRequest));
      }

      if (Array.isArray(Chat.info.ffzapBadges) && normalizedUserId) {
        Chat.info.ffzapBadges.forEach(function (user) {
          if (!user || String(user.id) !== normalizedUserId) return;

          var color = "#755000";

          if (user.tier == 2) {
            color = user.badge_color || "#755000";
          } else if (user.tier == 3) {
            color =
              user.badge_is_colored == 0
                ? user.badge_color || "#755000"
                : false;
          }

          Chat.addUserBadge(nick, {
            description: "FFZ:AP Badge",
            url:
              "https://api.ffzap.com/v1/user/badge/" + normalizedUserId + "/3",
            color: color,
          });
        });
      }

      if (Array.isArray(Chat.info.bttvBadges)) {
        Chat.info.bttvBadges.forEach(function (user) {
          if (!user || !user.badge) return;
          if (String(user.name || "").toLowerCase() !== normalizedNick) return;

          Chat.addUserBadge(nick, {
            description: user.badge.description,
            url: user.badge.svg,
          });
        });
      }

      if (Array.isArray(Chat.info.seventvBadges)) {
        Chat.info.seventvBadges.forEach(function (badge) {
          if (!badge || !Array.isArray(badge.users)) return;

          badge.users.forEach(function (user) {
            if (String(user || "").toLowerCase() !== normalizedNick) return;

            var badgeUrl = null;

            if (badge.urls && badge.urls[2] && badge.urls[2][1]) {
              badgeUrl = badge.urls[2][1];
            } else if (badge.urls && badge.urls[0] && badge.urls[0][1]) {
              badgeUrl = badge.urls[0][1];
            } else if (badge.url) {
              badgeUrl = badge.url;
            }

            if (!badgeUrl) return;

            Chat.addUserBadge(nick, {
              description: badge.tooltip || badge.name || "7TV Badge",
              url: badgeUrl,
            });
          });
        });
      }

      if (/^\d+$/.test(normalizedUserId)) {
        requests.push(
          waitFor(Chat.loadSevenTvUserBadge(nick, normalizedUserId)),
        );
      }

      if (Array.isArray(Chat.info.chatterinoBadges) && normalizedUserId) {
        Chat.info.chatterinoBadges.forEach(function (badge) {
          if (!badge || !Array.isArray(badge.users)) return;

          badge.users.forEach(function (user) {
            if (String(user) !== normalizedUserId) return;

            Chat.addUserBadge(nick, {
              description: badge.tooltip,
              url: badge.image3 || badge.image2 || badge.image1,
            });
          });
        });
      }

      if (requests.length) {
        return $.when.apply($, requests);
      }

      return $.Deferred().resolve().promise();
    },

    appendChatBadge: function ($target, badgeData) {
      if (Chat.info.hideAllBadges) return null;
      if (!badgeData) return null;

      var $badge;

      if (typeof badgeData === "object" && badgeData.html) {
        $badge = $(badgeData.html);
      } else {
        $badge = $("<img/>");
        $badge.addClass("badge");

        if (typeof badgeData === "object") {
          if (badgeData.color) $badge.css("background-color", badgeData.color);
          $badge.attr("src", badgeData.url || badgeData.src || badgeData.image);
        } else {
          $badge.attr("src", badgeData);
        }
      }

      if (!$badge || !$badge.length) return null;

      $target.append($badge);
      return $badge;
    },
  });
})();
