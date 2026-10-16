// A page address on a site: parsed once, and only when its host is the site's domain or one of its
// subdomains, so an address that merely mentions the site ("evil.com/?netflix.com") is not on it.
export function onSite(address: string, domain: string): URL | undefined {
  try {
    const url = new URL(address)
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`) ? url : undefined
  } catch {
    return undefined
  }
}

/** A path's part after an optional locale ("/en-gb/play/…", "/de/watch/…"), matched against `pattern`. */
export function pathMatch(
  url: URL | undefined,
  pattern: RegExp
): RegExpMatchArray | null | undefined {
  return url?.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i, '').match(pattern)
}
