# jChat+

[![Release](https://img.shields.io/badge/release-v1.0.0-blue)](#)
[![Website](https://img.shields.io/website-up-down-green-red/https/chat.melkepakken.tv.svg)](https://chat.melkepakken.tv/)
[![License](https://img.shields.io/github/license/Melkepakken/jchat-plus)](LICENSE)

**jChat+** is a modernized fork of [jChat](https://github.com/giambaJ/jChat) with Kick support, updated Twitch integrations, additional emoji rendering options, username color controls, and streamer-focused improvements.

The public hosted version is available at:

```txt
https://chat.melkepakken.tv/
```

This project is based on the original jChat by **giambaJ**. Huge credit to the original project.

---

## Features

### jChat+ additions

* Kick chat support
* Kick channel auto-resolve with `kick=true`, `kick=<channel>`, or `kick_channel=<channel>`
* Manual Kick chatroom override with `kick_room=<roomId>`
* Kick message deletion support
* Kick emote support
* Kick badge support

  * `badges_v2` image badges
  * custom subscriber badges when available from Kick channel data
  * fallback SVG badges for common Kick roles
* `!reloadchat` support from Kick broadcaster/moderator messages
* Toggle between native OS/browser emoji and pinned Twemoji
* Force all usernames to one custom color
* Updated Twitch Helix user, badge, and cheermote handling
* Updated 7TV v3 support
* Optional legacy FFZ user badge lookups to avoid harmless 404s
* Cloudflare Pages Function support for public Twitch Helix proxying

### Original jChat features

* Twitch chat overlay
* 7TV, BetterTTV, and FrankerFaceZ emote support
* Custom channel badges
* Multiple fonts and styling options
* Smooth message animation
* Fade old messages
* Hide bot messages
* Hide command messages
* `!reloadchat` from Twitch mods

---

## Hosted usage

Use the setup page:

```txt
https://chat.melkepakken.tv/
```

Or add the overlay URL directly as a browser source in OBS, XSplit, Meld, Streamlabs Desktop, or any other streaming software that supports browser sources.

### Twitch only

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel
```

### Twitch + Kick with the same channel name

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick=true
```

### Twitch + specific Kick channel

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick=yourkickchannel
```

### Manual Kick room ID fallback

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick_room=3180237
```

### Example OBS URL

```txt
https://chat.melkepakken.tv/v2/?channel=melkepakken&kick=true&size=3&font=0&shadow=2&animate=true&emoji=twemoji
```

When testing new deployments in OBS, add a cache-busting value:

```txt
https://chat.melkepakken.tv/v2/?channel=melkepakken&kick=true&size=3&font=0&shadow=2&animate=true&v=1
```

Increase `v=1` to `v=2`, `v=3`, etc. after deploying changes if OBS keeps showing an old version.

---

## Self-hosting

jChat+ is a static browser-based overlay.

Run it locally with a simple static server:

```bash
python -m http.server 3000
```

Then open:

```txt
http://localhost:3000/v2/?channel=yourtwitchchannel
```

For OBS, add the URL as a **Browser Source**.

---

## Twitch credentials for local/self-hosted use

The hosted version at `chat.melkepakken.tv` uses a Cloudflare proxy for Twitch Helix requests.

For local/self-hosted use, you can still use a local credentials file.

Copy:

```txt
v2/credentials[example].js
```

to:

```txt
v2/credentials.js
```

Use this format:

```js
var client_id = "YOUR_TWITCH_CLIENT_ID";
var oauth_token = "YOUR_TWITCH_APP_ACCESS_TOKEN";
```

Do **not** commit `v2/credentials.js`.

The variable names are intentionally lowercase because the current jChat+ Twitch helper expects:

```js
client_id
oauth_token
```

### Getting an app access token

Create a Twitch application in the Twitch Developer Console, then use your Client ID and Client Secret to generate an app access token.

Example:

```bash
curl -X POST "https://id.twitch.tv/oauth2/token?client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=client_credentials"
```

The response contains an `access_token`. Use that value as `oauth_token`.

Never commit or publish your Client Secret.

---

## Cloudflare Pages deployment

The public deployment uses:

```txt
Cloudflare Pages
chat.melkepakken.tv
/functions/api/twitch/[[path]].js
```

The Cloudflare Function proxies the Twitch Helix endpoints used by jChat+:

```txt
/api/twitch/users
/api/twitch/chat/badges/global
/api/twitch/chat/badges
/api/twitch/bits/cheermotes
```

Required Cloudflare environment variables/secrets:

```txt
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
```

`TWITCH_CLIENT_SECRET` must be saved as a secret.

The frontend should never expose `TWITCH_CLIENT_SECRET`.

---

## Query parameters

### Chat sources

| Parameter      | Example               | Description                                           |
| -------------- | --------------------- | ----------------------------------------------------- |
| `channel`      | `channel=melkepakken` | Twitch channel                                        |
| `kick`         | `kick=true`           | Resolve Kick channel using the same name as `channel` |
| `kick`         | `kick=velcuz`         | Resolve a specific Kick channel                       |
| `kick_channel` | `kick_channel=velcuz` | Alternative Kick channel parameter                    |
| `kick_room`    | `kick_room=3180237`   | Manual Kick chatroom ID override                      |

### Appearance

| Parameter    | Example           | Description                      |
| ------------ | ----------------- | -------------------------------- |
| `size`       | `size=3`          | Chat size                        |
| `font`       | `font=0`          | Font selection                   |
| `stroke`     | `stroke=2`        | Text stroke level                |
| `shadow`     | `shadow=2`        | Text shadow level                |
| `animate`    | `animate=true`    | Enable smooth message animation  |
| `fade`       | `fade=30`         | Fade messages after 30 seconds   |
| `small_caps` | `small_caps=true` | Use small-caps styling           |
| `cN`         | `cN=%23ffcc00`    | Force all usernames to one color |
| `emoji`      | `emoji=twemoji`   | Use pinned Twemoji               |
| `emoji`      | `emoji=native`    | Use native OS/browser emoji      |

### Filtering

| Parameter       | Example              | Description              |
| --------------- | -------------------- | ------------------------ |
| `bots`          | `bots=true`          | Show bot messages        |
| `hide_commands` | `hide_commands=true` | Hide command messages    |
| `hide_badges`   | `hide_badges=true`   | Hide special badges      |
| `block`         | `block=user1,user2`  | Block specific usernames |

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

* Gift badge tiers are not fully mapped. jChat+ uses a default fallback gift badge unless Kick sends a direct image URL.

---

## Security notes

Do not commit:

```txt
v2/credentials.js
.dev.vars
.dev.vars.*
.env
.env.*
```

The hosted version should use Cloudflare secrets instead of frontend credentials.

Forks of this project do not receive the original Cloudflare secrets. Anyone deploying their own version must provide their own Twitch app credentials.

---

## Credits

jChat+ is a fork of the original [jChat](https://github.com/giambaJ/jChat) by **giambaJ**.

Original project credit, structure, and core idea belong to giambaJ.

jChat+ adds modernized Twitch integrations, Kick support, Cloudflare deployment support, and additional streamer-focused customization.

---

## License

This project follows the license of the original jChat project.
