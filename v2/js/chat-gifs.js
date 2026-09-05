(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    decodeGifTag: function (value) {
      // IRCv3 escaping is applied here once, not by the shared IRC parser.
      return value.replace(/\\([\s\S])|\\$/g, function (_, escaped) {
        var escapes = { ":": ";", s: " ", "\\": "\\", r: "\r", n: "\n" };
        return escaped === undefined
          ? ""
          : Object.prototype.hasOwnProperty.call(escapes, escaped)
            ? escapes[escaped]
            : escaped;
      });
    },

    isValidGifUrl: function (value) {
      if (typeof value !== "string" || !/^https:\/\//i.test(value)) return false;
      // Reject characters that URL parsing would silently normalize away.
      if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
      try {
        var url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.port &&
          // GIPHY serves media from both bare and numbered media hosts.
          /^media(?:\d+)?\.giphy\.com$/i.test(url.hostname)
        );
      } catch (_) {
        return false;
      }
    },

    getNativeGifRanges: function (info, message) {
      if (
        !Chat.info.showGifs ||
        !Chat.isPlatformEnabled("twitch") ||
        !info ||
        info.platform !== "twitch" ||
        typeof info.gifs !== "string" ||
        !info.gifs
      ) {
        return [];
      }

      // Zero-based, inclusive ranges, as in Twitch's native GIF fixture.
      // Unicode code points and ACTION-body offsets follow IRC emote handling;
      // Twitch's GIF docs do not explicitly specify either convention yet.
      var characters = Array.from(message);
      var offsets = [0];
      characters.forEach(function (character) {
        offsets.push(offsets[offsets.length - 1] + character.length);
      });

      var ranges = [];
      var invalid = false;
      Chat.decodeGifTag(info.gifs).split(",").forEach(function (entry) {
        var match = /^(\d+)-(\d+)\|([^|]+)\|(.+)$/.exec(entry);
        if (!match) {
          invalid = true;
          return;
        }
        var start = Number(match[1]);
        var end = Number(match[2]);
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          end >= characters.length ||
          !Chat.isValidGifUrl(match[4])
        ) {
          invalid = true;
          return;
        }
        ranges.push({
          start: offsets[start],
          end: offsets[end + 1],
          url: match[4],
          caption: message.slice(offsets[start], offsets[end + 1]),
        });
      });

      ranges.sort(function (a, b) { return a.start - b.start; });
      for (var i = 1; i < ranges.length; i++) {
        if (ranges[i].start < ranges[i - 1].end) invalid = true;
      }
      // Reject the whole malformed tag rather than guessing at competing ranges.
      return invalid ? [] : ranges;
    },

    createGifPlaceholder: function (range) {
      var slot = document.createElement("span");
      slot.className = "chat_gif";
      slot.classList.add(
        Chat.info.gifSize === "small" ? "chat_gif_size_small" :
        Chat.info.gifSize === "large" ? "chat_gif_size_large" : "chat_gif_size_medium",
      );
      slot.setAttribute("data-gif-url", range.url);
      var caption = document.createElement("span");
      caption.className = "chat_gif_caption";
      caption.textContent = range.caption;
      slot.appendChild(caption);
      // No image or src is created in the HTML queue or measurement container.
      return slot;
    },

    activateRenderedGifs: function (root) {
      root.querySelectorAll(".chat_gif[data-gif-url]").forEach(function (slot) {
        var url = slot.getAttribute("data-gif-url");
        var caption = slot.querySelector(".chat_gif_caption");
        slot.removeAttribute("data-gif-url");
        if (
          !slot.isConnected ||
          !Chat.info.showGifs ||
          !Chat.isPlatformEnabled("twitch") ||
          !Chat.isValidGifUrl(url)
        ) {
          slot.replaceWith(document.createTextNode(caption ? caption.textContent : ""));
          return;
        }

        var image = document.createElement("img");
        image.className = "chat_gif_image";
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.onload = function () {
          image.onload = image.onerror = null;
          if (!slot.isConnected || !Chat.info.showGifs || !Chat.isPlatformEnabled("twitch")) {
            image.removeAttribute("src");
            image.remove();
            return;
          }
          slot.classList.add("chat_gif_loaded");
        };
        image.onerror = function () {
          image.onload = image.onerror = null;
          image.removeAttribute("src");
          image.remove();
          // Restore ordinary flowing text so long captions cannot be clipped.
          slot.replaceWith(document.createTextNode(caption ? caption.textContent : ""));
          // A failed attachment is not retried.
        };
        slot.appendChild(image);
        // Assign the supplied URL verbatim, including its complete query string.
        image.setAttribute("src", url);
      });
    },

    releaseGifMedia: function (root) {
      root.querySelectorAll(".chat_gif_image").forEach(function (image) {
        image.onload = image.onerror = null;
        image.removeAttribute("src");
        image.remove();
      });
    },
  });
})();
