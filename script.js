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
  if ($kick_enabled.is(":checked")) {
    $kick_channel_row.removeClass("hidden");
  } else {
    $kick_channel_row.addClass("hidden");
    $kick_channel.val("");
  }
}

function advancedOption() {
  const rows = $advanced_block_row
    .add($advanced_ffz_room_row)
    .add($advanced_ffz_user_row);

  if ($advanced_enabled.is(":checked")) {
    rows.removeClass("hidden");
  } else {
    rows.addClass("hidden");
    $block.val("");
    $ffz_room_badges.prop("checked", false);
    $ffz_user_badges.prop("checked", false);
  }
}

function forceColorOption() {
  if ($force_color_bool.is(":checked")) {
    $force_color_row.removeClass("hidden");
  } else {
    $force_color_row.addClass("hidden");
  }
}

function getKickValue() {
  if (!$kick_enabled.is(":checked")) {
    return false;
  }

  const kickChannel = $kick_channel.val().trim();

  if (kickChannel) {
    return kickChannel;
  }

  return "true";
}

function getOverlayChannel(options) {
  const isPreview = options && options.preview;
  const channel = $channel.val().trim();

  if (channel) {
    return channel;
  }

  return isPreview ? "Melkepakken" : "";
}

function getOverlayData(options) {
  const isPreview = options && options.preview;

  return {
    size: $size.val(),
    font: $font.val(),
    stroke: $stroke.val() !== "0" ? $stroke.val() : false,
    shadow: $shadow.val() !== "0" ? $shadow.val() : false,
    bots: $bots.is(":checked"),
    hide_commands: $commands.is(":checked"),
    hide_badges: !$all_badges.is(":checked") && $badges.is(":checked"),
    hide_all_badges: $all_badges.is(":checked"),
    animate: $animate.is(":checked"),
    fade: $fade_bool.is(":checked") ? $fade.val().trim() : false,
    small_caps: $small_caps.is(":checked"),
    kick: getKickValue(),
    emoji: $emoji.val() || false,
    cN: $force_color_bool.is(":checked") ? $force_color.val() : false,
    block: $block.val().trim() || false,
    ffz_room_badges: $ffz_room_badges.is(":checked"),
    ffz_user_badges: $ffz_user_badges.is(":checked"),
    preview: isPreview ? "true" : false,
  };
}

function buildOverlayQuery(options) {
  const channel = getOverlayChannel(options);
  const data = getOverlayData(options);
  const params = encodeQueryData(data);

  return (
    "channel=" + encodeURIComponent(channel) + (params ? "&" + params : "")
  );
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

  const channel = $channel.val().trim();

  if (!channel) {
    showAlert("Enter a Twitch channel first");
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

  $size.val("2");
  $font.val("0");
  $emoji.val("");
  $stroke.val("0");
  $shadow.val("0");

  $bots.prop("checked", true);
  $commands.prop("checked", false);
  $badges.prop("checked", false);
  $all_badges.prop("checked", false);

  $kick_enabled.prop("checked", true);
  $kick_channel.val("");

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

  kickOption();
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

  hideAlert();

  updateOverlayPreview({ forceSrc: true });
}

function schedulePreviewUpdate() {
  updateOverlayPreview();
}

function markUrlStale() {
  if (!$result.hasClass("hidden") && $url.val()) {
    $url_status.text("Settings changed. Generate again for a fresh URL.");
  }
}

const $generator = $("form[name='generator']");
const $channel = $('input[name="channel"]');

const $size = $("select[name='size']");
const $font = $("select[name='font']");
const $emoji = $("select[name='emoji']");
const $stroke = $("select[name='stroke']");
const $shadow = $("select[name='shadow']");

const $bots = $('input[name="bots"]');
const $commands = $("input[name='commands']");
const $badges = $("input[name='badges']");
const $all_badges = $("input[name='all_badges']");

const $kick_enabled = $('input[name="kick_enabled"]');
const $kick_channel = $('input[name="kick_channel"]');
const $kick_channel_row = $("#kick_channel_row");

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
const $result = $("#result");
const $url = $("#url");
const $url_status = $("#url_status");
const $alert = $("#alert");
const $reset = $("#reset");
const $submit = $('input[type="submit"]');

$fade_bool.change(function () {
  fadeOption();
  schedulePreviewUpdate();
});

$kick_enabled.change(function () {
  kickOption();
  schedulePreviewUpdate();
});

$advanced_enabled.change(function () {
  advancedOption();
  schedulePreviewUpdate();
});

$force_color_bool.change(function () {
  forceColorOption();
  schedulePreviewUpdate();
});

const $url_only_inputs = $channel.add($kick_channel);

$generator
  .find("input, select")
  .not($url_only_inputs)
  .on("input change", function () {
    schedulePreviewUpdate();
    markUrlStale();
  });

$url_only_inputs.on("input", markUrlStale);

$overlay_preview.on("load", function () {
  previewFrameLoaded = true;
  postPreviewSettings();
});

$generator.submit(generateURL);
$brightness.click(changePreview);
$url.click(copyUrl);
$reset.click(resetForm);

kickOption();
advancedOption();
forceColorOption();
updateOverlayPreview({ forceSrc: true });
