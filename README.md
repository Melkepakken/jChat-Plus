# [![](https://chat.melkepakken.tv/img/peepoHappy_plus_small.png)](#) jChat+

[![Release](https://img.shields.io/github/v/release/Melkepakken/jChat-Plus)](https://github.com/Melkepakken/jChat-Plus/releases/latest)
[![Website](https://img.shields.io/website-up-down-green-red/https/chat.melkepakken.tv.svg)](https://chat.melkepakken.tv/)
[![License](https://img.shields.io/github/license/Melkepakken/jchat-plus)](LICENSE)

**jChat+** puts Twitch, Kick, and YouTube chat into one browser-source overlay for your stream. Use the setup page to choose your channels and appearance, preview the result, and get a ready-to-use URL.

**[Open the hosted setup page](https://chat.melkepakken.tv/)**

```txt
https://chat.melkepakken.tv/
```

---

## Getting started

1. Open the [jChat+ setup page](https://chat.melkepakken.tv/).
2. Choose your platforms and customize the overlay's appearance.
3. Copy the generated URL into a **Browser Source** in OBS, XSplit, Meld, Streamlabs Desktop, or similar streaming software.

That's it. You do not need to set up Cloudflare or edit query parameters for normal hosted use.

---

## Features

* Twitch + Kick + YouTube chat support in one overlay
* BTTV, FFZ, and 7TV emotes
* 7TV name paints, user badges, and cosmetics
* Twitch, Kick, and YouTube platform badges, shown by default
* YouTube custom emoji and a choice of native emoji or pinned Twemoji
* Fonts, text sizes, username colours, strokes, shadows, and fitted message backgrounds
* Bot, command, and username filtering
* Smooth message animation and optional fading
* A setup page with live preview and simulated messages
* `!reloadchat` support for Twitch moderators and Kick broadcasters/moderators

---

## Platform support

### Twitch

jChat+ supports Twitch chat, Twitch badges and cheermotes, custom channel badges, and BTTV, FFZ, and 7TV emotes. It also supports 7TV paints and user cosmetics, plus `!reloadchat` from Twitch moderators.

### Kick

jChat+ can find a Kick chatroom from its channel name, or use a manually supplied chatroom ID. It supports:

* Live chat messages and Kick emotes
* Deleted messages
* Broadcaster/moderator `!reloadchat`
* Kick role badges and global level badges
* Custom subscriber badges when they are available in the channel data

**Known limitation:** Gift badge tiers are not fully mapped. jChat+ uses a default fallback gift badge unless Kick sends a direct image URL.

### YouTube

jChat+ can find a public live broadcast from a YouTube handle or channel URL. You can also connect directly with a video ID or URL, which is required for unlisted streams and keeps initial priority.

Automatic handle discovery backs off while a channel remains offline, from about one minute to several minutes between checks. A new public broadcast may therefore take a few minutes to appear, and can take longer when YouTube discovery or search is unavailable or quota-limited. This does not slow polling after Live Chat is connected. A direct-only `youtube_video` configuration bypasses Data API discovery. With a fallback `youtube` handle, repeated generic direct-chat failures may trigger a quota-safe check for a different current public live stream; an offline handle does not abandon the direct video. If a daily discovery quota is exhausted, affected calls pause until the next Pacific-time reset and retry automatically.

If automatic discovery reports a channel unavailable, jChat+ stops checking that handle until the overlay is reloaded; direct-video retries continue independently.

Supported YouTube features include:

* Explicit Live Chat, with no silent fallback to Top Chat
* Text messages, YouTube custom emoji, and ordinary Unicode emoji
* Deterministic username colours
* Moderator message deletion and user message retraction
* Bot, command, and blocked-user filtering
* Retry, session recovery, and reconnection handling
* Automatic return to public handle discovery after a direct stream ends when a fallback channel is configured

YouTube badges, membership styling, Super Chat styling, Super Stickers, and profile pictures are planned for a later update and are not currently supported.

**Current limitation:** YouTube chat follows the polling cadence returned by YouTube. jChat+ paces larger message batches for smoother mixed-platform chat, but messages may still arrive in bursts or appear behind the visible web chat.

---

## Advanced configuration

This section is optional. The setup page generates these URLs for you, but you can edit them manually when you want more control.

### Overlay URL examples

#### Twitch only

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel
```

#### Twitch + Kick with the same channel name

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick=true
```

#### Twitch + a specific Kick channel

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick=yourkickchannel
```

#### Twitch + YouTube using the effective same channel

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&youtube=true
```

#### Twitch + an explicit YouTube handle

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&youtube=youryoutubehandle
```

#### Twitch + an unlisted YouTube stream

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&youtube_video=VIDEO_ID
```

#### Twitch + Kick + YouTube

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick=true&youtube=true
```

#### Direct YouTube video with a fallback handle

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&youtube=youryoutubehandle&youtube_video=VIDEO_ID
```

#### Manual Kick room ID fallback

```txt
https://chat.melkepakken.tv/v2/?channel=yourtwitchchannel&kick_room=3180237
```

#### Preview mode

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

#### Example OBS URL

```txt
https://chat.melkepakken.tv/v2/?channel=melkepakken&kick=true&size=3&font=0&shadow=2&animate=true&emoji=twemoji
```

When testing new deployments in OBS, add a cache-busting value:

```txt
https://chat.melkepakken.tv/v2/?channel=melkepakken&kick=true&size=3&font=0&shadow=2&animate=true&v=1
```

Increase `v=1` to `v=2`, `v=3`, etc. after deploying changes if OBS keeps showing an old version.

### Query parameter reference

#### Chat sources

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

`youtube_video` takes initial priority. If `youtube` is also present, an explicit ended-chat response for the direct stream returns to public handle discovery.

#### Appearance

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

#### Filtering

| Parameter         | Example                | Description                                             |
| ----------------- | ---------------------- | ------------------------------------------------------- |
| `bots`            | `bots=true`            | Show bot messages                                       |
| `hide_commands`   | `hide_commands=true`   | Hide command messages                                   |
| `hide_badges`     | `hide_badges=true`     | Hide special/user badges, while keeping platform badges |
| `hide_all_badges` | `hide_all_badges=true` | Hide all badges                                         |
| `block`           | `block=user1,user2`    | Block specific usernames                                |

#### Emotes, badges, and cosmetics

| Parameter         | Example                | Description                         |
| ----------------- | ---------------------- | ----------------------------------- |
| `seventv_paints`  | `seventv_paints=true`  | Enable 7TV name paints              |
| `emote_shadow`    | `emote_shadow=true`    | Add shadows to emotes, rendered emoji, and cheers |
| `platform_badges` | `platform_badges=true`  | Show Twitch, Kick, and YouTube platform badges (default when omitted) |
| `platform_badges` | `platform_badges=false` | Hide platform badges only; other badges are unchanged |
| `platform_badges` | `platform_badges=only`  | Show platform logos while hiding all other badges |
| `ffz_room_badges` | `ffz_room_badges=true` | Enable legacy FFZ room badge lookup |
| `ffz_user_badges` | `ffz_user_badges=true` | Enable FFZ user badges |

`hide_badges=true` keeps its legacy behavior: it hides special/user badges while leaving normal Twitch/Kick badges and enabled platform badges visible. `hide_all_badges` overrides every badge setting, so no badges are shown even with `platform_badges=only`.

---

## Self-hosting

Normal users can use the hosted setup page. The instructions below are for running your own copy.

### Local server

Twitch and Kick can be served as a static browser-based overlay. Run a simple static server:

```bash
python -m http.server 3000
```

Then open:

```txt
http://localhost:3000/v2/?channel=yourtwitchchannel
```

For OBS, add that URL as a **Browser Source**.

YouTube uses Cloudflare Pages Functions. For local Wrangler use, create a `.dev.vars` file:

```txt
YOUTUBE_API_KEY=your_key_here
```

Then run the local Pages runtime:

```bash
npx wrangler pages dev .
```

Then open:

```txt
http://localhost:8788/v2/?channel=yourtwitchchannel&youtube=true
```

This does not introduce a build process. Wrangler is only the local Cloudflare Pages runtime. The Python static server remains enough for Twitch and Kick.

### Twitch credentials

The hosted version at `chat.melkepakken.tv` uses a Cloudflare proxy for Twitch Helix requests. For local or self-hosted use, you can use a local credentials file.

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

The variable names are intentionally lowercase because the current jChat+ Twitch helper expects:

```js
client_id
oauth_token
```

#### Getting an app access token

Create a Twitch application in the Twitch Developer Console, then use your Client ID and Client Secret to generate an app access token.

Example:

```bash
curl -X POST "https://id.twitch.tv/oauth2/token?client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=client_credentials"
```

The response contains an `access_token`. Use that value as `oauth_token`.

### Cloudflare Pages deployment

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

jChat+ includes its client version on YouTube backend requests for diagnostics only; it is not used for authentication or runtime behavior.

Discovery backoff and quota cooldowns use Cloudflare's Cache API. Its contents are local to the data center handling the request and may be evicted; concurrent work is coalesced only within the current Worker isolate. These safeguards reduce duplicate API calls, but they are not global coordination or an unlimited-scale guarantee.

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

## Development

The v2 overlay is split into plain browser scripts loaded directly from `v2/index.html`.

There is no bundler, no ES modules, and no imports. Load order matters because each file extends the global `Chat` object.

The scripts are separated by responsibility: shared state and styles, preview data, emotes and badges, platform connections, message rendering, and startup. Because they share the global `Chat` object, changes to script order or shared helpers should be checked carefully.

### AI-assisted development

jChat+ is developed with the assistance of AI coding tools.

I use AI to help navigate API documentation, inspect code, debug issues, review changes, and explore implementation approaches.

Project direction, architecture, feature decisions, testing, and releases are handled by me. Changes are reviewed and tested before they are merged or released.

---

## Security notes

Never commit or publish credentials. In particular, do not commit:

```txt
v2/credentials.js
.dev.vars
.dev.vars.*
.env
.env.*
```

Treat the `oauth_token` in `v2/credentials.js` as a credential, and never commit or publish your Twitch Client Secret. The frontend must not expose `TWITCH_CLIENT_SECRET` or `YOUTUBE_API_KEY`.

Hosted deployments should store `TWITCH_CLIENT_SECRET` and `YOUTUBE_API_KEY` as Cloudflare secrets instead of frontend credentials.

Forks of this project do not receive the original Cloudflare secrets. Anyone deploying their own version must provide their own Twitch app credentials and YouTube Data API v3 key.

---

## Credits

jChat+ is a fork of the original [jChat](https://github.com/giambaJ/jChat) by **giambaJ**.

YouTube deterministic username colours are based on the username colour hashing from [BetterYTL](https://github.com/datagutt/BetterYTL) by **datagutt (Thomas Lekanger)**.

jChat+ is not affiliated with [Twitch](https://www.twitch.tv/), [Kick](https://kick.com/), or [YouTube](https://www.youtube.com/).


---

## License

This project follows the license of the original jChat project.
