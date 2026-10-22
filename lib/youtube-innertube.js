import { Innertube, Log } from "youtubei.js/cf-worker";

Log.setLevel(Log.Level.NONE);

const DISCOVERY_TIMEOUT_MS = 15000;
const MAX_REQUESTS = 4;
const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const ALLOWED_PATHS = new Set([
  "/youtubei/v1/navigation/resolve_url",
  "/youtubei/v1/browse",
]);

function streamState(video) {
  if (!video || !["LockupView", "Video", "GridVideo"].includes(video.type)) {
    return { state: "unknown" };
  }

  const videoId = video.id || video.content_id;

  if (!VIDEO_ID.test(videoId || "")) {
    return { state: "unknown" };
  }

  if (video.type === "LockupView" && video.content_type !== "VIDEO") {
    return { state: "unknown" };
  }

  const badges = (video.content_image?.overlays || []).flatMap(
    (overlay) => overlay.badges || [],
  );

  if (
    video.is_live === true ||
    badges.some(
      (badge) =>
        badge.icon_name === "LIVE" ||
        badge.badge_style === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE",
    )
  ) {
    return { state: "live", videoId };
  }

  const metadata = (video.metadata?.metadata?.metadata_rows || []).flatMap(
    (row) => (row.metadata_parts || []).map((part) => String(part.text || "")),
  );

  if (
    video.is_upcoming === true ||
    metadata.some((text) => /^Scheduled for\b/.test(text))
  ) {
    return { state: "upcoming", videoId };
  }

  if (
    video.duration?.seconds > 0 ||
    metadata.some((text) => /^Streamed\b/.test(text))
  ) {
    return { state: "ended", videoId };
  }

  return { state: "unknown", videoId };
}

export async function discoverInnerTube(handle) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  let requestCount = 0;
  let primaryId = null;
  const uncertain = (reason) => ({
    state: "unknown",
    reason,
    ...(VIDEO_ID.test(primaryId || "") ? { candidateVideoId: primaryId } : {}),
  });

  try {
    const youtube = await Innertube.create({
      generate_session_locally: true,
      retrieve_player: false,
      retrieve_innertube_config: false,
      enable_session_cache: false,
      lang: "en",
      fetch: async (input, init) => {
        const url = new URL(
          typeof input === "string" ? input : input.url || String(input),
        );

        if (
          url.origin !== "https://www.youtube.com" ||
          !ALLOWED_PATHS.has(url.pathname) ||
          ++requestCount > MAX_REQUESTS
        ) {
          throw new Error("Unexpected discovery request");
        }

        return fetch(input, {
          ...init,
          redirect: "manual",
          signal: controller.signal,
        });
      },
    });
    const channelUrl = `https://www.youtube.com/@${encodeURIComponent(handle)}`;
    const resolved = await youtube.resolveURL(`${channelUrl}/live`);
    primaryId = resolved.name === "watchEndpoint"
      ? resolved.payload.videoId
      : null;
    let channelId = resolved.name === "browseEndpoint"
      ? resolved.payload.browseId
      : null;

    if (primaryId && VIDEO_ID.test(primaryId)) {
      const channelEndpoint = await youtube.resolveURL(channelUrl);
      channelId = channelEndpoint.name === "browseEndpoint"
        ? channelEndpoint.payload.browseId
        : null;
    } else if (!CHANNEL_ID.test(channelId || "")) {
      return uncertain("unrecognized-endpoint");
    }

    if (!CHANNEL_ID.test(channelId || "")) {
      return uncertain("unrecognized-channel");
    }

    const channel = await youtube.getChannel(channelId);

    if (
      channel.metadata?.external_id !== channelId ||
      !Array.isArray(channel.tabs) ||
      !channel.tabs.length ||
      !channel.current_tab
    ) {
      return uncertain("unrecognized-channel-page");
    }

    if (!channel.has_live_streams) {
      return primaryId
        ? uncertain("missing-streams-tab")
        : { state: "offline", channelId };
    }

    const streams = await channel.getLiveStreams();
    const tabUrl = streams.current_tab?.endpoint?.metadata?.url;

    if (
      streams.metadata?.external_id !== channelId ||
      typeof tabUrl !== "string" ||
      !new URL(tabUrl, "https://www.youtube.com").pathname.endsWith("/streams")
    ) {
      return uncertain("unrecognized-streams-page");
    }

    const grid = streams.current_tab.content;

    if (grid?.type !== "RichGrid" || !Array.isArray(grid.contents)) {
      return uncertain("unrecognized-streams-grid");
    }

    const states = grid.contents
      .filter((item) => item.type !== "ContinuationItem")
      .map((item) => streamState(item.type === "RichItem" ? item.content : null));
    const liveStreams = states.filter((video) => video.state === "live");
    const live = liveStreams.find((video) => video.videoId === primaryId) ||
      liveStreams[0];

    if (live) {
      return { state: "live", videoId: live.videoId, channelId };
    }

    if (
      !states.length ||
      states.some((video) => video.state === "unknown") ||
      (primaryId && !states.some((video) => video.videoId === primaryId))
    ) {
      return uncertain("unconfirmed-stream-state");
    }

    return { state: "offline", channelId };
  } catch {
    return uncertain(controller.signal.aborted ? "timeout" : "upstream-unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
