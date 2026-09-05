const YOUTUBE_API_ROOT = "https://www.googleapis.com/youtube/v3/";
const YOUTUBE_RESOLVER_VERSION = "2";
const YOUTUBE_API_TIMEOUT_MS = 15000;
const MAX_UPLOADS = 50;
const CACHE_VERSION = "v1";
const GLOBAL_CACHE_KEY = "global";
const OFFLINE_BACKOFF_MS = [60 * 1000, 120 * 1000, 300 * 1000];
const TEMPORARY_COOLDOWN_MS = 60 * 1000;
const CONFIGURATION_COOLDOWN_MS = 5 * 60 * 1000;
const PACIFIC_RESET_BUFFER_MS = 60 * 1000;
const MAX_MEMORY_CACHE_ENTRIES = 256;
const CACHE_TTL = {
  channel: 3 * 24 * 60 * 60,
  knownLive: 24 * 60 * 60,
  liveResult: 60,
  offlineState: 7 * 24 * 60 * 60,
  searchMiss: 60 * 60,
  searchClientCooldown: 30 * 60,
};
const DAILY_QUOTA_REASONS = new Set([
  "quotaExceeded",
  "dailyLimitExceeded",
  "variableTermExpiredDailyExceeded",
]);
const CONFIGURATION_REASONS = new Set([
  "accessNotConfigured",
  "dailyLimitExceededUnreg",
  "forbidden",
  "keyExpired",
  "keyInvalid",
  "rateLimitExceededUnreg",
  "userRateLimitExceededUnreg",
]);
const TEMPORARY_REASONS = new Set([
  "concurrentLimitExceeded",
  "rateLimitExceeded",
  "servingLimitExceeded",
  "userRateLimitExceeded",
]);
const inFlightResolutions = new Map();
const memoryCache = new Map();
const warningDeadlines = new Map();

function validRetryAfterMs(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : null;
}

function jsonResponse(body, status = 200, retryAfterMs = null) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-JChat-Resolver-Version": YOUTUBE_RESOLVER_VERSION,
  };
  const retryDelay = validRetryAfterMs(retryAfterMs);

  if (retryDelay !== null) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(retryDelay / 1000)));
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
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

function apiError(stage, status = null, reason = null) {
  const error = new Error("YouTube Data API request failed.");
  error.name = "YouTubeApiError";
  error.stage = stage;
  error.status = status;
  error.reason = reason;
  return error;
}

function configurationError(stage = "configuration", reason = null) {
  const error = new Error("YouTube discovery is not configured correctly.");
  error.name = "YouTubeConfigurationError";
  error.stage = stage;
  error.status = null;
  error.reason = reason;
  return error;
}

function discoveryError(code, message, retryAt, details = {}) {
  const error = new Error(message);
  error.name = "YouTubeDiscoveryError";
  error.code = code;
  error.retryAt = retryAt;
  error.stage = details.stage || "unknown";
  error.status = details.status ?? null;
  error.reason = details.reason || null;
  return error;
}

function safeLogToken(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(value)
    ? value
    : null;
}

function readClientVersion(request) {
  let value = null;

  try {
    value = request?.headers?.get?.("X-JChat-Client-Version");
  } catch {
    return null;
  }

  const version = typeof value === "string" ? value.trim() : "";

  return version.length <= 32 &&
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)
    ? version
    : null;
}

function diagnosticDetails(context, details = {}) {
  return {
    ...details,
    clientVersion: readClientVersion(context?.request),
    resolverVersion: YOUTUBE_RESOLVER_VERSION,
  };
}

function logWarningOnce(context, key, message, details = {}) {
  const now = Date.now();
  const deadline = warningDeadlines.get(key) || 0;

  if (deadline > now) {
    return;
  }

  warningDeadlines.set(key, now + TEMPORARY_COOLDOWN_MS);

  while (warningDeadlines.size > 32) {
    warningDeadlines.delete(warningDeadlines.keys().next().value);
  }

  console.warn(message, diagnosticDetails(context, details));
}

async function fetchApi(path, params, apiKey, stage) {
  const url = new URL(path, YOUTUBE_API_ROOT);

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    YOUTUBE_API_TIMEOUT_MS,
  );

  try {
    let response;

    try {
      response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        signal: controller.signal,
      });
    } catch {
      throw apiError(stage);
    }

    if (!response.ok) {
      let reason = null;

      try {
        const errorData = await response.json();
        const firstReason = errorData?.error?.errors?.[0]?.reason;

        if (typeof firstReason === "string") {
          reason = firstReason;
        }
      } catch {
        if (controller.signal.aborted) {
          throw apiError(stage);
        }

        // The status and stage are enough when Google does not return JSON.
      }

      throw apiError(stage, response.status, reason);
    }

    try {
      return await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw apiError(stage);
      }

      throw apiError(`${stage}-json`, response.status);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function responseItems(data, stage) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw apiError(`${stage}-shape`, 200);
  }

  if (!Object.prototype.hasOwnProperty.call(data, "items")) {
    return [];
  }

  if (!Array.isArray(data.items)) {
    throw apiError(`${stage}-shape`, 200);
  }

  return data.items;
}

function candidateVideoIds(items, getVideoId, stage) {
  const seen = new Set();
  const videoIds = [];

  for (const item of items) {
    const videoId = getVideoId(item);

    if (!isVideoId(videoId)) {
      throw apiError(`${stage}-shape`, 200);
    }

    if (!seen.has(videoId)) {
      seen.add(videoId);
      videoIds.push(videoId);
    }
  }

  return videoIds;
}

function zonedDateParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(timestamp));
  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return values;
}

function zonedTimeToUtc(parts, timeZone) {
  const desired = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0,
  );
  let candidate = desired;

  for (let attempt = 0; attempt < 4; attempt++) {
    const observed = zonedDateParts(candidate, timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const adjustment = desired - observedAsUtc;

    candidate += adjustment;

    if (adjustment === 0) {
      break;
    }
  }

  return candidate;
}

function nextPacificQuotaReset(now = Date.now()) {
  const timeZone = "America/Los_Angeles";
  const current = zonedDateParts(now, timeZone);
  const nextDate = new Date(
    Date.UTC(current.year, current.month - 1, current.day + 1),
  );
  const resetAt = zonedTimeToUtc(
    {
      day: nextDate.getUTCDate(),
      hour: 0,
      minute: 0,
      month: nextDate.getUTCMonth() + 1,
      second: 0,
      year: nextDate.getUTCFullYear(),
    },
    timeZone,
  );

  return resetAt + PACIFIC_RESET_BUFFER_MS;
}

function isDailyQuotaError(error) {
  return (
    error?.status === 403 &&
    DAILY_QUOTA_REASONS.has(safeLogToken(error.reason))
  );
}

function isConfigurationError(error) {
  return (
    error?.name === "YouTubeConfigurationError" ||
    CONFIGURATION_REASONS.has(safeLogToken(error?.reason))
  );
}

function isTemporaryError(error) {
  const status = error?.status;

  return (
    status === null ||
    status === undefined ||
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    TEMPORARY_REASONS.has(safeLogToken(error?.reason)) ||
    /-(json|shape)$/.test(String(error?.stage || ""))
  );
}

function defaultCache() {
  return globalThis.caches?.default || null;
}

function cacheKey(context, kind, handle) {
  const url = new URL(context.request.url);
  url.pathname =
    `/__jchat-youtube-live-cache/${CACHE_VERSION}/${kind}/` +
    encodeURIComponent(String(handle).toLowerCase());
  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
}

function memoryCacheKey(context, kind, handle) {
  return cacheKey(context, kind, handle).url;
}

function pruneMemoryCache(now = Date.now()) {
  for (const [key, entry] of memoryCache) {
    if (!entry || entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }

  while (memoryCache.size > MAX_MEMORY_CACHE_ENTRIES) {
    memoryCache.delete(memoryCache.keys().next().value);
  }
}

function readMemoryCache(context, kind, handle) {
  const now = Date.now();
  const key = memoryCacheKey(context, kind, handle);
  const entry = memoryCache.get(key);

  if (!entry || entry.expiresAt <= now) {
    memoryCache.delete(key);
    return null;
  }

  // Keep frequently consulted global cooldowns from being displaced by a
  // burst of one-off channel handles when the shared Cache API is unavailable.
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry.value;
}

function writeMemoryCache(context, kind, handle, value, ttl) {
  const key = memoryCacheKey(context, kind, handle);
  const expiresAt = Date.now() + Math.max(1, ttl) * 1000;

  pruneMemoryCache();
  memoryCache.delete(key);
  memoryCache.set(key, { expiresAt, value });
  pruneMemoryCache();
}

function deleteMemoryCache(context, kind, handle) {
  memoryCache.delete(memoryCacheKey(context, kind, handle));
}

async function readCache(context, kind, handle) {
  const cache = defaultCache();
  const inMemory = readMemoryCache(context, kind, handle);

  if (!cache) {
    return inMemory;
  }

  try {
    const response = await cache.match(cacheKey(context, kind, handle));

    if (!response) {
      return inMemory;
    }

    const shared = await response.json();
    const sharedWrittenAt = Number(shared?._cachedAt || 0);
    const memoryWrittenAt = Number(inMemory?._cachedAt || 0);

    if (inMemory !== null && memoryWrittenAt > sharedWrittenAt) {
      return inMemory;
    }

    const sharedExpiresAt = Number(shared?._expiresAt || 0);
    const remainingTtl = Math.ceil((sharedExpiresAt - Date.now()) / 1000);

    if (Number.isFinite(remainingTtl) && remainingTtl > 0) {
      writeMemoryCache(context, kind, handle, shared, remainingTtl);
    } else {
      // Older cache entries have no absolute expiry metadata. Do not retain a
      // stale local value after the shared cache has proved it obsolete.
      deleteMemoryCache(context, kind, handle);
    }

    return shared;
  } catch {
    logWarningOnce(
      context,
      `cache-read-${kind}`,
      "[youtube-live] Internal cache read failed; using isolate memory.",
      { kind },
    );
    return inMemory;
  }
}

async function writeCache(context, kind, handle, value, ttl) {
  const cache = defaultCache();
  const storedValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? {
          ...value,
          _cachedAt: Date.now(),
          _expiresAt: Date.now() + Math.max(1, ttl) * 1000,
        }
      : value;

  writeMemoryCache(context, kind, handle, storedValue, ttl);

  if (!cache) {
    return;
  }

  try {
    await cache.put(
      cacheKey(context, kind, handle),
      new Response(JSON.stringify(storedValue), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`,
        },
      }),
    );
  } catch {
    logWarningOnce(
      context,
      `cache-write-${kind}`,
      "[youtube-live] Internal cache write failed; using isolate memory.",
      { kind },
    );
  }
}

async function deleteCache(context, kind, handle) {
  const cache = defaultCache();

  deleteMemoryCache(context, kind, handle);

  if (!cache) {
    return;
  }

  try {
    await cache.delete(cacheKey(context, kind, handle));
  } catch {
    logWarningOnce(
      context,
      `cache-delete-${kind}`,
      "[youtube-live] Internal cache delete failed.",
      { kind },
    );
  }
}

function offlineResult(nextCheckAt, now = Date.now()) {
  const retryAfterMs = validRetryAfterMs(nextCheckAt - now);

  return retryAfterMs === null ? null : { live: false, retryAfterMs };
}

function cachedResolution(value, now = Date.now()) {
  if (value?.live === false && Number.isFinite(value.nextCheckAt)) {
    return offlineResult(value.nextCheckAt, now);
  }

  if (value?.live === true && isVideoId(value.videoId)) {
    return { live: true, videoId: value.videoId };
  }

  return null;
}

function cachedOfflineState(value) {
  if (
    !Number.isInteger(value?.offlineCount) ||
    value.offlineCount < 1 ||
    !Number.isFinite(value.nextCheckAt)
  ) {
    return null;
  }

  return {
    nextCheckAt: value.nextCheckAt,
    offlineCount: Math.min(value.offlineCount, OFFLINE_BACKOFF_MS.length),
  };
}

function cachedCooldown(value) {
  if (
    typeof value?.code !== "string" ||
    !Number.isFinite(value.retryAt) ||
    value.retryAt <= Date.now()
  ) {
    return null;
  }

  return {
    code: value.code,
    reason: safeLogToken(value.reason),
    retryAt: value.retryAt,
    stage: safeLogToken(value.stage) || "unknown",
    status: Number.isInteger(value.status) ? value.status : null,
  };
}

function cacheTtlUntil(deadline) {
  return Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
}

async function activeCooldown(context, kind) {
  return cachedCooldown(await readCache(context, kind, GLOBAL_CACHE_KEY));
}

async function activeGeneralCooldown(context) {
  const kinds = [
    "generalQuotaCooldown",
    "generalConfigurationCooldown",
    "generalTemporaryCooldown",
  ];

  for (const kind of kinds) {
    const cooldown = await activeCooldown(context, kind);

    if (cooldown) {
      return cooldown;
    }
  }

  return null;
}

function generalCooldownKind(code) {
  if (code === "youtube_quota_exceeded") {
    return "generalQuotaCooldown";
  }

  if (code === "youtube_configuration_error") {
    return "generalConfigurationCooldown";
  }

  return "generalTemporaryCooldown";
}

function cooldownPriority(code) {
  if (
    code === "youtube_quota_exceeded" ||
    code === "youtube_search_quota_exceeded"
  ) {
    return 3;
  }

  return code === "youtube_configuration_error" ? 2 : 1;
}

async function establishCooldown(context, kind, cooldown) {
  const existing = await activeCooldown(context, kind);

  if (
    existing &&
    cooldownPriority(existing.code) >= cooldownPriority(cooldown.code)
  ) {
    return existing;
  }

  await writeCache(
    context,
    kind,
    GLOBAL_CACHE_KEY,
    cooldown,
    cacheTtlUntil(cooldown.retryAt),
  );
  return cooldown;
}

async function establishGeneralCooldown(context, cooldown) {
  const existing = await activeGeneralCooldown(context);

  if (
    existing &&
    cooldownPriority(existing.code) >= cooldownPriority(cooldown.code)
  ) {
    return existing;
  }

  await writeCache(
    context,
    generalCooldownKind(cooldown.code),
    GLOBAL_CACHE_KEY,
    cooldown,
    cacheTtlUntil(cooldown.retryAt),
  );

  // Each priority has its own key so a late weaker write cannot overwrite a
  // quota cooldown in another isolate or concurrent request.
  return (await activeGeneralCooldown(context)) || cooldown;
}

function cooldownMessage(code) {
  if (code === "youtube_quota_exceeded") {
    return "YouTube discovery is paused because its API quota is exhausted.";
  }

  if (code === "youtube_configuration_error") {
    return "YouTube discovery is not configured correctly.";
  }

  return "YouTube discovery is temporarily unavailable.";
}

function throwCooldown(cooldown) {
  throw discoveryError(
    cooldown.code,
    cooldownMessage(cooldown.code),
    cooldown.retryAt,
    cooldown,
  );
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

  return candidateVideoIds(
    items,
    (item) => item?.contentDetails?.videoId,
    "playlistItems.list",
  );
}

async function searchLiveVideoIds(channelId, apiKey) {
  const items = responseItems(
    await fetchApi(
      "search",
      {
        part: "snippet",
        channelId,
        eventType: "live",
        type: "video",
        maxResults: "5",
        fields: "items(id/videoId)",
      },
      apiKey,
      "search.list",
    ),
    "search.list",
  );

  return candidateVideoIds(
    items,
    (item) => item?.id?.videoId,
    "search.list",
  );
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
  const requestedIds = new Set(videoIds);
  const indexedVideos = new Map();

  for (const video of videos) {
    const content = video?.snippet?.liveBroadcastContent;
    const details = video?.liveStreamingDetails;

    if (
      !video ||
      typeof video !== "object" ||
      Array.isArray(video) ||
      !isVideoId(video.id) ||
      !requestedIds.has(video.id) ||
      typeof video.snippet?.channelId !== "string" ||
      !["live", "none", "upcoming"].includes(content) ||
      (details != null &&
        (typeof details !== "object" || Array.isArray(details))) ||
      (details?.actualStartTime != null &&
        typeof details.actualStartTime !== "string") ||
      (details?.actualEndTime != null &&
        typeof details.actualEndTime !== "string")
    ) {
      throw apiError("videos.list-shape", 200);
    }

    indexedVideos.set(video.id, video);
  }

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

function logResult(context, source, result, details = {}) {
  console.log(
    "[youtube-live] Resolution result:",
    diagnosticDetails(context, {
      source,
      live: result.live,
      videoId: result.videoId || null,
      retryAfterMs: result.retryAfterMs || null,
      ...details,
    }),
  );
}

async function resetOfflineState(context, handle) {
  await deleteCache(context, "offlineState", handle);
  await writeCache(
    context,
    "offlineState",
    handle,
    { nextCheckAt: 0, offlineCount: 0 },
    CACHE_TTL.offlineState,
  );
}

async function storeLiveResult(context, handle, videoId) {
  const result = { live: true, videoId };
  await Promise.all([
    writeCache(context, "known-live", handle, { videoId }, CACHE_TTL.knownLive),
    writeCache(context, "result", handle, result, CACHE_TTL.liveResult),
    resetOfflineState(context, handle),
  ]);
  return result;
}

async function storeOfflineResult(context, handle) {
  const previous = cachedOfflineState(
    await readCache(context, "offlineState", handle),
  );
  const offlineCount = Math.min(
    (previous?.offlineCount || 0) + 1,
    OFFLINE_BACKOFF_MS.length,
  );
  const delay = OFFLINE_BACKOFF_MS[offlineCount - 1];
  const nextCheckAt = Date.now() + delay;
  const cachedResult = { live: false, nextCheckAt };

  await Promise.all([
    writeCache(
      context,
      "offlineState",
      handle,
      { nextCheckAt, offlineCount },
      CACHE_TTL.offlineState,
    ),
    writeCache(
      context,
      "result",
      handle,
      cachedResult,
      Math.ceil(delay / 1000),
    ),
  ]);

  return offlineResult(nextCheckAt);
}

async function resolveFromUploads(
  context,
  handle,
  apiKey,
  channel,
  source = "uploads-playlist",
) {
  const videoIds = await latestUploadIds(channel.uploadsPlaylistId, apiKey);
  const videoId = activeLiveVideoId(
    videoIds,
    await videosById(videoIds, apiKey),
    channel.channelId,
  );

  if (videoId) {
    const result = await storeLiveResult(context, handle, videoId);
    logResult(context, source, result, { uploadsChecked: videoIds.length });
    return result;
  }

  const result = await storeOfflineResult(context, handle);
  logResult(context, source, result, { uploadsChecked: videoIds.length });
  return result;
}

async function resolveLiveVideo(context, handle, apiKey) {
  const now = Date.now();
  const cached = cachedResolution(
    await readCache(context, "result", handle),
    now,
  );

  if (cached) {
    return cached;
  }

  const offlineState = cachedOfflineState(
    await readCache(context, "offlineState", handle),
  );
  const scheduledOffline = offlineState
    ? offlineResult(offlineState.nextCheckAt, now)
    : null;

  if (scheduledOffline) {
    return scheduledOffline;
  }

  const generalCooldown = await activeGeneralCooldown(context);

  if (generalCooldown) {
    throwCooldown(generalCooldown);
  }

  if (!apiKey) {
    throw configurationError("configuration");
  }

  const channel = await resolveChannel(context, handle, apiKey);

  if (!channel) {
    const result = await storeOfflineResult(context, handle);
    logResult(context, "channel-not-found", result);
    return result;
  }

  const knownLive = await readCache(context, "known-live", handle);
  const knownVideoId = isVideoId(knownLive?.videoId) ? knownLive.videoId : null;

  if (knownVideoId) {
    const verifiedVideoId = activeLiveVideoId(
      [knownVideoId],
      await videosById([knownVideoId], apiKey),
      channel.channelId,
    );

    if (verifiedVideoId) {
      const result = await storeLiveResult(context, handle, verifiedVideoId);
      logResult(context, "known-live-cache", result);
      return result;
    }

    await deleteCache(context, "known-live", handle);
  }

  const searchDisabledValue = await readCache(
    context,
    "searchDisabled",
    GLOBAL_CACHE_KEY,
  );
  const searchDisabled =
    cachedCooldown(searchDisabledValue) || searchDisabledValue?.active === true;

  if (searchDisabled) {
    return resolveFromUploads(
      context,
      handle,
      apiKey,
      channel,
      "search-disabled-uploads",
    );
  }

  const searchTemporary = await activeCooldown(context, "searchTemporary");

  if (searchTemporary) {
    return resolveFromUploads(
      context,
      handle,
      apiKey,
      channel,
      "search-error-uploads",
    );
  }

  const searchMiss = await readCache(context, "searchMiss", handle);

  if (searchMiss !== null) {
    return resolveFromUploads(
      context,
      handle,
      apiKey,
      channel,
      "search-miss-uploads",
    );
  }

  const searchClient = context.request.headers.get("CF-Connecting-IP");

  if (
    searchClient &&
    (await readCache(context, "searchClientCooldown", searchClient)) !== null
  ) {
    return resolveFromUploads(
      context,
      handle,
      apiKey,
      channel,
      "search-client-throttled-uploads",
    );
  }

  if (searchClient) {
    await writeCache(
      context,
      "searchClientCooldown",
      searchClient,
      { active: true },
      CACHE_TTL.searchClientCooldown,
    );
  }

  let searchVideoIds;

  try {
    searchVideoIds = await searchLiveVideoIds(channel.channelId, apiKey);
  } catch (error) {
    const quotaExceeded =
      error?.stage === "search.list" && isDailyQuotaError(error);

    if (!quotaExceeded && searchClient) {
      await deleteCache(context, "searchClientCooldown", searchClient);
    }

    if (error?.stage !== "search.list") {
      throw error;
    }

    if (isConfigurationError(error)) {
      throw error;
    }

    if (!quotaExceeded && !isTemporaryError(error)) {
      throw error;
    }

    const cooldown = quotaExceeded
      ? await establishCooldown(context, "searchDisabled", {
          code: "youtube_search_quota_exceeded",
          reason: safeLogToken(error.reason),
          retryAt: nextPacificQuotaReset(),
          stage: "search.list",
          status: error.status,
        })
      : await establishCooldown(context, "searchTemporary", {
          code: "youtube_search_unavailable",
          reason: safeLogToken(error.reason),
          retryAt: Date.now() + TEMPORARY_COOLDOWN_MS,
          stage: safeLogToken(error.stage) || "search.list",
          status: Number.isInteger(error.status) ? error.status : null,
        });

    logWarningOnce(
      context,
      `search-${cooldown.code}-${cooldown.reason || "unknown"}`,
      quotaExceeded
        ? "[youtube-live] search.list quota exhausted; using uploads fallback."
        : "[youtube-live] search.list unavailable; using uploads fallback.",
      {
        reason: cooldown.reason,
        retryAt: cooldown.retryAt,
        stage: cooldown.stage,
        status: cooldown.status,
      },
    );

    return resolveFromUploads(
      context,
      handle,
      apiKey,
      channel,
      quotaExceeded ? "search-disabled-uploads" : "search-error-uploads",
    );
  }

  const searchVideoId = activeLiveVideoId(
    searchVideoIds,
    await videosById(searchVideoIds, apiKey),
    channel.channelId,
  );

  if (searchVideoId) {
    const result = await storeLiveResult(context, handle, searchVideoId);
    logResult(context, "search-list", result, {
      searchCandidatesChecked: searchVideoIds.length,
    });
    return result;
  }

  await writeCache(
    context,
    "searchMiss",
    handle,
    { active: true },
    CACHE_TTL.searchMiss,
  );
  return resolveFromUploads(
    context,
    handle,
    apiKey,
    channel,
    "search-miss-uploads",
  );
}

async function resolveWithFailureHandling(context, handle, apiKey) {
  try {
    return await resolveLiveVideo(context, handle, apiKey);
  } catch (error) {
    if (error?.name === "YouTubeDiscoveryError") {
      throw error;
    }

    const stage = safeLogToken(error?.stage) || "unknown";
    const status = Number.isInteger(error?.status) ? error.status : null;
    const reason = safeLogToken(error?.reason);
    let code = "youtube_upstream_unavailable";
    let retryAt = Date.now() + TEMPORARY_COOLDOWN_MS;

    if (
      isDailyQuotaError(error) &&
      ["channels.list", "playlistItems.list", "videos.list"].includes(stage)
    ) {
      code = "youtube_quota_exceeded";
      retryAt = nextPacificQuotaReset();
    } else if (isConfigurationError(error)) {
      code = "youtube_configuration_error";
      retryAt = Date.now() + CONFIGURATION_COOLDOWN_MS;
    }

    const cooldown = await establishGeneralCooldown(context, {
      code,
      reason,
      retryAt,
      stage,
      status,
    });

    logWarningOnce(
      context,
      `general-${cooldown.code}-${cooldown.stage}-${cooldown.reason || "unknown"}`,
      "[youtube-live] Discovery cooldown established.",
      {
        code: cooldown.code,
        reason: cooldown.reason,
        retryAt: cooldown.retryAt,
        stage: cooldown.stage,
        status: cooldown.status,
        temporary: isTemporaryError(error),
      },
    );
    throwCooldown(cooldown);
  }
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const handle = normalizeHandle(requestUrl.searchParams.get("handle"));

  if (!handle) {
    return jsonResponse({ error: "Missing or invalid YouTube handle." }, 400);
  }

  const apiKey = String(context.env?.YOUTUBE_API_KEY || "").trim();
  const resolutionKey = handle.toLowerCase();
  let resolutionPromise = inFlightResolutions.get(resolutionKey);

  if (!resolutionPromise) {
    resolutionPromise = resolveWithFailureHandling(context, handle, apiKey);
    inFlightResolutions.set(resolutionKey, resolutionPromise);
  }

  try {
    const result = await resolutionPromise;
    return jsonResponse(
      result,
      200,
      result.live === false ? result.retryAfterMs : null,
    );
  } catch (error) {
    const retryAfterMs = Math.max(
      1000,
      Number(error?.retryAt || 0) - Date.now(),
    );
    const code =
      typeof error?.code === "string"
        ? error.code
        : "youtube_upstream_unavailable";
    const message = cooldownMessage(code);

    return jsonResponse(
      { code, error: message, retryAfterMs },
      503,
      retryAfterMs,
    );
  } finally {
    if (inFlightResolutions.get(resolutionKey) === resolutionPromise) {
      inFlightResolutions.delete(resolutionKey);
    }
  }
}
