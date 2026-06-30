(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
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
  });
})();