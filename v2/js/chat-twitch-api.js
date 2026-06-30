(function () {
  window.Chat = window.Chat || {};

  Chat.twitchApi = function (path, data) {
    var hasLocalTwitchCredentials =
      typeof TwitchAPI === "function" &&
      typeof client_id !== "undefined" &&
      typeof oauth_token !== "undefined";

    if (hasLocalTwitchCredentials) {
      var query = data ? "?" + $.param(data) : "";
      return TwitchAPI("https://api.twitch.tv/helix" + path + query);
    }

    var apiBase = Chat.info.twitchApiBase || "/api/twitch";

    return $.ajax({
      url: apiBase + path,
      data: data || {},
      dataType: "json",
    });
  };
})();