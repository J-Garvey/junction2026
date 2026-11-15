/** The public app origin for chat links; override PUBLIC_APP_URL for another deployment. */
export const DEFAULT_APP_URL = "https://junction.hewston.ie";

export function whatsAppLink(path: string, appUrl = DEFAULT_APP_URL): string | null {
  if (path.length > 1200 || appUrl.length > 500 || !path.startsWith("/") || path.startsWith("//") || /[\\\s]/u.test(path)) return null;
  try {
    const base = new URL(appUrl);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) return null;
    const url = new URL(path, base);
    return url.origin === base.origin ? url.href : null;
  } catch { return null; }
}
