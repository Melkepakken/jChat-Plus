const HOSTED_OVERLAY_BASE_URL = "https://chat.melkepakken.tv/v2/";
const defaultNickColor = "rgb(38, 255, 0)";

const previewMessages = [
  {
    classes: "preview-twitch preview-sub",
    source: "Twitch",
    badges: [
      {
        classes: "badge",
        src: "https://static-cdn.jtvnw.net/badges/v1/3158e758-3cb4-43c5-94b3-7639810451c5/3",
        alt: "Subscriber",
      },
      {
        classes: "badge special",
        src: "https://cdn.7tv.app/badge/60d5998fb0ac44b85331fe2b/3x",
        alt: "7TV",
      },
    ],
    name: "Melkepakken",
    color: "rgb(38, 255, 0)",
    message:
      'Sub hype 😎🔥 <img class="emote" src="https://cdn.7tv.app/emote/6040aacfcf6746000db1034f/4x" alt="emote">',
  },
  {
    classes: "preview-twitch preview-cheer",
    source: "Bits",
    badges: [
      {
        classes: "badge special",
        src: "https://cdn.frankerfacez.com/badge/3/4",
        alt: "FFZ",
        style: "background-color: rgb(117, 80, 0)",
      },
    ],
    name: "BitWizard",
    color: "#a970ff",
    message:
      '<img class="cheer_emote" src="https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100/4.gif" alt="cheer"><span class="cheer_bits">100</span> Lighting up chat ⚡',
  },
  {
    classes: "preview-kick",
    source: "Kick",
    badges: [
      {
        classes: "badge kick_badge",
        src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Crect width='18' height='18' rx='4' fill='%2353fc18'/%3E%3Cpath d='M5 4h3v3h2V4h3v10h-3v-3H8v3H5z' fill='%23000'/%3E%3C/svg%3E",
        alt: "Kick",
      },
    ],
    name: "KickMod",
    color: "#00d1ff",
    message: "Kick chat joins 🟢",
  },
  {
    classes: "preview-bot preview-command",
    source: "Bot",
    badges: [
      {
        classes: "badge",
        src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Crect width='18' height='18' rx='4' fill='%2388aaff'/%3E%3Ccircle cx='6' cy='8' r='1.4' fill='%23000'/%3E%3Ccircle cx='12' cy='8' r='1.4' fill='%23000'/%3E%3Cpath d='M5 12h8' stroke='%23000' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E",
        alt: "Bot",
      },
    ],
    name: "StreamElements",
    color: "#ffcc00",
    message: "!followage",
  },
  {
    classes: "preview-normal",
    source: "Chat",
    badges: [],
    name: "ChatGoblin",
    color: "#ff4fd8",
    message: "No badges, just vibes 🐸",
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  function renderPreview() {
    const forceColor = $force_color_bool.is(":checked");
    const forcedColor = $force_color.val();

    const html = previewMessages
      .filter(shouldShowPreviewMessage)
      .map(function (item) {
        const badges = item.badges.map(renderBadge).join("");
        const nickColor = forceColor
          ? forcedColor
          : item.color || defaultNickColor;

        return `
        <div class="chat_line ${escapeHtml(item.classes)}">
          <span class="user_info">
            ${badges}<span class="nick" style="color: ${escapeHtml(nickColor)}">${escapeHtml(item.name)}</span><span class="colon">:</span>
          </span>
          <span class="message">${item.message}</span>
        </div>
      `;
      })
      .join("");

    $example.html(html);

    if (
      $emoji.val() !== "native" &&
      window.twemoji &&
      typeof window.twemoji.parse === "function"
    ) {
      window.twemoji.parse($example[0], {
        base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
        folder: "svg",
        ext: ".svg",
      });
    }

    applyTextEffects();
    capsUpdate();
  }
}

function sizeUpdate() {
  const size = sizes[Number($size.val()) - 1];

  removeCSS("size");
  appendCSS("size", size);
}

function fontUpdate() {
  const font = fonts[Number($font.val())];

  removeCSS("font");
  appendCSS("font", font);
}

function strokeUpdate() {
  applyTextEffects();
}

function shadowUpdate() {
  applyTextEffects();
}

function badgesUpdate() {
  renderPreview();
}

function capsUpdate() {
  if ($small_caps.is(":checked")) {
    $("#example").css("font-variant", "small-caps");
  } else {
    $("#example").css("font-variant", "");
  }
}

function forceColorUpdate() {
  renderPreview();
}

function getTextEffectTargets() {
  return $(
    "#example .nick, #example .message, #example .colon, #example .cheer_bits",
  );
}

function getStrokePreviewShadows() {
  const stroke = Number($stroke.val());

  if (stroke === 1) {
    return ["-1px 0 #000", "1px 0 #000", "0 -1px #000", "0 1px #000"];
  }

  if (stroke === 2) {
    return [
      "-1px -1px #000",
      "-1px 0 #000",
      "-1px 1px #000",
      "0 -1px #000",
      "0 1px #000",
      "1px -1px #000",
      "1px 0 #000",
      "1px 1px #000",
    ];
  }

  if (stroke === 3) {
    return [
      "-2px -2px #000",
      "-2px 0 #000",
      "-2px 2px #000",
      "0 -2px #000",
      "0 2px #000",
      "2px -2px #000",
      "2px 0 #000",
      "2px 2px #000",
    ];
  }

  if (stroke === 4) {
    return [
      "-3px -3px #000",
      "-3px 0 #000",
      "-3px 3px #000",
      "0 -3px #000",
      "0 3px #000",
      "3px -3px #000",
      "3px 0 #000",
      "3px 3px #000",
    ];
  }

  return [];
}

function getShadowPreviewShadows() {
  const shadow = Number($shadow.val());

  if (shadow === 1) {
    return ["1px 1px 2px #000"];
  }

  if (shadow === 2) {
    return ["2px 2px 4px #000"];
  }

  if (shadow === 3) {
    return ["3px 3px 6px #000"];
  }

  return [];
}

function applyTextEffects() {
  const shadows = getStrokePreviewShadows().concat(getShadowPreviewShadows());

  getTextEffectTargets().css(
    "text-shadow",
    shadows.length ? shadows.join(", ") : "",
  );
}

function shouldShowPreviewMessage(message) {
  if (!$bots.is(":checked") && message.classes.includes("preview-bot")) {
    return false;
  }

  if ($commands.is(":checked") && message.classes.includes("preview-command")) {
    return false;
  }

  return true;
}

function renderBadge(badge) {
  const hideAllBadges = $all_badges.is(":checked");
  const hideSpecialBadges =
    !$all_badges.is(":checked") && $badges.is(":checked");

  if (hideAllBadges) {
    return "";
  }

  if (hideSpecialBadges && badge.classes.includes("special")) {
    return "";
  }

  const style = badge.style ? ` style="${escapeHtml(badge.style)}"` : "";

  return `<img class="${escapeHtml(badge.classes)}" src="${badge.src}" alt="${escapeHtml(
    badge.alt || "badge",
  )}"${style}>`;
}

function renderPreview() {
  const forceColor = $force_color_bool.is(":checked");
  const forcedColor = $force_color.val();

  const html = previewMessages
    .filter(shouldShowPreviewMessage)
    .map(function (item) {
      const badges = item.badges.map(renderBadge).join("");
      const nickColor = forceColor
        ? forcedColor
        : item.color || defaultNickColor;

      return `
        <div class="chat_line ${escapeHtml(item.classes)}">
          <span class="user_info">
            ${badges}<span class="nick" style="color: ${escapeHtml(nickColor)}">${escapeHtml(item.name)}</span><span class="colon">:</span>
          </span>
          <span class="message">${item.message}</span>
        </div>
      `;
    })
    .join("");

  $example.html(html);

  if ($emoji.val() === "twemoji" && typeof twemoji !== "undefined") {
    twemoji.parse($example[0], {
      base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
      folder: "svg",
      ext: ".svg",
    });
  }

  applyTextEffects();
  capsUpdate();
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
    HOSTED_OVERLAY_BASE_URL + "?channel=" + encodeURIComponent(channel);

  const data = {
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
  };

  const params = encodeQueryData(data);

  $url.val(generatedUrl + (params ? "&" + params : ""));

  $generator.addClass("hidden");
  $result.removeClass("hidden");
}

function changePreview() {
  if ($example.hasClass("white")) {
    $example.removeClass("white");
    $brightness.attr("src", "img/light.png");
  } else {
    $example.addClass("white");
    $brightness.attr("src", "img/dark.png");
  }
}

function copyUrl() {
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

function showUrl() {
  $alert.css("opacity", "0");

  setTimeout(function () {
    $alert.css("visibility", "hidden");
  }, 200);
}

function resetForm() {
  $channel.val("");

  $size.val("3");
  $font.val("0");
  $emoji.val("");
  $stroke.val("0");
  $shadow.val("0");

  $bots.prop("checked", false);
  $commands.prop("checked", false);
  $badges.prop("checked", false);
  $all_badges.prop("checked", false);

  $kick_enabled.prop("checked", false);
  $kick_channel.val("");

  $animate.prop("checked", false);
  $fade_bool.prop("checked", false);
  $fade.addClass("hidden");
  $fade_seconds.addClass("hidden");
  $fade.val("30");
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

  sizeUpdate();
  fontUpdate();
  applyTextEffects();
  renderPreview();

  if ($example.hasClass("white")) {
    changePreview();
  }

  $result.addClass("hidden");
  $generator.removeClass("hidden");
  showUrl();
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
const $example = $("#example");
const $result = $("#result");
const $url = $("#url");
const $alert = $("#alert");
const $reset = $("#reset");

$fade_bool.change(fadeOption);
$kick_enabled.change(kickOption);
$advanced_enabled.change(advancedOption);
$force_color_bool.change(forceColorOption);
$force_color.change(forceColorUpdate);

$size.change(sizeUpdate);
$font.change(fontUpdate);
$emoji.change(renderPreview);
$stroke.change(strokeUpdate);
$shadow.change(shadowUpdate);
$small_caps.change(capsUpdate);
$badges.change(badgesUpdate);
$all_badges.change(badgesUpdate);
$bots.change(renderPreview);
$commands.change(renderPreview);

$generator.submit(generateURL);
$brightness.click(changePreview);
$url.click(copyUrl);
$alert.click(showUrl);
$reset.click(resetForm);

kickOption();
advancedOption();
forceColorOption();
sizeUpdate();
fontUpdate();
renderPreview();
