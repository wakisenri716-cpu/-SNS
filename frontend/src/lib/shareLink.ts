// Shares a link: the phone's share sheet (LINE, X, ...) where the browser
// supports it, otherwise copies it to the clipboard. Returns what happened so
// the caller can say "copied"; "manual" means both failed and the caller
// should show the link for the user to copy.
export async function shareLink(url: string, title: string): Promise<"shared" | "cancelled" | "copied" | "manual"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (err) {
      // The user closing the share sheet isn't an error worth reacting to.
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "manual";
  }
}
