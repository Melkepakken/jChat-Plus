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
