"use strict";

function normalizeSearchText(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function searchTabsByTitle(tabs, query, workspaceFilter = "all") {
  const needle = normalizeSearchText(query);
  if (!needle) return [];

  return (Array.isArray(tabs) ? tabs : [])
    .filter((tab) => {
      if (workspaceFilter !== "all" && tab.workspaceId !== workspaceFilter) return false;
      return normalizeSearchText(tab.title).includes(needle);
    })
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
}

if (typeof globalThis !== "undefined") {
  globalThis.normalizeSearchText = normalizeSearchText;
  globalThis.searchTabsByTitle = searchTabsByTitle;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeSearchText,
    searchTabsByTitle,
  };
}
