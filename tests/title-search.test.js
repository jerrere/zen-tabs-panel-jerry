"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { searchTabsByTitle } = require("../lib/title-search.js");

const tab = (overrides = {}) => Object.assign({
  domId: "tab-1",
  title: "",
  url: "https://example.com/",
  workspaceId: "ws-a",
  lastAccessed: 0,
}, overrides);

test("searchTabsByTitle matches title substrings case-insensitively", () => {
  const tabs = [
    tab({ domId: "a", title: "GitHub Pull Request" }),
    tab({ domId: "b", title: "Calendar" }),
  ];

  assert.deepEqual(searchTabsByTitle(tabs, "pull").map((t) => t.domId), ["a"]);
  assert.deepEqual(searchTabsByTitle(tabs, "GITHUB").map((t) => t.domId), ["a"]);
});

test("searchTabsByTitle returns no results for blank queries", () => {
  const tabs = [tab({ domId: "a", title: "Anything" })];

  assert.deepEqual(searchTabsByTitle(tabs, ""), []);
  assert.deepEqual(searchTabsByTitle(tabs, "   "), []);
});

test("searchTabsByTitle only matches titles, not URLs or domains", () => {
  const tabs = [
    tab({ domId: "a", title: "Inbox", url: "https://github.com/issues" }),
    tab({ domId: "b", title: "GitHub Notifications", url: "https://example.com/" }),
  ];

  assert.deepEqual(searchTabsByTitle(tabs, "github").map((t) => t.domId), ["b"]);
});

test("searchTabsByTitle orders matches by lastAccessed descending", () => {
  const tabs = [
    tab({ domId: "old", title: "Project docs", lastAccessed: 10 }),
    tab({ domId: "new", title: "Project board", lastAccessed: 30 }),
    tab({ domId: "mid", title: "Project notes", lastAccessed: 20 }),
  ];

  assert.deepEqual(searchTabsByTitle(tabs, "project").map((t) => t.domId), ["new", "mid", "old"]);
});

test("searchTabsByTitle applies workspace filtering", () => {
  const tabs = [
    tab({ domId: "a", title: "Design spec", workspaceId: "ws-a" }),
    tab({ domId: "b", title: "Design review", workspaceId: "ws-b" }),
  ];

  assert.deepEqual(searchTabsByTitle(tabs, "design", "ws-b").map((t) => t.domId), ["b"]);
  assert.deepEqual(searchTabsByTitle(tabs, "design", "all").map((t) => t.domId), ["a", "b"]);
});
