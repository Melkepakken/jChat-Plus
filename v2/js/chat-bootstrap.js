$(document).ready(function () {
  if (Chat.info.started) return;
  Chat.info.started = true;
  Chat.info.startupGeneration++;
  Chat.applyPlatformSettings(window.location.search);

  // Shared state and styles exist before any platform can deliver a message.
  Chat.applyStaticStyles();

  function start(name, action) {
    if (!Chat.isPlatformEnabled(name)) return;
    try {
      action();
    } catch (err) {
      console.warn("jChat: Could not start " + name + ".", err);
    }
  }

  if (Chat.info.preview) {
    Chat.startPreview();
  } else {
    start("twitch", function () { Chat.connect(Chat.info.channel); });
    start("kick", function () {
      if (Chat.info.kickRoomId) Chat.connectKick(Chat.info.kickRoomId);
      else Chat.connectKickChannel(Chat.info.kickChannel, true);
    });
    start("youtube", function () { Chat.connectYouTube(); });
  }

  // Optional resources must never gate connections or preview samples.
  Chat.loadSharedResources();
  start("twitch", function () { Chat.loadTwitchGlobalResources(); });
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
