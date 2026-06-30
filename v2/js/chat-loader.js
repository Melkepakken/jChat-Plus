(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
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
  });
})();