/* globals ExtensionAPI, Services, ChromeUtils */
"use strict";

this.zenWorkspaces = class extends ExtensionAPI {
  getAPI(context) {

    // -----------------------------------------------------------------------
    // Companion Zen Mods
    // -----------------------------------------------------------------------

    const COMPANION_MODS = {
      "zen-tabs-panel-unread-indicator": {
        name: "Unread Tab Indicator",
        description: "Blue dot on tabs opened in the background that you haven't visited yet.",
        version: "1.0.0",
        css: `
.tabbrowser-tab[unread="true"] .tab-content {
  position: relative !important;
}
.tabbrowser-tab[unread="true"] .tab-content::after {
  content: "" !important;
  position: absolute !important;
  top: 50% !important;
  right: 8px !important;
  transform: translateY(-50%) !important;
  width: 8px !important;
  height: 8px !important;
  border-radius: 50% !important;
  background: #3b82f6 !important;
  border: 1.5px solid rgba(0, 0, 0, 0.3) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
  z-index: 9999 !important;
  pointer-events: none !important;
}
.tabbrowser-tab[unread="true"] .tab-label-container {
  margin-right: 22px !important;
}
.tabbrowser-tab[unread="true"]:hover .tab-content::after {
  display: none !important;
}`,
      },
      "zen-tabs-panel-dim-unloaded": {
        name: "Dim Unloaded Tabs",
        description: "Grayscale and fade tabs that have been unloaded from memory.",
        version: "1.0.0",
        css: `
.tabbrowser-tab[pending="true"] .tab-icon-stack {
  filter: grayscale(1) !important;
  opacity: 0.5 !important;
}
.tabbrowser-tab[pending="true"] .tab-label-container {
  filter: grayscale(1) !important;
  opacity: 0.5 !important;
}`,
      },
      "zen-tabs-panel-corner-fix": {
        name: "Corner Bleed Fix",
        description: "Fixes white corners bleeding through rounded edges using clip-path. Trades corner bleed for slightly blurry text on large or high-DPI displays — a Gecko compositor limitation with no perfect CSS fix (see zen-browser/desktop#8421).",
        version: "1.0.4",
        css: `
.browserStack,
.browserStack > browser {
  clip-path: inset(0 round var(--zen-native-inner-radius)) !important;
}`,
      },
      "zen-tabs-panel-split-header-hover": {
        name: "Split View Header on Hover",
        description: "Hides the split view toolbar until you hover near the top edge of the pane.",
        version: "1.0.0",
        css: `
.browserSidebarContainer .zen-view-splitter-header-container {
  opacity: 0 !important;
  transition: opacity 0.15s !important;
}
.zen-view-splitter-header-container:hover {
  opacity: 1 !important;
}`,
      },
    };

    // Clean up on extension unload
    context.callOnClose({
      close() {
        const w = Services.wm.getMostRecentWindow("navigator:browser");
        if (!w) return;
        if (duplicateSyncTimer !== null) {
          w.clearTimeout(duplicateSyncTimer);
          duplicateSyncTimer = null;
        }
        try { uninstallCtrlTabSwitcher(); } catch (e) {}
        try { teardownTabTracking(); } catch (e) {}
        const overlay = w.document.getElementById("zen-tabs-panel-overlay");
        if (overlay) overlay.remove();
      },
    });

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function getWin() {
      return Services.wm.getMostRecentWindow("navigator:browser");
    }

    function findTabByDomId(domId) {
      const w = getWin();
      if (!w) return null;
      return w.document.getElementById(domId);
    }

    function getExtTabId(nativeTab) {
      try {
        return context.extension.tabManager.getWrapper(nativeTab)?.id ?? null;
      } catch (e) {
        return null;
      }
    }

    function unwrapFavicon(url) {
      if (!url) return "";
      if (url.startsWith("moz-remote-image://")) {
        try {
          const parsed = new URL(url);
          return parsed.searchParams.get("url") || url;
        } catch (e) {}
      }
      return url;
    }

    function cleanTitleText(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function getDisplayedTabTitle(tab) {
      const selectors = [".tab-label", ".tab-label-container"];
      for (const selector of selectors) {
        const el = tab.querySelector?.(selector);
        const text = cleanTitleText(el?.textContent || el?.getAttribute?.("value"));
        if (text) return text;
      }
      return cleanTitleText(tab.label || tab.getAttribute?.("label"));
    }

    let duplicateSyncTimer = null;

    function firstGrapheme(value) {
      return Array.from(cleanTitleText(value))[0] || "";
    }

    function isFetchableWorkspaceIcon(icon) {
      return /^(chrome|resource|moz-extension|data):/i.test(icon) || /\.svg(?:[?#]|$)/i.test(icon);
    }

    async function getWorkspaceIconData(workspace) {
      const icon = cleanTitleText(workspace?.icon);
      let svgContent = "";
      let iconText = "";

      if (icon) {
        if (isFetchableWorkspaceIcon(icon)) {
          try {
            const resp = await getWin().fetch(icon);
            const text = await resp.text();
            if (/<svg[\s>]/i.test(text)) {
              svgContent = text;
            }
          } catch (e) {}
        } else {
          iconText = icon;
        }
      }

      if (!svgContent && !iconText) {
        iconText = firstGrapheme(workspace?.name);
      }

      return { svgContent, iconText };
    }

    // Get all tab elements across all workspaces from the DOM
    function getAllTabElements() {
      const w = getWin();
      if (!w || !w.document) return [];
      return Array.from(w.document.querySelectorAll(".tabbrowser-tab"));
    }

    function getDuplicateUrl(tab) {
      if (!tab || tab.closing) return "";
      const url = tab.linkedBrowser?.currentURI?.spec || "";
      if (!url || url === "about:newtab" || url === "about:blank") return "";
      return url;
    }

    let SS = null;
    let SS_GET = null;
    let SS_SET = null;
    try {
      SS = ChromeUtils.importESModule(
        "resource:///modules/sessionstore/SessionStore.sys.mjs"
      ).SessionStore;
      SS_GET = SS && (SS.getCustomTabValue || SS.getTabValue) || null;
      SS_SET = SS && (SS.setCustomTabValue || SS.setTabValue) || null;
    } catch (e) {
      SS = null;
    }

    const tabMemoryStore = new WeakMap();
    const STATS_VERSION = 1;
    const STATS_DEFAULT = Object.freeze({
      v: STATS_VERSION,
      focusCount: 0,
      focusDurationSeconds: 0,
      createdAt: 0,
    });

    function readTabValue(tab, key) {
      try {
        if (SS_GET) {
          const raw = SS_GET.call(SS, tab, key);
          if (raw === undefined || raw === null || raw === "") return undefined;
          try { return JSON.parse(raw); } catch (e) { return raw; }
        }
      } catch (e) {}
      const mem = tabMemoryStore.get(tab);
      return mem ? mem[key] : undefined;
    }

    function writeTabValue(tab, key, value) {
      try {
        if (SS_SET) {
          SS_SET.call(SS, tab, key, JSON.stringify(value));
          return;
        }
      } catch (e) {}
      let mem = tabMemoryStore.get(tab);
      if (!mem) {
        mem = {};
        tabMemoryStore.set(tab, mem);
      }
      mem[key] = value;
    }

    function readTabStats(tab) {
      const stored = readTabValue(tab, "panelStats");
      if (!stored || typeof stored !== "object") return { ...STATS_DEFAULT };
      if (stored.v !== STATS_VERSION) return { ...STATS_DEFAULT, ...stored, v: STATS_VERSION };
      return stored;
    }

    function writeTabStats(tab, patch) {
      const current = readTabStats(tab);
      writeTabValue(tab, "panelStats", { ...current, ...patch, v: STATS_VERSION });
    }

    let focusState = { tab: null, startedAt: 0, paused: false };
    const tabAccumMs = new WeakMap();

    function recordFocusInterval() {
      if (!focusState.tab || focusState.paused) return;
      const elapsed = Math.max(0, Date.now() - focusState.startedAt);
      if (elapsed === 0) return;
      const tab = focusState.tab;
      const total = (tabAccumMs.get(tab) || 0) + elapsed;
      const wholeSec = Math.floor(total / 1000);
      if (wholeSec > 0) {
        const stats = readTabStats(tab);
        stats.focusDurationSeconds = (stats.focusDurationSeconds || 0) + wholeSec;
        writeTabStats(tab, stats);
      }
      tabAccumMs.set(tab, total - wholeSec * 1000);
      focusState.startedAt = Date.now();
    }

    function endFocus() {
      recordFocusInterval();
      focusState = { tab: null, startedAt: 0, paused: false };
    }

    function beginFocus(tab) {
      if (!tab) return;
      if (focusState.tab === tab && !focusState.paused) return;
      endFocus();
      try {
        const stats = readTabStats(tab);
        stats.focusCount = (stats.focusCount || 0) + 1;
        if (!stats.createdAt) stats.createdAt = Date.now();
        writeTabStats(tab, stats);
      } catch (e) {}
      focusState = { tab, startedAt: Date.now(), paused: false };
    }

    // Our own tab history for Previous tab, most recent first. A tab is
    // recorded only after it stays selected for a moment, so a tab Zen
    // selects for an instant during a workspace switch is skipped.
    const TAB_HISTORY_SETTLE_MS = 300;
    const TAB_HISTORY_MAX = 50;
    let tabHistory = [];
    let tabHistoryTimer = null;

    // Zen's placeholder "New Tab" that sits in an empty workspace.
    function isZenEmptyTab(tab) {
      if (!tab) return false;
      if (tab.hasAttribute?.("zen-empty-tab")) return true;
      try { return getWin()?.gZenWorkspaces?._emptyTab === tab; } catch (e) { return false; }
    }

    function recordTabHistory(tab) {
      if (!tab || tab.closing || isZenEmptyTab(tab)) return;
      tabHistory = [tab, ...tabHistory.filter((t) => t !== tab)].slice(0, TAB_HISTORY_MAX);
    }

    function flushTabHistory() {
      const w = getWin();
      if (tabHistoryTimer !== null) {
        w?.clearTimeout(tabHistoryTimer);
        tabHistoryTimer = null;
      }
      recordTabHistory(w?.gBrowser?.selectedTab);
    }

    function scheduleTabHistory() {
      const w = getWin();
      if (!w) return;
      if (tabHistoryTimer !== null) w.clearTimeout(tabHistoryTimer);
      tabHistoryTimer = w.setTimeout(flushTabHistory, TAB_HISTORY_SETTLE_MS);
    }

    const TAB_TRACKING_KEY = "__zenTabsPanelFocusTracking";
    let tabTrackingInstalled = false;
    let tabTrackingListeners = null;

    function ensureTabTracking() {
      if (tabTrackingInstalled) return;
      const w = getWin();
      if (!w || !w.gBrowser || !w.gBrowser.tabContainer) return;
      try {
        const prior = w[TAB_TRACKING_KEY];
        if (prior && prior.container) {
          try {
            prior.container.removeEventListener("TabOpen", prior.onOpen);
            prior.container.removeEventListener("TabSelect", prior.onSelect);
            prior.container.removeEventListener("TabClose", prior.onClose);
          } catch (e) {}
        }

        const onOpen = (event) => {
          try {
            const stats = readTabStats(event.target);
            if (!stats.createdAt) writeTabStats(event.target, { ...stats, createdAt: Date.now() });
          } catch (e) {}
        };
        const onSelect = (event) => {
          beginFocus(event.target);
          scheduleTabHistory();
          // Keep a preview of the tab we just left for the Ctrl+Tab switcher.
          const previousTab = event.detail?.previousTab;
          if (previousTab && !previousTab.hasAttribute("busy")) {
            w.setTimeout(() => captureThumb(previousTab), 0);
          }
        };
        const onClose = (event) => {
          try { if (focusState.tab === event.target) endFocus(); } catch (e) {}
          tabHistory = tabHistory.filter((t) => t !== event.target);
        };

        w.gBrowser.tabContainer.addEventListener("TabOpen", onOpen);
        w.gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
        w.gBrowser.tabContainer.addEventListener("TabClose", onClose);
        tabTrackingListeners = { container: w.gBrowser.tabContainer, onOpen, onSelect, onClose };
        w[TAB_TRACKING_KEY] = tabTrackingListeners;
        if (w.gBrowser.selectedTab) {
          focusState = { tab: w.gBrowser.selectedTab, startedAt: Date.now(), paused: false };
          recordTabHistory(w.gBrowser.selectedTab);
        }
        tabTrackingInstalled = true;
      } catch (e) {}
    }

    function teardownTabTracking() {
      try { recordFocusInterval(); } catch (e) {}
      if (tabTrackingListeners) {
        try {
          const { container, onOpen, onSelect, onClose } = tabTrackingListeners;
          container.removeEventListener("TabOpen", onOpen);
          container.removeEventListener("TabSelect", onSelect);
          container.removeEventListener("TabClose", onClose);
        } catch (e) {}
        const w = getWin();
        if (w && w[TAB_TRACKING_KEY] === tabTrackingListeners) {
          delete w[TAB_TRACKING_KEY];
        }
      }
      if (tabHistoryTimer !== null) {
        try { getWin()?.clearTimeout(tabHistoryTimer); } catch (e) {}
        tabHistoryTimer = null;
      }
      tabHistory = [];
      tabTrackingListeners = null;
      tabTrackingInstalled = false;
    }

    const DUP_INDICATOR_CSS = `
        .tabbrowser-tab[zen-tabs-panel-duplicate] .tab-content {
          position: relative !important;
        }
        .tabbrowser-tab[zen-tabs-panel-duplicate] .tab-content::before {
          content: "" !important;
          position: absolute !important;
          top: 50% !important;
          right: 5px !important;
          transform: translateY(-50%) rotate(45deg) !important;
          width: 7px !important;
          height: 7px !important;
          background: #f59e0b !important;
          border: 1.5px solid rgba(0, 0, 0, 0.3) !important;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
          z-index: 9999 !important;
          pointer-events: none !important;
        }
        .tabbrowser-tab[zen-tabs-panel-duplicate][unread="true"] .tab-content::before {
          right: 22px !important;
        }
        .tabbrowser-tab[unread="true"] .tab-content::after {
          right: 8px !important;
        }
        .tabbrowser-tab[unread="true"] .tab-label-container {
          margin-right: 22px !important;
        }
        .tabbrowser-tab[zen-tabs-panel-duplicate]:hover .tab-content::before {
          display: none !important;
        }
        .tabbrowser-tab[zen-tabs-panel-duplicate] .tab-label-container {
          margin-right: 22px !important;
        }
        .tabbrowser-tab[zen-tabs-panel-duplicate][unread="true"] .tab-label-container {
          margin-right: 34px !important;
        }
    `;

    function ensureDuplicateStyles() {
      const w = getWin();
      if (!w) return;
      let el = w.document.getElementById("zen-tabs-panel-dup-indicator-styles");
      if (!el) {
        el = w.document.createElement("style");
        el.id = "zen-tabs-panel-dup-indicator-styles";
        w.document.documentElement.appendChild(el);
      }
      el.textContent = DUP_INDICATOR_CSS;
    }

    function syncDuplicateAttributes() {
      ensureDuplicateStyles();
      const tabs = getAllTabElements();
      const urlCounts = {};
      for (const tab of tabs) {
        const url = getDuplicateUrl(tab);
        if (url) urlCounts[url] = (urlCounts[url] || 0) + 1;
      }
      for (const tab of tabs) {
        const url = getDuplicateUrl(tab);
        if (url && urlCounts[url] > 1) {
          tab.setAttribute("zen-tabs-panel-duplicate", "true");
        } else {
          tab.removeAttribute("zen-tabs-panel-duplicate");
        }
      }
    }

    function scheduleDuplicateSync() {
      syncDuplicateAttributes();

      const w = getWin();
      if (!w) return;
      if (duplicateSyncTimer !== null) {
        w.clearTimeout(duplicateSyncTimer);
      }
      duplicateSyncTimer = w.setTimeout(() => {
        duplicateSyncTimer = null;
        syncDuplicateAttributes();
      }, 250);
    }

    // Activate a native tab, switching workspaces if needed
    async function activateNativeTab(tab) {
      const w = getWin();
      if (!w || !w.gBrowser || !w.gZenWorkspaces) return false;

      const tabWorkspace = tab.getAttribute("zen-workspace-id") || null;
      const activeWorkspace = w.gZenWorkspaces.activeWorkspace;

      // Essentials show in every workspace, but still carry the
      // zen-workspace-id they were created in. Never follow that id, and
      // undo it if Zen moves the workspace while selecting the essential.
      if (tab.hasAttribute("zen-essential")) {
        w.gBrowser.selectedTab = tab;
        const restore = () => {
          if (activeWorkspace && w.gZenWorkspaces.activeWorkspace !== activeWorkspace) {
            w.gZenWorkspaces.changeWorkspaceWithID(activeWorkspace).catch(() => {});
          }
        };
        Promise.resolve().then(restore);
        w.setTimeout(restore, 0);
        return true;
      }

      if (tabWorkspace && tabWorkspace !== activeWorkspace) {
        await w.gZenWorkspaces.changeWorkspaceWithID(tabWorkspace);
      }

      w.gBrowser.selectedTab = tab;
      return true;
    }

    // -----------------------------------------------------------------------
    // Tab preview highlight
    // -----------------------------------------------------------------------

    let previewedTab = null;
    let savedScrollPositions = null; // Map<scrollbox, scrollTop>
    let restoreRAF = null;

    function applyPreview(tab) {
      if (restoreRAF) {
        const w = getWin();
        if (w) w.cancelAnimationFrame(restoreRAF);
        restoreRAF = null;
      }
      if (previewedTab && previewedTab !== tab) {
        previewedTab.removeAttribute("zen-tabs-panel-preview");
      }
      if (!savedScrollPositions) {
        savedScrollPositions = new Map();
        const w = getWin();
        if (w) {
          for (const asb of w.document.querySelectorAll(".workspace-arrowscrollbox")) {
            if (asb.scrollbox) {
              savedScrollPositions.set(asb.scrollbox, asb.scrollbox.scrollTop);
            }
          }
        }
      }
      tab.setAttribute("zen-tabs-panel-preview", "true");
      previewedTab = tab;
      tab.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    function clearPreviewState() {
      if (previewedTab) {
        previewedTab.removeAttribute("zen-tabs-panel-preview");
        previewedTab = null;
      }
      if (savedScrollPositions) {
        const positions = savedScrollPositions;
        savedScrollPositions = null;
        const restore = () => {
          for (const [scrollbox, scrollTop] of positions) {
            scrollbox.scrollTo({ top: scrollTop, behavior: "instant" });
          }
        };
        restore();
        const w = getWin();
        if (w) {
          restoreRAF = w.requestAnimationFrame(() => {
            restoreRAF = w.requestAnimationFrame(() => {
              restore();
              restoreRAF = null;
            });
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // Palette overlay
    // -----------------------------------------------------------------------

    const OVERLAY_ID = "zen-tabs-panel-overlay";
    const PANEL_ID = "zen-tabs-panel-panel";

    let pendingView = null;

    function getPaletteURL() {
      const isDark = getWin()?.document?.documentElement?.getAttribute("zen-should-be-dark-mode") === "true";
      let url = context.extension.getURL("popup/popup.html") + "?theme=" + (isDark ? "dark" : "light");
      if (pendingView) url += "&view=" + encodeURIComponent(pendingView);
      return url;
    }

    function createOverlay() {
      const w = getWin();
      if (!w) return null;

      if (w.document.getElementById(OVERLAY_ID)) return null;

      // Inject animation styles into chrome if not already present
      if (!w.document.getElementById("zen-tabs-panel-anim-styles")) {
        const animStyle = w.document.createElement("style");
        animStyle.id = "zen-tabs-panel-anim-styles";
        animStyle.textContent = `
          @keyframes ztt-overlay-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes ztt-panel-in {
            from { opacity: 0; transform: scale(0.96) translateY(-8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes ztt-overlay-out {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          @keyframes ztt-panel-out {
            from { opacity: 1; transform: scale(1) translateY(0); }
            to { opacity: 0; transform: scale(0.96) translateY(-8px); }
          }
        `;
        w.document.documentElement.appendChild(animStyle);
      }

      if (!w.document.getElementById("zen-tabs-panel-preview-styles")) {
        const previewStyle = w.document.createElement("style");
        previewStyle.id = "zen-tabs-panel-preview-styles";
        previewStyle.textContent = `
          .tabbrowser-tab[zen-tabs-panel-preview] .tab-stack {
            outline: 3px solid color-mix(in srgb, var(--zen-primary-color, AccentColor), white 60%) !important;
            outline-offset: -3px;
            border-radius: 10px;
          }
        `;
        w.document.documentElement.appendChild(previewStyle);
      }

      const overlay = w.document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.style.cssText = [
        "position: fixed",
        "top: 0",
        "left: 0",
        "width: 100%",
        "height: 100%",
        "z-index: 99999",
        "display: flex",
        "align-items: center",
        "justify-content: center",
        "background: rgba(0, 0, 0, 0.18)",
        "animation: ztt-overlay-in 0.15s ease-out",
      ].join(";");

      const panel = w.document.createElement("div");
      panel.id = PANEL_ID;
      panel.style.cssText = [
        "width: 960px",
        "max-height: 576px",
        "background: var(--arrowpanel-background, light-dark(rgb(244, 244, 244), rgb(31, 31, 31)))",
        "border-radius: 22px",
        "border: 1px solid var(--zen-colors-border, light-dark(rgba(35,44,70,0.12), rgba(255,255,255,0.08)))",
        "box-shadow: 0 22px 70px rgba(0, 0, 0, 0.32)",
        "overflow: hidden",
        "display: flex",
        "flex-direction: column",
        "animation: ztt-panel-in 0.15s ease-out",
      ].join(";");

      const br = w.document.createXULElement("browser");
      br.id = "zen-tabs-panel-browser";
      br.setAttribute("type", "content");
      br.setAttribute("remote", "true");
      br.setAttribute("maychangeremoteness", "true");
      br.setAttribute("disableglobalhistory", "true");
      br.setAttribute("messagemanagergroup", "webext-browsers");
      br.setAttribute("webextension-view-type", "popup");
      br.setAttribute("transparent", "true");
      br.setAttribute("src", getPaletteURL());
      br.style.cssText = "width:960px;height:576px;border:none";

      panel.appendChild(br);
      overlay.appendChild(panel);

      overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) {
          destroyOverlay();
        }
      });

      w.document.documentElement.appendChild(overlay);

      w.setTimeout(() => {
        br.focus();
      }, 50);

      return overlay;
    }

    function destroyOverlay() {
      clearPreviewState();
      const w = getWin();
      if (!w) return;
      const overlay = w.document.getElementById(OVERLAY_ID);
      if (!overlay || overlay.dataset.closing) return;

      overlay.dataset.closing = "true";
      const panel = w.document.getElementById(PANEL_ID);
      overlay.style.animation = "ztt-overlay-out 0.12s ease-in forwards";
      if (panel) panel.style.animation = "ztt-panel-out 0.12s ease-in forwards";

      overlay.addEventListener("animationend", () => overlay.remove(), { once: true });
    }

    function isOverlayOpen() {
      const w = getWin();
      if (!w) return false;
      const overlay = w.document.getElementById(OVERLAY_ID);
      // Not open if it's animating out
      return overlay && !overlay.dataset.closing;
    }

    // -----------------------------------------------------------------------
    // Ctrl+Tab switcher: recent tabs across all workspaces, with previews.
    // Quick Ctrl+Tab = previous tab. Hold Ctrl = show panel, Tab cycles,
    // releasing Ctrl switches. Esc cancels.
    // -----------------------------------------------------------------------

    const SWITCHER_ID = "zen-tabs-panel-switcher";
    const SWITCHER_MAX_TABS = 8;
    const SWITCHER_SHOW_DELAY_MS = 200;
    const THUMB_WIDTH = 220;
    const THUMB_HEIGHT = 138;

    let pageThumbs = null;
    const thumbCache = new WeakMap(); // tab element -> data URL
    let switcher = null; // { tabs, index, shown, showTimer, cards }
    let switcherListeners = null;

    function getPageThumbs() {
      if (pageThumbs) return pageThumbs;
      try {
        pageThumbs = ChromeUtils.importESModule("resource://gre/modules/PageThumbs.sys.mjs").PageThumbs;
      } catch (e) {
        pageThumbs = null;
      }
      return pageThumbs;
    }

    async function captureThumb(tab) {
      const w = getWin();
      const thumbs = getPageThumbs();
      const browser = tab?.linkedBrowser;
      if (!w || !thumbs || !browser || !tab.isConnected || tab.closing || tab.hasAttribute("pending")) return null;
      try {
        const scale = w.devicePixelRatio || 1;
        const canvas = w.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
        canvas.width = Math.round(THUMB_WIDTH * scale);
        canvas.height = Math.round(THUMB_HEIGHT * scale);
        await thumbs.captureToCanvas(browser, canvas);
        const url = canvas.toDataURL("image/jpeg", 0.85);
        thumbCache.set(tab, url);
        return url;
      } catch (e) {
        return null;
      }
    }

    function getSwitcherTabs() {
      const w = getWin();
      const current = w?.gBrowser?.selectedTab;
      const alive = (t) => t && t.isConnected && !t.closing && !isZenEmptyTab(t);
      flushTabHistory();
      const fromHistory = tabHistory.filter((t) => alive(t) && t !== current);
      const rest = getAllTabElements()
        .filter((t) => alive(t) && t !== current && !fromHistory.includes(t))
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      return [current, ...fromHistory, ...rest].filter(alive).slice(0, SWITCHER_MAX_TABS);
    }

    function getWorkspaceNameMap() {
      const w = getWin();
      const map = new Map();
      try {
        for (const ws of w.gZenWorkspaces.getWorkspaces() || []) map.set(ws.uuid, ws.name || "");
      } catch (e) {}
      return map;
    }

    function setThumbImage(card, url) {
      if (!card || !url) return;
      card.thumb.replaceChildren();
      const img = card.thumb.ownerDocument.createElement("img");
      img.src = url;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
      card.thumb.appendChild(img);
    }

    function updateSwitcherSelection() {
      if (!switcher?.cards) return;
      switcher.cards.forEach((card, i) => {
        const selected = i === switcher.index;
        card.root.style.borderColor = selected ? "var(--zen-primary-color, AccentColor)" : "transparent";
        card.root.style.background = selected
          ? "color-mix(in srgb, var(--zen-primary-color, AccentColor) 16%, transparent)"
          : "transparent";
      });
    }

    function renderSwitcher() {
      const w = getWin();
      if (!w || !switcher) return;
      const doc = w.document;
      doc.getElementById(SWITCHER_ID)?.remove();

      const root = doc.createElement("div");
      root.id = SWITCHER_ID;
      root.style.cssText = [
        "position: fixed", "inset: 0", "z-index: 99999",
        "display: flex", "align-items: center", "justify-content: center",
        "pointer-events: none",
      ].join(";");

      const panel = doc.createElement("div");
      panel.style.cssText = [
        "pointer-events: auto",
        "display: flex", "flex-wrap: wrap", "justify-content: center", "gap: 10px",
        "max-width: 90vw", "padding: 14px",
        "background: var(--arrowpanel-background, light-dark(rgb(244, 244, 244), rgb(31, 31, 31)))",
        "color: var(--arrowpanel-color, light-dark(rgb(21, 20, 26), rgb(251, 251, 254)))",
        "border: 1px solid var(--zen-colors-border, light-dark(rgba(35,44,70,0.12), rgba(255,255,255,0.08)))",
        "border-radius: 16px",
        "box-shadow: 0 22px 70px rgba(0, 0, 0, 0.32)",
        "font: menu", "font-size: 12px",
      ].join(";");

      const names = getWorkspaceNameMap();
      switcher.cards = switcher.tabs.map((tab, i) => {
        const card = doc.createElement("div");
        card.style.cssText = [
          `width: ${THUMB_WIDTH}px`, "padding: 6px", "border-radius: 10px",
          "border: 2px solid transparent", "cursor: default",
          "display: flex", "flex-direction: column", "gap: 5px",
        ].join(";");

        const thumb = doc.createElement("div");
        thumb.style.cssText = [
          `width: ${THUMB_WIDTH}px`, `height: ${THUMB_HEIGHT}px`, "border-radius: 6px", "overflow: hidden",
          "display: flex", "align-items: center", "justify-content: center",
          "background: color-mix(in srgb, currentColor 8%, transparent)",
        ].join(";");

        const favUrl = unwrapFavicon(tab.image);
        if (favUrl) {
          const bigIcon = doc.createElement("img");
          bigIcon.src = favUrl;
          bigIcon.style.cssText = "width:32px;height:32px;opacity:0.7";
          thumb.appendChild(bigIcon);
        }

        const titleRow = doc.createElement("div");
        titleRow.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0";
        if (favUrl) {
          const icon = doc.createElement("img");
          icon.src = favUrl;
          icon.style.cssText = "width:16px;height:16px;flex:none";
          titleRow.appendChild(icon);
        }
        const title = doc.createElement("span");
        title.textContent = getDisplayedTabTitle(tab) || tab.linkedBrowser?.currentURI?.spec || "";
        title.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        titleRow.appendChild(title);

        const wsLabel = doc.createElement("div");
        wsLabel.textContent = tab.hasAttribute("zen-essential")
          ? "Essential"
          : names.get(tab.getAttribute("zen-workspace-id")) || "";
        wsLabel.style.cssText = "font-size:11px;opacity:0.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

        card.append(thumb, titleRow, wsLabel);
        card.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!switcher) return;
          switcher.index = i;
          commitSwitcher();
        });
        panel.appendChild(card);

        const entry = { root: card, thumb, tab };
        const cached = thumbCache.get(tab);
        if (cached) setThumbImage(entry, cached);
        return entry;
      });

      root.appendChild(panel);
      doc.documentElement.appendChild(root);
      updateSwitcherSelection();

      // Refresh previews: the current tab always, others only when missing.
      const current = w.gBrowser.selectedTab;
      for (const card of switcher.cards) {
        if (card.tab !== current && thumbCache.has(card.tab)) continue;
        captureThumb(card.tab).then((url) => {
          if (switcher?.cards?.includes(card)) setThumbImage(card, url);
        });
      }
    }

    function showSwitcher() {
      const w = getWin();
      if (!switcher || switcher.shown) return;
      if (switcher.showTimer !== null) w?.clearTimeout(switcher.showTimer);
      switcher.showTimer = null;
      switcher.shown = true;
      renderSwitcher();
    }

    function closeSwitcher() {
      const w = getWin();
      if (switcher?.showTimer != null) w?.clearTimeout(switcher.showTimer);
      switcher = null;
      w?.document.getElementById(SWITCHER_ID)?.remove();
    }

    function commitSwitcher() {
      const target = switcher?.tabs[switcher.index];
      closeSwitcher();
      const w = getWin();
      if (!w || !target || !target.isConnected || target.closing || target === w.gBrowser.selectedTab) return;
      activateNativeTab(target).catch(() => {});
    }

    function moveSwitcher(step) {
      if (!switcher) return;
      const len = switcher.tabs.length;
      switcher.index = (switcher.index + step + len) % len;
      if (!switcher.shown) showSwitcher();
      else updateSwitcherSelection();
    }

    function openSwitcher(reverse) {
      const w = getWin();
      const tabs = getSwitcherTabs();
      // When the current tab is Zen's empty tab it is left out of the list,
      // so the first card is already the previous tab.
      const firstIndex = tabs[0] === w?.gBrowser?.selectedTab ? 1 : 0;
      if (!w || tabs.length <= firstIndex) return;
      switcher = {
        tabs,
        index: reverse ? tabs.length - 1 : Math.min(firstIndex, tabs.length - 1),
        shown: false,
        showTimer: w.setTimeout(showSwitcher, SWITCHER_SHOW_DELAY_MS),
        cards: null,
      };
    }

    function installCtrlTabSwitcher() {
      const w = getWin();
      if (!w || switcherListeners) return;

      const stop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };

      const onKeyDown = (event) => {
        const isCtrlTab = event.key === "Tab" && event.ctrlKey && !event.altKey && !event.metaKey;
        if (isCtrlTab) {
          if (isOverlayOpen()) return;
          stop(event);
          if (!switcher) openSwitcher(event.shiftKey);
          else moveSwitcher(event.shiftKey ? -1 : 1);
          return;
        }
        if (!switcher) return;
        if (event.key === "Escape") {
          stop(event);
          closeSwitcher();
        } else if (event.key === "Enter") {
          stop(event);
          commitSwitcher();
        } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          stop(event);
          moveSwitcher(event.key === "ArrowRight" ? 1 : -1);
        }
      };

      const onKeyUp = (event) => {
        if (switcher && event.key === "Control") commitSwitcher();
      };

      // Window lost focus while Ctrl was held: no keyup will come, so cancel.
      const onBlur = (event) => {
        if (switcher && event.target === w) closeSwitcher();
      };

      w.addEventListener("keydown", onKeyDown, true);
      w.addEventListener("keyup", onKeyUp, true);
      w.addEventListener("blur", onBlur);
      switcherListeners = { w, onKeyDown, onKeyUp, onBlur };
    }

    function uninstallCtrlTabSwitcher() {
      closeSwitcher();
      if (!switcherListeners) return;
      const { w, onKeyDown, onKeyUp, onBlur } = switcherListeners;
      try {
        w.removeEventListener("keydown", onKeyDown, true);
        w.removeEventListener("keyup", onKeyUp, true);
        w.removeEventListener("blur", onBlur);
      } catch (e) {}
      switcherListeners = null;
    }

    installCtrlTabSwitcher();

    return {
      zenWorkspaces: {
        async getAll() {
          const w = getWin();
          if (!w || !w.gZenWorkspaces) return [];
          return w.gZenWorkspaces.getWorkspaces();
        },

        async getActiveWorkspaceId() {
          const w = getWin();
          if (!w || !w.gZenWorkspaces) return null;
          return w.gZenWorkspaces.activeWorkspace;
        },

        async getTabWorkspaceId(tabId) {
          try {
            const nativeTab = context.extension.tabManager.get(tabId)?.nativeTab;
            if (!nativeTab) return null;
            return nativeTab.getAttribute("zen-workspace-id") || null;
          } catch (e) {
            return null;
          }
        },

        async switchTo(uuid) {
          const w = getWin();
          if (!w || !w.gZenWorkspaces) return;
          await w.gZenWorkspaces.changeWorkspaceWithID(uuid);
        },

        async activateTabByDomId(domId) {
          const tab = findTabByDomId(domId);
          if (!tab) return false;
          return activateNativeTab(tab);
        },

        // Go to previous tab using lastAccessed, filtering out the current
        // tab and any tabs visible in split view.
        async goToPreviousTab() {
          const w = getWin();
          if (!w || !w.gBrowser || !w.gZenWorkspaces) return false;

          const allTabs = getAllTabElements();
          const currentTab = w.gBrowser.selectedTab;
          const currentDomId = currentTab?.id;

          // Collect DOM IDs of tabs currently visible to the user
          const visibleDomIds = new Set();
          if (currentDomId) visibleDomIds.add(currentDomId);

          // If current tab is in a split view, find its sibling tabs
          if (w.gZenViewSplitter?._data) {
            const currentGroup = w.gZenViewSplitter._data.find(
              (g) => g.tabs && g.tabs.some((t) => t.id === currentDomId)
            );
            if (currentGroup) {
              for (const tab of currentGroup.tabs) {
                visibleDomIds.add(tab.id);
              }
            }
          }

          // Prefer our own history: lastAccessed gets bumped when Zen
          // switches workspaces on its own (e.g. around Essential tabs).
          flushTabHistory();
          const fromHistory = tabHistory.find(
            (t) => t.isConnected && !t.closing && !visibleDomIds.has(t.id) && !isZenEmptyTab(t)
          );
          if (fromHistory) return activateNativeTab(fromHistory);

          // Fallback: sort by lastAccessed descending, filter out visible and unread tabs
          const candidates = allTabs
            .filter((t) => !visibleDomIds.has(t.id) && !t.hasAttribute("unread") && !isZenEmptyTab(t))
            .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

          if (candidates.length === 0) return false;

          return activateNativeTab(candidates[0]);
        },

        async goToParentTab() {
          const w = getWin();
          if (!w || !w.gBrowser || !w.gZenWorkspaces) return false;

          const currentTab = w.gBrowser.selectedTab;
          if (!currentTab || !currentTab.openerTab) return false;

          return activateNativeTab(currentTab.openerTab);
        },

        // Close a tab by DOM id — works cross-workspace.
        async closeTabByDomId(domId) {
          const w = getWin();
          if (!w || !w.gBrowser) return false;

          const tab = findTabByDomId(domId);
          if (!tab) return false;

          // Never close pinned tabs (includes Essentials)
          if (tab.pinned) return false;

          w.gBrowser.removeTab(tab);
          scheduleDuplicateSync();
          return true;
        },

        // Get ALL tabs across ALL workspaces.
        async getAllTabs() {
          ensureTabTracking();
          try { recordFocusInterval(); } catch (e) {}

          const tabElements = getAllTabElements();
          const w = getWin();
          const results = [];

          // Build a map of tab DOM ID → split group ID
          const tabToGroupId = new Map();
          if (w?.gZenViewSplitter?._data) {
            for (const group of w.gZenViewSplitter._data) {
              if (group.tabs) {
                for (const tab of group.tabs) {
                  tabToGroupId.set(tab.id, group.groupId);
                }
              }
            }
          }

          for (const tab of tabElements) {
            const extId = getExtTabId(tab);
            const panelStats = readTabStats(tab);

            results.push({
              id: extId,
              domId: tab.id,
              title: getDisplayedTabTitle(tab),
              url: tab.linkedBrowser?.currentURI?.spec || "",
              workspaceId: tab.getAttribute("zen-workspace-id") || null,
              pinned: tab.pinned || false,
              active: tab.selected || false,
              lastAccessed: tab.lastAccessed || 0,
              favIconUrl: unwrapFavicon(tab.image),
              unread: tab.hasAttribute("unread"),
              openerTabDomId: tab.openerTab?.id || null,
              splitView: tab.hasAttribute("split-view"),
              splitGroupId: tabToGroupId.get(tab.id) || null,
              panelStats,
              focusCount: panelStats.focusCount || 0,
            });
          }
          return results;
        },

        async initTabTracking() {
          ensureTabTracking();
          return true;
        },

        // ---------------------------------------------------------------
        // Companion mod management
        // ---------------------------------------------------------------

        async getCompanionMods() {
          const w = getWin();
          const installedMods = (w && w.gZenMods) ? await w.gZenMods.getMods() : {};
          const result = [];
          for (const [id, def] of Object.entries(COMPANION_MODS)) {
            const installed = installedMods[id];
            result.push({
              id,
              name: def.name,
              description: def.description,
              installed: !!installed,
              installedVersion: installed?.version || null,
              latestVersion: def.version,
            });
          }
          return result;
        },

        async installCompanionMod(modId) {
          const def = COMPANION_MODS[modId];
          if (!def) return { success: false };

          const w = getWin();
          if (!w || !w.gZenMods) return { success: false };

          try {
            const { PathUtils, IOUtils } = w;

            const modFolder = PathUtils.join(w.gZenMods.modsRootPath, modId);
            await IOUtils.makeDirectory(modFolder, { ignoreExisting: true });
            await IOUtils.write(
              PathUtils.join(modFolder, "chrome.css"),
              new w.TextEncoder().encode(def.css)
            );

            const mods = await w.gZenMods.getMods();
            mods[modId] = {
              id: modId,
              name: "Zen Tabs Panel — " + def.name,
              description: def.description,
              author: "c13v",
              version: def.version,
              enabled: true,
            };
            await IOUtils.writeJSON(w.gZenMods.modsDataFile, mods);
            w.gZenMods.triggerModsUpdate();
            return { success: true };
          } catch (e) {
            console.error("[ZenTabsPanel] Failed to install mod " + modId + ":", e);
            return { success: false };
          }
        },

        async removeCompanionMod(modId) {
          const w = getWin();
          if (!w || !w.gZenMods) return { success: false };

          try {
            const { PathUtils, IOUtils } = w;

            const modFolder = PathUtils.join(w.gZenMods.modsRootPath, modId);
            await IOUtils.remove(modFolder, { recursive: true, ignoreAbsent: true });

            const mods = await w.gZenMods.getMods();
            delete mods[modId];
            await IOUtils.writeJSON(w.gZenMods.modsDataFile, mods);
            w.gZenMods.triggerModsUpdate();
            return { success: true };
          } catch (e) {
            console.error("[ZenTabsPanel] Failed to remove mod " + modId + ":", e);
            return { success: false };
          }
        },

        // Get DOM IDs of multiselected tabs (excludes essentials)
        async getSelectedTabDomIds() {
          const w = getWin();
          if (!w || !w.gBrowser) return [];
          return w.gBrowser.selectedTabs
            .filter(t => !t.hasAttribute("zen-essential"))
            .map(t => t.id);
        },

        async getSelectedTabUrls() {
          const w = getWin();
          if (!w || !w.gBrowser) return [];
          return w.gBrowser.selectedTabs
            .filter(t => !t.hasAttribute("zen-essential"))
            .map(t => t.linkedBrowser?.currentURI?.spec || "")
            .filter(url => url !== "");
        },

        async syncDuplicates() {
          scheduleDuplicateSync();
        },

        async getTabInfo(domId) {
          const w = getWin();
          if (!w || !w.gBrowser) return null;
          const tab = findTabByDomId(domId);
          if (!tab) return null;

          const url = tab.linkedBrowser?.currentURI?.spec || "";

          // Session history
          let sessionEntries = [];
          try {
            const state = JSON.parse(w.SessionStore.getTabState(tab));
            sessionEntries = (state.entries || []).map(e => ({
              url: e.url || "",
              title: e.title || "",
            }));
          } catch (e) {}

          // Memory and CPU via ChromeUtils.requestProcInfo
          let memory = null;
          let cpuTime = null;
          try {
            const outerWindowID = tab.linkedBrowser?.outerWindowID;
            if (outerWindowID) {
              const info = await ChromeUtils.requestProcInfo();
              for (const child of info.children) {
                for (const win of (child.windows || [])) {
                  if (win.outerWindowId === outerWindowID) {
                    memory = child.memory;
                    cpuTime = child.cpuTime;
                    break;
                  }
                }
                if (memory !== null) break;
              }
            }
          } catch (e) {}

          // Duplicates (includes self)
          const allTabs = getAllTabElements();
          const duplicateDomIds = allTabs
            .filter(t => (t.linkedBrowser?.currentURI?.spec || "") === url)
            .map(t => t.id);

          return {
            domId,
            title: getDisplayedTabTitle(tab),
            url,
            favIconUrl: unwrapFavicon(tab.image),
            pinned: tab.pinned || false,
            workspaceId: tab.getAttribute("zen-workspace-id") || null,
            lastAccessed: tab.lastAccessed || 0,
            status: tab.hasAttribute("pending") ? "unloaded" : "loaded",
            sessionEntries,
            memory,
            cpuTime,
            duplicateDomIds,
          };
        },

        async getEssentialTabIds() {
          const w = getWin();
          if (!w || !w.gBrowser) return [];
          return Array.from(w.document.querySelectorAll('.tabbrowser-tab[zen-essential]'))
            .map(t => {
              try { return context.extension.tabManager.getWrapper(t)?.id ?? null; } catch (e) { return null; }
            })
            .filter(id => id !== null);
        },

        async getNavigationHistory() {
          const w = getWin();
          if (!w || !w.gBrowser) return null;
          const tab = w.gBrowser.selectedTab;
          if (!tab) return null;
          try {
            const sh = tab.linkedBrowser.browsingContext?.sessionHistory;
            if (!sh) return null;
            const entries = [];
            for (let i = 0; i < sh.count; i++) {
              const entry = sh.getEntryAtIndex(i);
              entries.push({
                url: entry.URI?.spec || "",
                title: entry.title || "",
              });
            }
            return { entries, index: sh.index };
          } catch (e) {
            return null;
          }
        },

        async navigateToHistoryIndex(index) {
          const w = getWin();
          if (!w || !w.gBrowser) return;
          w.gBrowser.gotoIndex(index);
        },

        async scrollCurrentTabIntoView() {
          const w = getWin();
          if (!w || !w.gBrowser) return false;
          const tab = w.gBrowser.selectedTab;
          if (!tab) return false;
          tab.scrollIntoView({ block: "center", behavior: "smooth" });
          return true;
        },

        async previewTab(domId) {
          const tab = findTabByDomId(domId);
          if (!tab) return false;
          applyPreview(tab);
          return true;
        },

        async clearPreview() {
          clearPreviewState();
        },

        // Get workspaces with inline SVG icon content
        async getWorkspacesWithIcons() {
          const w = getWin();
          if (!w || !w.gZenWorkspaces) return [];
          const workspaces = w.gZenWorkspaces.getWorkspaces();
          const activeId = w.gZenWorkspaces.activeWorkspace;
          const results = [];
          for (const ws of workspaces) {
            const { svgContent, iconText } = await getWorkspaceIconData(ws);
            results.push({ uuid: ws.uuid, name: ws.name, svgContent, iconText, isActive: ws.uuid === activeId });
          }
          return results;
        },

        // Move gBrowser.selectedTabs to the given workspace, placed at top
        async moveSelectedTabsToWorkspace(workspaceId) {
          const w = getWin();
          if (!w || !w.gBrowser || !w.gZenWorkspaces) return;

          const tabs = w.gBrowser.selectedTabs.filter(t => !t.hasAttribute("zen-essential"));
          if (tabs.length === 0) return;

          // If the active tab is being moved, activate the previous tab first
          const activeTab = w.gBrowser.selectedTab;
          const movingActive = tabs.some(t => t === activeTab);

          if (movingActive) {
            // Reuse goToPreviousTab logic: find the most recently accessed non-visible tab
            const allTabs = getAllTabElements();
            const visibleDomIds = new Set();
            visibleDomIds.add(activeTab.id);
            if (w.gZenViewSplitter?._data) {
              const currentGroup = w.gZenViewSplitter._data.find(
                (g) => g.tabs && g.tabs.some((t) => t.id === activeTab.id)
              );
              if (currentGroup) {
                for (const tab of currentGroup.tabs) {
                  visibleDomIds.add(tab.id);
                }
              }
            }
            // Also exclude all tabs being moved
            for (const t of tabs) visibleDomIds.add(t.id);

            const candidates = allTabs
              .filter((t) => !visibleDomIds.has(t.id))
              .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
            if (candidates.length > 0) {
              await activateNativeTab(candidates[0]);
            }
          }

          // Use Zen's built-in moveTabsToWorkspace to handle all the
          // internal bookkeeping (split views, glance tabs, containers,
          // cached tab invalidation, etc.), then reorder to top.
          await w.gZenWorkspaces.moveTabsToWorkspace(tabs, workspaceId);

          // Move each tab to the top of its container (unpinned section).
          // moveTabsToWorkspace places them at the end — we want the top.
          // The tabs are now in the target workspace's DOM area. Access
          // the container from the tab element's parentNode.
          // Reverse iterate so the original order is preserved at the top.
          for (let i = tabs.length - 1; i >= 0; i--) {
            const tab = tabs[i];
            const container = tab.parentNode;
            if (!container) continue;
            // Find the first unpinned tab in this container as insertion point
            const firstUnpinned = Array.from(container.children).find(
              t => t.matches && t.matches(".tabbrowser-tab") && !t.pinned
            );
            if (firstUnpinned && firstUnpinned !== tab) {
              container.insertBefore(tab, firstUnpinned);
            }
          }
        },

        async reorderTabsByDomIds(domIds) {
          const w = getWin();
          if (!w || !w.document || !Array.isArray(domIds) || domIds.length <= 1) return false;

          const tabs = domIds
            .map((domId) => findTabByDomId(domId))
            .filter((tab) => tab && !tab.hasAttribute("zen-essential"));
          if (tabs.length <= 1) return false;

          const parent = tabs[0].parentNode;
          if (!parent) return false;
          if (tabs.some((tab) => tab.parentNode !== parent)) return false;

          const children = Array.from(parent.children);
          const tabSet = new Set(tabs);
          const firstIndex = children.findIndex((child) => tabSet.has(child));
          if (firstIndex < 0) return false;

          const marker = w.document.createComment("zen-tabs-panel-reorder");
          parent.insertBefore(marker, children[firstIndex]);

          const fragment = w.document.createDocumentFragment();
          for (const tab of tabs) {
            fragment.appendChild(tab);
          }

          parent.insertBefore(fragment, marker.nextSibling);
          marker.remove();
          return true;
        },

        // Palette management
        async showPalette(view) {
          if (isOverlayOpen()) {
            if (view) {
              const w = getWin();
              const browserEl = w?.document.getElementById("zen-tabs-panel-browser");
              if (browserEl) {
                clearPreviewState();
                pendingView = view;
                browserEl.setAttribute("src", getPaletteURL());
                pendingView = null;
                w.setTimeout(() => browserEl.focus(), 50);
                return true;
              }
            }
            destroyOverlay();
            return false;
          }
          pendingView = view || null;
          createOverlay();
          pendingView = null;
          return true;
        },

        async hidePalette() {
          destroyOverlay();
        },

      },
    };
  }
};
