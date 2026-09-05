(function () {
  window.Chat = window.Chat || {};
  var ffzRoomBadgeOverrides = {};

  function storeBadges(response, globalBadges) {
    if (!response || !Array.isArray(response.data)) return;
    response.data.forEach(function (badgeSet) {
      (badgeSet.versions || []).forEach(function (version) {
        var key = badgeSet.set_id + ":" + version.id;
        if (ffzRoomBadgeOverrides[key] || (globalBadges && Chat.info.badges[key])) return;
        Chat.info.badges[key] = version.image_url_4x;
      });
    });
  }

  $.extend(Chat, {
    loadSharedResources: function () {
      if (!["twitch", "kick", "youtube"].some(Chat.isPlatformEnabled)) return;
      Chat.loadGlobalEmotes();
    },

    loadTwitchGlobalResources: function () {
      if (!Chat.isPlatformEnabled("twitch")) return;
      if (Chat.info.ffzUserBadges && !Chat.info.hideBadges && Chat.shouldRenderNormalBadges()) {
        Chat.loadFfzUserBadgeData();
      }
      if (!Chat.info.twitchGlobalResourcesLoaded) {
        Chat.info.twitchGlobalResourcesLoaded = true;
        Chat.twitchApi("/chat/badges/global").done(function (res) { storeBadges(res, true); });
      }

      if (!Chat.info.hideBadges && !Chat.info.hideAllBadges && !Chat.info.twitchUserResourcesLoaded) {
        Chat.info.twitchUserResourcesLoaded = true;
        [
          ["https://api.ffzap.com/v1/supporters", "ffzapBadges"],
          ["https://api.betterttv.net/3/cached/badges", "bttvBadges"],
          ["https://api.chatterino.com/badges", "chatterinoBadges"],
        ].forEach(function (resource) {
          $.getJSON(resource[0]).done(function (res) {
            Chat.info[resource[1]] = resource[1] === "chatterinoBadges" ? res.badges : res;
          }).fail(function () {
            Chat.info[resource[1]] = [];
          });
        });
        Chat.info.seventvBadges = [];
      }
    },

    load: function () {
      if (Chat.info.preview || !Chat.isPlatformEnabled("twitch") || Chat.info.twitchChannelResourcesStarted) return;
      Chat.info.twitchChannelResourcesStarted = true;
      var generation = Chat.info.startupGeneration;
      var channel = Chat.info.channel;
      function active() {
        return generation === Chat.info.startupGeneration &&
          Chat.isPlatformEnabled("twitch") && Chat.info.channel === channel;
      }

      Chat.twitchApi("/users", { login: channel }).done(function (res) {
        if (!active()) return;
        if (!res.data || !res.data[0]) {
          console.warn("jChat: Twitch user not found for channel " + channel);
          return;
        }

        var channelID = res.data[0].id;
        Chat.info.channelID = channelID;
        Chat.loadEmotes(channelID);
        Chat.twitchApi("/chat/badges", { broadcaster_id: channelID }).done(function (badges) {
          if (active()) storeBadges(badges);
        });

        if (Chat.info.ffzRoomBadges) {
          $.getJSON("https://api.frankerfacez.com/v1/_room/id/" + encodeURIComponent(channelID))
            .done(function (response) {
              if (!active() || !response || !response.room) return;
              if (response.room.moderator_badge) {
                ffzRoomBadgeOverrides["moderator:1"] = true;
                Chat.info.badges["moderator:1"] = "https://cdn.frankerfacez.com/room-badge/mod/" + channel + "/4/rounded";
              }
              if (response.room.vip_badge) {
                ffzRoomBadgeOverrides["vip:1"] = true;
                Chat.info.badges["vip:1"] = "https://cdn.frankerfacez.com/room-badge/vip/" + channel + "/4";
              }
            });
        }

        Chat.twitchApi("/bits/cheermotes", { broadcaster_id: channelID }).done(function (response) {
          if (!active() || !response || !Array.isArray(response.data)) return;
          response.data.forEach(function (action) {
            Chat.info.cheers[action.prefix] = {};
            (action.tiers || []).forEach(function (tier) {
              var images = tier.images && tier.images.dark && tier.images.dark.animated;
              Chat.info.cheers[action.prefix][tier.min_bits] = {
                image: images && (images["4"] || images["3"] || images["2"] || images["1"]),
                color: tier.color,
              };
            });
          });
        });
      }).fail(function () {
        if (active()) console.warn("jChat: Twitch channel assets unavailable.");
      });
    },
  });
})();
