function appendCSS(type, name) {
  $("<link/>", {
    rel: "stylesheet",
    type: "text/css",
    class: `chat_${type}`,
    href: `styles/${type}_${name}.css`,
  }).appendTo("head");
}

function escapeRegExp(string) {
  // Thanks to coolaj86 and Darren Cook (https://stackoverflow.com/a/6969486)
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(message) {
  return message
    .replace(/&/g, "&amp;")
    .replace(/(<)(?!3)/g, "&lt;")
    .replace(/(>)(?!\()/g, "&gt;");
}

function TwitchAPI(url) {
  if (url.includes("api.twitch.tv/helix")) {
    return $.ajax({
      url: url,
      dataType: "json",
      headers: {
        "Client-ID": client_id,
        Authorization: "Bearer " + oauth_token,
      },
    });
  }

  return $.getJSON(url);
}
