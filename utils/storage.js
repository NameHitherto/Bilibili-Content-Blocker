const STORAGE_KEYS = {
  ENABLED: "enabled",
  BLOCK_MODE: "blockMode",
  REGEX_LIBRARY: "regexLibrary",
};

const DEFAULT_VALUES = {
  [STORAGE_KEYS.ENABLED]: false,
  [STORAGE_KEYS.BLOCK_MODE]: "blackout",
  [STORAGE_KEYS.REGEX_LIBRARY]: null,
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
  getBlockMode,
  getEnabled,
  getRegexLibrary,
  STORAGE_KEYS,
  setBlockMode,
  setEnabled,
  setRegexLibrary,
};
