# Zen Tabs Panel Jerry Journal

這份 journal 用來紀錄本專案的重要歷史、決策、版本、打包產物與 Git 狀態。之後如果忘記「為什麼這樣改」，先查這份檔案。

最後更新：2026-05-16 18:21 +08:00

## 快速索引

| 主題 | 目前狀態 |
|---|---|
| 上游專案 | `cfilipov/zen-tabs-panel` |
| 我的 GitHub | `jerrere/zen-tabs-panel-jerry` |
| 本地主要工作分支 | `jerry-previous-tab-shortcut` |
| 已推送版本 | `v0.3.1-previous-tab` |
| 本機試用版 | `0.3.1-ui-restore`，尚未 commit / push |
| 主要需求 | 保留原作者 v0.3.0 UI/互動，同時保留獨立 Previous Tab 可設定快捷鍵 |

## Remote 設定

```text
origin   https://github.com/jerrere/zen-tabs-panel-jerry.git
upstream https://github.com/cfilipov/zen-tabs-panel.git
```

約定：

- `origin` 是自己的 GitHub repo，用來保存自己的版本。
- `upstream` 是原作者 repo，用來追蹤原作者更新。

## 版本紀錄

### 2026-05-16 - 研究 0.3.0 為什麼只剩一個快捷鍵

問題：

- `v0.2.0` 在 `about:addons > Manage Extension Shortcuts` 有很多可設定快捷鍵。
- `v0.3.0` 只剩 `Open tab actions palette`。

查到的原因：

- 原作者在 commit `0145932 Remove global shortcuts, use chord-based navigation only` 移除了大多數 global `commands`。
- `v0.3.0` 的 `manifest.json` 只保留 `open-palette`。
- 其他動作改成 palette 內單鍵或 leader-key chord，例如 `Ctrl+Cmd+. P`。

Windows 補充：

- Windows 沒有 `Cmd`。
- 建議把 open palette 設成 `Ctrl+Alt+.`，再按 `P` 等單鍵。

### 2026-05-16 - `0.3.1 previous-tab` 修改版

需求：

- 把 `Previous tab` 獨立出來，重新出現在 `about:addons > Manage Extension Shortcuts`。
- 保留原本 palette/chord 功能。

主要修改：

- `manifest.json`
  - 新增 command：`go-to-previous-tab`
  - Windows/Linux 預設：`Ctrl+Alt+P`
  - macOS 預設：`MacCtrl+Command+P`
- `background.js`
  - `browser.commands.onCommand` 收到 `go-to-previous-tab` 時直接呼叫 `api.goToPreviousTab()`。
- `README.md`
  - 註明這個 fork 恢復獨立 Previous Tab shortcut。
- `package.json` / `manifest.json`
  - 版本 bump 到 `0.3.1`。

Git 狀態：

```text
branch: jerry-previous-tab-shortcut
commit: 195cca6 Restore configurable previous tab shortcut
tag:    v0.3.1-previous-tab
```

已推送到 GitHub：

```text
origin/main                       -> 195cca6
origin/jerry-previous-tab-shortcut -> 195cca6
tag v0.3.1-previous-tab            -> 195cca6
```

打包產物：

```text
zen-tabs-panel-0.3.1-previous-tab.xpi
```

注意事項：

- 第一次打包時，Windows zip 內部路徑用了反斜線 `\`，Zen/Firefox 判定 XPI 損毀。
- 後來改成強制 zip entry 使用 `/` 正斜線。
- 安裝 XPI 時應使用 `about:addons > Install Add-on From File...`，不要只靠雙擊。

### 2026-05-16 - GitHub / fork / private 設定

建立 repo：

```text
https://github.com/jerrere/zen-tabs-panel-jerry
```

重要觀念：

- public fork 不能直接改成 private。
- 如果要 private，需要離開 fork network，或另外建立 private repo 再推上去。

目前採用：

- `jerrere/zen-tabs-panel-jerry` 作為自己的 GitHub repo。
- 本地 `origin` 已經改成 `jerrere/zen-tabs-panel-jerry`。
- 原作者 repo 保留為 `upstream`。

### 2026-05-16 - `0.3.1-ui-restore` 本機試用版

需求：

- 完全回到原作者 `cfilipov/zen-tabs-panel` 的 `v0.3.0` UI 版面。
- 包含所有子頁面/子選單。
- 保留原本互動：
  - hover preview/highlight
  - 鍵盤上下選取
  - 單鍵 hotkey
  - workspace footer
  - footer QWERTY workspace filtering
- 保留獨立 `Previous tab` 可設定快捷鍵。
- 修正 `0.3.1` 開 palette 有延遲的問題，回到 `v0.3.0` 立即顯示 palette 的方式。
- 先重新打包 XPI 試用，不推送 GitHub。

實作方式：

- 將下列 runtime/UI 檔案還原為 `v0.3.0` 基準：
  - `popup/popup.html`
  - `popup/popup.css`
  - `popup/popup.js`
  - `experiment/api.js`
  - `experiment/schema.json`
  - `options/options.html`
  - `options/options.js`
  - `welcome/welcome.html`
  - `welcome/welcome.js`
  - `Makefile`
- 只重新套用必要差異：
  - `manifest.json`
  - `background.js`
  - `README.md`
  - `package.json`

版本注意：

- Firefox/Zen 的 `manifest.json` 裡 `version` 不能寫 `0.3.1-ui-restore`。
- WebExtension version 必須是 1 到 4 段數字。
- 因此目前使用：

```json
{
  "version": "0.3.1.1",
  "version_name": "0.3.1-ui-restore"
}
```

快捷鍵：

```text
Open palette
Windows/Linux: Ctrl+Alt+.
macOS:         Ctrl+Cmd+.

Go to previous tab
Windows/Linux: Ctrl+Alt+P
macOS:         Ctrl+Cmd+P
```

打包產物：

```text
zen-tabs-panel-0.3.1-ui-restore.xpi
```

驗證：

- `manifest.json` / `package.json` JSON parse OK。
- `manifest.version` 符合 Firefox 數字格式。
- `background.js` 語法檢查 OK。
- `popup/popup.js` 語法檢查 OK。
- 現有 Node tests：18 passed。
- XPI 內部確認：
  - `manifest.json` 在 root。
  - entry path 使用 `/`。
  - 沒有 `\` 反斜線 entry。

目前 Git 狀態：

- `0.3.1-ui-restore` 尚未 commit。
- `0.3.1-ui-restore` 尚未推送 GitHub。
- 先試用 XPI，確認 UI/互動符合需求後再 commit / tag / push。

### 2026-05-16 - `0.3.1-ui-restore-reorder-fix` 本機試用版

問題：

- 安裝 `zen-tabs-panel-0.3.1-ui-restore.xpi` 後，`Reorder tabs` 子選單可以打開。
- 點任一排序項目或用鍵盤按 `1` 到 `9`，palette 會關閉，但 tab 順序不會改變。
- Browser Toolbox 主控台沒有錯誤訊息。
- 其他功能如 `Move to start`、`Move to end`、`Scroll to tab`、`Unload` 正常。

判斷：

- `Reorder tabs` 的 message 有送出，因為 palette 會關閉。
- 原本背景邏輯一次呼叫 `browser.tabs.move(tabs.map((t) => t.id), { index })`。
- 在 Zen/Firefox 中，批次移動多個 tab 可能保留它們原本的相對順序，因此排序結果看起來沒有套用。

修正：

- 在 `background.js` 新增 `moveTabsInOrder(tabs, startIndex)`。
- 改成從排序結果尾端開始，一個一個移到目標 index。
- 這樣最後實際 tab 順序會符合排序後的陣列。
- 同步修正 legacy `sort-tabs-by-recent` 和 `sort-tabs-by-domain` 路徑。

版本：

```json
{
  "version": "0.3.1.2",
  "version_name": "0.3.1-ui-restore-reorder-fix"
}
```

交付：

```text
zen-tabs-panel-0.3.1-ui-restore-reorder-fix.xpi
```

狀態：

- 本機試用版。
- 尚未 commit。
- 尚未 push。

### 2026-05-16 - `0.3.1-ui-restore-reorder-dom-fix` 本機試用版

問題：

- `0.3.1-ui-restore-reorder-fix` 仍然沒有改變 tab 順序。
- 這表示問題不只是批次 `browser.tabs.move`，而是 `browser.tabs.move` 這條 WebExtension 路徑對 Zen 的整批 reorder 不可靠。

修正：

- 在 `experiment/api.js` 新增 `reorderTabsByDomIds(domIds)`。
- 在 `experiment/schema.json` 暴露 `browser.zenWorkspaces.reorderTabsByDomIds()`。
- `background.js` 的 reorder 流程改成：
  - 用 `browser.zenWorkspaces.getAllTabs()` 取得含 DOM id 的 Zen tab 清單。
  - 只篩選目前 active workspace。
  - 依目前動作排序。
  - 呼叫 `browser.zenWorkspaces.reorderTabsByDomIds(sortedDomIds)`。
- `reorderTabsByDomIds()` 在 chrome privileged context 裡直接重排 native tab elements，避免 WebExtension `tabs.move` 被 Zen workspace/sidebar 行為吃掉。

版本：

```json
{
  "version": "0.3.1.3",
  "version_name": "0.3.1-ui-restore-reorder-dom-fix"
}
```

交付：

```text
zen-tabs-panel-0.3.1-ui-restore-reorder-dom-fix.xpi
```

狀態：

- 本機試用版。
- 尚未 commit。
- 尚未 push。

### 2026-05-16 - `0.3.1-ui-restore-title-sort` 本機試用版

需求：

- 在 `Reorder tabs` 子選單加入新的排序功能。
- 顯示名稱：`Title (A-Z)`。
- 放在最後。
- 快捷鍵：`0`。
- 排序依據：Zen 左側 sidebar 顯示的 tab 名稱。
- 如果使用者雙擊自定義名稱，使用自定義名稱。
- 沒有自定義名稱時，用原本 tab 名稱。
- 第一次執行 A-Z，第二次執行同功能切換 Z-A。
- 大小寫不敏感。
- 使用瀏覽器預設 locale。
- 使用自然排序，例如 `tab 2` 在 `tab 10` 前面。
- 空名稱或只有空白的 tab 放最後。
- 只排序目前 workspace。
- pinned / Essential 規則沿用既有 reorder 行為。

修正：

- `popup/popup.js`
  - 在 `showReorderTabs()` 最後新增 `Title (A-Z)` 項目。
  - hotkey 使用 `0`。
  - action 使用 `sort-tabs-title-toggle`。
- `background.js`
  - 新增 `titleSortDescending` 狀態，用來在 A-Z / Z-A 間切換。
  - 使用 `Intl.Collator(undefined, { numeric: true, sensitivity: "base" })` 做自然排序與大小寫不敏感比較。
  - 空白 title 永遠排最後。
  - 仍透過 `browser.zenWorkspaces.reorderTabsByDomIds()` 套用排序。

版本：

```json
{
  "version": "0.3.1.4",
  "version_name": "0.3.1-ui-restore-title-sort"
}
```

交付：

```text
zen-tabs-panel-0.3.1-ui-restore-title-sort.xpi
```

狀態：

- 本機試用版。
- 尚未 commit。
- 尚未 push。

### 2026-05-17 - `title-search-workspace-polish` 本機工作版

概要：

- 新增跨 workspace 的 tab title 搜尋。
- 搜尋會使用 Zen sidebar 實際顯示的 title，包含使用者自定義後的 tab title。
- 主 palette 保留 `Previous` 第一列，原本 `Parent` 的位置改成搜尋列；`Parent` 移到下方與 `Children` / `Siblings` / `Parent tabs` 同區。
- 搜尋列快捷鍵改為 `Z`，開啟 palette 時不自動聚焦搜尋欄，避免吞掉原本的 palette 快捷鍵。
- 搜尋時刪到空字串後仍留在搜尋輸入框，顯示 `Type a tab title`；按 `Esc` 才回主 palette。
- 修正中文輸入法 / IME composition：組字期間不攔截 `Enter`、方向鍵、`Esc`、`Process` / `keyCode 229` 等事件，並把搜尋欄改成 `type="text"`。
- 搜尋結果支援現有 workspace footer filtering：backtick 切 all/current workspace，QWERTY row 切指定 workspace。
- Workspace footer / workspace switcher 的 icon 改成支援 Zen workspace 的 SVG URL 與 emoji/文字 icon，避免 fallback 成空心圓。
- Active workspace 不再用半透明灰階，改成低調 selected state：淡背景 + 左側 2px accent indicator。
- 新增 Essential tabs 的 narrow `Ctrl+Tab` guard：只有目前 tab 是 `zen-essential` 時介入，限定在目前可見 workspace 的 Essential tabs 之間切換，避免 Ctrl+Tab 跳到其他 workspace。

主要檔案：

- `popup/popup.js`
  - 新增 title search row、`title-search` view、Z 聚焦搜尋、IME composition handling、空搜尋狀態。
  - Workspace icon render 統一成 `renderWorkspaceIcon()` / `renderWorkspaceIconOrInitial()`。
  - Active workspace row 使用 `.ws-active` 樣式，不再顯示成 disabled 感。
- `popup/popup.css`
  - 新增搜尋列樣式。
  - 新增 workspace emoji/文字 icon 尺寸樣式。
  - 調整 `.ws-active` 為低調選取狀態。
- `popup/popup.html`
  - 載入 `../lib/title-search.js`。
- `lib/title-search.js`
  - 新增 `normalizeSearchText()` / `searchTabsByTitle()`，只匹配 title、空字串回空結果、依 `lastAccessed` 新到舊排序、支援 workspace filter。
- `tests/title-search.test.js`
  - 覆蓋大小寫不敏感、空查詢、只搜 title、不搜 URL/domain、lastAccessed 排序、workspace filter。
- `experiment/api.js`
  - 新增 `getDisplayedTabTitle()`，優先讀 `.tab-label` / `.tab-label-container`，fallback 到 `tab.label`。
  - `getAllTabs()` / `getTabInfo()` 改用同一個 displayed title helper。
  - `getWorkspacesWithIcons()` 改成回傳 `svgContent` 或 `iconText`。
  - 新增 Essential-only `Ctrl+Tab` guard，extension unload 時會移除 listener。
- `Makefile`
  - 把 `lib/title-search.js` 加入 XPI 打包清單。
- `README.md`
  - 更新 title search、Z 快捷鍵、workspace footer filtering 描述。

驗證：

- `node --check lib/title-search.js`
- `node --check popup/popup.js`
- `node --check experiment/api.js`
- `node --test tests/*.test.js`
  - 目前 23 tests passed。
- `git diff --check`
  - 通過，僅有 Windows checkout 的 LF/CRLF warning。
- 多次重新產生 `zen-tabs-panel.xpi`，最新一次在此工作艙中為 `2026-05-17 22:04:31 +08:00`，大小 `43,942 bytes`。

注意：

- 目前仍在 `jerry-previous-tab-shortcut` branch。
- 這些變更目前是本機未 commit 狀態，尚未 push。
- 修改到 `experiment/api.js` 的內容，安裝 XPI 後通常需要完整重啟 Zen Browser 才會載入新的 experiment API。

### 2026-05-17 - `0.4.0` release

概要：

- 將 `title-search-workspace-polish` 工作版整理為 `0.4.0`。
- `manifest.json` / `package.json` 版本更新為 `0.4.0`。
- `README.md` 版本標示更新為 `0.4.0`。
- 預計以 `v0.4.0` tag 觸發 GitHub Actions release workflow，產生並上傳 `zen-tabs-panel.xpi`。

驗證：

- 發布前重新跑 `node --test tests/*.test.js`。
- 發布前重新打包 `zen-tabs-panel.xpi` 並確認內容包含 `lib/title-search.js`。

### 2026-05-18 - `0.4.1` IME numpad local fix

概要：

- 修正微軟注音在 title search 輸入框使用數字鍵盤時，事件被 palette 當作結果快捷鍵或方向鍵處理，造成選取項目跳動的問題。
- Title search 組字期間的 `input` / `keydown` 不再觸發列表重繪或全域快捷鍵。
- 在 `title-search` view 中，從 IME 候選窗落到 document 的 numpad 文字鍵會重新聚焦搜尋框並略過 palette 快捷鍵。
- 本機版本更新為 `0.4.1`，方便覆蓋安裝測試。

驗證：

- `node --check popup/popup.js`
- `node --test tests/*.test.js`
  - 目前 23 tests passed。

### 2026-05-18 - `0.4.2` workspace-local Ctrl+Tab fix

概要：

- 將 `Ctrl+Tab` guard 從 essential-only 擴大成 workspace-local guard。
- 從一般 tab 按 `Ctrl+Tab` 時，候選清單只包含目前 workspace 的非 essential tabs，避免原生 Ctrl+Tab 撞到 essential 後切到 essential 固定綁定的 workspace。
- 目前 tab 已是 essential 時，才允許 essential 參與候選，並同時保留目前 workspace 的一般 tabs，讓 essential 狀態下仍可回到同 workspace 的上一個一般 tab。
- 選到 essential 後會用 microtask + 0ms timer 檢查並還原原本的 active workspace，降低 Zen 內部 essential tab selection 將 workspace 帶走的機率。
- 本機版本更新為 `0.4.2`，方便覆蓋安裝測試。

驗證：

- `node --check experiment/api.js`
- `node --check popup/popup.js`
- `node --test tests/*.test.js`
  - 目前 23 tests passed。

### 2026-05-19 - `0.4.3` independent Recent shortcut

需求：

- 把 palette 內的 `Recent` 功能獨立成 `about:addons > Manage Extension Shortcuts` 可設定的快捷鍵，像 `Previous tab` 一樣不用先開 palette 再按 `R`。

修改：

- `manifest.json`
  - 版本更新為 `0.4.3`。
  - 新增 command：`open-recent-tabs`。
  - Windows/Linux 預設：`Ctrl+Alt+R`。
  - macOS 預設：`MacCtrl+Command+R`。
- `background.js`
  - `browser.commands.onCommand` 收到 `open-recent-tabs` 時呼叫 `browser.zenWorkspaces.showPalette("last-visited")`。
- `experiment/api.js`
  - `showPalette(view)` 在 overlay 已開啟且有指定 view 時，改為重新載入 popup 到該 view，而不是直接關閉 palette。
  - 一般 `open-palette` 沒帶 view 時仍保留 toggle 行為。
- `README.md`
  - 補上獨立快捷鍵表格與 Recent 直接開啟說明。
- `package.json`
  - 版本同步更新為 `0.4.3`。

驗證：

- `node --check background.js`
- `node --check experiment/api.js`
- `node --check popup/popup.js`
- `node --test tests/*.test.js`
  - sandbox 內第一次執行遇到 `spawn EPERM`，提升權限重跑後 23 tests passed。
- `manifest.json` / `package.json` JSON parse OK。
- `git diff --check`
  - 無 whitespace error；僅顯示 Windows checkout 的 LF/CRLF warning。
- `zen-tabs-panel.xpi`
  - `make` 不在目前 Windows shell PATH 內，因此改用 PowerShell/.NET 依 Makefile 來源清單打包。
  - XPI entry path 已確認使用 `/`，`manifest.json` 在 root。

## 目前工作樹注意事項

截至 2026-05-16 18:21，本地工作樹有尚未 commit 的 `0.3.1-ui-restore` 修改。

被 Git ignore 的 XPI 產物：

```text
zen-tabs-panel-0.3.1-previous-tab.xpi
zen-tabs-panel-0.3.1-ui-restore.xpi
```

這些 XPI 是安裝檔/打包產物，不是原始碼版控的主要內容。若要提供下載，適合放 GitHub Releases。

## 常用命令

查看狀態：

```powershell
git status --short --branch --ignored
```

查看目前版本：

```powershell
git log --oneline --decorate -8
git tag --list
```

切回已推送 previous-tab 版本：

```powershell
git switch jerry-previous-tab-shortcut
git checkout v0.3.1-previous-tab
```

之後若 `0.3.1-ui-restore` 試用 OK，可建立 commit/tag：

```powershell
git add README.md Makefile background.js experiment/api.js experiment/schema.json manifest.json options/options.html options/options.js package.json popup/popup.html popup/popup.css popup/popup.js welcome/welcome.html welcome/welcome.js JOURNAL.md
git commit -m "Restore v0.3.0 palette UI with previous tab shortcut"
git tag -a v0.3.1-ui-restore -m "Restore v0.3.0 palette UI with configurable previous tab shortcut"
```

推送到 GitHub：

```powershell
git push origin jerry-previous-tab-shortcut
git push origin v0.3.1-ui-restore
```

## 未來 Journal Entry 模板

```markdown
### YYYY-MM-DD - 標題

需求：

- ...

做了什麼：

- ...

影響檔案：

- `path/to/file`

驗證：

- ...

Git / 版本：

- branch:
- commit:
- tag:
- pushed:

備註：

- ...
```
