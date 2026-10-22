const YOUTUBE_ORIGIN = "https://www.youtube.com";
const YOUTUBE_CLIENT_VERSION = "2.20260623.01.00";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/130.0.0.0 Safari/537.36";
const DISCOVERY_TIMEOUT_MS = 15000;
const MAX_REQUESTS = 4;
const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const ALLOWED_PATHS = new Set(["navigation/resolve_url", "browse"]);

function isVideoId(value) {
  return typeof value === "string" && VIDEO_ID.test(value);
}

function text(value) {
  return value?.simpleText || value?.content ||
    value?.runs?.map((run) => run.text).join("") || "";
}

function channelTabs(page) {
  return page?.contents?.twoColumnBrowseResultsRenderer?.tabs
    ?.map((tab) => tab.tabRenderer).filter(Boolean);
}

function isStreamsTab(tab) {
  const url = tab?.endpoint?.commandMetadata?.webCommandMetadata?.url;
  if (typeof url !== "string") return false;
  const target = new URL(url, YOUTUBE_ORIGIN);
  return target.origin === YOUTUBE_ORIGIN &&
    target.pathname.endsWith("/streams");
}

function streamState(content, channelId) {
  const lockup = content?.lockupViewModel;
  const video = content?.videoRenderer || content?.gridVideoRenderer;
  if (!lockup && !video) return { state: "unknown" };

  const videoId = lockup?.contentId || video?.videoId;
  if (!isVideoId(videoId)) return { state: "unknown" };
  const uncertain = () => ({ state: "unknown", videoId });
  if (lockup && lockup.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") {
    return uncertain();
  }

  const commandId = lockup?.rendererContext?.commandContext?.onTap
    ?.innertubeCommand?.watchEndpoint?.videoId ||
    video?.navigationEndpoint?.watchEndpoint?.videoId;
  if (commandId && commandId !== videoId) return uncertain();

  const authors = [video?.ownerText, video?.shortBylineText, video?.longBylineText]
    .flatMap((value) => value?.runs || []);
  if (authors.some((run) => {
    const owner = run.navigationEndpoint?.browseEndpoint?.browseId;
    return owner && owner !== channelId;
  })) return uncertain();

  const badges = (lockup?.contentImage?.thumbnailViewModel?.overlays || [])
    .flatMap((overlay) =>
      overlay.thumbnailOverlayBadgeViewModel?.thumbnailBadges ||
      overlay.thumbnailBottomOverlayViewModel?.badges || [],
    )
    .map((badge) => badge.thumbnailBadgeViewModel).filter(Boolean);
  const times = (video?.thumbnailOverlays || [])
    .map((overlay) => overlay.thumbnailOverlayTimeStatusRenderer).filter(Boolean);
  const labels = (video?.badges || [])
    .map((badge) => badge.metadataBadgeRenderer).filter(Boolean);
  const metadata = (lockup?.metadata?.lockupMetadataViewModel?.metadata
    ?.contentMetadataViewModel?.metadataRows || [])
    .flatMap((row) => (row.metadataParts || []).map((part) => text(part.text)));

  const live = badges.some((badge) =>
    badge.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE" ||
    badge.icon?.sources?.some((source) => source.clientResource?.imageName === "LIVE"),
  ) || times.some((overlay) => overlay.style === "LIVE") ||
    labels.some((badge) => badge.style === "BADGE_STYLE_TYPE_LIVE_NOW");
  const upcoming = Boolean(video?.upcomingEventData?.startTime) ||
    metadata.some((value) => /^Scheduled for\b/.test(value)) ||
    badges.some((badge) => badge.text === "Upcoming");

  if (live && upcoming) return uncertain();
  if (live) return { state: "live", videoId };
  if (upcoming) return { state: "upcoming", videoId };
  if (
    metadata.some((value) => /^Streamed\b/.test(value)) ||
    /^Streamed\b/.test(text(video?.publishedTimeText)) ||
    [video?.lengthText, ...times.map((overlay) => overlay.text)]
      .some((value) => /^\d+:\d+(?::\d+)?$/.test(text(value)))
  ) return { state: "ended", videoId };
  return uncertain();
}

export async function discoverInnerTube(handle) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  let requestCount = 0;
  let primaryId = null;
  const uncertain = (reason) => ({
    state: "unknown",
    reason,
    ...(isVideoId(primaryId) ? { candidateVideoId: primaryId } : {}),
  });
  const context = {
    client: {
      hl: "en",
      gl: "US",
      clientName: "WEB",
      clientVersion: YOUTUBE_CLIENT_VERSION,
      userAgent: USER_AGENT,
      timeZone: "UTC",
      utcOffsetMinutes: 0,
    },
    user: { enableSafetyMode: false },
    request: { useSsl: true },
  };

  async function post(path, body) {
    if (!ALLOWED_PATHS.has(path) || ++requestCount > MAX_REQUESTS) {
      throw new Error("Unexpected discovery request");
    }
    const response = await fetch(
      `${YOUTUBE_ORIGIN}/youtubei/v1/${path}?prettyPrint=false&alt=json`,
      {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: YOUTUBE_ORIGIN,
          "User-Agent": USER_AGENT,
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": YOUTUBE_CLIENT_VERSION,
        },
        body: JSON.stringify({ ...body, context }),
      },
    );
    if (!response.ok) {
      if (response.body) await response.body.cancel();
      throw new Error("Discovery request failed");
    }
    return response.json();
  }

  try {
    const channelUrl = `${YOUTUBE_ORIGIN}/@${encodeURIComponent(handle)}`;
    const resolved = (await post("navigation/resolve_url", {
      url: `${channelUrl}/live`,
    }))?.endpoint;
    let channelId = resolved?.browseEndpoint?.browseId;

    if (resolved?.watchEndpoint) {
      primaryId = resolved.watchEndpoint.videoId;
      if (!isVideoId(primaryId)) return uncertain("unrecognized-endpoint");
      channelId = (await post("navigation/resolve_url", { url: channelUrl }))
        ?.endpoint?.browseEndpoint?.browseId;
    }
    if (typeof channelId !== "string" || !CHANNEL_ID.test(channelId)) {
      return uncertain("unrecognized-channel");
    }

    const channel = await post("browse", { browseId: channelId });
    const tabs = channelTabs(channel);
    if (
      channel?.metadata?.channelMetadataRenderer?.externalId !== channelId ||
      !tabs?.length || tabs.filter((tab) => tab.selected).length !== 1
    ) return uncertain("unrecognized-channel-page");

    const tab = tabs.find(isStreamsTab);
    if (!tab) {
      return primaryId
        ? uncertain("missing-streams-tab")
        : { state: "offline", channelId };
    }
    const endpoint = tab.endpoint?.browseEndpoint;
    if (
      endpoint?.browseId !== channelId ||
      (!tab.selected && (typeof endpoint.params !== "string" || !endpoint.params))
    ) return uncertain("unrecognized-streams-endpoint");

    const streams = tab.selected ? channel : await post("browse", {
      browseId: channelId,
      params: endpoint.params,
    });
    const selected = channelTabs(streams)?.filter((tab) => tab.selected);
    if (
      streams?.metadata?.channelMetadataRenderer?.externalId !== channelId ||
      selected?.length !== 1 || !isStreamsTab(selected[0]) ||
      selected[0].endpoint?.browseEndpoint?.browseId !== channelId
    ) return uncertain("unrecognized-streams-page");

    const grid = selected[0].content?.richGridRenderer?.contents;
    if (!Array.isArray(grid)) return uncertain("unrecognized-streams-grid");
    const states = grid
      .filter((item) => !item.continuationItemRenderer)
      .map((item) => streamState(item.richItemRenderer?.content, channelId));
    const liveStreams = states.filter((video) => video.state === "live");
    const live = liveStreams.find((video) => video.videoId === primaryId) ||
      liveStreams[0];
    if (live) return { state: "live", videoId: live.videoId, channelId };

    if (
      !states.length || states.some((video) => video.state === "unknown") ||
      (primaryId && !states.some((video) => video.videoId === primaryId))
    ) return uncertain("unconfirmed-stream-state");

    return { state: "offline", channelId };
  } catch {
    return uncertain(controller.signal.aborted ? "timeout" : "upstream-unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
