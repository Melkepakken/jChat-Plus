(function () {
  function twitch(nick, displayName, color, badges, message, options) {
    options = options || {};

    return {
      platform: "twitch",
      nick: nick,
      bot: !!options.bot,
      command: !!options.command,
      info: {
        badges: badges || "",
        color: color,
        "display-name": displayName || nick,
        "user-id": options.userId || "preview-" + nick.toLowerCase(),
        bits: options.bits || "0",
        emotes: options.emotes || null,
        mod: options.mod ? "1" : "0",
      },
      message: message,
    };
  }

  function kickBadge(type, extra) {
    return Object.assign(
      {
        type: type,
        text: type,
        sort_order: 10,
      },
      extra || {},
    );
  }

  function kick(slug, username, color, badges, content, options) {
    options = options || {};
    badges = badges || [];

    return {
      platform: "kick",
      bot: !!options.bot,
      command: !!options.command,
      data: {
        id: "preview-kick-" + slug,
        content: content,
        sender: {
          slug: slug,
          username: username,
          identity: {
            color: color,
            badges: badges,
            badges_v2: badges,
          },
        },
      },
    };
  }

  var twitchMessages = [
    twitch(
      "Melkepakken",
      "Melkepakken",
      "#26ff00",
      "broadcaster/1,subscriber/12",
      "Sub hype PogChamp 😎🔥",
    ),
    twitch(
      "Metalpakken",
      "Metalpakken",
      "#ff4444",
      "vip/1",
      "THE PREVIEW ENGINE HAS AWAKENED 💀🔥🎸",
    ),
    twitch(
      "BitWizard",
      "BitWizard",
      "#a970ff",
      "bits/100",
      "Cheer100 lighting up chat ⚡",
      { bits: "100" },
    ),
    twitch(
      "ModHammer",
      "ModHammer",
      "#00b8ff",
      "moderator/1,subscriber/6",
      "mods, pretend you did not see that",
      { mod: true },
    ),
    twitch(
      "GifterGoblin",
      "GifterGoblin",
      "#ffcc00",
      "sub-gifter/1,subscriber/3",
      "rare melk W, gift subs are loaded into the trebuchet",
    ),
    twitch(
      "LongMessageAndy",
      "LongMessageAndy",
      "#00bcd4",
      "",
      "This longer message tests wrapping, spacing, stroke, shadow, font size and general readability inside the real /v2 overlay renderer without inventing fake badge nonsense.",
    ),
    twitch("KappaInspector", "KappaInspector", "#8a2be2", "", "Kappa", {
      emotes: "25:0-4",
    }),
    twitch(
      "ChatCriminal",
      "ChatCriminal",
      "#ff7f50",
      "subscriber/1",
      "!gamble all",
      { command: true },
    ),
    twitch(
      "TipGoblin",
      "TipGoblin",
      "#ff69b4",
      "subscriber/2",
      "!tip melk 50",
      { command: true },
    ),
    twitch("QueueEnjoyer", "QueueEnjoyer", "#2e8b57", "", "!join", {
      command: true,
    }),
    twitch(
      "WatchtimeWarlord",
      "WatchtimeWarlord",
      "#daa520",
      "subscriber/9",
      "!watchtime",
      { command: true },
    ),
    twitch(
      "SongRequestDude",
      "SongRequestDude",
      "#1e90ff",
      "",
      "!sr DragonForce - Through the Fire and Flames",
      { command: true },
    ),
    twitch("ClipGremlin", "ClipGremlin", "#9acd32", "vip/1", "!clip", {
      command: true,
    }),
    twitch("LurkKnight", "LurkKnight", "#d2691e", "subscriber/4", "!lurk", {
      command: true,
    }),
    twitch(
      "GuitarGoblin",
      "GuitarGoblin",
      "#ff4500",
      "",
      "play the forbidden riff",
    ),
    twitch(
      "NoShotNils",
      "NoShotNils",
      "#5f9ea0",
      "",
      "no shot that actually worked",
    ),
    twitch(
      "BodoNPC",
      "BodøNPC",
      "#008000",
      "subscriber/7",
      "chat is cooked, Bodø edition 🐟",
    ),
    twitch(
      "Nightbot",
      "Nightbot",
      "#a0a0a0",
      "moderator/1",
      "Remember to follow the channel if you enjoy the chaos.",
      { bot: true, mod: true },
    ),
    twitch(
      "StreamElements",
      "StreamElements",
      "#ffcc00",
      "moderator/1",
      "New follower: some absolute legend just joined the milk carton.",
      { bot: true, mod: true },
    ),
    twitch(
      "Fossabot",
      "Fossabot",
      "#00ffff",
      "moderator/1",
      "Tip: use !watchtime to inspect how deep the rabbit hole goes.",
      { bot: true, mod: true },
    ),
    twitch(
      "ActionDude",
      "ActionDude",
      "#b22222",
      "subscriber/5",
      "\x01ACTION slowly backs away from the OBS browser source\x01",
    ),
    twitch(
      "SevenTVDrip",
      "SevenTVDrip",
      "#ffffff",
      "",
      "7TV badge test using a real Twitch user id with 7TV cosmetics. Name paint is for later.",
      { userId: "78968851" },
    ),
  ];

  var kickMessages = [
    kick(
      "melkepakken",
      "Melkepakken",
      "53fc18",
      [kickBadge("broadcaster", { text: "Broadcaster", sort_order: 1 })],
      "Kick side is alive [emote:37226:KEKW] 🟢",
    ),
    kick(
      "kickmod",
      "KickMod",
      "00d1ff",
      [
        kickBadge("moderator", { text: "Moderator", sort_order: 1 }),
        kickBadge("subscriber", {
          text: "Subscriber",
          count: 12,
          sort_order: 9,
        }),
      ],
      "Kick chat joins the party [emote:37244:modCheck]",
    ),
    kick(
      "kickvip",
      "KickVIP",
      "ffcc00",
      [
        kickBadge("vip", { text: "VIP", sort_order: 2 }),
        kickBadge("founder", { text: "Founder", count: 1, sort_order: 3 }),
      ],
      "VIP badge check, no fake renderer goblins allowed 🔥",
    ),
    kick(
      "verifiedviking",
      "VerifiedViking",
      "53fc18",
      [kickBadge("verified", { text: "Verified", sort_order: 2 })],
      "verified check mark gaming",
    ),
    kick(
      "ogfrog",
      "OGFrog",
      "00fff2",
      [kickBadge("og", { text: "OG", sort_order: 4 })],
      "been here since the cave paintings had bitrate issues",
    ),
    kick(
      "giftlord",
      "GiftLord",
      "ff69b4",
      [kickBadge("gifter", { text: "Sub Gifter", count: 25, sort_order: 8 })],
      "dropping subs like a medieval tax collector",
    ),
    kick(
      "levelbeast",
      "LevelBeast",
      "eeeeee",
      [kickBadge("level", { text: "42", count: 42, sort_order: 7 })],
      "level badge fallback check",
    ),
    kick(
      "sidekickhero",
      "SidekickHero",
      "ff6a4a",
      [kickBadge("sidekick", { text: "Sidekick", sort_order: 1 })],
      "sidekick badge entering from stage left",
    ),
    kick(
      "staffperson",
      "StaffPerson",
      "53fc18",
      [kickBadge("staff", { text: "Staff", sort_order: 1 })],
      "staff badge smoke test",
    ),
    kick(
      "botrix",
      "BotRix",
      "4fd8ff",
      [kickBadge("bot", { text: "Bot", sort_order: 1 })],
      "Alert test ready. No commands from this robot goblin.",
      { bot: true },
    ),
    kick(
      "kickgambler",
      "KickGambler",
      "9acd32",
      [
        kickBadge("subscriber", {
          text: "Subscriber",
          count: 3,
          sort_order: 9,
        }),
      ],
      "!gamble all",
      { command: true },
    ),
    kick("kicktipper", "KickTipper", "ff69b4", [], "!tip melk 50", {
      command: true,
    }),
    kick("kickqueue", "KickQueue", "1e90ff", [], "!join", { command: true }),
    kick(
      "kickwatcher",
      "KickWatcher",
      "daa520",
      [
        kickBadge("subscriber", {
          text: "Subscriber",
          count: 1,
          sort_order: 9,
        }),
      ],
      "!watchtime",
      { command: true },
    ),
    kick(
      "kicksr",
      "KickSR",
      "ff4500",
      [],
      "!sr Iron Maiden - Stranger in a Strange Land",
      { command: true },
    ),
    kick(
      "kickchatter",
      "KickChatter",
      "00bcd4",
      [],
      "this overlay looks clean now ngl [emote:37226:KEKW]",
    ),
    kick(
      "longkickandy",
      "LongKickAndy",
      "8a2be2",
      [],
      "This long Kick message checks wrapping, spacing, emoji, Kick emotes, and whether the preview panel stays readable when chat starts yapping at full goblin velocity [emote:37226:KEKW] 🔥",
    ),
  ];

  window.jChatPlusPreviewMessages = twitchMessages.concat(kickMessages);
})();
