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
