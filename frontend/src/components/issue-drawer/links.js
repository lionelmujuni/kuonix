// Pure helpers for the issue panel's resource links — no DOM or Electron deps,
// so they're unit-testable in isolation.
//
// Backend ResourceLink shape: { label, url, type } where type is one of
// "article" | "video" | "search". Curated links are rendered as static rows;
// search links seed the editable "search for tutorials" box.

export function partitionResources(resources) {
  const list = Array.isArray(resources) ? resources : [];
  return {
    curated: list.filter((r) => r && r.url && r.type !== "search"),
    search:  list.filter((r) => r && r.url && r.type === "search"),
  };
}

// Pull the human-readable query out of a search deep-link so it can pre-fill
// the editable box. Handles both Google (?q=) and YouTube (?search_query=).
export function searchQueryFromResources(resources) {
  const { search } = partitionResources(resources);
  for (const r of search) {
    try {
      const u = new URL(r.url);
      const q = u.searchParams.get("q") || u.searchParams.get("search_query");
      if (q) return q;
    } catch {
      /* ignore malformed url */
    }
  }
  return "";
}

export function googleUrl(query) {
  return "https://www.google.com/search?q=" + encodeURIComponent(query || "");
}

export function youtubeUrl(query) {
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(query || "");
}
