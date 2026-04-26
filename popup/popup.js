import {
  getBlockMode,
  getEnabled,
  getRegexLibrary,
  setBlockMode,
  setEnabled,
  setRegexLibrary,
} from "../utils/storage.js";

let currentLibrary = null;
const selectedItems = new Set();
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
  itemEl.classList.toggle("selected", selectedItems.has(item.id));

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "rule-toggle";
  toggle.checked = item.opened;
  toggle.title = item.opened ? "已启用" : "已停用";
  toggle.addEventListener("change", async () => {
    item.opened = toggle.checked;
    toggle.title = item.opened ? "已启用" : "已停用";
    await saveLibrary();
    notifyContentScript();
  });
  itemEl.appendChild(toggle);

  if (groupName === "其它") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = item.filter;
    input.placeholder = "输入正则表达式";
    input.addEventListener("change", async () => {
      item.filter = input.value;
      await saveLibrary();
      notifyContentScript();
    });
    itemEl.appendChild(input);

    itemEl.addEventListener("click", (event) => {
      if (event.target instanceof HTMLInputElement) return;

      if (selectedItems.has(item.id)) {
        selectedItems.delete(item.id);
        itemEl.classList.remove("selected");
      } else {
        selectedItems.add(item.id);
        itemEl.classList.add("selected");
      }
    });
  } else {
    const text = document.createElement("span");
    text.textContent = item.filter;
    text.className = "regex-text";
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
    id: nextId++,
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
          id: id++,
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
