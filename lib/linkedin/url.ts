/**
 * Canonical LinkedIn profile URL helpers.
 * One person → one targets row, keyed by normalized /in/{vanity} URL.
 */

/** Normalize a LinkedIn profile URL for storage + uniqueness checks. */
export function normalizeLinkedInProfileUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    // Allow bare vanity
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith("linkedin.com") || trimmed.startsWith("www.linkedin.com")
        ? `https://${trimmed}`
        : trimmed.startsWith("/in/")
          ? `https://www.linkedin.com${trimmed}`
          : `https://www.linkedin.com/in/${trimmed.replace(/^\/+/, "")}`;

    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "linkedin.com") return null;

    // /in/vanity or /in/vanity/... → keep vanity only
    const m = u.pathname.match(/^\/in\/([^/?#]+)/i);
    if (!m) return null;

    let vanity = decodeURIComponent(m[1]).replace(/\/+$/, "");
    // Drop trailing junk LinkedIn sometimes appends
    vanity = vanity.split(",")[0].trim();
    if (!vanity || vanity.length < 2) return null;
    // Reject obvious non-profile paths
    if (/^(edit|overlay|detail|ops|sales)$/i.test(vanity)) return null;

    // Canonical form used everywhere in Linki
    return `https://www.linkedin.com/in/${vanity}`;
  } catch {
    return null;
  }
}

export function vanityFromLinkedInUrl(url: string | null | undefined): string | null {
  const n = normalizeLinkedInProfileUrl(url);
  if (!n) return null;
  const m = n.match(/\/in\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** Case-insensitive match key for DB lookups */
export function linkedInUrlMatchKey(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}
