// The site's stand-in for chrome.runtime.getURL: files in public/, relative to wherever the site is hosted.
export function asset(path: string) {
  return new URL(path, new URL(import.meta.env.BASE_URL, location.href)).href;
}
