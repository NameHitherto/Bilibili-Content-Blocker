let defaultRegexLibraryPromise = null;

async function loadDefaultRegexLibrary() {
  if (!defaultRegexLibraryPromise) {
    defaultRegexLibraryPromise = fetch(chrome.runtime.getURL("data/regex-library.json")).then(
      async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load default regex library: ${response.status}`);
        }
        return response.json();
      },
    );
  }

  const library = await defaultRegexLibraryPromise;
  return JSON.parse(JSON.stringify(library));
}

function removeTestGroup(library) {
  if (!Array.isArray(library?.groups)) {
    return library;
  }

  const groups = library.groups.filter((group) => group?.name !== "测试");
  return { ...library, groups };
}

async function ensureDefaultSettings() {
  const current = await chrome.storage.local.get(["enabled", "blockMode", "regexLibrary"]);
  const updates = {};

  if (current.enabled === undefined) {
    updates.enabled = false;
  }

  if (current.blockMode === undefined) {
    updates.blockMode = "blackout";
  }

  if (current.regexLibrary === undefined || current.regexLibrary === null) {
    updates.regexLibrary = await loadDefaultRegexLibrary();
  } else {
    const normalizedLibrary = removeTestGroup(current.regexLibrary);
    if (JSON.stringify(normalizedLibrary) !== JSON.stringify(current.regexLibrary)) {
      updates.regexLibrary = normalizedLibrary;
    }
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureDefaultSettings();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureDefaultSettings();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "getDefaultRegexLibrary") {
    loadDefaultRegexLibrary()
      .then((library) => {
        sendResponse({ library: removeTestGroup(library) });
      })
      .catch((error) => {
        console.error(error);
        sendResponse({ error: error.message });
      });
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "refresh" });
  }
});
