import { useSyncExternalStore } from "react";

/** Hidden fields sent with every join, filled on the client after mount. */
export type Attribution = {
  ref: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  landing_path: string;
  referrer: string;
};

export const EMPTY_ATTRIBUTION: Attribution = Object.freeze({
  ref: "",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  landing_path: "",
  referrer: "",
});

/** The referrer, only when it is an absolute http(s) URL from another site. */
function externalReferrer(referrer: string, origin: string): string {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin === origin ? "" : url.href;
  } catch {
    return "";
  }
}

export function readAttribution(location: Pick<Location, "search" | "pathname" | "origin">, referrer: string): Attribution {
  const params = new URLSearchParams(location.search);
  const get = (name: string) => params.get(name)?.trim() ?? "";
  return {
    ref: get("ref"),
    utm_source: get("utm_source"),
    utm_medium: get("utm_medium"),
    utm_campaign: get("utm_campaign"),
    landing_path: `${location.pathname}${location.search}`,
    referrer: externalReferrer(referrer, location.origin),
  };
}

// useSyncExternalStore needs a stable snapshot: recompute only when the URL or referrer changes.
let cache: { key: string; value: Attribution } | null = null;

function getSnapshot(): Attribution {
  const key = `${window.location.href}\n${document.referrer}`;
  if (cache?.key !== key) cache = { key, value: readAttribution(window.location, document.referrer) };
  return cache.value;
}

function getServerSnapshot(): Attribution {
  return EMPTY_ATTRIBUTION;
}

function subscribe() {
  return () => {};
}

/** Empty on the server and during hydration; the real values after mount. */
export function useAttribution(): Attribution {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
