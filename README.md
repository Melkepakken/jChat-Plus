# [![](https://chat.melkepakken.tv/img/peepoHappy_plus_small.png)](#) jChat+

[![Release](https://img.shields.io/badge/release-v1.2.1-blue)](#)
[![Website](https://img.shields.io/website-up-down-green-red/https/chat.melkepakken.tv.svg)](https://chat.melkepakken.tv/)
[![License](https://img.shields.io/github/license/Melkepakken/jchat-plus)](LICENSE)

**jChat+** is a modernized fork of [jChat](https://github.com/giambaJ/jChat) with Twitch + Kick + YouTube support, updated Twitch integrations, preview mode, improved badge and emote handling, 7TV cosmetics, emoji rendering options, username color controls, and streamer-focused customization.

The public hosted version is available at:

```txt
https://chat.melkepakken.tv/
```

This project is based on the original jChat by **giambaJ**. Huge credit to the original project.

---

## Features

### jChat+ additions

* Twitch + Kick + YouTube chat support in one overlay
* New setup page for generating overlay URLs
* Preview mode for testing appearance and behavior without needing live chat
* Public YouTube live broadcast discovery from a handle or channel URL
* Direct YouTube video ID and URL support for unlisted live streams
* Explicit, unfiltered YouTube Live Chat instead of Top Chat
* Ordinary YouTube messages with deterministic username colours
* YouTube custom emoji plus ordinary Unicode emoji using the existing Twemoji or Native setting
* YouTube moderator message deletion and user retraction handling
* YouTube bot, hidden-command, and blocked-user filtering
* YouTube chat retry and reconnection handling
* Automatic return to YouTube handle discovery after a stream ends when a fallback channel is configured
* Simulated YouTube preview messages
* Kick channel auto-resolve with `kick=true`, `kick=<channel>`, or `kick_channel=<channel>`
* Manual Kick chatroom override with `kick_room=<roomId>`
* Kick message deletion support
* Kick emote support
* Kick badge support

  * `badges_v2` image badges
  * custom subscriber badges when available from Kick channel data
  * fallback SVG badges for common Kick roles
  * global level badges
* `!reloadchat` support from Kick broadcaster/moderator messages
* Toggle between native OS/browser emoji and pinned Twemoji
* Force all usernames to one custom color with `cN`
* Expanded list of known bots to filter out
* Twitch, Kick, and YouTube platform badges, enabled by default
* Hide all badges
* Block specific usernames
* Updated Twitch Helix user, badge, and cheermote handling
* Updated BTTV, FFZ, and 7TV emote loading
* 7TV name paint support
* 7TV user badge/cosmetic support
* Fixed optional legacy FFZ room and user badge lookups
* Cloudflare Pages Function support for public Twitch Helix proxying
* Modular v2 code structure using plain browser scripts

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

### Twitch + YouTube using the effective same channel

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&youtube=true
```

### Twitch + explicit YouTube handle

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&youtube=youryoutubehandle
```

### Twitch + unlisted YouTube stream

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&youtube_video=VIDEO_ID
```

### Twitch + Kick + YouTube

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick=true&youtube=true
```

### Direct YouTube video with fallback handle

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&youtube=youryoutubehandle&youtube_video=VIDEO_ID
```

### Manual Kick room ID fallback

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick_room=3180237
```

### Preview mode

Preview mode can be used to test the overlay without relying on live chat messages.

```txt
https://chat.melkepakken.tv/v2/?preview=true&channel=twitch&kick=kick&youtube=true&size=3&font=0&shadow=2&animate=true
```

The neutral preview values are intentionally:

```txt
channel=twitch
kick=kick
youtube=true
```

This rotates simulated Twitch, Kick, and YouTube messages without connecting to a real YouTube stream.

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

Twitch and Kick can be served as a static browser-based overlay.

Run it locally with a simple static server:

```bash
python -m http.server 3000
```

Then open:

```txt
http://localhost:3000/v2/?channel=yourtwitchchannel
```

For OBS, add the URL as a **Browser Source**.

YouTube uses Cloudflare Pages Functions. For local Wrangler use, create a `.dev.vars` file:

```txt
YOUTUBE_API_KEY=your_key_here
```

Do **not** commit `.dev.vars`.

Then run the local Pages runtime:

```bash
npx wrangler pages dev .
```

Then open:

```txt
http://localhost:8788/v2/?channel=yourtwitchchannel&youtube=true
```

This does not introduce a build process. Wrangler is only the local Cloudflare Pages runtime. The Python static server remains enough for Twitch and Kick.

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
/functions/api/youtube/live.js
/functions/api/youtube/chat.js
```

The Cloudflare Function proxies the Twitch Helix endpoints used by jChat+:

```txt
/api/twitch/users
/api/twitch/chat/badges/global
/api/twitch/chat/badges
/api/twitch/bits/cheermotes
```

The YouTube Functions handle separate parts of YouTube support:

* `functions/api/youtube/live.js` uses the official YouTube Data API v3 to find the current live stream for a handle.
* `functions/api/youtube/chat.js` uses the public web chat connector to read Live Chat messages, custom emoji, and deletion actions.

Live Chat reading does not require YouTube OAuth.

Required Cloudflare environment variables/secrets:

```txt
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
YOUTUBE_API_KEY
```

`TWITCH_CLIENT_SECRET` and `YOUTUBE_API_KEY` must be saved as Cloudflare secrets.

Enable YouTube Data API v3 in Google Cloud, create an API key, and restrict it to YouTube Data API v3. Save that key as `YOUTUBE_API_KEY` in Cloudflare.

The frontend should never expose either value.

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
| `youtube`      | `youtube=true`        | Use the specific Kick channel when available, otherwise the Twitch channel |
| `youtube`      | `youtube=handle`      | Resolve the current public live broadcast for a YouTube handle |
| `youtube`      | `youtube=https://www.youtube.com/@handle` | Resolve a YouTube channel URL |
| `youtube_video` | `youtube_video=VIDEO_ID` | Connect directly to a live video, including an unlisted stream |
| `youtube_video` | `youtube_video=https://youtu.be/VIDEO_ID` | Connect directly using a YouTube watch, live, or `youtu.be` URL |
| `youtube`      | `youtube=false`       | Explicitly disable YouTube                             |
| `preview`      | `preview=true`        | Enable preview mode                                   |

`youtube_video` takes initial priority. If `youtube` is also present, jChat+ returns to public handle discovery after the direct stream ends.

### Appearance

| Parameter    | Example           | Description                      |
| ------------ | ----------------- | -------------------------------- |
| `size`       | `size=4`          | Large (38px); `size=3` remains Extra Large (48px) |
| `font`       | `font=0`          | Font selection                   |
| `stroke`     | `stroke=2`        | Text stroke level                |
| `shadow`     | `shadow=4`        | Layered Glow text shadow         |
| `message_box` | `message_box=true` | Add a fitted background to each message |
| `animate`    | `animate=true`    | Enable smooth message animation  |
| `fade`       | `fade=30`         | Fade messages after 30 seconds   |
| `small_caps` | `small_caps=true` | Use small-caps styling           |
| `cN`         | `cN=%23ffcc00`    | Force all usernames to one color |
| `emoji`      | `emoji=twemoji`   | Use pinned Twemoji               |
| `emoji`      | `emoji=native`    | Use native OS/browser emoji      |

### Filtering

| Parameter         | Example                | Description                                             |
| ----------------- | ---------------------- | ------------------------------------------------------- |
| `bots`            | `bots=true`            | Show bot messages                                       |
| `hide_commands`   | `hide_commands=true`   | Hide command messages                                   |
| `hide_badges`     | `hide_badges=true`     | Hide special/user badges, while keeping platform badges |
| `hide_all_badges` | `hide_all_badges=true` | Hide all badges                                         |
| `block`           | `block=user1,user2`    | Block specific usernames                                |

### Emotes, badges, and cosmetics

| Parameter         | Example                | Description                         |
| ----------------- | ---------------------- | ----------------------------------- |
| `seventv_paints`  | `seventv_paints=true`  | Enable 7TV name paints              |
| `emote_shadow`    | `emote_shadow=true`    | Add shadows to emotes, rendered emoji, and cheers |
| `platform_badges` | `platform_badges=true`  | Show Twitch, Kick, and YouTube platform badges (default when omitted) |
| `platform_badges` | `platform_badges=false` | Hide platform badges only; other badges are unchanged |
| `platform_badges` | `platform_badges=only`  | Show platform logos while hiding all other badges |
| `ffz_room_badges` | `ffz_room_badges=true` | Enable legacy FFZ room badge lookup |
| `ffz_user_badges` | `ffz_user_badges=true` | Enable legacy FFZ user badge lookup |

`hide_badges=true` keeps its legacy behavior: it hides special/user badges while leaving normal Twitch/Kick badges and enabled platform badges visible. `hide_all_badges` overrides every badge setting, so no badges are shown even with `platform_badges=only`.

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

## YouTube support details

jChat+ uses the official YouTube Data API v3 to discover public live streams by handle. Actual Live Chat reading uses the public web chat connector and does not require YouTube OAuth. Unlisted streams require `youtube_video`.

Current YouTube support includes:

* Explicit Live Chat, with no silent fallback to Top Chat
* Ordinary text messages
* YouTube custom emoji
* Ordinary Unicode emoji through the selected Twemoji or Native setting
* Deterministic username colours
* Individual moderator message deletion
* User message retraction
* Bot filtering
* Command filtering
* Blocked users
* Automatic public live discovery
* Direct unlisted video support
* YouTube chat retry and reconnection handling
* Stream-end rediscovery when a fallback YouTube channel is configured

Planned YouTube additions:

* YouTube badges
* Membership styling
* Super Chat styling
* Super Stickers
* Profile pictures

These will be added in a later update.

Current limitation:

* YouTube polling follows the continuation timing returned by YouTube and may be behind the visible web chat.

---

## v2 module structure

The v2 overlay is split into plain browser scripts loaded directly from `v2/index.html`.

There is no bundler, no ES modules, and no imports. Load order matters because each file extends the global `Chat` object.

Main modules:

| File                     | Purpose                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `preview-messages.js`    | Preview message data only                                             |
| `js/chat-bots.js`        | Default hidden bot username list                                      |
| `js/chat-core.js`        | Query parsing, shared state, and shared helpers                       |
| `js/chat-twitch-api.js`  | Twitch API helper using local credentials or `/api/twitch`            |
| `js/chat-styles.js`      | Overlay style loading and static style application                    |
| `js/chat-preview.js`     | Twitch, Kick, and YouTube simulated preview rotation and setup-page updates |
| `js/chat-emotes.js`      | BTTV, FFZ, and 7TV emote loading                                      |
| `js/chat-seventv.js`     | 7TV badges, paints, cosmetics, gradients, and shadows                 |
| `js/chat-badges.js`      | Generic badge helpers and user badge loading                          |
| `js/chat-kick-badges.js` | Kick badge parsing, fallback badges, and subscriber badge caching     |
| `js/chat-kick.js`        | Kick chat connection, delete handling, emote parsing, and `writeKick` |
| `js/chat-youtube.js`     | YouTube source selection, live discovery, polling, filtering, custom emoji, deletions, and lifecycle handling |
| `js/chat-loader.js`      | Twitch channel lookup and resource loading                            |
| `js/chat-renderer.js`    | Chat line rendering and cleanup                                       |
| `js/chat-twitch.js`      | Twitch IRC connection and message handling                            |
| `js/chat-bootstrap.js`   | Overlay startup and preview message listener                          |

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

Forks of this project do not receive the original Cloudflare secrets. Anyone deploying their own version must provide their own Twitch app credentials and YouTube Data API v3 key.

---

## Credits

jChat+ is a fork of the original [jChat](https://github.com/giambaJ/jChat) by **giambaJ**.

Original project credit, structure, and core idea belong to giambaJ.

jChat+ is not affiliated with [Twitch](https://www.twitch.tv/), [Kick](https://kick.com/), or [YouTube](https://www.youtube.com/).

jChat+ adds modernized Twitch integrations, Kick and YouTube support, Cloudflare deployment support, preview mode, improved badge/emote handling, 7TV cosmetics, and additional streamer-focused customization.

---

## License

This project follows the license of the original jChat project.
