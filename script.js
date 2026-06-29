function fadeOption(event) {
  if ($fade_bool.is(":checked")) {
    $fade.removeClass("hidden");
    $fade_seconds.removeClass("hidden");
  } else {
    $fade.addClass("hidden");
    $fade_seconds.addClass("hidden");
  }
}

function sizeUpdate(event) {
  let size = sizes[Number($size.val()) - 1];
  removeCSS("size");
  appendCSS("size", size);
}

function fontUpdate(event) {
  let font = fonts[Number($font.val())];
  removeCSS("font");
  appendCSS("font", font);
}

function strokeUpdate(event) {
  removeCSS("stroke");

  if ($stroke.val() == "0") {
    return;
  }

  let stroke = strokes[Number($stroke.val()) - 1];
  appendCSS("stroke", stroke);
}

function shadowUpdate(event) {
  removeCSS("shadow");

  if ($shadow.val() == "0") {
    return;
  }

  let shadow = shadows[Number($shadow.val()) - 1];
  appendCSS("shadow", shadow);
}

function badgesUpdate(event) {
  if ($badges.is(":checked")) {
    $('img[class="badge special"]').addClass("hidden");
  } else {
    $('img[class="badge special hidden"]').removeClass("hidden");
  }
}

function capsUpdate(event) {
  if ($small_caps.is(":checked")) {
    appendCSS("variant", "SmallCaps");
  } else {
    removeCSS("variant");
  }
}

function forceColorUpdate(event) {
  const $nick = $("#example .nick");

  if ($force_color_bool.is(":checked")) {
    $nick.css("color", $force_color.val());
  } else {
    $nick.css("color", defaultNickColor);
  }
}

function getOverlayBaseUrl() {
  return window.location.origin + "/v2/";
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

function generateURL(event) {
  event.preventDefault();

  const channel = $channel.val().trim();

  if (!channel) {
    return;
  }

  const generatedUrl =
    getOverlayBaseUrl() + "?channel=" + encodeURIComponent(channel);

  let data = {
    size: $size.val(),
    font: $font.val(),
    stroke: $stroke.val() != "0" ? $stroke.val() : false,
    shadow: $shadow.val() != "0" ? $shadow.val() : false,
    bots: $bots.is(":checked"),
    hide_commands: $commands.is(":checked"),
    hide_badges: $badges.is(":checked"),
    animate: $animate.is(":checked"),
    fade: $fade_bool.is(":checked") ? $fade.val().trim() : false,
    small_caps: $small_caps.is(":checked"),

    kick: getKickValue(),
    kick_room: $kick_room.val().trim() || false,

    emoji: $emoji.val() || false,
    cN: $force_color_bool.is(":checked") ? $force_color.val() : false,

    block: $block.val().trim() || false,

    ffz_room_badges: $ffz_room_badges.is(":checked"),
    ffz_user_badges: $ffz_user_badges.is(":checked"),
  };

  const params = encodeQueryData(data);

  $url.val(generatedUrl + (params ? "&" + params : ""));

  $generator.addClass("hidden");
  $result.removeClass("hidden");
}

function changePreview(event) {
  if ($example.hasClass("white")) {
    $example.removeClass("white");
    $brightness.attr("src", "img/light.png");
  } else {
    $example.addClass("white");
    $brightness.attr("src", "img/dark.png");
  }
}

function copyUrl(event) {
  const value = $url.val();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value);
  } else {
    $url.select();
    document.execCommand("copy");
  }

  $alert.css("visibility", "visible");
  $alert.css("opacity", "1");
}

function showUrl(event) {
  $alert.css("opacity", "0");

  setTimeout(function () {
    $alert.css("visibility", "hidden");
  }, 200);
}

function resetForm(event) {
  $channel.val("");

  $kick_enabled.prop("checked", false);
  $kick_channel.val("");
  $kick_room.val("");

  $size.val("3");
  $font.val("0");
  $stroke.val("0");
  $shadow.val("0");

  $bots.prop("checked", false);
  $commands.prop("checked", false);
  $badges.prop("checked", false);
  $animate.prop("checked", false);

  $fade_bool.prop("checked", false);
  $fade.addClass("hidden");
  $fade_seconds.addClass("hidden");
  $fade.val("30");

  $small_caps.prop("checked", false);

  $emoji.val("");

  $force_color_bool.prop("checked", false);
  $force_color.val("#ffcc00");

  $block.val("");

  $ffz_room_badges.prop("checked", false);
  $ffz_user_badges.prop("checked", false);

  sizeUpdate();
  fontUpdate();
  strokeUpdate();
  shadowUpdate();
  badgesUpdate();
  capsUpdate();
  forceColorUpdate();

  if ($example.hasClass("white")) {
    changePreview();
  }

  $result.addClass("hidden");
  $generator.removeClass("hidden");
  showUrl();
}

const defaultNickColor = "rgb(38, 255, 0)";

const $generator = $("form[name='generator']");
const $channel = $('input[name="channel"]');

const $kick_enabled = $('input[name="kick_enabled"]');
const $kick_channel = $('input[name="kick_channel"]');
const $kick_room = $('input[name="kick_room"]');

const $animate = $('input[name="animate"]');
const $bots = $('input[name="bots"]');
const $fade_bool = $("input[name='fade_bool']");
const $fade = $("input[name='fade']");
const $fade_seconds = $("#fade_seconds");
const $commands = $("input[name='commands']");
const $small_caps = $("input[name='small_caps']");
const $badges = $("input[name='badges']");

const $size = $("select[name='size']");
const $font = $("select[name='font']");
const $stroke = $("select[name='stroke']");
const $shadow = $("select[name='shadow']");
const $emoji = $("select[name='emoji']");

const $force_color_bool = $('input[name="force_color_bool"]');
const $force_color = $('input[name="force_color"]');

const $block = $('input[name="block"]');
const $ffz_room_badges = $('input[name="ffz_room_badges"]');
const $ffz_user_badges = $('input[name="ffz_user_badges"]');

const $brightness = $("#brightness");
const $example = $("#example");
const $result = $("#result");
const $url = $("#url");
const $alert = $("#alert");
const $reset = $("#reset");

$fade_bool.change(fadeOption);
$size.change(sizeUpdate);
$font.change(fontUpdate);
$stroke.change(strokeUpdate);
$shadow.change(shadowUpdate);
$small_caps.change(capsUpdate);
$badges.change(badgesUpdate);

$force_color_bool.change(forceColorUpdate);
$force_color.change(forceColorUpdate);

$generator.submit(generateURL);
$brightness.click(changePreview);
$url.click(copyUrl);
$alert.click(showUrl);
$reset.click(resetForm);
