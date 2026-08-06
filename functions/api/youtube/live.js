const YOUTUBE_API_ROOT = "https://www.googleapis.com/youtube/v3/";
const MAX_UPLOADS = 50;
const CACHE_VERSION = "v1";
const CACHE_TTL = {
  channel: 3 * 24 * 60 * 60,
  knownLive: 24 * 60 * 60,
  liveResult: 60,
  offlineResult: 5 * 60,
};
const inFlightResolutions = new Map();

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeHandle(value) {
  const handle = String(value || "")
    .trim()
    .replace(/^@+/, "");

  return handle && /^[a-zA-Z0-9._-]+$/.test(handle) ? handle : null;
}

function isVideoId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || ""));
}

function apiError(stage, status = null) {
  const error = new Error("YouTube Data API request failed.");
  error.name = "YouTubeApiError";
  error.stage = stage;
  error.status = status;
  return error;
}

async function fetchApi(path, params, apiKey, stage) {
  const url = new URL(path, YOUTUBE_API_ROOT);

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  let response;

  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Goog-Api-Key": apiKey,
      },
    });
  } catch {
    throw apiError(stage);
  }

  if (!response.ok) {
    throw apiError(stage, response.status);
  }

  try {
    return await response.json();
  } catch {
    throw apiError(`${stage}-json`, response.status);
  }
}

function responseItems(data, stage) {
  if (!data || typeof data !== "object") {
    throw apiError(`${stage}-shape`, 200);
  }

  if (data.items == null) {
    return [];
  }

  if (!Array.isArray(data.items)) {
    throw apiError(`${stage}-shape`, 200);
  }

  return data.items;
}

function defaultCache() {
  return globalThis.caches?.default || null;
}

function cacheKey(context, kind, handle) {
  const url = new URL(context.request.url);
  url.pathname =
    `/__jchat-youtube-live-cache/${CACHE_VERSION}/${kind}/` +
    encodeURIComponent(handle.toLowerCase());
  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
}

async function readCache(context, kind, handle) {
  const cache = defaultCache();

  if (!cache) {
    return null;
  }

  try {
    const response = await cache.match(cacheKey(context, kind, handle));
    return response ? await response.json() : null;
  } catch {
    console.warn("[youtube-live] Internal cache read failed.", { kind });
    return null;
  }
}

async function writeCache(context, kind, handle, value, ttl) {
  const cache = defaultCache();

  if (!cache) {
    return;
  }

  try {
    await cache.put(
      cacheKey(context, kind, handle),
      new Response(JSON.stringify(value), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`,
        },
      }),
    );
  } catch {
    console.warn("[youtube-live] Internal cache write failed.", { kind });
  }
}

async function deleteCache(context, kind, handle) {
  const cache = defaultCache();

  if (!cache) {
    return;
  }

  try {
    await cache.delete(cacheKey(context, kind, handle));
  } catch {
    console.warn("[youtube-live] Internal cache delete failed.", { kind });
  }
}

function cachedResolution(value) {
  if (value?.live === false) {
    return { live: false };
  }

  if (value?.live === true && isVideoId(value.videoId)) {
    return { live: true, videoId: value.videoId };
  }

  return null;
}

function cachedChannel(value) {
  if (
    typeof value?.channelId !== "string" ||
    typeof value?.uploadsPlaylistId !== "string"
  ) {
    return null;
  }

  return {
    channelId: value.channelId,
    uploadsPlaylistId: value.uploadsPlaylistId,
  };
}

async function resolveChannel(context, handle, apiKey) {
  const cached = cachedChannel(await readCache(context, "channel", handle));

  if (cached) {
    return cached;
  }

  const items = responseItems(
    await fetchApi(
      "channels",
      {
        part: "contentDetails",
        forHandle: handle,
        maxResults: "1",
        fields: "items(id,contentDetails/relatedPlaylists/uploads)",
      },
      apiKey,
      "channels.list",
    ),
    "channels.list",
  );

  if (!items.length) {
    return null;
  }

  const item = items[0] || {};
  const channel = {
    channelId: item.id,
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
  };

  if (
    typeof channel.channelId !== "string" ||
    typeof channel.uploadsPlaylistId !== "string"
  ) {
    throw apiError("channels.list-shape", 200);
  }

  await writeCache(context, "channel", handle, channel, CACHE_TTL.channel);
  return channel;
}

async function latestUploadIds(uploadsPlaylistId, apiKey) {
  const items = responseItems(
    await fetchApi(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: String(MAX_UPLOADS),
        fields: "items(contentDetails/videoId)",
      },
      apiKey,
      "playlistItems.list",
    ),
    "playlistItems.list",
  );
  const seen = new Set();

  return items
    .map((item) => item?.contentDetails?.videoId)
    .filter((videoId) => {
      if (!isVideoId(videoId) || seen.has(videoId)) {
        return false;
      }

      seen.add(videoId);
      return true;
    });
}

async function videosById(videoIds, apiKey) {
  if (!videoIds.length) {
    return [];
  }

  return responseItems(
    await fetchApi(
      "videos",
      {
        part: "snippet,liveStreamingDetails",
        id: videoIds.join(","),
        fields:
          "items(id,snippet(channelId,liveBroadcastContent)," +
          "liveStreamingDetails(actualStartTime,actualEndTime))",
      },
      apiKey,
      "videos.list",
    ),
    "videos.list",
  );
}

function activeLiveVideoId(videoIds, videos, channelId) {
  const indexedVideos = new Map(
    videos.filter((video) => isVideoId(video?.id)).map((video) => [video.id, video]),
  );

  for (const videoId of videoIds) {
    const video = indexedVideos.get(videoId);
    const details = video?.liveStreamingDetails;

    if (
      video?.snippet?.channelId === channelId &&
      video.snippet.liveBroadcastContent === "live" &&
      details?.actualStartTime &&
      !details.actualEndTime
    ) {
      return videoId;
    }
  }

  return null;
}

function logResult(source, result, details = {}) {
  console.log("[youtube-live] Resolution result:", {
    source,
    live: result.live,
    videoId: result.videoId || null,
    ...details,
  });
}

async function storeResult(context, handle, result) {
  const ttl = result.live
    ? CACHE_TTL.liveResult
    : CACHE_TTL.offlineResult;
  await writeCache(context, "result", handle, result, ttl);
}

async function storeLiveResult(context, handle, videoId) {
  const result = { live: true, videoId };
  await Promise.all([
    writeCache(
      context,
      "known-live",
      handle,
      { videoId },
      CACHE_TTL.knownLive,
    ),
    storeResult(context, handle, result),
  ]);
  return result;
}

async function resolveLiveVideo(context, handle, apiKey) {
  const cached = cachedResolution(await readCache(context, "result", handle));

  if (cached) {
    logResult("result-cache", cached);
    return cached;
  }

  const channel = await resolveChannel(context, handle, apiKey);

  if (!channel) {
    const result = { live: false };
    await storeResult(context, handle, result);
    logResult("channel-not-found", result);
    return result;
  }

  const knownLive = await readCache(context, "known-live", handle);
  const knownVideoId = isVideoId(knownLive?.videoId)
    ? knownLive.videoId
    : null;

  if (knownVideoId) {
    const verifiedVideoId = activeLiveVideoId(
      [knownVideoId],
      await videosById([knownVideoId], apiKey),
      channel.channelId,
    );

    if (verifiedVideoId) {
      const result = await storeLiveResult(context, handle, verifiedVideoId);
      logResult("known-live-cache", result);
      return result;
    }

    await deleteCache(context, "known-live", handle);
  }

  const videoIds = await latestUploadIds(channel.uploadsPlaylistId, apiKey);
  const videoId = activeLiveVideoId(
    videoIds,
    await videosById(videoIds, apiKey),
    channel.channelId,
  );

  if (videoId) {
    const result = await storeLiveResult(context, handle, videoId);
    logResult("uploads-playlist", result, { uploadsChecked: videoIds.length });
    return result;
  }

  const result = { live: false };
  await storeResult(context, handle, result);
  console.warn("[youtube-live] No active broadcast found in latest uploads.", {
    channelId: channel.channelId,
    uploadsChecked: videoIds.length,
  });
  logResult("uploads-playlist", result, { uploadsChecked: videoIds.length });
  return result;
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const handle = normalizeHandle(requestUrl.searchParams.get("handle"));

  if (!handle) {
    return jsonResponse(
      { error: "Missing or invalid YouTube handle." },
      400,
    );
  }

  const apiKey = String(context.env?.YOUTUBE_API_KEY || "").trim();

  if (!apiKey) {
    console.warn("[youtube-live] YOUTUBE_API_KEY is not configured.");
    return jsonResponse(
      { error: "Could not resolve the YouTube live stream." },
      502,
    );
  }

  const resolutionKey = handle.toLowerCase();
  let resolutionPromise = inFlightResolutions.get(resolutionKey);

  if (!resolutionPromise) {
    resolutionPromise = resolveLiveVideo(context, handle, apiKey);
    inFlightResolutions.set(resolutionKey, resolutionPromise);
  }

  try {
    return jsonResponse(await resolutionPromise);
  } catch (error) {
    console.warn("[youtube-live] YouTube Data API resolution failed.", {
      stage: error?.stage || "unknown",
      status: error?.status || null,
    });
    return jsonResponse(
      { error: "Could not resolve the YouTube live stream." },
      502,
    );
  } finally {
    if (inFlightResolutions.get(resolutionKey) === resolutionPromise) {
      inFlightResolutions.delete(resolutionKey);
    }
  }
}
