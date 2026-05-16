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
