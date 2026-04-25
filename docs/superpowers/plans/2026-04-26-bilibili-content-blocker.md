# Bilibili Content Blocker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that filters Bilibili video comments using custom regex patterns with two blocking modes (blackout mask and direct hide).

**Architecture:** Chrome Extension (Manifest V3) with popup UI, content script for DOM manipulation, background service worker, and chrome.storage for persistence. The blackout mask uses CSS similar to moegirl.org's heimu class.

**Tech Stack:** HTML, CSS, JavaScript (ES6+), Chrome Extensions API (Manifest V3), Biome for linting

---

## File Structure

```
Bilibili-Content-Blocker/
├── manifest.json              # Extension manifest (MV3)
├── popup/
│   ├── popup.html             # Popup UI structure
│   ├── popup.css              # Popup styles
│   └── popup.js               # Popup logic
├── content/
│   ├── content.js             # Content script for comment filtering
│   └── content.css            # Styles for heimu blackout effect
├── background/
│   └── background.js          # Service worker for state management
├── data/
│   └── regex-library.json     # Default regex library
├── utils/
│   └── storage.js             # Chrome storage utilities
└── images/
    └── bilibili-content-blocker.png  # Extension icon
```

---

### Task 1: Project Setup and Manifest

**Files:**
- Create: `manifest.json`
- Create: `biome.json`
- Create: `data/regex-library.json`

- [ ] **Step 1: Create manifest.json for Chrome Extension MV3**

```json
{
  "manifest_version": 3,
  "name": "Bilibili Content Blocker",
  "version": "1.0.0",
  "description": "Filter Bilibili video comments using custom regex patterns",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["*://*.bilibili.com/*"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "images/bilibili-content-blocker.png",
      "48": "images/bilibili-content-blocker.png",
      "128": "images/bilibili-content-blocker.png"
    }
  },
  "icons": {
    "16": "images/bilibili-content-blocker.png",
    "48": "images/bilibili-content-blocker.png",
    "128": "images/bilibili-content-blocker.png"
  },
  "content_scripts": [
    {
      "matches": ["*://*.bilibili.com/*"],
      "js": ["content/content.js"],
      "css": ["content/content.css"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "background/background.js"
  }
}
```

- [ ] **Step 2: Create biome.json for linting configuration**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.5.3/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

- [ ] **Step 3: Create default regex library**

Create `data/regex-library.json`:

```json
{
  "groups": [
    {
      "name": "广告推广",
      "items": [
        { "type": 1, "filter": "加微信|加V|加Q", "opened": true, "id": 1 },
        { "type": 1, "filter": "代刷|代练|代充", "opened": true, "id": 2 }
      ]
    },
    {
      "name": "引战内容",
      "items": [
        { "type": 1, "filter": "引战|带节奏", "opened": true, "id": 3 }
      ]
    },
    {
      "name": "其它",
      "items": []
    }
  ]
}
```

- [ ] **Step 4: Verify file structure**

Run: `ls -la && ls data/`
Expected: manifest.json, biome.json, data/regex-library.json exist

- [ ] **Step 5: Commit**

```bash
git add manifest.json biome.json data/regex-library.json
git commit -m "feat: initialize project structure with manifest and config"
```

---

### Task 2: Storage Utilities

**Files:**
- Create: `utils/storage.js`

- [ ] **Step 1: Create storage utility module**

```javascript
const STORAGE_KEYS = {
  ENABLED: "enabled",
  BLOCK_MODE: "blockMode",
  REGEX_LIBRARY: "regexLibrary"
};

const DEFAULT_VALUES = {
  [STORAGE_KEYS.ENABLED]: false,
  [STORAGE_KEYS.BLOCK_MODE]: "blackout",
  [STORAGE_KEYS.REGEX_LIBRARY]: null
};

async function getStorageData(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? DEFAULT_VALUES[key];
}

async function setStorageData(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function getEnabled() {
  return getStorageData(STORAGE_KEYS.ENABLED);
}

async function setEnabled(enabled) {
  await setStorageData(STORAGE_KEYS.ENABLED, enabled);
}

async function getBlockMode() {
  return getStorageData(STORAGE_KEYS.BLOCK_MODE);
}

async function setBlockMode(mode) {
  await setStorageData(STORAGE_KEYS.BLOCK_MODE, mode);
}

async function getRegexLibrary() {
  const library = await getStorageData(STORAGE_KEYS.REGEX_LIBRARY);
  if (library) return library;
  const response = await fetch(chrome.runtime.getURL("data/regex-library.json"));
  return response.json();
}

async function setRegexLibrary(library) {
  await setStorageData(STORAGE_KEYS.REGEX_LIBRARY, library);
}

export {
  STORAGE_KEYS,
  getEnabled,
  setEnabled,
  getBlockMode,
  setBlockMode,
  getRegexLibrary,
  setRegexLibrary
};
```

- [ ] **Step 2: Verify syntax with Biome**

Run: `npx biome check utils/storage.js`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add utils/storage.js
git commit -m "feat: add storage utilities for chrome.storage.local"
```

---

### Task 3: Popup HTML Structure

**Files:**
- Create: `popup/popup.html`

- [ ] **Step 1: Create popup HTML with flex column layout**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bilibili Content Blocker</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="title">评论屏蔽</span>
      <label class="switch">
        <input type="checkbox" id="enableSwitch">
        <span class="slider"></span>
      </label>
    </div>

    <div class="regex-editor">
      <div class="regex-list" id="regexList">
      </div>
      <div class="regex-actions">
        <button class="action-btn" id="addBtn" title="添加">+</button>
        <button class="action-btn" id="deleteBtn" title="删除">-</button>
      </div>
    </div>

    <div class="options">
      <div class="block-mode">
        <span class="option-label">屏蔽方式:</span>
        <label class="radio-label">
          <input type="radio" name="blockMode" value="blackout" checked>
          <span>黑幕屏蔽</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="blockMode" value="hide">
          <span>直接隐藏</span>
        </label>
      </div>
      <button class="export-btn" id="exportBtn">导出为B站弹幕屏蔽规则文件</button>
    </div>
  </div>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add popup/popup.html
git commit -m "feat: add popup HTML structure"
```

---

### Task 4: Popup CSS Styles

**Files:**
- Create: `popup/popup.css`

- [ ] **Step 1: Create popup styles with flex layout**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 360px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  background: #f4f5f7;
}

.container {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #18191c;
}

.switch {
  position: relative;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #00a1d6;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.regex-editor {
  display: flex;
  gap: 8px;
  height: 200px;
}

.regex-list {
  flex: 1;
  overflow-y: auto;
  background: white;
  border-radius: 8px;
  padding: 8px;
  border: 1px solid #e3e5e7;
}

.regex-group {
  margin-bottom: 8px;
}

.group-name {
  font-size: 12px;
  color: #9499a0;
  padding: 4px 0;
  border-bottom: 1px solid #e3e5e7;
}

.regex-item {
  display: flex;
  align-items: center;
  padding: 6px 4px;
  cursor: pointer;
  border-radius: 4px;
}

.regex-item:hover {
  background: #f4f5f7;
}

.regex-item.selected {
  background: #e3f2fd;
}

.regex-item input[type="checkbox"] {
  margin-right: 8px;
}

.regex-item input[type="text"] {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  outline: none;
}

.regex-item input[type="text"]:focus {
  border-bottom: 1px solid #00a1d6;
}

.regex-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: #00a1d6;
  color: white;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.2s;
}

.action-btn:hover {
  background: #0090c8;
}

.action-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.block-mode {
  display: flex;
  align-items: center;
  gap: 12px;
}

.option-label {
  color: #61666d;
  font-size: 13px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #18191c;
}

.radio-label input[type="radio"] {
  accent-color: #00a1d6;
}

.export-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  background: #fb7299;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.export-btn:hover {
  background: #e85d87;
}
```

- [ ] **Step 2: Commit**

```bash
git add popup/popup.css
git commit -m "feat: add popup CSS styles with flex layout"
```

---

### Task 5: Popup JavaScript Logic

**Files:**
- Create: `popup/popup.js`

- [ ] **Step 1: Create popup JavaScript with all functionality**

```javascript
import {
  getEnabled,
  setEnabled,
  getBlockMode,
  setBlockMode,
  getRegexLibrary,
  setRegexLibrary
} from "../utils/storage.js";

let currentLibrary = null;
let selectedItems = new Set();
let nextId = 1000;

async function init() {
  const enabled = await getEnabled();
  document.getElementById("enableSwitch").checked = enabled;

  const blockMode = await getBlockMode();
  document.querySelector(`input[name="blockMode"][value="${blockMode}"]`).checked = true;

  currentLibrary = await getRegexLibrary();
  renderRegexList();

  setupEventListeners();
}

function renderRegexList() {
  const container = document.getElementById("regexList");
  container.innerHTML = "";

  for (const group of currentLibrary.groups) {
    const groupEl = document.createElement("div");
    groupEl.className = "regex-group";

    const groupName = document.createElement("div");
    groupName.className = "group-name";
    groupName.textContent = group.name;
    groupEl.appendChild(groupName);

    for (const item of group.items) {
      const itemEl = createRegexItem(item, group.name);
      groupEl.appendChild(itemEl);
    }

    container.appendChild(groupEl);
  }
}

function createRegexItem(item, groupName) {
  const itemEl = document.createElement("div");
  itemEl.className = "regex-item";
  itemEl.dataset.id = item.id;
  itemEl.dataset.group = groupName;

  if (groupName === "其它") {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedItems.has(item.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedItems.add(item.id);
        itemEl.classList.add("selected");
      } else {
        selectedItems.delete(item.id);
        itemEl.classList.remove("selected");
      }
    });
    itemEl.appendChild(checkbox);

    const input = document.createElement("input");
    input.type = "text";
    input.value = item.filter;
    input.addEventListener("change", () => {
      item.filter = input.value;
      saveLibrary();
    });
    itemEl.appendChild(input);
  } else {
    const text = document.createElement("span");
    text.textContent = item.filter;
    text.style.fontSize = "13px";
    itemEl.appendChild(text);
  }

  return itemEl;
}

function setupEventListeners() {
  document.getElementById("enableSwitch").addEventListener("change", async (e) => {
    await setEnabled(e.target.checked);
    notifyContentScript();
  });

  document.querySelectorAll('input[name="blockMode"]').forEach((radio) => {
    radio.addEventListener("change", async (e) => {
      await setBlockMode(e.target.value);
      notifyContentScript();
    });
  });

  document.getElementById("addBtn").addEventListener("click", addRegexItem);
  document.getElementById("deleteBtn").addEventListener("click", deleteSelectedItems);
  document.getElementById("exportBtn").addEventListener("click", exportToBilibiliFormat);
}

async function addRegexItem() {
  const otherGroup = currentLibrary.groups.find((g) => g.name === "其它");
  if (!otherGroup) return;

  const newItem = {
    type: 1,
    filter: "",
    opened: true,
    id: nextId++
  };
  otherGroup.items.push(newItem);
  await saveLibrary();
  renderRegexList();
}

async function deleteSelectedItems() {
  const otherGroup = currentLibrary.groups.find((g) => g.name === "其它");
  if (!otherGroup) return;

  otherGroup.items = otherGroup.items.filter((item) => !selectedItems.has(item.id));
  selectedItems.clear();
  await saveLibrary();
  renderRegexList();
  notifyContentScript();
}

async function saveLibrary() {
  await setRegexLibrary(currentLibrary);
}

function notifyContentScript() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "refresh" });
    }
  });
}

function exportToBilibiliFormat() {
  const allItems = [];
  let id = 1;
  for (const group of currentLibrary.groups) {
    for (const item of group.items) {
      if (item.filter) {
        allItems.push({
          type: item.type,
          filter: item.filter,
          opened: item.opened,
          id: id++
        });
      }
    }
  }

  const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bilibili.block.json";
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", init);
```

- [ ] **Step 2: Verify syntax with Biome**

Run: `npx biome check popup/popup.js`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add popup/popup.js
git commit -m "feat: add popup JavaScript logic with full functionality"
```

---

### Task 6: Content Script CSS (Heimu Style)

**Files:**
- Create: `content/content.css`

- [ ] **Step 1: Create heimu blackout CSS style**

```css
.bcb-heimu {
  background-color: #000;
  color: #000;
  transition: color 0.2s;
  cursor: pointer;
  border-radius: 2px;
  padding: 0 2px;
}

.bcb-heimu:hover {
  color: #fff;
}

.bcb-heimu a {
  color: #000;
}

.bcb-heimu:hover a {
  color: #fff;
}

.bcb-hidden {
  display: none !important;
}
```

- [ ] **Step 2: Commit**

```bash
git add content/content.css
git commit -m "feat: add heimu blackout CSS style"
```

---

### Task 7: Content Script JavaScript

**Files:**
- Create: `content/content.js`

- [ ] **Step 1: Create content script for comment filtering**

```javascript
import {
  getEnabled,
  getBlockMode,
  getRegexLibrary
} from "../utils/storage.js";

let isEnabled = false;
let blockMode = "blackout";
let regexPatterns = [];

async function init() {
  isEnabled = await getEnabled();
  blockMode = await getBlockMode();
  const library = await getRegexLibrary();
  regexPatterns = compilePatterns(library);

  if (isEnabled) {
    processComments();
  }
}

function compilePatterns(library) {
  const patterns = [];
  for (const group of library.groups) {
    for (const item of group.items) {
      if (item.filter && item.opened) {
        try {
          patterns.push(new RegExp(item.filter, "gi"));
        } catch {
          console.warn(`Invalid regex: ${item.filter}`);
        }
      }
    }
  }
  return patterns;
}

function processComments() {
  const commentSelector = ".comment-content, .reply-content, .reply-wrap";
  const comments = document.querySelectorAll(commentSelector);

  for (const comment of comments) {
    processComment(comment);
  }
}

function processComment(commentEl) {
  const text = commentEl.textContent;
  let matched = false;

  for (const pattern of regexPatterns) {
    if (pattern.test(text)) {
      matched = true;
      break;
    }
  }

  if (!matched) return;

  if (blockMode === "blackout") {
    applyBlackout(commentEl);
  } else {
    applyHide(commentEl);
  }
}

function applyBlackout(element) {
  if (element.dataset.bcbProcessed) return;
  element.dataset.bcbProcessed = "true";

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  for (const node of textNodes) {
    const text = node.textContent;
    let hasMatch = false;

    for (const pattern of regexPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        hasMatch = true;
        break;
      }
    }

    if (hasMatch) {
      const span = document.createElement("span");
      span.className = "bcb-heimu";
      span.textContent = text;
      node.parentNode.replaceChild(span, node);
    }
  }
}

function applyHide(element) {
  const commentItem = element.closest(".comment-item, .reply-item, .reply-wrap");
  if (commentItem) {
    commentItem.classList.add("bcb-hidden");
  }
}

function observeComments() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const comments = node.querySelectorAll(".comment-content, .reply-content, .reply-wrap");
          for (const comment of comments) {
            processComment(comment);
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "refresh") {
    init().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

init();
observeComments();
```

- [ ] **Step 2: Verify syntax with Biome**

Run: `npx biome check content/content.js`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add content/content.js
git commit -m "feat: add content script for comment filtering"
```

---

### Task 8: Background Service Worker

**Files:**
- Create: `background/background.js`

- [ ] **Step 1: Create background service worker**

```javascript
chrome.runtime.onInstalled.addListener(async () => {
  const enabled = await chrome.storage.local.get("enabled");
  if (enabled.enabled === undefined) {
    await chrome.storage.local.set({ enabled: false });
  }

  const blockMode = await chrome.storage.local.get("blockMode");
  if (blockMode.blockMode === undefined) {
    await chrome.storage.local.set({ blockMode: "blackout" });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "toggle" });
  }
});
```

- [ ] **Step 2: Verify syntax with Biome**

Run: `npx biome check background/background.js`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add background/background.js
git commit -m "feat: add background service worker"
```

---

### Task 9: Final Verification and Testing

**Files:**
- Modify: `manifest.json` (if needed)

- [ ] **Step 1: Run Biome check on all JavaScript files**

Run: `npx biome check utils/ popup/ content/ background/`
Expected: No errors

- [ ] **Step 2: Verify extension can be loaded in Chrome**

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project directory
5. Verify extension appears in list without errors

- [ ] **Step 3: Test popup functionality**

1. Click extension icon
2. Verify popup opens with correct layout
3. Toggle enable switch
4. Add a new regex item in "其它" group
5. Delete a selected item
6. Change block mode
7. Click export button and verify file downloads

- [ ] **Step 4: Test content script on Bilibili**

1. Go to a Bilibili video page with comments
2. Enable the extension
3. Add a regex pattern that matches some comments
4. Verify comments are blocked according to selected mode
5. Test both blackout and hide modes

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Bilibili Content Blocker extension"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Switch button for enable/disable (Task 5)
- [x] Regex list editor with groups (Task 3, 4, 5)
- [x] Add/Delete buttons for "其它" group (Task 5)
- [x] Block mode radio buttons (Task 3, 5)
- [x] Export to bilibili.block.json (Task 5)
- [x] Blackout mask mode (Task 6, 7)
- [x] Direct hide mode (Task 6, 7)
- [x] Regex library persistence (Task 2, 5)
- [x] Chrome Extension MV3 (Task 1)
- [x] Biome linting (Task 1, all JS tasks)

**2. Placeholder scan:** No TBD, TODO, or placeholder text found.

**3. Type consistency:** All function names and data structures are consistent across tasks.
