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

        if (shadow === 4) {
          return [
            "2px 2px 2px rgba(0, 0, 0, 1)",
            "0 0 6px rgba(0, 0, 0, 0.9)",
          ];
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

      if (Chat.info.messageBox) {
        var messageBoxBackgroundOffset =
          Number(Chat.info.font) === 0 ? "-0.2em" : "0";

        rules.push(
          "#chat_container {\n" +
            "  padding: 6px;\n" +
            "}\n" +
            "#chat_container .chat_line {\n" +
            "  margin-bottom: 4px;\n" +
            "  line-height: 1.15 !important;\n" +
            "  padding: 4px 8px;\n" +
            "  border-radius: 8px;\n" +
            "  display: block;\n" +
            "  width: fit-content;\n" +
            "  max-width: 100%;\n" +
            "  box-sizing: border-box;\n" +
            "  position: relative;\n" +
            "  isolation: isolate;\n" +
            "}\n" +
            "#chat_container .chat_line::before {\n" +
            '  content: "";\n' +
            "  position: absolute;\n" +
            "  inset: 0;\n" +
            "  background-color: rgba(14, 14, 16, 0.706);\n" +
            "  border-radius: 8px;\n" +
            "  transform: translateY(" +
            messageBoxBackgroundOffset +
            ");\n" +
            "  pointer-events: none;\n" +
            "  z-index: -1;\n" +
            "}",
        );
      }

      if (Chat.info.emoteShadow) {
        rules.push(
          "#chat_container .emote,\n" +
            "#chat_container .cheer_emote,\n" +
            "#chat_container .cheer_bits,\n" +
            "#chat_container .emoji {\n" +
            "  filter:\n" +
            "    drop-shadow(2px 2px 4px rgba(0, 0, 0, 1))\n" +
            "    drop-shadow(-2px -2px 4px rgba(0, 0, 0, 1));\n" +
            "}",
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
