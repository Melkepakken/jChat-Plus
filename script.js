const HOSTED_OVERLAY_BASE_URL = "https://chat.melkepakken.tv/v2/";

let previewFrameLoaded = false;
let previewUpdateTimer = null;
let alertTimer = null;
let generateButtonTimer = null;

function fadeOption() {
  if ($fade_bool.is(":checked")) {
    $fade.removeClass("hidden");
    $fade_seconds.removeClass("hidden");
  } else {
    $fade.addClass("hidden");
    $fade_seconds.addClass("hidden");
  }
}

function kickOption() {
  const enabled = $kick_enabled.is(":checked");
  $kick_channel_row.toggleClass("hidden", !enabled);
  $kick_channel.prop("disabled", !enabled);
  updatePlatformHints();
}

function twitchOption() {
  const enabled = $twitch_enabled.is(":checked");
  $twitch_controls.toggleClass("hidden", !enabled);
  $twitch_controls.find("input").prop("disabled", !enabled);
  gifSizeOption();
  updatePlatformHints();
}

function gifSizeOption() {
  const enabled = $twitch_enabled.is(":checked") && $show_gifs.is(":checked");
  $gif_size_row.toggleClass("hidden", !enabled);
  $gif_size.prop("disabled", !enabled);
}

function youtubeOption() {
  const rows = $youtube_channel_row.add($youtube_video_row);

  const enabled = $youtube_enabled.is(":checked");
  rows.toggleClass("hidden", !enabled);
  $youtube_channel.add($youtube_video).prop("disabled", !enabled);
  updatePlatformHints();
}

function advancedOption() {
  const rows = $advanced_block_row
    .add($advanced_ffz_room_row)
    .add($advanced_ffz_user_row);

  if ($advanced_enabled.is(":checked")) {
    rows.removeClass("hidden");
  } else {
    rows.addClass("hidden");
  }
}

function forceColorOption() {
  if ($force_color_bool.is(":checked")) {
    $force_color_row.removeClass("hidden");
  } else {
    $force_color_row.addClass("hidden");
  }
}

function getPlatformFields() {
  const settings = window.jChatPlatformSettings;
  const twitchEnabled = $twitch_enabled.is(":checked");
  const kickEnabled = $kick_enabled.is(":checked");
  const youtubeEnabled = $youtube_enabled.is(":checked");
  const channel = twitchEnabled
    ? settings.normalizeTwitchChannel($channel.val())
    : null;
  const kickFallback = settings.normalizeKickChannel(channel, true);
  const kickInput = $kick_channel.val().trim();
  const kickChannel = kickEnabled
    ? (kickInput ? settings.normalizeKickChannel(kickInput) : kickFallback)
    : null;
  const youtubeKickFallback = settings.normalizeYouTubeHandle(kickChannel, true);
  const youtubeTwitchFallback = settings.normalizeYouTubeHandle(channel, true);
  const youtubeInput = $youtube_channel.val().trim();
  const videoInput = $youtube_video.val().trim();
  const youtubeHandle = youtubeEnabled
    ? (youtubeInput
        ? settings.normalizeYouTubeHandle(youtubeInput)
        : videoInput ? null : youtubeKickFallback || youtubeTwitchFallback)
    : null;
  const youtubeVideo = youtubeEnabled
    ? settings.getYouTubeVideoId(videoInput)
    : null;

  return {
    twitchEnabled,
    kickEnabled,
    youtubeEnabled,
    channel,
    kickFallback,
    kickChannel,
    youtubeFallbackPlatform: youtubeKickFallback ? "Kick" : youtubeTwitchFallback ? "Twitch" : null,
    youtubeHandle,
    youtubeVideo,
  };
}

function updatePlatformHints() {
  const fields = getPlatformFields();
  $kick_channel_help.text(
    fields.kickFallback ? "Blank = same as Twitch channel" : "Enter a Kick channel",
  );
  $youtube_channel_help.text(
    $youtube_video.val().trim()
      ? "Optional fallback for future streams"
      : fields.youtubeFallbackPlatform
        ? "Blank = same as " + fields.youtubeFallbackPlatform + " channel"
        : "Enter a handle or live video",
  );
  $preview_empty.toggleClass(
    "hidden",
    fields.twitchEnabled || fields.kickEnabled || fields.youtubeEnabled,
  );
}

function clearFormErrors() {
  $form_error.addClass("hidden").text("");
  $generator.find("[aria-invalid]").removeAttr("aria-invalid");
}

function validatePlatformFields() {
  const fields = getPlatformFields();
  const errors = [];

  function invalid($input, message) {
    $input.attr("aria-invalid", "true");
    errors.push(message);
  }

  clearFormErrors();
  if (fields.twitchEnabled && !fields.channel) {
    invalid($channel, "Enter a valid Twitch channel.");
  }
  if (fields.kickEnabled && !fields.kickChannel) {
    invalid($kick_channel, "Enter a valid Kick channel.");
  }
  if (fields.youtubeEnabled) {
    if ($youtube_channel.val().trim() && !fields.youtubeHandle) {
      invalid($youtube_channel, "Enter a valid YouTube handle.");
    }
    if ($youtube_video.val().trim() && !fields.youtubeVideo) {
      invalid($youtube_video, "Enter a valid YouTube video ID or URL.");
    }
    if (
      !fields.youtubeHandle &&
      !$youtube_channel.val().trim() &&
      !$youtube_video.val().trim()
    ) {
      invalid($youtube_channel, "Enter a YouTube handle or live video.");
    }
  }
  if (!fields.twitchEnabled && !fields.kickEnabled && !fields.youtubeEnabled) {
    errors.push("Enable at least one platform.");
  }

  if (errors.length) {
    $form_error.text(errors.join(" ")).removeClass("hidden");
    $generator.find('[aria-invalid="true"]').first().trigger("focus");
    return false;
  }
  return true;
}

function getOverlayData(options) {
  const isPreview = options && options.preview;
  const fields = getPlatformFields();
  const settings = window.jChatPlatformSettings;
  const showGifs = fields.twitchEnabled && $show_gifs.is(":checked");

  return {
    // Preview selections carry no user identities and never validate sources online.
    channel: isPreview ? false : fields.channel,
    twitch: fields.twitchEnabled ? (isPreview ? "true" : false) : "false",
    kick: isPreview ? String(fields.kickEnabled) : settings.formatKickChannel(fields.kickChannel),
    youtube: isPreview ? String(fields.youtubeEnabled) : settings.formatYouTubeHandle(fields.youtubeHandle),
    youtube_video: isPreview ? false : fields.youtubeVideo,
    GIFs: showGifs ? "true" : false,
    gif_size: showGifs ? settings.normalizeGifSize($gif_size.val()) : false,
    size: $size.val(),
    font: $font.val(),
    stroke: $stroke.val() !== "0" ? $stroke.val() : false,
    shadow: $shadow.val() !== "0" ? $shadow.val() : false,
    message_box: $message_box.is(":checked"),
    emote_shadow: $emote_shadow.is(":checked"),
    bots: $bots.is(":checked"),
    hide_commands: $commands.is(":checked"),
    platform_badges:
      $platform_badges.val() === "true" ? false : $platform_badges.val(),
    hide_badges: !$all_badges.is(":checked") && $badges.is(":checked"),
    hide_all_badges: $all_badges.is(":checked"),
    animate: $animate.is(":checked"),
    fade: $fade_bool.is(":checked") ? $fade.val().trim() : false,
    small_caps: $small_caps.is(":checked"),
    emoji: $emoji.val() || false,
    seventv_paints: fields.twitchEnabled && $seventv_paints.is(":checked"),
    cN: $force_color_bool.is(":checked") ? $force_color.val() : false,
    block: $block.val().trim() || false,
    ffz_room_badges: fields.twitchEnabled && $ffz_room_badges.is(":checked"),
    ffz_user_badges: fields.twitchEnabled && $ffz_user_badges.is(":checked"),
    preview: isPreview ? "true" : false,
  };
}

function buildOverlayQuery(options) {
  return encodeQueryData(getOverlayData(options));
}

function buildHostedOverlayUrl() {
  return HOSTED_OVERLAY_BASE_URL + "?" + buildOverlayQuery({ preview: false });
}

function buildPreviewOverlayUrl() {
  return "v2/?" + buildOverlayQuery({ preview: true });
}

function postPreviewSettings() {
  const iframe = $overlay_preview[0];

  if (!iframe || !iframe.contentWindow) {
    return;
  }

  iframe.contentWindow.postMessage(
    {
      type: "jchat_plus_preview_settings",
      query: buildOverlayQuery({ preview: true }),
    },
    window.location.origin,
  );
}

function updateOverlayPreview(options) {
  clearTimeout(previewUpdateTimer);

  previewUpdateTimer = setTimeout(function () {
    if (!previewFrameLoaded || (options && options.forceSrc)) {
      previewFrameLoaded = false;
      $overlay_preview.attr("src", buildPreviewOverlayUrl());
      return;
    }

    postPreviewSettings();
  }, 80);
}

function generateURL(event) {
  event.preventDefault();

  if (!validatePlatformFields()) {
    return;
  }

  $url.val(buildHostedOverlayUrl());
  $result.removeClass("hidden");
  $url_status.text("Click the URL to copy it.");

  showAlert("URL generated");

  clearTimeout(generateButtonTimer);
  $submit.val("Generated ✓");

  generateButtonTimer = setTimeout(function () {
    $submit.val("Generate URL");
  }, 1600);
}

function changePreview() {
  if ($preview_container.hasClass("white")) {
    $preview_container.removeClass("white");
    $brightness.attr("src", "img/light.png");
  } else {
    $preview_container.addClass("white");
    $brightness.attr("src", "img/dark.png");
  }
}

function copyUrl() {
  const value = $url.val();

  if (!value) {
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value);
  } else {
    $url.select();
    document.execCommand("copy");
  }

  showAlert("Copied to clipboard");
}

function showAlert(message) {
  clearTimeout(alertTimer);

  $alert.text(message);
  $alert.css("visibility", "visible");
  $alert.css("opacity", "1");

  alertTimer = setTimeout(hideAlert, 2400);
}

function hideAlert() {
  $alert.css("opacity", "0");

  setTimeout(function () {
    $alert.css("visibility", "hidden");
  }, 200);
}

function resetForm() {
  clearTimeout(alertTimer);
  clearTimeout(generateButtonTimer);

  $channel.val("");
  $twitch_enabled.prop("checked", true);
  $show_gifs.prop("checked", false);
  $gif_size.val("medium");

  $size.val("2");
  $font.val("0");
  $emoji.val("");
  $seventv_paints.prop("checked", false);
  $stroke.val("0");
  $shadow.val("0");
  $message_box.prop("checked", false);
  $emote_shadow.prop("checked", false);

  $bots.prop("checked", true);
  $commands.prop("checked", false);
  $platform_badges.val("true");
  $badges.prop("checked", false);
  $all_badges.prop("checked", false);

  $kick_enabled.prop("checked", true);
  $kick_channel.val("");

  $youtube_enabled.prop("checked", false);
  $youtube_channel.val("");
  $youtube_video.val("");

  $animate.prop("checked", true);
  $fade_bool.prop("checked", false);
  $fade.val("30");
  $fade.addClass("hidden");
  $fade_seconds.addClass("hidden");

  $small_caps.prop("checked", false);

  $force_color_bool.prop("checked", false);
  $force_color.val("#ffcc00");

  $advanced_enabled.prop("checked", false);
  $block.val("");
  $ffz_room_badges.prop("checked", false);
  $ffz_user_badges.prop("checked", false);

  twitchOption();
  kickOption();
  youtubeOption();
  advancedOption();
  forceColorOption();
  fadeOption();

  if ($preview_container.hasClass("white")) {
    $preview_container.removeClass("white");
    $brightness.attr("src", "img/light.png");
  }

  $result.addClass("hidden");
  $url.val("");
  $url_status.text("URL generated. Click the field to copy it.");
  $submit.val("Generate URL");

  clearFormErrors();
  hideAlert();

  updateOverlayPreview({ forceSrc: true });
}

function schedulePreviewUpdate() {
  updateOverlayPreview();
}

function markUrlStale() {
  clearFormErrors();
  if (!$result.hasClass("hidden") && $url.val()) {
    $url_status.text("Settings changed. Generate again for a fresh URL.");
  }
}

const $generator = $("form[name='generator']");
const $channel = $('input[name="channel"]');
const $twitch_enabled = $('input[name="twitch_enabled"]');
const $twitch_controls = $("#twitch_controls");
const $show_gifs = $('input[name="show_gifs"]');
const $gif_size = $('select[name="gif_size"]');
const $gif_size_row = $("#gif_size_row");

const $size = $("select[name='size']");
const $font = $("select[name='font']");
const $emoji = $("select[name='emoji']");
const $seventv_paints = $('input[name="seventv_paints"]');
const $stroke = $("select[name='stroke']");
const $shadow = $("select[name='shadow']");
const $message_box = $('input[name="message_box"]');
const $emote_shadow = $('input[name="emote_shadow"]');

const $bots = $('input[name="bots"]');
const $commands = $("input[name='commands']");
const $platform_badges = $('select[name="platform_badges"]');
const $badges = $("input[name='badges']");
const $all_badges = $("input[name='all_badges']");

const $kick_enabled = $('input[name="kick_enabled"]');
const $kick_channel = $('input[name="kick_channel"]');
const $kick_channel_row = $("#kick_channel_row");
const $kick_channel_help = $("#kick_channel_help");

const $youtube_enabled = $('input[name="youtube_enabled"]');
const $youtube_channel = $('input[name="youtube_channel"]');
const $youtube_video = $('input[name="youtube_video"]');
const $youtube_channel_row = $("#youtube_channel_row");
const $youtube_video_row = $("#youtube_video_row");
const $youtube_channel_help = $("#youtube_channel_help");

const $animate = $('input[name="animate"]');
const $fade_bool = $("input[name='fade_bool']");
const $fade = $("input[name='fade']");
const $fade_seconds = $("#fade_seconds");
const $small_caps = $("input[name='small_caps']");

const $force_color_bool = $('input[name="force_color_bool"]');
const $force_color = $('input[name="force_color"]');
const $force_color_row = $("#force_color_row");

const $advanced_enabled = $('input[name="advanced_enabled"]');
const $block = $('input[name="block"]');
const $ffz_room_badges = $('input[name="ffz_room_badges"]');
const $ffz_user_badges = $('input[name="ffz_user_badges"]');
const $advanced_block_row = $("#advanced_block_row");
const $advanced_ffz_room_row = $("#advanced_ffz_room_row");
const $advanced_ffz_user_row = $("#advanced_ffz_user_row");

const $brightness = $("#brightness");
const $preview_container = $("#preview_container");
const $overlay_preview = $("#overlay_preview");
const $preview_empty = $("#preview_empty");
const $form_error = $("#form_error");
const $result = $("#result");
const $url = $("#url");
const $url_status = $("#url_status");
const $alert = $("#alert");
const $reset = $("#reset");
const $submit = $("#generate_url");

$fade_bool.change(function () {
  fadeOption();
  schedulePreviewUpdate();
});

$twitch_enabled.change(function () {
  twitchOption();
  schedulePreviewUpdate();
});

$show_gifs.change(gifSizeOption);

$kick_enabled.change(function () {
  kickOption();
  schedulePreviewUpdate();
});

$youtube_enabled.change(function () {
  youtubeOption();
  schedulePreviewUpdate();
  markUrlStale();
});

$advanced_enabled.change(function () {
  advancedOption();
});

$force_color_bool.change(function () {
  forceColorOption();
  schedulePreviewUpdate();
});

const $url_only_inputs = $channel
  .add($kick_channel)
  .add($youtube_channel)
  .add($youtube_video);
const $preview_ignored_inputs = $url_only_inputs
  .add($advanced_enabled)
  .add($youtube_enabled);

$generator
  .find("input, select")
  .not($preview_ignored_inputs)
  .on("input change", function () {
    schedulePreviewUpdate();
    markUrlStale();
  });

$url_only_inputs.on("input change", function () {
  updatePlatformHints();
  markUrlStale();
});

$overlay_preview.on("load", function () {
  previewFrameLoaded = true;
  postPreviewSettings();
});

$generator.submit(generateURL);
$brightness.click(changePreview);
$url.click(copyUrl);
$reset.click(resetForm);

twitchOption();
kickOption();
youtubeOption();
advancedOption();
forceColorOption();
updateOverlayPreview({ forceSrc: true });
