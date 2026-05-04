const MARKETING_HOSTS = new Set(["lotview.ai", "www.lotview.ai"]);

export function shouldRenderMarketingSite(hostname: string, search = ""): boolean {
  const normalizedHost = hostname.split(":")[0].toLowerCase();

  if (MARKETING_HOSTS.has(normalizedHost)) {
    return true;
  }

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("site") === "marketing";
}
