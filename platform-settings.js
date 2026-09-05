(function () {
  function paramsFrom(input) {
    return input instanceof URLSearchParams
      ? input
      : new URLSearchParams(String(input || ""));
  }

  function disabled(value) {
    return /^(false|0|no|off|disabled)$/i.test(String(value || "").trim());
  }

  function kickAlias(value) {
    return /^(true|1|yes|same|channel|twitch)$/i.test(String(value || "").trim());
  }

  function youtubeAlias(value) {
    return /^(true|1|yes|same|channel|kick)$/i.test(String(value || "").trim());
  }

  function normalizeTwitchChannel(value) {
    var channel = String(value || "").trim().toLowerCase();
    return !disabled(channel) && /^[a-z0-9_]+$/.test(channel) ? channel : null;
  }

  function normalizeKickChannel(value, literal) {
    var channel = String(value || "").trim();
    if (disabled(channel) || (!literal && kickAlias(channel))) return null;

    channel = channel
      .replace(/^@+/, "")
      .replace(/^https?:\/\/(www\.)?kick\.com\//i, "")
      .replace(/^popout\//i, "")
      .replace(/\/chat$/i, "")
      .split(/[/?#]/)[0]
      .trim()
      .toLowerCase();

    return !disabled(channel) && /^[a-z0-9_-]+$/.test(channel) ? channel : null;
  }

  function normalizeYouTubeHandle(value, literal) {
    var input = String(value || "").trim();
    if (!input || disabled(input) || (!literal && youtubeAlias(input))) return null;

    try {
      var url = new URL(/^https?:\/\//i.test(input) ? input : "https://" + input);
      if (/^(www\.|m\.)?youtube\.com$/i.test(url.hostname)) {
        var match = url.pathname.match(/^\/@([^/?#]+)/);
        if (match) input = match[1];
      }
    } catch (err) {
      // A plain handle does not have to be a URL.
    }

    input = input.replace(/^@+/, "");
    return !disabled(input) && /^[a-zA-Z0-9._-]+$/.test(input) ? input : null;
  }

  // Preserve literal names that would otherwise be read as legacy URL aliases.
  function formatKickChannel(value) {
    var channel = normalizeKickChannel(value, true);
    return channel && kickAlias(channel) ? "@" + channel : channel;
  }

  function formatYouTubeHandle(value) {
    var handle = normalizeYouTubeHandle(value, true);
    return handle && youtubeAlias(handle) ? "@" + handle : handle;
  }

  function getYouTubeVideoId(value) {
    var input = String(value || "").trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

    try {
      var url = new URL(/^https?:\/\//i.test(input) ? input : "https://" + input);
      var host = url.hostname.toLowerCase();
      var videoId = null;
      var parts = url.pathname.split("/").filter(Boolean);

      if (host === "youtu.be") {
        videoId = parts[0];
      } else if (/^(www\.|m\.)?youtube\.com$/.test(host)) {
        videoId = url.searchParams.get("v");
        if (!videoId && /^(live|embed|shorts)$/.test(parts[0])) videoId = parts[1];
      }

      return /^[a-zA-Z0-9_-]{11}$/.test(videoId || "") ? videoId : null;
    } catch (err) {
      return null;
    }
  }

  function strictGifFlag(input) {
    var found = false;
    var enabled = true;
    paramsFrom(input).forEach(function (value, name) {
      if (name.toLowerCase() !== "gifs") return;
      found = true;
      if (value.toLowerCase() !== "true") enabled = false;
    });
    return found && enabled;
  }

  function parse(input) {
    var params = paramsFrom(input);
    var twitchChannel = normalizeTwitchChannel(params.get("channel"));
    var twitchDisabled = /^false$/i.test(params.get("twitch") || "");
    var twitchSelected = !twitchDisabled && Boolean(
      String(params.get("channel") || "").trim() ||
      /^true$/i.test(params.get("twitch") || ""),
    );
    var kickValue = params.has("kick") ? params.get("kick") : params.get("kick_channel");
    var roomValue = String(params.get("kick_room") || "").trim();
    var roomId = /^\d+$/.test(roomValue) && Number.isSafeInteger(Number(roomValue)) && Number(roomValue) > 0
      ? Number(roomValue) : null;
    var kickChannel = kickAlias(kickValue)
      ? normalizeKickChannel(twitchChannel, true)
      : normalizeKickChannel(kickValue);
    var kickSelected = Boolean(roomValue || (String(kickValue || "").trim() && !disabled(kickValue)));
    var youtubeValue = params.get("youtube");
    var youtubeDisabled = params.has("youtube") && disabled(youtubeValue);
    var videoId = youtubeDisabled ? null : getYouTubeVideoId(params.get("youtube_video"));
    var youtubeSelected = !youtubeDisabled && Boolean(
      String(youtubeValue || "").trim() || String(params.get("youtube_video") || "").trim(),
    );
    // Legacy aliases may reuse a configured name even when its source is disabled.
    var specificKickChannel = !kickAlias(kickValue) && !/^kick$/i.test(String(kickValue || "").trim())
      ? normalizeYouTubeHandle(kickChannel, true) : null;
    var youtubeHandle = youtubeAlias(youtubeValue)
      ? (specificKickChannel || normalizeYouTubeHandle(twitchChannel, true))
      : normalizeYouTubeHandle(youtubeValue);

    return {
      twitch: { selected: twitchSelected, enabled: twitchSelected && Boolean(twitchChannel), channel: twitchChannel },
      kick: { selected: kickSelected, enabled: kickSelected && Boolean(roomId || kickChannel), channel: kickChannel, roomId: roomId },
      youtube: { selected: youtubeSelected, enabled: youtubeSelected && Boolean(videoId || youtubeHandle), handle: youtubeHandle, videoId: videoId, disabled: youtubeDisabled },
      showGifs: twitchSelected && strictGifFlag(params),
    };
  }

  window.jChatPlatformSettings = {
    parse: parse,
    strictGifFlag: strictGifFlag,
    normalizeTwitchChannel: normalizeTwitchChannel,
    normalizeKickChannel: normalizeKickChannel,
    normalizeYouTubeHandle: normalizeYouTubeHandle,
    formatKickChannel: formatKickChannel,
    formatYouTubeHandle: formatYouTubeHandle,
    getYouTubeVideoId: getYouTubeVideoId,
  };
})();
