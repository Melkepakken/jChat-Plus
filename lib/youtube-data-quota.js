export const TEMPORARY_COOLDOWN_MS = 60 * 1000;
const PACIFIC_RESET_BUFFER_MS = 60 * 1000;

export const DAILY_QUOTA_REASONS = new Set([
  "quotaExceeded",
  "dailyLimitExceeded",
  "variableTermExpiredDailyExceeded",
]);

export const TEMPORARY_REASONS = new Set([
  "concurrentLimitExceeded",
  "rateLimitExceeded",
  "servingLimitExceeded",
  "userRateLimitExceeded",
]);

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

export function nextPacificQuotaReset(now = Date.now()) {
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

export function dataApiLimitRetryAt(errorBody, now) {
  const errors = errorBody?.error?.errors;
  if (!Array.isArray(errors)) return 0;
  if (errors.some(error => DAILY_QUOTA_REASONS.has(error?.reason))) return nextPacificQuotaReset(now);
  if (errors.some(error => TEMPORARY_REASONS.has(error?.reason))) return now + TEMPORARY_COOLDOWN_MS;
  return 0;
}
