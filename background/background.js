const TEST_GROUP_NAME = "测试";
const TEST_RULE = {
  type: 1,
  filter: ".*",
  opened: false,
  id: 36,
};

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

function ensureTestGroup(library) {
  const groups = Array.isArray(library?.groups) ? [...library.groups] : [];
  const testGroup = groups.find((group) => group.name === TEST_GROUP_NAME);

  if (!testGroup) {
    groups.push({
      name: TEST_GROUP_NAME,
      items: [{ ...TEST_RULE }],
    });
    return { ...(library ?? {}), groups };
  }

  const hasTestRule = testGroup.items?.some((item) => item.filter === TEST_RULE.filter);
  if (!hasTestRule) {
    testGroup.items = [...(testGroup.items ?? []), { ...TEST_RULE }];
  }

  return { ...(library ?? {}), groups };
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
    const normalizedLibrary = ensureTestGroup(current.regexLibrary);
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
        sendResponse({ library: ensureTestGroup(library) });
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
