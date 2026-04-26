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
    chrome.tabs.sendMessage(tab.id, { action: "refresh" });
  }
});
