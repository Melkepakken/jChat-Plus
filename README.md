# [![](https://www.giambaj.it/twitch/jchat/img/peepoHappysmall.png)](#) jChat+ [![GitHub version](https://img.shields.io/badge/release-v1.0.0-blue)](#) [![Website giambaj.it](https://img.shields.io/website-up-down-green-red/https/giambaj.it.svg)](https://chat.melkepakken.tv/) [![GitHub license](https://img.shields.io/github/license/giambaJ/jChat)](https://github.com/giambaJ/jChat/blob/main/LICENSE)

**jChat+** is a modernized fork of [jChat](https://github.com/giambaJ/jChat) with Kick support, updated Twitch integrations, additional emoji rendering options, username color controls, and streamer-focused improvements.

This project is based on the original jChat by **giambaJ**. Huge credit to the original project. <3

> **Status:** jChat+ is currently a work-in-progress and is not hosted on a public website yet.
> Self-hosting works by running the project locally or hosting it yourself.

---

## Features

### jChat+ additions

* Kick chat support
* Kick channel auto-resolve with `kick=true` or `kick=<channel>`
* Kick message deletion support
* Kick emote support
* Kick badge support

  * `badges_v2` image badges
  * custom subscriber badges when available from Kick channel data
  * captured fallback SVG badges for common Kick roles
* `!reloadchat` support from Kick broadcaster/moderator messages
* Toggle between native OS/browser emoji and pinned Twemoji
* Force all usernames to one custom color
* Updated Twitch Helix user, badge, and cheermote handling
* Updated 7TV v3 support
* Optional legacy FFZ user badge lookups to avoid harmless 404s

### Original jChat features

* Twitch chat overlay
* 7TV, BTTV, and FFZ emote support
* Custom channel badges
* Multiple fonts and styling options
* Smooth message animation
* Fade old messages
* Hide bot messages
* Hide command messages
* `!reloadchat` from Twitch mods

---

## Self-hosting

jChat+ is a static browser-based overlay.

You can run it locally with a simple static server, for example:

```bash
python -m http.server 3000
```

Then open:

```txt
http://localhost:3000/v2/?channel=yourtwitchchannel
```

For OBS, add it as a **Browser Source**.

---

## Twitch credentials

Some Twitch API features require credentials.

Create a local file:

```txt
v2/credentials.js
```

Use this format:

```js
const CLIENT_ID = "your_twitch_client_id";
const OAUTH_TOKEN = "your_twitch_oauth_token";
```

Do **not** commit `credentials.js`.

---

## Basic usage

### Twitch only

```txt
http://localhost:3000/v2/?channel=melkepakken
```

### Twitch + Kick with same channel name

```txt
http://localhost:3000/v2/?channel=melkepakken&kick=true
```

### Twitch + specific Kick channel

```txt
http://localhost:3000/v2/?channel=melkepakken&kick=melkepakken
```

### Manual Kick room ID fallback

```txt
http://localhost:3000/v2/?channel=melkepakken&kick_room=3180237
```

---

## Useful query parameters

### Chat sources

| Parameter      | Example                    | Description                                           |
| -------------- | -------------------------- | ----------------------------------------------------- |
| `channel`      | `channel=melkepakken`      | Twitch channel                                        |
| `kick`         | `kick=true`                | Resolve Kick channel using the same name as `channel` |
| `kick`         | `kick=velcuz`              | Resolve a specific Kick channel                       |
| `kick_channel` | `kick_channel=velcuz`      | Alternative Kick channel parameter                    |
| `kick_room`    | `kick_room=3180237`        | Manual Kick chatroom ID override                      |

### Appearance

| Parameter | Example         | Description                      |
| --------- | --------------- | -------------------------------- |
| `size`    | `size=3`        | Chat size                        |
| `font`    | `font=0`        | Font selection                   |
| `shadow`  | `shadow=2`      | Text shadow level                |
| `animate` | `animate=true`  | Enable smooth message animation  |
| `cN`      | `cN=%23ffcc00`  | Force all usernames to one color |
| `emoji`   | `emoji=twemoji` | Use Twemoji                      |
| `emoji`   | `emoji=native`  | Use native OS/browser emoji      |

### Optional legacy features

| Parameter         | Example                | Description                      |
| ----------------- | ---------------------- | -------------------------------- |
| `ffz_room_badges` | `ffz_room_badges=true` | Enable old FFZ room badge lookup |
| `ffz_user_badges` | `ffz_user_badges=true` | Enable old FFZ user badge lookup |

---

## Kick support details

jChat+ supports Kick chat through Kick’s public chat websocket events.

Current Kick support includes:

* Live chat messages
* Kick emotes
* Deleted messages
* Broadcaster/moderator `!reloadchat`
* Kick role badges
* Kick global level badges
* Custom subscriber badges when discoverable from channel data
* Automatic Kick channel slug to chatroom ID resolution

Known limitation:

* Gift badge tiers are not fully mapped. jChat+ uses a default captured gift badge unless Kick sends a direct image URL.

---

## Example OBS URL

```txt
http://localhost:3000/v2/?channel=melkepakken&kick=true&size=3&font=0&shadow=2&animate=true&emoji=twemoji
```

---

## Credits

jChat+ is a fork of the original [jChat](https://github.com/giambaJ/jChat) by **giambaJ**.

Original project credit, structure, and core idea belong to giambaJ.
jChat+ adds modernized integrations and Kick support on top of that foundation.

---

## License

This project follows the license of the original jChat project.
