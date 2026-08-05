(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    getYouTubeNameColor: function (name) {
      var value = String(name || "youtube")
        .trim()
        .toLowerCase();

      var hash = 0;

      for (var i = 0; i < value.length; i++) {
        // Based on Datagutt's BetterYTL username colour hashing.
        // This is effectively: hash * 31 + the current character.
        hash = value.charCodeAt(i) + ((hash << 5) - hash);

        hash |= 0;
      }

      var hue = ((hash % 360) + 360) % 360;

      return "hsl(" + hue + ", 75%, 60%)";
    },

    writeYouTubeMessage: function (data) {
      if (!data) return;

      var displayName = String(data.displayName || "").trim();
      var message = String(data.message || "");

      if (!displayName || !message) return;

      var nick = displayName.toLowerCase();
      var messageId =
        data.id ||
        "test-" +
          Date.now() +
          "-" +
          Math.random().toString(36).slice(2);

      var info = {
        id: "youtube:" + messageId,
        "display-name": displayName,
        "user-id": data.userId ? "youtube:" + data.userId : null,
        color: Chat.getYouTubeNameColor(displayName),
        badges: null,
        emotes: null,
        mod: "0",
        bits: "0",
        platform: "youtube",
      };

      Chat.write(nick, info, message);
    },
  });
})();