(function () {
  window.Chat = window.Chat || {};

  $.extend(Chat, {
    isKickDeleteEvent: function (eventName) {
      if (!eventName) return false;

      return (
        /delete|deleted|remove|removed/i.test(eventName) &&
        /message|chat/i.test(eventName)
      );
    },

    findKickDeletedMessageId: function (data) {
      if (!data) return null;

      var candidates = [
        data.id,
        data.message_id,
        data.messageId,
        data.chat_message_id,
        data.chatMessageId,
        data.target_msg_id,
        data.targetMessageId,
        data.deletedMessage && data.deletedMessage.id,
        data.deleted_message && data.deleted_message.id,
        data.message && data.message.id,
        data.chatMessage && data.chatMessage.id,
        data.chat_message && data.chat_message.id,
        data.target && data.target.id,
      ];

      var visibleIds = $(".chat_line")
        .map(function () {
          return $(this).attr("data-id");
        })
        .get();

      for (var i = 0; i < candidates.length; i++) {
        if (!candidates[i]) continue;

        var candidate = candidates[i].toString();

        if (visibleIds.includes(candidate)) {
          return candidate;
        }
      }

      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j]) return candidates[j].toString();
      }

      return null;
    },

    deleteKickMessage: function (data) {
      if (!data) return;

      var messageId = Chat.findKickDeletedMessageId(data);

      if (!messageId) {
        console.warn(
          "jChat Kick: Delete event did not include a usable message id.",
          data,
        );
        return;
      }

      console.log("jChat Kick: Deleting message " + messageId);
      Chat.clearMessage(messageId);
    },

    escapeHtml: function (value) {
      return $("<div>")
        .text(value || "")
        .html();
    },

    debugKickBadgePayload: function (data, badges) {
      if (!data || !badges || !badges.length) return;

      console.group("jChat Kick badge payload");
      console.log("full message data:", data);
      console.log("sender:", data.sender);
      console.log("identity:", data.sender && data.sender.identity);
      console.log("metadata:", data.metadata);
      console.log("badges found by jChat:", badges);

      badges.forEach(function (badge, index) {
        console.log("badge #" + index, {
          raw: badge,
          type: Chat.getKickBadgeType(badge),
          image: Chat.getKickBadgeImage(badge),
          level: Chat.getKickBadgeLevel(badge),
          label: Chat.getKickBadgeLabel(Chat.getKickBadgeType(badge), badge),
        });
      });

      console.groupEnd();
    },

    getKickBadgeType: function (badge) {
      if (!badge) return null;

      var rawType = "";

      if (typeof badge === "string") {
        rawType = badge;
      } else {
        rawType =
          badge.type ||
          badge.name ||
          badge.slug ||
          badge.id ||
          badge.key ||
          badge.badge ||
          badge.badge_type ||
          badge.text ||
          badge.label ||
          "";
      }

      rawType = String(rawType)
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      if (!rawType) return null;

      if (
        rawType === "broadcaster" ||
        rawType === "streamer" ||
        rawType === "channel-owner" ||
        rawType === "owner" ||
        rawType === "creator"
      ) {
        return "broadcaster";
      }

      if (
        rawType === "moderator" ||
        rawType === "mod" ||
        rawType === "channel-moderator" ||
        rawType === "global-moderator" ||
        rawType === "global-mod" ||
        rawType === "global-moderator-badge"
      ) {
        return "moderator";
      }

      if (rawType === "vip") {
        return "vip";
      }

      if (rawType === "og" || rawType === "original-gangster") {
        return "og";
      }

      if (
        rawType === "subscriber" ||
        rawType === "sub" ||
        rawType === "channel-subscriber" ||
        rawType === "subscriber-badge" ||
        rawType === "sub-badge"
      ) {
        return "subscriber";
      }

      if (
        rawType === "sub-gifter" ||
        rawType === "subgifter" ||
        rawType === "gifter" ||
        rawType === "gift" ||
        rawType === "gifts" ||
        rawType === "gifted-sub" ||
        rawType === "gifted-subs" ||
        rawType === "gifted-subscription" ||
        rawType === "gifted-subscriptions" ||
        rawType === "subscription-gifter"
      ) {
        return "gifter";
      }

      if (
        rawType === "founder" ||
        rawType === "founding-subscriber" ||
        rawType === "founder-subscriber" ||
        rawType === "founder-sub" ||
        rawType === "founding-sub"
      ) {
        return "founder";
      }

      if (
        rawType === "verified" ||
        rawType === "verified-user" ||
        rawType === "partner" ||
        rawType === "kick-partner" ||
        rawType === "verified-partner"
      ) {
        return "verified";
      }

      if (
        rawType === "staff" ||
        rawType === "kick-staff" ||
        rawType === "admin" ||
        rawType === "administrator" ||
        rawType === "global-admin" ||
        rawType === "super-admin" ||
        rawType === "kick-admin"
      ) {
        return "staff";
      }

      if (rawType === "sidekick") {
        return "sidekick";
      }

      if (
        rawType === "bot" ||
        rawType === "kickbot" ||
        rawType === "kick-bot"
      ) {
        return "bot";
      }

      if (
        rawType === "level" ||
        rawType === "rank" ||
        rawType.indexOf("level") === 0
      ) {
        return "level";
      }

      return rawType;
    },

    getKickBadgeImage: function (badge) {
      if (!badge) return null;

      function normalizeImageUrl(value) {
        if (typeof value !== "string") return null;

        value = value.trim();
        if (!value) return null;

        // Do not create data:image badge URLs. They spam devtools and look ugly.
        if (value.indexOf("data:") === 0) return null;

        if (value.indexOf("//") === 0) return "https:" + value;

        if (/^https?:\/\//i.test(value)) {
          return value;
        }

        if (value.charAt(0) === "/") {
          return "https://kick.com" + value;
        }

        if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(value)) {
          return "https://files.kick.com/" + value.replace(/^\/+/, "");
        }

        return null;
      }

      function scan(value, depth) {
        if (!value || depth > 5) return null;

        if (typeof value === "string") {
          return normalizeImageUrl(value);
        }

        if (Array.isArray(value)) {
          for (var i = 0; i < value.length; i++) {
            var arrayResult = scan(value[i], depth + 1);
            if (arrayResult) return arrayResult;
          }

          return null;
        }

        if (typeof value !== "object") return null;

        var preferredKeys = [
          "image",
          "image_url",
          "imageUrl",
          "icon",
          "icon_url",
          "iconUrl",
          "url",
          "src",
          "path",
          "asset",
        ];

        for (var j = 0; j < preferredKeys.length; j++) {
          var directResult = normalizeImageUrl(value[preferredKeys[j]]);
          if (directResult) return directResult;
        }

        if (value.images) {
          var imageResult = scan(value.images, depth + 1);
          if (imageResult) return imageResult;
        }

        if (value.metadata) {
          var metadataResult = scan(value.metadata, depth + 1);
          if (metadataResult) return metadataResult;
        }

        for (var key in value) {
          if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
          if (key === "emotes" || key === "content") continue;

          var nestedResult = scan(value[key], depth + 1);
          if (nestedResult) return nestedResult;
        }

        return null;
      }

      return scan(badge, 0);
    },

    getKickBadgeLevel: function (badge) {
      if (!badge) return null;

      var values = [
        badge.level,
        badge.chat_level,
        badge.chatLevel,
        badge.rank,
        badge.count,
        badge.months,
        badge.tier,
        badge.value,
        badge.text,
        badge.name,
        badge.title,
        badge.label,
      ];

      if (badge.metadata) {
        values = values.concat([
          badge.metadata.level,
          badge.metadata.chat_level,
          badge.metadata.chatLevel,
          badge.metadata.rank,
          badge.metadata.count,
          badge.metadata.months,
          badge.metadata.tier,
          badge.metadata.value,
          badge.metadata.text,
          badge.metadata.name,
          badge.metadata.title,
          badge.metadata.label,
        ]);
      }

      for (var i = 0; i < values.length; i++) {
        if (values[i] === undefined || values[i] === null) continue;

        var digits = values[i].toString().match(/\d+/);

        if (digits) return digits[0];
      }

      return null;
    },

    getKickBadgeLabel: function (type, badge) {
      if (type === "level") return Chat.getKickBadgeLevel(badge) || "1";

      switch (type) {
        case "broadcaster":
          return "★";
        case "moderator":
          return "◆";
        case "subscriber":
          return "S";
        case "verified":
          return "✓";
        case "founder":
          return "F";
        case "vip":
          return "V";
        case "og":
          return "OG";
        case "staff":
          return "K";
        case "gifter":
          return "G";
        default:
          return type.charAt(0).toUpperCase();
      }
    },

    createKickBadgeHtml: function (type, badge) {
      type =
        Chat.getKickBadgeType(type) ||
        Chat.getKickBadgeType(badge) ||
        "unknown";

      var label = Chat.getKickBadgeLabel(type, badge) || type;
      var safeType = String(type).replace(/[^a-z0-9_-]/gi, "-");

      function esc(value) {
        return Chat.escapeHtml(String(value == null ? "" : value));
      }

      function svgToImg(svg, className, alt) {
        // Force a real square intrinsic size. Without this, some SVG img badges
        // can get weird browser-default sizing.
        if (svg.indexOf("<svg ") === 0 && svg.indexOf(" width=") === -1) {
          svg = svg.replace("<svg ", '<svg width="32" height="32" ');
        }

        return (
          '<img class="badge kick_badge ' +
          className +
          '" alt="' +
          esc(alt || type) +
          '" draggable="false" src="data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(svg) +
          '">'
        );
      }

      function textBadge(text, bg, fg, wide, round) {
        var width = wide ? 44 : 32;
        var fontSize = wide ? 14 : 18;
        var rx = round ? width / 2 : 4;

        return (
          '<svg xmlns="http://www.w3.org/2000/svg" width="' +
          width +
          '" height="32" viewBox="0 0 ' +
          width +
          ' 32">' +
          '<rect x="0" y="0" width="' +
          width +
          '" height="32" rx="' +
          rx +
          '" fill="' +
          bg +
          '"/>' +
          '<text x="' +
          width / 2 +
          '" y="16" dominant-baseline="central" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="' +
          fontSize +
          '" font-weight="900" fill="' +
          fg +
          '">' +
          esc(text) +
          "</text>" +
          "</svg>"
        );
      }

      var icons = {
        broadcaster: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M15.6773 22.1533C17.3698 22.1533 18.8182 21.5507 20.0233 20.3461C21.2282 19.1415 21.8307 17.6924 21.8307 16V6.15401C21.8307 4.46162 21.2286 3.01305 20.0233 1.80784C18.8182 0.602907 17.3698 0 15.6773 0C13.9849 0 12.5363 0.602907 11.3311 1.80784C10.1259 3.01285 9.52344 4.46162 9.52344 6.15401V16C9.52344 17.6923 10.1262 19.1415 11.3311 20.3461C12.5361 21.5507 13.9849 22.1533 15.6773 22.1533Z" fill="url(#a)"/>' +
            '<path d="M15.6773 22.1533C17.3698 22.1533 18.8182 21.5507 20.0233 20.3461C21.2282 19.1415 21.8307 17.6924 21.8307 16V6.15401C21.8307 4.46162 21.2286 3.01305 20.0233 1.80784C18.8182 0.602907 17.3698 0 15.6773 0C13.9849 0 12.5363 0.602907 11.3311 1.80784C10.1259 3.01285 9.52344 4.46162 9.52344 6.15401V16C9.52344 17.6923 10.1262 19.1415 11.3311 20.3461C12.5361 21.5507 13.9849 22.1533 15.6773 22.1533Z" fill="white" fill-opacity=".3"/>' +
            '<path d="M26.3888 12.6731C26.1459 12.4295 25.8568 12.3076 25.5234 12.3076C25.1904 12.3076 24.902 12.4295 24.6581 12.6731C24.4147 12.9167 24.293 13.2051 24.293 13.5383V16C24.293 18.3718 23.4498 20.4006 21.7639 22.0864C20.0785 23.7723 18.0495 24.6153 15.6775 24.6153C13.3057 24.6153 11.2769 23.7723 9.59089 22.0864C7.90509 20.401 7.06226 18.3719 7.06226 16V13.5383C7.06226 13.2051 6.94041 12.9167 6.69692 12.6731C6.45329 12.4295 6.16514 12.3076 5.83159 12.3076C5.49804 12.3076 5.20956 12.4295 4.96606 12.6731C4.72237 12.9167 4.60059 13.2051 4.60059 13.5383V16C4.60059 18.8333 5.54627 21.2981 7.4371 23.3941C9.32799 25.4901 11.6645 26.6919 14.4467 26.9994V29.5381H9.52373C9.19038 29.5381 8.90196 29.6601 8.6584 29.9037C8.41477 30.1472 8.29293 30.4357 8.29293 30.7691C8.29293 31.1019 8.41477 31.391 8.6584 31.6344C8.90196 31.8778 9.19038 32 9.52373 32H21.831C22.1643 32 22.4531 31.8779 22.6963 31.6344C22.9402 31.391 23.0622 31.1019 23.0622 30.7691C23.0622 30.4358 22.9402 30.1472 22.6963 29.9037C22.4532 29.6601 22.1644 29.5381 21.831 29.5381H16.9086V26.9994C19.6904 26.6919 22.0267 25.4901 23.9178 23.3941C25.8089 21.2981 26.7548 18.8333 26.7548 16V13.5383C26.7548 13.2051 26.6327 12.9169 26.3888 12.6731Z" fill="url(#b)"/>' +
            "<defs>" +
            '<linearGradient id="a" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#FF1CD2"/><stop offset="1" stop-color="#B20DFF"/></linearGradient>' +
            '<linearGradient id="b" x1="0" y1="0" x2="4.72839" y2="35.6202" gradientUnits="userSpaceOnUse"><stop stop-color="#FF1CD2"/><stop offset="1" stop-color="#B20DFF"/></linearGradient>' +
            "</defs>" +
            "</svg>"
          );
        },

        staff: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M30 0C31.1046 0 32 0.895431 32 2V30C32 31.1046 31.1046 32 30 32H2C0.895431 32 0 31.1046 0 30V2C0 0.895431 0.895431 4.10637e-08 2 0H30ZM6 5V27H13.5029V22.1162H16V24.5576H18.4971V27H26V19.6631H23.5029V17.2207H20.9941V14.7793H23.5029V12.3369H26V5H18.4971V7.44238H16V9.88379H13.5029V5H6Z" fill="url(#a)"/>' +
            "<defs>" +
            '<linearGradient id="a" x1="8.99888" y1="34.208" x2="20.0805" y2="-2.27173" gradientUnits="userSpaceOnUse">' +
            '<stop stop-color="#1EFF00"/>' +
            '<stop offset="0.99" stop-color="#00FF8C"/>' +
            "</linearGradient>" +
            "</defs>" +
            "</svg>"
          );
        },

        moderator: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M30 0C31.1046 0 32 .895431 32 2V30C32 31.1046 31.1046 32 30 32H2C.895431 32 0 31.1046 0 30V2C0 .895431 .895431 0 2 0H30ZM16.2197 2.99316C15.8292 2.60266 15.1962 2.60265 14.8057 2.99316L8.36328 9.43555C7.97294 9.82608 7.97284 10.4591 8.36328 10.8496L10.0918 12.5781C10.4823 12.9686 11.1153 12.9685 11.5059 12.5781L11.585 12.499L13.9414 14.8564L3.57129 25.2275C2.70357 26.0954 2.7035 27.5023 3.57129 28.3701C4.43911 29.2376 5.84612 29.2377 6.71387 28.3701L17.084 17.999L19.4414 20.3564L19.3633 20.4346C18.9728 20.8251 18.9728 21.4581 19.3633 21.8486L21.0918 23.5771C21.4823 23.9676 22.1154 23.9676 22.5059 23.5771L28.9482 17.1348C29.3386 16.7443 29.3386 16.1112 28.9482 15.7207L27.2197 13.9922C26.8293 13.6017 26.1962 13.6018 25.8057 13.9922L25.7266 14.0703L23.3701 11.7139C24.2377 10.8461 24.2376 9.4391 23.3701 8.57129C22.5023 7.7035 21.0954 7.70357 20.2275 8.57129L17.8701 6.21387L17.9482 6.13574C18.3388 5.74522 18.3388 5.11221 17.9482 4.72168L16.2197 2.99316Z" fill="url(#a)"/>' +
            '<defs><linearGradient id="a" x1="-14.9543" y1="46.9544" x2="32.0001" y2="-.0005" gradientUnits="userSpaceOnUse"><stop stop-color="#0095FF"/><stop offset=".99" stop-color="#00C7FF"/></linearGradient></defs>' +
            "</svg>"
          );
        },

        vip: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M30 0C31.1046 0 32 .895431 32 2V30C32 31.1046 31.1046 32 30 32H2C.895431 32 0 31.1046 0 30V2C0 .895431 .895431 0 2 0H30ZM15.9648 5C15.7748 5.00005 15.588 5.05204 15.4238 5.15039C15.2596 5.24878 15.124 5.39057 15.0303 5.56055L9.82812 15.0176L3.55078 11.8906C3.36913 11.7985 3.16534 11.7607 2.96387 11.7822C2.76241 11.8038 2.57048 11.8842 2.41113 12.0127C2.25235 12.1408 2.13185 12.3126 2.06348 12.5078C1.99511 12.7031 1.98143 12.9144 2.02441 13.1172L4.58301 25.127C4.63544 25.3782 4.77165 25.6034 4.96777 25.7627C5.16376 25.9217 5.40762 26.0056 5.65723 26H26.251C26.5009 26.0057 26.7453 25.9219 26.9414 25.7627C27.1376 25.6034 27.2737 25.3782 27.3262 25.127L29.9697 13.1172C30.0187 12.9103 30.0086 12.6932 29.9404 12.4922C29.8722 12.2912 29.7485 12.1151 29.585 11.9844C29.4215 11.8537 29.2249 11.7743 29.0186 11.7559C28.8122 11.7374 28.6049 11.7802 28.4219 11.8799L22.1025 15.0283L16.9004 5.56055C16.8066 5.39054 16.6701 5.24878 16.5059 5.15039C16.3416 5.05207 16.1549 5 15.9648 5Z" fill="url(#a)"/>' +
            '<path d="M30 0C31.1046 0 32 .895431 32 2V30C32 31.1046 31.1046 32 30 32H2C.895431 32 0 31.1046 0 30V2C0 .895431 .895431 0 2 0H30ZM15.9648 5C15.7748 5.00005 15.588 5.05204 15.4238 5.15039C15.2596 5.24878 15.124 5.39057 15.0303 5.56055L9.82812 15.0176L3.55078 11.8906C3.36913 11.7985 3.16534 11.7607 2.96387 11.7822C2.76241 11.8038 2.57048 11.8842 2.41113 12.0127C2.25235 12.1408 2.13185 12.3126 2.06348 12.5078C1.99511 12.7031 1.98143 12.9144 2.02441 13.1172L4.58301 25.127C4.63544 25.3782 4.77165 25.6034 4.96777 25.7627C5.16376 25.9217 5.40762 26.0056 5.65723 26H26.251C26.5009 26.0057 26.7453 25.9219 26.9414 25.7627C27.1376 25.6034 27.2737 25.3782 27.3262 25.127L29.9697 13.1172C30.0187 12.9103 30.0086 12.6932 29.9404 12.4922C29.8722 12.2912 29.7485 12.1151 29.585 11.9844C29.4215 11.8537 29.2249 11.7743 29.0186 11.7559C28.8122 11.7374 28.6049 11.7802 28.4219 11.8799L22.1025 15.0283L16.9004 5.56055C16.8066 5.39054 16.6701 5.24878 16.5059 5.15039C16.3416 5.05207 16.1549 5 15.9648 5Z" fill="url(#b)"/>' +
            "<defs>" +
            '<linearGradient id="a" x1="18.8102" y1="-12.7222" x2="2.88536" y2="39.1063" gradientUnits="userSpaceOnUse"><stop stop-color="#FF6A4A"/><stop offset="1" stop-color="#C70C00"/></linearGradient>' +
            '<linearGradient id="b" x1="15.7467" y1="-4.75575" x2="16.321" y2="39.0672" gradientUnits="userSpaceOnUse"><stop stop-color="#FFC900"/><stop offset=".99" stop-color="#FF9500"/></linearGradient>' +
            "</defs>" +
            "</svg>"
          );
        },

        verified: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M30.8598 19.2368C30.1977 18.2069 29.5356 17.2138 28.8736 16.1839C28.7264 15.9632 28.7264 15.8161 28.8736 15.5954C29.5356 14.6023 30.1609 13.6092 30.823 12.6161C31.5954 11.4391 31.1908 10.2989 29.8667 9.82069C28.7632 9.41609 27.6598 8.97471 26.5563 8.57012C26.3356 8.49656 26.2253 8.34943 26.2253 8.09196C26.1885 6.87816 26.1149 5.66437 26.0414 4.48736C25.9678 3.2 24.9747 2.46437 23.7241 2.7954C22.5471 3.08966 21.3701 3.42069 20.2299 3.75173C19.9724 3.82529 19.8253 3.75173 19.6414 3.56782C18.9057 2.61149 18.1333 1.69195 17.3977 .772414C16.5885 -.257472 15.3379 -.257472 14.492 .772414C13.7563 1.69195 12.9839 2.61149 12.2851 3.53103C12.1012 3.7885 11.9172 3.82529 11.623 3.75173C10.4828 3.42069 9.34253 3.12644 8.53334 2.90575C6.95173 2.53793 5.99541 3.16322 5.92184 4.48736C5.84828 5.70115 5.77472 6.91495 5.73794 8.16552C5.73794 8.42299 5.62759 8.53333 5.4069 8.64368C4.26667 9.08506 3.12644 9.52644 1.98621 9.96782C.809203 10.446 .441387 11.5862 1.14023 12.6529C1.8023 13.6828 2.46437 14.6759 3.12644 15.7057C3.27356 15.9264 3.27356 16.0736 3.12644 16.331C2.42759 17.3609 1.76552 18.3908 1.10345 19.4575C.478165 20.4506 .882759 21.6276 1.98621 22.069C3.12644 22.5104 4.30345 22.9517 5.44368 23.3931C5.70115 23.4667 5.77471 23.6138 5.77471 23.8713C5.81149 25.0483 5.95862 26.1885 5.95862 27.3655C5.95862 28.5425 6.9885 29.6092 8.42298 29.1678C9.56321 28.8 10.7034 28.5425 11.8437 28.2115C12.0644 28.1379 12.2115 28.1747 12.3586 28.3954C13.131 29.3517 13.8667 30.2713 14.6391 31.2276C15.485 32.2575 16.6988 32.2575 17.508 31.2276C18.2805 30.2713 19.0161 29.3517 19.7885 28.3954C19.9356 28.2115 20.046 28.1379 20.3034 28.2115C21.4804 28.5425 22.6575 28.8368 23.8345 29.1678C25.0483 29.4988 26.0781 28.7632 26.1149 27.5126C26.1885 26.2989 26.2621 25.0851 26.2988 23.8345C26.2988 23.5402 26.446 23.4299 26.6667 23.3563C27.7701 22.9517 28.9103 22.5104 30.0138 22.069C31.1908 21.4805 31.5586 20.3034 30.8598 19.2368ZM22.069 13.2046L14.7127 20.5609C14.5287 20.7448 14.2713 20.892 14.0138 20.9287C13.9402 20.9287 13.8299 20.9655 13.7563 20.9655C13.4253 20.9655 13.0575 20.8184 12.8 20.5609L9.78392 17.5448C9.26898 17.0299 9.26898 16.1839 9.78392 15.669C10.2989 15.154 11.1448 15.154 11.6598 15.669L13.7196 17.7287L20.1196 11.3287C20.6345 10.8138 21.4805 10.8138 21.9954 11.3287C22.5839 11.8437 22.5839 12.6897 22.069 13.2046Z" fill="url(#a)"/>' +
            '<defs><linearGradient id="a" x1="8.14138" y1="32.3591" x2="24.4968" y2=".904884" gradientUnits="userSpaceOnUse"><stop stop-color="#1EFF00"/><stop offset=".99" stop-color="#00FF8C"/></linearGradient></defs>' +
            "</svg>"
          );
        },

        og: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M22.8226 17.2693V28.0037C22.8226 28.2177 22.8929 28.383 23.0336 28.4996C23.1742 28.5969 23.3969 28.6455 23.7017 28.6455H24.5104V32H21.838C19.9627 32 18.6265 31.6694 17.8294 31.0082C17.0559 30.347 16.6691 29.472 16.6691 28.383V16.8901C16.6691 15.8011 17.0559 14.926 17.8294 14.2648C18.6265 13.6036 19.9627 13.273 21.838 13.273H24.6511V16.6276H23.7017C23.3969 16.6276 23.1742 16.6859 23.0336 16.8026C22.8929 16.8998 22.8226 17.0554 22.8226 17.2693ZM32.0002 21.6447V24.8826H24.0885V21.6447H32.0002ZM25.8466 19.6904V17.2693C25.8466 17.0554 25.7763 16.8998 25.6357 16.8026C25.495 16.6859 25.2723 16.6276 24.9676 16.6276H24.0182V13.273H26.8312C28.7066 13.273 30.031 13.6036 30.8046 14.2648C31.6017 14.926 32.0002 15.8011 32.0002 16.8901V19.6904H25.8466ZM25.8466 28.0037V23.8908H32.0002V28.383C32.0002 29.472 31.6017 30.347 30.8046 31.0082C30.031 31.6694 28.7066 32 26.8312 32H24.1588V28.6455H24.9676C25.2723 28.6455 25.495 28.5969 25.6357 28.4996C25.7763 28.383 25.8466 28.2177 25.8466 28.0037Z" fill="url(#a)"/>' +
            '<path d="M22.8228 3.99625V14.7307C22.8228 14.9446 22.8931 15.1099 23.0338 15.2266C23.1744 15.3238 23.3971 15.3724 23.7019 15.3724H24.5106V18.727H21.8382C19.9629 18.727 18.6267 18.3964 17.8296 17.7352C17.056 17.074 16.6693 16.1989 16.6693 15.1099V3.61704C16.6693 2.52804 17.056 1.65295 17.8296 .99177C18.6267 .33059 19.9629 0 21.8382 0H24.6513V3.35452H23.7019C23.3971 3.35452 23.1744 3.41286 23.0338 3.52953C22.8931 3.62677 22.8228 3.78234 22.8228 3.99625ZM32.0004 8.37171V11.6095H24.0887V8.37171H32.0004ZM25.8468 6.41734V3.99625C25.8468 3.78234 25.7765 3.62677 25.6358 3.52953C25.4952 3.41286 25.2725 3.35452 24.9677 3.35452H24.0183V0H26.8314C28.7067 0 30.0312 .33059 30.8048 .99177C31.6018 1.65295 32.0004 2.52804 32.0004 3.61704V6.41734H25.8468ZM25.8468 14.7307V10.6178H32.0004V15.1099C32.0004 16.1989 31.6018 17.074 30.8048 17.7352C30.0312 18.3964 28.7067 18.727 26.8314 18.727H24.159V15.3724H24.9677C25.2725 15.3724 25.4952 15.3238 25.6358 15.2266C25.7765 15.1099 25.8468 14.9446 25.8468 14.7307Z" fill="#00FFF2"/>' +
            '<path d="M9.38855 7.81748V4.28795C9.38855 4.07404 9.31822 3.91846 9.17757 3.82123C9.03691 3.70455 8.81421 3.64621 8.50947 3.64621H7.34909V0H10.3731C12.2485 0 13.573 .33059 14.3465 .99177C15.1436 1.65295 15.5421 2.52804 15.5421 3.61704V7.81748H9.38855ZM9.38855 14.439V7.43828H15.5421V15.1099C15.5421 16.1989 15.1436 17.074 14.3465 17.7352C13.573 18.3964 12.2485 18.727 10.3731 18.727H7.34909V15.0807H8.50947C8.81421 15.0807 9.03691 15.0321 9.17757 14.9349C9.31822 14.8182 9.38855 14.6529 9.38855 14.439ZM6.15354 4.28795V7.81748H0V3.61704C0 2.52804 .386794 1.65295 1.16038 .99177C1.95741 .33059 3.29361 0 5.16897 0H8.193V3.64621H7.03262C6.72787 3.64621 6.50517 3.70455 6.36452 3.82123C6.22387 3.91846 6.15354 4.07404 6.15354 4.28795ZM6.15354 7.43828V14.439C6.15354 14.6529 6.22387 14.8182 6.36452 14.9349C6.50517 15.0321 6.72787 15.0807 7.03262 15.0807H8.193V18.727H5.16897C3.29361 18.727 1.95741 18.3964 1.16038 17.7352C.386794 17.074 0 16.1989 0 15.1099V7.43828H6.15354Z" fill="url(#b)"/>' +
            '<path d="M9.38839 21.0905V17.561C9.38839 17.3471 9.31807 17.1915 9.17741 17.0943C9.03676 16.9776 8.81406 16.9193 8.50932 16.9193H7.34893V13.273H10.373C12.2483 13.273 13.5728 13.6036 14.3464 14.2648C15.1434 14.926 15.5419 15.8011 15.5419 16.8901V21.0905H9.38839ZM9.38839 27.712V20.7113H15.5419V28.383C15.5419 29.472 15.1434 30.347 14.3464 31.0082C13.5728 31.6694 12.2483 32 10.373 32H7.34893V28.3538H8.50932C8.81406 28.3538 9.03676 28.3052 9.17741 28.2079C9.31807 28.0913 9.38839 27.926 9.38839 27.712ZM6.15339 17.561V21.0905H-.000152588V16.8901C-.000152588 15.8011 .386641 14.926 1.16023 14.2648C1.95726 13.6036 3.29346 13.273 5.16882 13.273H8.19285V16.9193H7.03247C6.72772 16.9193 6.50502 16.9776 6.36437 17.0943C6.22371 17.1915 6.15339 17.3471 6.15339 17.561ZM6.15339 20.7113V27.712C6.15339 27.926 6.22371 28.0913 6.36437 28.2079C6.50502 28.3052 6.72772 28.3538 7.03247 28.3538H8.19285V32H5.16882C3.29346 32 1.95726 31.6694 1.16023 31.0082C.386641 30.347 -.000152588 29.472 -.000152588 28.383V20.7113H6.15339Z" fill="#00FFF2"/>' +
            "<defs>" +
            '<linearGradient id="a" x1="23.9622" y1=".695162" x2="24.4274" y2="31.9986" gradientUnits="userSpaceOnUse"><stop stop-color="#00FFF2"/><stop offset="1" stop-color="#006399"/></linearGradient>' +
            '<linearGradient id="b" x1="7.77104" y1="0" x2="7.91062" y2="32.567" gradientUnits="userSpaceOnUse"><stop stop-color="#00FFF2"/><stop offset="1" stop-color="#006399"/></linearGradient>' +
            "</defs>" +
            "</svg>"
          );
        },

        subscriber: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M17.0284 2.91378L16.2357 .667951C16.1573 .445558 15.8427 .445558 15.7643 .667951L14.9716 2.91378C12.9003 8.78263 8.78263 12.9003 2.91378 14.9716L.667951 15.7643C.445558 15.8427 .445558 16.1573 .667951 16.2357L2.91378 17.0284C8.78263 19.0998 12.9003 23.2174 14.9716 29.0862L15.7643 31.3321C15.8427 31.5544 16.1573 31.5544 16.2357 31.3321L17.0284 29.0862C19.0998 23.2174 23.2174 19.0998 29.0862 17.0284L31.3321 16.2357C31.5544 16.1573 31.5544 15.8427 31.3321 15.7643L29.0862 14.9716C23.2174 12.9003 19.0998 8.78263 17.0284 2.91378Z" fill="black"/>' +
            '<path d="M17.0284 2.91378L16.2357 .667951C16.1573 .445558 15.8427 .445558 15.7643 .667951L14.9716 2.91378C12.9003 8.78263 8.78263 12.9003 2.91378 14.9716L.667951 15.7643C.445558 15.8427 .445558 16.1573 .667951 16.2357L2.91378 17.0284C8.78263 19.0998 12.9003 23.2174 14.9716 29.0862L15.7643 31.3321C15.8427 31.5544 16.1573 31.5544 16.2357 31.3321L17.0284 29.0862C19.0998 23.2174 23.2174 19.0998 29.0862 17.0284L31.3321 16.2357C31.5544 16.1573 31.5544 15.8427 31.3321 15.7643L29.0862 14.9716C23.2174 12.9003 19.0998 8.78263 17.0284 2.91378Z" fill="url(#a)"/>' +
            '<defs><radialGradient id="a" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(16 16) rotate(90) scale(16)"><stop stop-color="#E1FF00"/><stop offset="1" stop-color="#2AA300"/></radialGradient></defs>' +
            "</svg>"
          );
        },

        gifter: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M22.34 9.5L26 4H18L16 7L14 4H6L9.66 9.5H4V15.1H28V9.5H22.34Z" fill="#53FC18"/>' +
            '<path d="M26.0799 19.0996H5.8999V28.4996H26.0799V19.0996Z" fill="#53FC18"/>' +
            '<path d="M26.0799 15.0996H5.8999V19.0996H26.0799V15.0996Z" fill="#32970E"/>' +
            "</svg>"
          );
        },

        sidekick: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M30 0C31.1046 0 32 0.895431 32 2V30C32 31.1046 31.1046 32 30 32H2C0.895431 32 0 31.1046 0 30V2C0 0.895431 0.895431 4.10637e-08 2 0H30ZM29.5244 11.3008C29.5244 11.3008 25.2627 10.4758 21.0332 11.5596C18.8953 12.1069 16.3789 14.1719 16.3789 14.1719C16.1704 14.343 15.8296 14.343 15.6211 14.1719C15.6211 14.1719 13.1047 12.1069 10.9668 11.5596C6.74733 10.4784 2.4957 11.2969 2.47559 11.3008C2.20629 11.353 1.99226 11.6104 2 11.873C2 11.873 2.25315 20.0384 8.10938 21.7568C11.2306 22.6722 15.5488 20.7051 15.5488 20.7051C15.7969 20.5923 16.2029 20.5923 16.4512 20.7051C16.4512 20.7051 20.7698 22.6722 23.8896 21.7568C29.7469 20.0382 30 11.873 30 11.873C30.0076 11.6104 29.7937 11.353 29.5244 11.3008ZM21.5322 14.3301C24.071 13.2488 26.4385 14.1729 26.4385 14.1729C26.7938 14.3116 26.9784 14.7083 26.8486 15.0537C26.839 15.0791 25.9689 17.3603 23.4443 18.4355C20.9228 19.5093 18.5704 18.6049 18.5391 18.5928C18.1836 18.4541 17.9991 18.0573 18.1289 17.7119C18.138 17.688 19.007 15.4058 21.5322 14.3301ZM5.43652 14.1162C5.43652 14.1162 7.80404 13.1921 10.3428 14.2734C12.8674 15.3488 13.7366 17.6302 13.7461 17.6553C13.8761 18.0007 13.6914 18.3975 13.3359 18.5361C13.3029 18.5489 10.9514 19.4515 8.43066 18.3779C5.89367 17.2966 5.02734 14.9961 5.02734 14.9961C4.89754 14.6507 5.08139 14.2549 5.43652 14.1162Z" fill="url(#a)"/>' +
            '<defs><linearGradient id="a" x1="18.8102" y1="-12.7222" x2="2.88536" y2="39.1063" gradientUnits="userSpaceOnUse"><stop stop-color="#FF6A4A"/><stop offset="1" stop-color="#C70C00"/></linearGradient></defs>' +
            "</svg>"
          );
        },

        bot: function () {
          return (
            '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M17.56 0H14.4533C13.717 0 13.12 .597452 13.12 1.33445V4.4437C13.12 5.1807 13.717 5.77815 14.4533 5.77815H17.56C18.2964 5.77815 18.8933 5.1807 18.8933 4.4437V1.33445C18.8933 .597452 18.2964 0 17.56 0Z" fill="url(#a)"/>' +
            '<path d="M17.3333 5.77815H14.6667V8.44704H17.3333V5.77815Z" fill="url(#b)"/>' +
            '<path d="M5.33333 14.8257C5.33333 14.8257 0 14.8257 0 20.1635C0 25.5013 5.33333 25.5013 5.33333 25.5013V14.8257Z" fill="url(#c)"/>' +
            '<path d="M26.6667 14.8257C26.6667 14.8257 32 14.8257 32 20.1635C32 25.5013 26.6667 25.5013 26.6667 25.5013V14.8257Z" fill="url(#d)"/>' +
            '<path d="M26.6667 10.8224H5.33333V28.1701H26.6667V10.8224Z" fill="#4FD8FF"/>' +
            '<path d="M15.76 11.2761C20.4133 11.2761 24.0933 12.3036 25.24 13.2911C26.3867 14.8657 26.1733 24.4737 24.9067 26.0751C24.2533 26.849 21.0667 28.01 16.28 28.01C11.24 28.01 7.73333 26.7556 6.94667 25.9283C5.70667 24.367 5.65333 14.7189 6.84 13.211C7.58667 12.4637 10.6667 11.2761 15.76 11.2761ZM15.76 7.27273C10.9067 7.27273 6.12 8.28691 4.01333 10.382C1.25333 13.1309 1.34667 25.7948 4.01333 28.6372C6.08 30.8524 11.2133 32 16.28 32C21.3467 32 26.08 30.9058 27.9867 28.6372C30.48 25.648 30.8667 12.9975 27.9867 10.382C25.7467 8.34028 20.72 7.27273 15.76 7.27273Z" fill="url(#e)"/>' +
            '<path d="M23 17.975C23 16.6852 21.9553 15.6397 20.6667 15.6397C19.378 15.6397 18.3333 16.6852 18.3333 17.975V21.3111C18.3333 22.6008 19.378 23.6464 20.6667 23.6464C21.9553 23.6464 23 22.6008 23 21.3111V17.975Z" fill="black"/>' +
            '<path d="M13.6667 17.975C13.6667 16.6852 12.622 15.6397 11.3333 15.6397C10.0447 15.6397 9 16.6852 9 17.975V21.3111C9 22.6008 10.0447 23.6464 11.3333 23.6464C12.622 23.6464 13.6667 22.6008 13.6667 21.3111V17.975Z" fill="black"/>' +
            "<defs>" +
            '<linearGradient id="a" x1="15.963" y1=".886836" x2="15.963" y2="43.3072" gradientUnits="userSpaceOnUse"><stop stop-color="#00C7FF"/><stop offset=".99" stop-color="#006399"/></linearGradient>' +
            '<linearGradient id="b" x1="16" y1="-69.28" x2="16" y2="-69.28" gradientUnits="userSpaceOnUse"><stop stop-color="#00C7FF"/><stop offset=".99" stop-color="#006399"/></linearGradient>' +
            '<linearGradient id="c" x1="17.28" y1="-.2" x2="16.8598" y2="31.7766" gradientUnits="userSpaceOnUse"><stop stop-color="#00C7FF"/><stop offset=".99" stop-color="#006399"/></linearGradient>' +
            '<linearGradient id="d" x1="14.72" y1="-.2" x2="15.1402" y2="31.7766" gradientUnits="userSpaceOnUse"><stop stop-color="#00C7FF"/><stop offset=".99" stop-color="#006399"/></linearGradient>' +
            '<linearGradient id="e" x1="5.14015" y1=".587156" x2="36.6592" y2="34.8544" gradientUnits="userSpaceOnUse"><stop stop-color="#00C7FF"/><stop offset=".99" stop-color="#006399"/></linearGradient>' +
            "</defs>" +
            "</svg>"
          );
        },

        founder: function () {
          var number = Chat.getKickBadgeLevel(badge) || "1";

          return (
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
            '<circle cx="16" cy="16" r="16" fill="url(#a)"/>' +
            '<circle cx="16" cy="16" r="13.0375" fill="url(#b)"/>' +
            '<path d="M29.0375 16C29.0375 23.1875 23.1875 29.0375 16 29.0375C13.6563 29.0375 11.4625 28.4187 9.5625 27.3312C11.3125 28.2062 13.2875 28.7 15.375 28.7C22.5625 28.7 28.4125 22.85 28.4125 15.6625C28.4125 10.8188 25.75 6.58125 21.8125 4.3375C26.0938 6.475 29.0375 10.8938 29.0375 16Z" fill="black" fill-opacity=".05"/>' +
            '<text x="16" y="22.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="900" fill="black" fill-opacity=".8">' +
            esc(number) +
            "</text>" +
            "<defs>" +
            '<linearGradient id="a" x1="15.7467" y1="-4.46667" x2="16.2533" y2="36.6933" gradientUnits="userSpaceOnUse"><stop stop-color="#FFC900"/><stop offset=".99" stop-color="#FF9500"/></linearGradient>' +
            '<linearGradient id="b" x1="15.7936" y1="-.677142" x2="16.2064" y2="32.8618" gradientUnits="userSpaceOnUse"><stop stop-color="#FFC900"/><stop offset=".99" stop-color="#FF9500"/></linearGradient>' +
            "</defs>" +
            "</svg>"
          );
        },
      };

      if (type === "level") {
        return svgToImg(
          textBadge(
            Chat.getKickBadgeLevel(badge) || "1",
            "#e6e6e6",
            "#222",
            false,
            true,
          ),
          "kick_badge_" + safeType,
          label,
        );
      }

      if (icons[type]) {
        return svgToImg(icons[type](), "kick_badge_" + safeType, label);
      }

      var textFallbacks = {
        unknown: "?",
      };

      var text = textFallbacks[type] || label;
      var isWide = String(text).length > 1;

      return svgToImg(
        textBadge(
          text,
          type === "staff" ? "#111" : "#53fc18",
          type === "staff" ? "#53fc18" : "#111",
          isWide,
        ),
        "kick_badge_" + safeType,
        label,
      );
    },

    addKickBadgeCandidate: function (badges, badge) {
      if (!badge) return;

      if (Array.isArray(badge)) {
        badge.forEach(function (item) {
          Chat.addKickBadgeCandidate(badges, item);
        });
        return;
      }

      if (typeof badge === "string" || typeof badge === "number") {
        badges.push({
          type: badge.toString(),
          text: badge.toString(),
        });
        return;
      }

      if (typeof badge === "object") {
        badges.push(badge);
      }
    },

    getKickBadgesFromData: function (data) {
      var badges = [];

      if (!data) return badges;

      var sender = data.sender || {};
      var identity = sender.identity || {};
      var metadata = data.metadata || {};

      var modernBadges = [];
      var legacyBadges = [];

      [
        identity.badges_v2,
        identity.badgesV2,
        sender.badges_v2,
        sender.badgesV2,
        data.badges_v2,
        data.badgesV2,
        metadata.badges_v2,
        metadata.badgesV2,
      ].forEach(function (candidate) {
        Chat.addKickBadgeCandidate(modernBadges, candidate);
      });

      [
        identity.badges,
        sender.badges,
        sender.chat_badges,
        sender.chatBadges,
        data.badges,
        data.chat_badges,
        data.chatBadges,
        metadata.badges,
        metadata.chat_badges,
        metadata.chatBadges,
      ].forEach(function (candidate) {
        Chat.addKickBadgeCandidate(legacyBadges, candidate);
      });

      modernBadges = modernBadges.filter(function (badge) {
        return badge && badge.selected !== false && badge.active !== false;
      });

      legacyBadges = legacyBadges.filter(function (badge) {
        return badge && badge.selected !== false && badge.active !== false;
      });

      modernBadges.sort(function (a, b) {
        return (a.sort_order || 999) - (b.sort_order || 999);
      });

      legacyBadges.sort(function (a, b) {
        return (a.sort_order || 999) - (b.sort_order || 999);
      });

      badges = modernBadges.concat(legacyBadges);

      [
        identity.level,
        identity.chat_level,
        identity.chatLevel,
        identity.rank,
        sender.level,
        sender.chat_level,
        sender.chatLevel,
        sender.rank,
        data.level,
        data.chat_level,
        data.chatLevel,
        metadata.level,
        metadata.chat_level,
        metadata.chatLevel,
      ].forEach(function (level) {
        if (level === undefined || level === null || level === "") return;

        if (typeof level === "object") {
          level.type = level.type || "level";
          Chat.addKickBadgeCandidate(badges, level);
        } else {
          badges.push({
            type: "level",
            value: level,
            text: level.toString(),
          });
        }
      });

      var seen = {};
      return badges.filter(function (badge) {
        var key = JSON.stringify(badge);

        if (seen[key]) return false;

        seen[key] = true;
        return true;
      });
    },

    getKickSubscriberBadgeCount: function (badge) {
      function toPositiveInt(value) {
        var number = parseInt(value, 10);
        return isNaN(number) || number <= 0 ? null : number;
      }

      if (!badge || typeof badge !== "object") return null;

      return (
        toPositiveInt(badge.count) ||
        toPositiveInt(badge.months) ||
        toPositiveInt(badge.month) ||
        toPositiveInt(badge.tier) ||
        toPositiveInt(badge.level) ||
        toPositiveInt(badge.minimum_months) ||
        toPositiveInt(badge.minimumMonths) ||
        toPositiveInt(badge.min_months) ||
        toPositiveInt(badge.minMonths) ||
        toPositiveInt(badge.metadata && badge.metadata.count) ||
        toPositiveInt(badge.metadata && badge.metadata.months) ||
        toPositiveInt(badge.metadata && badge.metadata.month) ||
        toPositiveInt(badge.metadata && badge.metadata.tier) ||
        toPositiveInt(badge.metadata && badge.metadata.level) ||
        null
      );
    },

    cacheKickSubscriberBadgesFromChannel: function (payload) {
      var found = {};

      function toPositiveInt(value) {
        var number = parseInt(value, 10);
        return isNaN(number) || number <= 0 ? null : number;
      }

      function findSubscriberImage(node, depth) {
        if (!node || depth > 8) return null;

        if (typeof node === "string") {
          if (
            node.indexOf("/channel_subscriber_badges/") !== -1 ||
            node.indexOf("channel_subscriber_badges") !== -1 ||
            node.indexOf("subscriber_badges") !== -1
          ) {
            return node;
          }

          return null;
        }

        if (Array.isArray(node)) {
          for (var i = 0; i < node.length; i++) {
            var arrayImage = findSubscriberImage(node[i], depth + 1);
            if (arrayImage) return arrayImage;
          }

          return null;
        }

        if (typeof node === "object") {
          for (var key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

            var objectImage = findSubscriberImage(node[key], depth + 1);
            if (objectImage) return objectImage;
          }
        }

        return null;
      }

      function findCount(node) {
        if (!node || typeof node !== "object") return null;

        return (
          toPositiveInt(node.count) ||
          toPositiveInt(node.months) ||
          toPositiveInt(node.month) ||
          toPositiveInt(node.tier) ||
          toPositiveInt(node.level) ||
          toPositiveInt(node.minimum_months) ||
          toPositiveInt(node.minimumMonths) ||
          toPositiveInt(node.min_months) ||
          toPositiveInt(node.minMonths) ||
          toPositiveInt(node.months_required) ||
          toPositiveInt(node.monthsRequired) ||
          toPositiveInt(node.required_months) ||
          toPositiveInt(node.requiredMonths) ||
          toPositiveInt(node.metadata && node.metadata.count) ||
          toPositiveInt(node.metadata && node.metadata.months) ||
          toPositiveInt(node.metadata && node.metadata.month) ||
          toPositiveInt(node.metadata && node.metadata.tier) ||
          toPositiveInt(node.metadata && node.metadata.level) ||
          null
        );
      }

      function walk(node, depth, arrayIndex) {
        if (!node || depth > 8) return;

        if (Array.isArray(node)) {
          for (var i = 0; i < node.length; i++) {
            walk(node[i], depth + 1, i);
          }

          return;
        }

        if (typeof node !== "object") return;

        var image = findSubscriberImage(node, 0);

        if (image) {
          var count = findCount(node);

          // If Kick gives an ordered array without month metadata,
          // use array position as a weak fallback.
          if (!count && arrayIndex !== undefined && arrayIndex !== null) {
            count = arrayIndex + 1;
          }

          if (count) {
            found[count] = image;
          } else {
            found.default = image;
          }
        }

        for (var key in node) {
          if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
          walk(node[key], depth + 1, null);
        }
      }

      walk(payload, 0, null);

      Chat.info.kickSubscriberBadges = Chat.info.kickSubscriberBadges || {};

      Object.keys(found).forEach(function (key) {
        Chat.info.kickSubscriberBadges[key] = found[key];
      });

      if (Object.keys(found).length) {
        console.log(
          "jChat Kick: Cached subscriber badges",
          Chat.info.kickSubscriberBadges,
        );
      }

      return Chat.info.kickSubscriberBadges;
    },

    getKickSubscriberBadgeImage: function (badge) {
      var badges = Chat.info.kickSubscriberBadges || {};
      var count = Chat.getKickSubscriberBadgeCount(badge);

      if (count && badges[count]) {
        return badges[count];
      }

      if (count) {
        var bestKey = null;

        Object.keys(badges).forEach(function (key) {
          var number = parseInt(key, 10);

          if (isNaN(number)) return;
          if (number > count) return;

          if (bestKey === null || number > bestKey) {
            bestKey = number;
          }
        });

        if (bestKey !== null && badges[bestKey]) {
          return badges[bestKey];
        }
      }

      return badges.default || null;
    },

    registerKickBadges: function (badges) {
      if (!Array.isArray(badges) || badges.length === 0) return null;

      function esc(value) {
        return Chat.escapeHtml(String(value == null ? "" : value));
      }

      function imageBadgeHtml(type, image, label) {
        var safeType = String(type || "unknown").replace(/[^a-z0-9_-]/gi, "-");

        return (
          '<img class="badge kick_badge kick_badge_' +
          safeType +
          '" alt="' +
          esc(label || type || "Kick badge") +
          '" draggable="false" src="' +
          esc(image) +
          '">'
        );
      }

      var badgeKeys = [];

      badges.forEach(function (badge, index) {
        var type = Chat.getKickBadgeType(badge);
        if (!type) return;

        var image = Chat.getKickBadgeImage(badge);

        if (!image && type === "subscriber") {
          image = Chat.getKickSubscriberBadgeImage(badge);
        }

        var label = Chat.getKickBadgeLabel(type, badge);

        var html = image
          ? imageBadgeHtml(type, image, label)
          : Chat.createKickBadgeHtml(type, badge);

        if (!html) return;

        var badgeIdParts = [type, label, image || "fallback"]
          .join(":")
          .replace(/[^a-z0-9:_-]/gi, "_");

        var badgeKey = "kick:" + badgeIdParts + ":" + index;
        var badgeTag = "kick/" + badgeIdParts + ":" + index;

        Chat.info.badges[badgeKey] = { html: html };
        Chat.info.kickBadges[badgeIdParts] = badge;
        badgeKeys.push(badgeTag);
      });

      return badgeKeys.length ? badgeKeys.join(",") : null;
    },

    parseKickEmotes: function (message) {
      if (message === undefined || message === null) {
        return "";
      }

      message = String(message);

      message = message.replace(
        /\[emote:(\d+):([^\]]+)\]/g,
        function (match, id, name) {
          var token = "kick_emote_" + id;

          Chat.info.emotes[token] = {
            image: "https://files.kick.com/emotes/" + id + "/fullsize",
            zeroWidth: false,
          };

          // Important: add spaces around the internal token.
          // Without this, repeated Kick emotes become:
          // kick_emote_1kick_emote_1kick_emote_1
          return " " + token + " ";
        },
      );

      return message.replace(/[ \t]{2,}/g, " ").trim();
    },

    isReloadChatCommand: function (message) {
      return (
        String(message || "")
          .trim()
          .toLowerCase() === "!reloadchat"
      );
    },

    isKickReloadAllowed: function (data) {
      var sender = data && data.sender ? data.sender : {};
      var identity = sender.identity || {};
      var badges = [];

      if (Array.isArray(identity.badges)) {
        badges = badges.concat(identity.badges);
      }

      if (Array.isArray(identity.badges_v2)) {
        badges = badges.concat(identity.badges_v2);
      }

      if (Array.isArray(identity.badgesV2)) {
        badges = badges.concat(identity.badgesV2);
      }

      return badges.some(function (badge) {
        var type = Chat.getKickBadgeType(badge);

        return type === "broadcaster" || type === "moderator";
      });
    },

    writeKick: function (data) {
      var rawKickMessage = data && data.content ? String(data.content) : "";

      if (Chat.isReloadChatCommand(rawKickMessage)) {
        if (Chat.isKickReloadAllowed(data)) {
          console.log(
            "jChat Kick: !reloadchat accepted from",
            data.sender && data.sender.username,
          );
          window.location.reload();
          return;
        }

        console.log(
          "jChat Kick: !reloadchat ignored from non-mod/non-broadcaster",
          data.sender && data.sender.username,
        );
        return;
      }
      if (!data || !data.sender) return;

      var sender = data.sender;
      var identity = sender.identity || {};

      var nick = (sender.slug || sender.username || "kick-user").toLowerCase();
      var displayName = sender.username || nick;
      var content = data.content || "";
      var badges = Chat.getKickBadgesFromData(data);
      if (
        "debug_kick_badges" in $.QueryString &&
        $.QueryString.debug_kick_badges.toLowerCase() === "true"
      ) {
        Chat.debugKickBadgePayload(data, badges);
      }

      content = Chat.parseKickEmotes(content);

      var isMod = badges.some(function (badge) {
        return Chat.getKickBadgeType(badge) === "moderator";
      });

      var isBroadcaster =
        badges.some(function (badge) {
          return Chat.getKickBadgeType(badge) === "broadcaster";
        }) || nick === Chat.info.channel;

      if (content.toLowerCase() === "!reloadchat" && (isBroadcaster || isMod)) {
        location.reload();
        return;
      }

      if (Chat.info.hideCommands && /^!.+/.test(content)) return;

      if (!Chat.info.showBots && Chat.info.bots.includes(nick)) return;

      if (Chat.info.blockedUsers && Chat.info.blockedUsers.includes(nick))
        return;

      var color = identity.color;
      if (
        typeof color === "string" &&
        color.length > 0 &&
        color.charAt(0) !== "#"
      ) {
        color = "#" + color;
      }

      var info = {
        id: data.id || "kick-" + Date.now() + "-" + Math.random(),
        badges: Chat.registerKickBadges(badges),
        color: color || undefined,
        "display-name": displayName,
        emotes: null,
        mod: isMod ? "1" : "0",
        bits: "0",
      };

      Chat.write(nick, info, content);
    },

    clearKickReconnectTimer: function () {
      if (Chat.info.kickReconnectTimer) {
        clearTimeout(Chat.info.kickReconnectTimer);
        Chat.info.kickReconnectTimer = null;
      }
    },

    scheduleKickReconnect: function (chatroomId) {
      if (Chat.info.kickManualClose) return;

      Chat.clearKickReconnectTimer();

      var attempt = Chat.info.kickReconnectAttempts;
      var delay = Math.min(
        Chat.info.kickReconnectMaxDelay,
        Chat.info.kickReconnectBaseDelay * Math.pow(2, attempt),
      );

      // Tiny jitter so reconnects don't all spam the server.
      delay += Math.floor(Math.random() * 1000);

      Chat.info.kickReconnectAttempts += 1;

      console.warn(
        "jChat Kick: Reconnecting in " +
          Math.round(delay / 1000) +
          "s. Attempt " +
          Chat.info.kickReconnectAttempts +
          ".",
      );

      Chat.info.kickReconnectTimer = setTimeout(function () {
        Chat.connectKick(chatroomId, true);
      }, delay);
    },

    normalizeKickChannel: function (channel) {
      if (channel === undefined || channel === null || channel === false) {
        return null;
      }

      var slug = String(channel).trim();

      // Allow &kick=true / &kick=1 / &kick=same to mean "same as Twitch channel".
      if (/^(true|1|yes|same|channel|twitch)$/i.test(slug)) {
        slug = Chat.info.channel;
      }

      if (!slug) return null;

      slug = slug
        .replace(/^@+/, "")
        .replace(/^https?:\/\/(www\.)?kick\.com\//i, "")
        .replace(/^popout\//i, "")
        .replace(/\/chat$/i, "")
        .split(/[/?#]/)[0]
        .trim()
        .toLowerCase();

      return slug || null;
    },

    findKickChatroomId: function (payload) {
      function toId(value) {
        var id = parseInt(value, 10);
        return Number.isNaN(id) ? null : id;
      }

      function fromChatroomObject(obj) {
        if (!obj || typeof obj !== "object") return null;

        return (
          toId(obj.id) || toId(obj.chatroom_id) || toId(obj.chatroomId) || null
        );
      }

      function walk(node, depth) {
        if (!node || depth > 7) return null;

        if (Array.isArray(node)) {
          for (var i = 0; i < node.length; i++) {
            var arrayResult = walk(node[i], depth + 1);
            if (arrayResult) return arrayResult;
          }

          return null;
        }

        if (typeof node !== "object") return null;

        if (node.chatroom) {
          var chatroomResult = fromChatroomObject(node.chatroom);
          if (chatroomResult) return chatroomResult;
        }

        var directResult =
          toId(node.chatroom_id) || toId(node.chatroomId) || null;

        if (directResult) return directResult;

        for (var key in node) {
          if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

          var result = walk(node[key], depth + 1);
          if (result) return result;
        }

        return null;
      }

      return walk(payload, 0);
    },

    resolveKickChatroomId: function (channel) {
      var slug = Chat.normalizeKickChannel(channel);
      var deferred = $.Deferred();

      if (!slug) {
        deferred.reject("Missing Kick channel slug.");
        return deferred.promise();
      }

      var endpoints = [
        "https://kick.com/api/v2/channels/" + encodeURIComponent(slug),
        "https://kick.com/api/v1/channels/" + encodeURIComponent(slug),
        "https://kick.com/api/v1/channels/" +
          encodeURIComponent(slug) +
          "/chat",
      ];

      var errors = [];

      function tryEndpoint(index) {
        if (index >= endpoints.length) {
          deferred.reject({
            slug: slug,
            message: "Could not resolve Kick chatroom ID.",
            errors: errors,
          });

          return;
        }

        var url = endpoints[index];

        console.log("jChat Kick: Resolving " + slug + " via " + url);

        $.ajax({
          url: url,
          method: "GET",
          dataType: "json",
          timeout: 10000,
        })
          .done(function (res) {
            var chatroomId = Chat.findKickChatroomId(res);

            if (chatroomId) {
              Chat.info.kickRoomId = chatroomId;
              Chat.cacheKickSubscriberBadgesFromChannel(res);

              console.log(
                "jChat Kick: Resolved " + slug + " to chatroom " + chatroomId,
              );

              deferred.resolve(chatroomId, res);
              return;
            }

            errors.push({
              url: url,
              reason: "No chatroom ID found in response.",
              response: res,
            });

            tryEndpoint(index + 1);
          })
          .fail(function (xhr, status, error) {
            errors.push({
              url: url,
              status: status,
              error: error,
              httpStatus: xhr && xhr.status,
            });

            tryEndpoint(index + 1);
          });
      }

      tryEndpoint(0);

      return deferred.promise();
    },

    connectKickChannel: function (channel) {
      var slug = Chat.normalizeKickChannel(channel);

      if (!slug) {
        console.warn("jChat Kick: Missing Kick channel slug.");
        return;
      }

      Chat.resolveKickChatroomId(slug)
        .done(function (chatroomId) {
          Chat.connectKick(chatroomId);
        })
        .fail(function (err) {
          console.warn(
            "jChat Kick: Failed to auto-resolve channel. Use kick_room as fallback.",
            err,
          );
        });
    },

    connectKick: function (chatroomId, isReconnect) {
      if (!chatroomId || Number.isNaN(chatroomId)) {
        console.warn("jChat Kick: Missing or invalid kick_room parameter.");
        return;
      }

      Chat.clearKickReconnectTimer();

      if (!isReconnect) {
        Chat.info.kickReconnectAttempts = 0;
      }

      Chat.info.kickManualClose = false;

      // Avoid duplicate Kick sockets if connectKick is called twice.
      if (
        Chat.info.kickSocket &&
        (Chat.info.kickSocket.readyState === WebSocket.OPEN ||
          Chat.info.kickSocket.readyState === WebSocket.CONNECTING)
      ) {
        Chat.info.kickManualClose = true;

        try {
          Chat.info.kickSocket.close();
        } catch (err) {
          console.warn("jChat Kick: Failed to close existing socket.", err);
        }

        Chat.info.kickManualClose = false;
      }

      console.log(
        "jChat Kick: " +
          (isReconnect ? "Reconnecting" : "Connecting") +
          " to chatroom " +
          chatroomId,
      );

      var socket = new WebSocket(Chat.info.kickPusherUrl);
      Chat.info.kickSocket = socket;

      var subscribed = false;
      var channelName = "chatrooms." + chatroomId + ".v2";

      function subscribe() {
        if (subscribed || socket.readyState !== WebSocket.OPEN) return;

        socket.send(
          JSON.stringify({
            event: "pusher:subscribe",
            data: {
              auth: "",
              channel: channelName,
            },
          }),
        );

        subscribed = true;
        Chat.info.kickReconnectAttempts = 0;

        console.log("jChat Kick: Subscribed to " + channelName);
      }

      socket.onopen = function () {
        console.log("jChat Kick: WebSocket open");
      };

      socket.onmessage = function (event) {
        var packet;

        try {
          packet = JSON.parse(event.data);
        } catch (err) {
          console.warn("jChat Kick: Failed to parse packet.", err);
          return;
        }

        if (packet.event === "pusher:connection_established") {
          subscribe();
          return;
        }

        if (packet.event === "pusher:ping") {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ event: "pusher:pong" }));
          }

          return;
        }

        if (packet.event === "pusher:error") {
          console.warn("jChat Kick: Pusher error.", packet);
          return;
        }

        if (!packet.event || packet.event.indexOf("App\\Events\\") !== 0)
          return;

        var data;

        try {
          data =
            typeof packet.data === "string"
              ? JSON.parse(packet.data)
              : packet.data;
        } catch (err) {
          console.warn("jChat Kick: Failed to parse event data.", err, packet);
          return;
        }

        if (packet.event === "App\\Events\\ChatMessageEvent") {
          Chat.writeKick(data);
          return;
        }

        if (
          packet.event === "App\\Events\\ChatMessageDeletedEvent" ||
          Chat.isKickDeleteEvent(packet.event)
        ) {
          Chat.deleteKickMessage(data);
          return;
        }
      };

      socket.onerror = function (err) {
        console.warn("jChat Kick: WebSocket error.", err);
      };

      socket.onclose = function (event) {
        subscribed = false;

        if (Chat.info.kickSocket === socket) {
          Chat.info.kickSocket = null;
        }

        if (Chat.info.kickManualClose) {
          console.log("jChat Kick: WebSocket closed manually.");
          return;
        }

        console.warn(
          "jChat Kick: Disconnected. Code: " +
            event.code +
            ", reason: " +
            (event.reason || "none"),
        );

        Chat.scheduleKickReconnect(chatroomId);
      };
    },
  });
})();
