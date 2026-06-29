// jChat+ local/self-hosted Twitch credentials example.
//
// Copy this file to:
//
//   v2/credentials.js
//
// Then replace the placeholder values below.
//
// This file is only needed for local/self-hosted setups.
// The public chat.melkepakken.tv deployment uses a Cloudflare proxy instead.
//
// Do not commit v2/credentials.js.
// Do not put your Twitch Client Secret in this file.

var client_id = "YOUR_TWITCH_CLIENT_ID";
var oauth_token = "YOUR_TWITCH_APP_ACCESS_TOKEN";

// To create an app access token, make a Twitch app at:
// https://dev.twitch.tv/console
//
// Then run:
//
// curl -X POST "https://id.twitch.tv/oauth2/token?client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=client_credentials"
//
// Copy the "access_token" value from the response and use it as oauth_token.
//
// Keep your Client Secret private.