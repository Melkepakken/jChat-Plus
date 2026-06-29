(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    applyOverlayStyles: function () {
      $("#jchat_plus_overlay_styles").remove();

      var rules = [];

      function strokeShadows(value) {
        var stroke = Number(value);

        if (stroke === 1) {
          return ["-1px 0 #000", "1px 0 #000", "0 -1px #000", "0 1px #000"];
        }

        if (stroke === 2) {
          return [
            "-1px -1px #000",
            "-1px 0 #000",
            "-1px 1px #000",
            "0 -1px #000",
            "0 1px #000",
            "1px -1px #000",
            "1px 0 #000",
            "1px 1px #000",
          ];
        }

        if (stroke === 3) {
          return [
            "-2px -2px #000",
            "-2px 0 #000",
            "-2px 2px #000",
            "0 -2px #000",
            "0 2px #000",
            "2px -2px #000",
            "2px 0 #000",
            "2px 2px #000",
          ];
        }

        if (stroke === 4) {
          return [
            "-3px -3px #000",
            "-3px 0 #000",
            "-3px 3px #000",
            "0 -3px #000",
            "0 3px #000",
            "3px -3px #000",
            "3px 0 #000",
            "3px 3px #000",
          ];
        }

        return [];
      }

      function normalShadows(value) {
        var shadow = Number(value);

        if (shadow === 1) {
          return ["1px 1px 2px #000"];
        }

        if (shadow === 2) {
          return ["2px 2px 4px #000"];
        }

        if (shadow === 3) {
          return ["3px 3px 6px #000"];
        }

        return [];
      }

      if (Chat.info.hideAllBadges) {
        rules.push(
          [
            ".badge",
            "img.badge",
            ".special",
            "img.special",
            ".kick_badge",
            "img.kick_badge",
            ".user_info > img",
          ].join(", ") + " { display: none !important; }",
        );
      }

      var shadows = strokeShadows(Chat.info.stroke).concat(
        normalShadows(Chat.info.shadow),
      );

      rules.push(
        [
          "#chat_container",
          "#chat_container .chat_line",
          "#chat_container .nick",
          "#chat_container .message",
          "#chat_container .colon",
        ].join(", ") + " { -webkit-text-stroke: 0 !important; }",
      );

      if (shadows.length) {
        rules.push(
          [
            "#chat_container .nick",
            "#chat_container .message",
            "#chat_container .colon",
          ].join(", ") +
            " { text-shadow: " +
            shadows.join(", ") +
            " !important; }",
        );
      }

      rules.push(
        "#chat_container .cheer_bits { -webkit-text-stroke: 0 !important; text-shadow: none !important; }",
      );

      $("<style>", {
        id: "jchat_plus_overlay_styles",
        text: rules.join("\n"),
      }).appendTo("head");
    },

    applyStaticStyles: function () {
      let size = sizes[Chat.info.size - 1] || sizes[2];
      let font = fonts[Chat.info.font] || fonts[0];

      $(".chat_size, .chat_font, .chat_variant").remove();

      appendCSS("size", size);
      appendCSS("font", font);

      Chat.applyOverlayStyles();

      if (Chat.info.smallCaps) {
        appendCSS("variant", "SmallCaps");
      }
    },
  });
})();