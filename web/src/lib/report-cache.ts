export const REPORT_CACHE_PREFIX = "report_cache_";

type CachedReport<T> = {
  cachedDate: string;
  report: T;
};

export function getShanghaiDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function getReportCacheKey(
  patientId: string,
  dateKey: string,
): string {
  return `${REPORT_CACHE_PREFIX}${patientId}_${dateKey}`;
}

export function readReportCache<T>(
  patientId: string,
  dateKey: string,
): T | null {
  const key = getReportCacheKey(patientId, dateKey);

  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return null;
    }

    const cached = JSON.parse(rawValue) as CachedReport<T>;

    if (cached.cachedDate !== dateKey || !cached.report) {
      window.localStorage.removeItem(key);
      return null;
    }

    return cached.report;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function writeReportCache<T>(
  patientId: string,
  dateKey: string,
  report: T,
): void {
  const cached: CachedReport<T> = {
    cachedDate: dateKey,
    report,
  };

  window.localStorage.setItem(
    getReportCacheKey(patientId, dateKey),
    JSON.stringify(cached),
  );
}

export function clearReportCachesForPatient(patientId: string): void {
  const patientPrefix = `${REPORT_CACHE_PREFIX}${patientId}_`;

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (key?.startsWith(patientPrefix)) {
      window.localStorage.removeItem(key);
    }
  }
}

export function clearAllReportCaches(): void {
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (key?.startsWith(REPORT_CACHE_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
}