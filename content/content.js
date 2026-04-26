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

const ATTACHMENT_RETRY_DELAYS = [40, 120, 240, 480, 960];

async function getStorageData(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? DEFAULT_VALUES[key];
}

async function getEnabled() {
  return getStorageData(STORAGE_KEYS.ENABLED);
}

async function getBlockMode() {
  return getStorageData(STORAGE_KEYS.BLOCK_MODE);
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function getRegexLibrary() {
  const library = await getStorageData(STORAGE_KEYS.REGEX_LIBRARY);
  if (library?.groups) return library;

  const response = await sendRuntimeMessage({ action: "getDefaultRegexLibrary" });
  if (!response?.library?.groups) {
    throw new Error(response?.error || "Failed to load regex library");
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.REGEX_LIBRARY]: response.library });
  return response.library;
}

(async () => {
  let isEnabled = false;
  let blockMode = "blackout";
  let regexPatterns = [];
  let configVersion = 0;
  let flushScheduled = false;

  const knownThreadHosts = new Set();
  const knownReplyHosts = new Set();
  const knownLegacyComments = new Set();

  const pendingThreadHosts = new Set();
  const pendingReplyHosts = new Set();
  const pendingLegacyComments = new Set();

  const hostStates = new WeakMap();
  const attachmentRetryCounts = new WeakMap();

  const observedDocumentRoots = new WeakSet();
  const observedBiliCommentsHosts = new WeakSet();
  const observedBiliCommentsRoots = new WeakSet();
  const observedThreadHosts = new WeakSet();
  const observedThreadRoots = new WeakSet();
  const observedThreadCommentRoots = new WeakSet();
  const observedThreadRichTextRoots = new WeakSet();
  const observedRepliesHosts = new WeakSet();
  const observedRepliesRoots = new WeakSet();
  const observedReplyHosts = new WeakSet();
  const observedReplyRoots = new WeakSet();
  const observedReplyRichTextRoots = new WeakSet();

  async function init() {
    isEnabled = await getEnabled();
    blockMode = await getBlockMode();
    const library = await getRegexLibrary();
    regexPatterns = compilePatterns(library);
    configVersion += 1;

    clearAllEffects();

    if (!isEnabled) return;

    discoverExistingComments();
    scheduleFlush();
  }

  function compilePatterns(library) {
    const patterns = [];
    for (const group of library.groups) {
      for (const item of group.items) {
        if (!item.filter || !item.opened) continue;
        try {
          patterns.push(new RegExp(item.filter, "gi"));
        } catch {
          console.warn(`Invalid regex: ${item.filter}`);
        }
      }
    }
    return patterns;
  }

  function matchesAnyPattern(text) {
    if (!text) return false;
    for (const pattern of regexPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) return true;
    }
    return false;
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(() => {
      flushScheduled = false;
      flushPendingComments();
    });
  }

  function flushPendingComments() {
    if (!isEnabled) {
      pendingThreadHosts.clear();
      pendingReplyHosts.clear();
      pendingLegacyComments.clear();
      return;
    }

    const threadHosts = Array.from(pendingThreadHosts);
    const replyHosts = Array.from(pendingReplyHosts);
    const legacyComments = Array.from(pendingLegacyComments);

    pendingThreadHosts.clear();
    pendingReplyHosts.clear();
    pendingLegacyComments.clear();

    for (const threadHost of threadHosts) {
      processThreadHost(threadHost);
    }

    for (const replyHost of replyHosts) {
      processReplyHost(replyHost);
    }

    for (const commentEl of legacyComments) {
      processLegacyComment(commentEl);
    }

    if (
      pendingThreadHosts.size > 0 ||
      pendingReplyHosts.size > 0 ||
      pendingLegacyComments.size > 0
    ) {
      scheduleFlush();
    }
  }

  function enqueueThreadHost(threadHost) {
    if (!(threadHost instanceof Element)) return;
    knownThreadHosts.add(threadHost);
    pendingThreadHosts.add(threadHost);
    scheduleFlush();
  }

  function enqueueReplyHost(replyHost) {
    if (!(replyHost instanceof Element)) return;
    knownReplyHosts.add(replyHost);
    pendingReplyHosts.add(replyHost);
    scheduleFlush();
  }

  function enqueueLegacyComment(commentEl) {
    if (!(commentEl instanceof Element)) return;
    knownLegacyComments.add(commentEl);
    pendingLegacyComments.add(commentEl);
    scheduleFlush();
  }

  function clearAllEffects() {
    pruneKnownHosts();

    for (const threadHost of knownThreadHosts) {
      const richText = getThreadRichText(threadHost);
      if (richText?.shadowRoot) {
        clearShadowEffects(richText.shadowRoot, threadHost);
      } else {
        threadHost.style.display = "";
      }
      hostStates.delete(threadHost);
    }

    for (const replyHost of knownReplyHosts) {
      const richText = getReplyRichText(replyHost);
      if (richText?.shadowRoot) {
        clearShadowEffects(richText.shadowRoot, replyHost);
      } else {
        replyHost.style.display = "";
      }
      hostStates.delete(replyHost);
    }

    for (const commentEl of knownLegacyComments) {
      clearLegacyEffects(commentEl);
      hostStates.delete(commentEl);
    }
  }

  function pruneKnownHosts() {
    pruneDisconnectedNodes(knownThreadHosts);
    pruneDisconnectedNodes(knownReplyHosts);
    pruneDisconnectedNodes(knownLegacyComments);
  }

  function pruneDisconnectedNodes(nodes) {
    for (const node of Array.from(nodes)) {
      if (!node.isConnected) {
        nodes.delete(node);
      }
    }
  }

  function discoverExistingComments() {
    registerDocumentNode(document);
    registerDocumentNode(document.body);

    const biliComments = document.querySelectorAll("bili-comments");
    for (const host of biliComments) {
      registerBiliCommentsHost(host);
    }

    const legacyComments = document.querySelectorAll(".reply-content");
    for (const commentEl of legacyComments) {
      enqueueLegacyComment(commentEl);
    }
  }

  function registerDocumentNode(node) {
    if (!node) return;

    registerBiliCommentsInNode(node);
    registerThreadHostsInNode(node);
    registerReplyHostsInNode(node);
    registerLegacyCommentsInNode(node);
  }

  function registerBiliCommentsInNode(node) {
    for (const host of collectMatches(node, "bili-comments")) {
      registerBiliCommentsHost(host);
    }
  }

  function registerThreadHostsInNode(node) {
    for (const threadHost of collectMatches(node, "bili-comment-thread-renderer")) {
      registerThreadHost(threadHost);
    }
  }

  function registerReplyHostsInNode(node) {
    for (const replyHost of collectMatches(node, "bili-comment-reply-renderer")) {
      registerReplyHost(replyHost);
    }
  }

  function registerLegacyCommentsInNode(node) {
    for (const commentEl of collectMatches(node, ".reply-content")) {
      enqueueLegacyComment(commentEl);
    }
  }

  function collectMatches(node, selector) {
    if (!node) return [];

    if (node instanceof Document || node instanceof ShadowRoot) {
      return Array.from(node.querySelectorAll(selector));
    }

    if (!(node instanceof Element)) return [];

    const matches = [];
    if (node.matches(selector)) {
      matches.push(node);
    }
    matches.push(...node.querySelectorAll(selector));
    return matches;
  }

  function registerBiliCommentsHost(host) {
    if (!(host instanceof Element)) return;

    if (!observedBiliCommentsHosts.has(host)) {
      observedBiliCommentsHosts.add(host);
      scheduleAttachmentRetry(host, () => registerBiliCommentsHost(host));
    }

    const shadowRoot = host.shadowRoot;
    if (!shadowRoot || observedBiliCommentsRoots.has(shadowRoot)) return;

    observedBiliCommentsRoots.add(shadowRoot);
    observeMutations(shadowRoot, (mutations) => {
      for (const mutation of mutations) {
        registerDocumentNode(mutation.target);
        for (const node of mutation.addedNodes) {
          registerDocumentNode(node);
        }
      }
    });

    registerThreadHostsInNode(shadowRoot);
  }

  function registerThreadHost(threadHost, options = {}) {
    const { enqueue = true } = options;
    if (!(threadHost instanceof Element)) return;

    knownThreadHosts.add(threadHost);
    if (enqueue) {
      enqueueThreadHost(threadHost);
    }

    if (!observedThreadHosts.has(threadHost)) {
      observedThreadHosts.add(threadHost);
      scheduleAttachmentRetry(threadHost, () => registerThreadHost(threadHost));
    }

    const shadowRoot = threadHost.shadowRoot;
    if (!shadowRoot || observedThreadRoots.has(shadowRoot)) return;

    observedThreadRoots.add(shadowRoot);
    observeMutations(shadowRoot, (mutations) => {
      enqueueThreadHost(threadHost);
      for (const mutation of mutations) {
        registerDocumentNode(mutation.target);
        for (const node of mutation.addedNodes) {
          registerDocumentNode(node);
        }
      }
      registerThreadDependencies(threadHost);
    });

    registerThreadDependencies(threadHost);
  }

  function registerThreadDependencies(threadHost) {
    const commentRoot = getThreadCommentRoot(threadHost);
    if (commentRoot && !observedThreadCommentRoots.has(commentRoot)) {
      observedThreadCommentRoots.add(commentRoot);
      observeMutations(commentRoot, () => {
        enqueueThreadHost(threadHost);
        registerThreadDependencies(threadHost);
      });
    }

    const richText = getThreadRichText(threadHost);
    if (richText) {
      const richTextRoot = richText.shadowRoot;
      if (richTextRoot && !observedThreadRichTextRoots.has(richTextRoot)) {
        observedThreadRichTextRoots.add(richTextRoot);
        observeMutations(richTextRoot, () => enqueueThreadHost(threadHost));
      } else if (!richTextRoot) {
        scheduleAttachmentRetry(richText, () => registerThreadDependencies(threadHost));
      }
    }

    const repliesHost = getRepliesRenderer(threadHost);
    if (repliesHost) {
      registerRepliesHost(repliesHost, threadHost);
    }
  }

  function registerRepliesHost(repliesHost, threadHost) {
    if (!(repliesHost instanceof Element)) return;

    if (!observedRepliesHosts.has(repliesHost)) {
      observedRepliesHosts.add(repliesHost);
      scheduleAttachmentRetry(repliesHost, () => registerRepliesHost(repliesHost, threadHost));
    }

    const shadowRoot = repliesHost.shadowRoot;
    if (!shadowRoot || observedRepliesRoots.has(shadowRoot)) return;

    observedRepliesRoots.add(shadowRoot);
    observeMutations(shadowRoot, (mutations) => {
      for (const mutation of mutations) {
        registerDocumentNode(mutation.target);
        for (const node of mutation.addedNodes) {
          registerDocumentNode(node);
        }
      }
      enqueueThreadHost(threadHost);
      registerReplyHostsInNode(shadowRoot);
    });

    registerReplyHostsInNode(shadowRoot);
  }

  function registerReplyHost(replyHost, options = {}) {
    const { enqueue = true } = options;
    if (!(replyHost instanceof Element)) return;

    knownReplyHosts.add(replyHost);
    if (enqueue) {
      enqueueReplyHost(replyHost);
    }

    if (!observedReplyHosts.has(replyHost)) {
      observedReplyHosts.add(replyHost);
      scheduleAttachmentRetry(replyHost, () => registerReplyHost(replyHost));
    }

    const shadowRoot = replyHost.shadowRoot;
    if (!shadowRoot || observedReplyRoots.has(shadowRoot)) return;

    observedReplyRoots.add(shadowRoot);
    observeMutations(shadowRoot, (mutations) => {
      enqueueReplyHost(replyHost);
      for (const mutation of mutations) {
        registerDocumentNode(mutation.target);
        for (const node of mutation.addedNodes) {
          registerDocumentNode(node);
        }
      }
      registerReplyDependencies(replyHost);
    });

    registerReplyDependencies(replyHost);
  }

  function registerReplyDependencies(replyHost) {
    const richText = getReplyRichText(replyHost);
    if (!richText) return;

    const shadowRoot = richText.shadowRoot;
    if (shadowRoot && !observedReplyRichTextRoots.has(shadowRoot)) {
      observedReplyRichTextRoots.add(shadowRoot);
      observeMutations(shadowRoot, () => enqueueReplyHost(replyHost));
      return;
    }

    if (!shadowRoot) {
      scheduleAttachmentRetry(richText, () => registerReplyDependencies(replyHost));
    }
  }

  function scheduleAttachmentRetry(element, callback) {
    if (!(element instanceof Element) || element.shadowRoot || !element.isConnected) return;

    const retryCount = attachmentRetryCounts.get(element) ?? 0;
    if (retryCount >= ATTACHMENT_RETRY_DELAYS.length) return;

    attachmentRetryCounts.set(element, retryCount + 1);
    window.setTimeout(() => {
      if (!element.isConnected || element.shadowRoot) return;
      callback();
    }, ATTACHMENT_RETRY_DELAYS[retryCount]);
  }

  function observeMutations(root, onMutations) {
    const observer = new MutationObserver((mutations) => {
      onMutations(mutations);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function processAllComments() {
    discoverExistingComments();
    scheduleFlush();
  }

  function processThreadHost(threadHost) {
    if (!threadHost.isConnected) {
      knownThreadHosts.delete(threadHost);
      hostStates.delete(threadHost);
      return;
    }

    registerThreadHost(threadHost, { enqueue: false });

    const richText = getThreadRichText(threadHost);
    if (!richText?.shadowRoot) return;

    processRichText(richText, threadHost);
  }

  function processReplyHost(replyHost) {
    if (!replyHost.isConnected) {
      knownReplyHosts.delete(replyHost);
      hostStates.delete(replyHost);
      return;
    }

    registerReplyHost(replyHost, { enqueue: false });

    const richText = getReplyRichText(replyHost);
    if (!richText?.shadowRoot) return;

    processRichText(richText, replyHost);
  }

  function processRichText(richText, hostElement) {
    const shadowRoot = richText.shadowRoot;
    if (!shadowRoot) return;

    const contentEl = shadowRoot.querySelector("#contents");
    if (!contentEl) return;

    const signature = extractNodeSignature(contentEl);
    const previousState = hostStates.get(hostElement);
    if (
      previousState &&
      previousState.configVersion === configVersion &&
      previousState.signature === signature
    ) {
      return;
    }

    clearShadowEffects(shadowRoot, hostElement);

    const matched = matchesAnyPattern(signature);
    if (matched) {
      if (blockMode === "blackout") {
        applyShadowHeimu(shadowRoot);
      } else {
        applyShadowHide(hostElement);
      }
    }

    hostStates.set(hostElement, { configVersion, signature, matched });
  }

  function getThreadCommentRoot(threadHost) {
    return threadHost.shadowRoot?.querySelector("#comment")?.shadowRoot ?? null;
  }

  function getThreadRichText(threadHost) {
    return getThreadCommentRoot(threadHost)?.querySelector("#content > bili-rich-text") ?? null;
  }

  function getRepliesRenderer(threadHost) {
    return (
      threadHost.shadowRoot?.querySelector("#replies > bili-comment-replies-renderer") ?? null
    );
  }

  function getReplyRichText(replyHost) {
    return replyHost.shadowRoot?.querySelector("#main > bili-rich-text") ?? null;
  }

  function extractNodeSignature(root) {
    const parts = [];
    const seen = new Set();

    const text = root.textContent?.trim();
    if (text) {
      parts.push(text);
    }

    const labelledNodes = root.querySelectorAll("[alt], [title], [aria-label]");
    for (const node of labelledNodes) {
      const values = [node.getAttribute("alt"), node.getAttribute("title"), node.getAttribute("aria-label")];
      for (const value of values) {
        if (!value) continue;
        const normalized = value.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        parts.push(normalized);
      }
    }

    return parts.join("\n");
  }

  function clearShadowEffects(shadowRoot, hostElement) {
    const heimuStyle = shadowRoot.querySelector("#bcb-heimu-style");
    if (heimuStyle) heimuStyle.remove();

    hostElement.style.display = "";
  }

  function applyShadowHeimu(shadowRoot) {
    if (shadowRoot.querySelector("#bcb-heimu-style")) return;

    const style = document.createElement("style");
    style.id = "bcb-heimu-style";
    style.textContent = `
    #contents {
      background-color: #000 !important;
      color: #000 !important;
      cursor: pointer;
      border-radius: 2px;
      padding: 0 2px;
      transition: color 0.2s;
    }
    #contents:hover {
      color: #fff !important;
    }
    #contents a {
      color: #000 !important;
    }
    #contents:hover a {
      color: #fff !important;
    }
  `;
    shadowRoot.appendChild(style);
  }

  function applyShadowHide(hostElement) {
    hostElement.style.display = "none";
  }

  function processLegacyComment(commentEl) {
    if (!commentEl.isConnected) {
      knownLegacyComments.delete(commentEl);
      hostStates.delete(commentEl);
      return;
    }

    const signature = extractNodeSignature(commentEl);
    const previousState = hostStates.get(commentEl);
    if (
      previousState &&
      previousState.configVersion === configVersion &&
      previousState.signature === signature
    ) {
      return;
    }

    clearLegacyEffects(commentEl);

    const matched = matchesAnyPattern(signature);
    if (matched) {
      if (blockMode === "blackout") {
        applyLegacyHeimu(commentEl);
      } else {
        applyLegacyHide(commentEl);
      }
    }

    hostStates.set(commentEl, { configVersion, signature, matched });
  }

  function clearLegacyEffects(commentEl) {
    const heimuSpans = commentEl.querySelectorAll(".bcb-heimu");
    for (const span of heimuSpans) {
      const textNode = document.createTextNode(span.textContent || "");
      span.parentNode?.replaceChild(textNode, span);
    }

    const hiddenAncestor = commentEl.closest(".bcb-hidden");
    if (hiddenAncestor) {
      hiddenAncestor.classList.remove("bcb-hidden");
    }
  }

  function applyLegacyHeimu(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const node of textNodes) {
      const text = node.textContent;
      if (!matchesAnyPattern(text)) continue;

      const span = document.createElement("span");
      span.className = "bcb-heimu";
      span.textContent = text;
      node.parentNode?.replaceChild(span, node);
    }
  }

  function applyLegacyHide(element) {
    const container = element.closest(".root-reply-container, .sub-reply-container, .reply-wrap");
    if (container) {
      container.classList.add("bcb-hidden");
    }
  }

  function enqueueLegacyFromMutationTarget(target) {
    const element = target instanceof Element ? target : target?.parentElement;
    const commentEl = element?.closest(".reply-content");
    if (commentEl) {
      enqueueLegacyComment(commentEl);
    }
  }

  function observePage() {
    if (!document.documentElement || observedDocumentRoots.has(document.documentElement)) return;

    observedDocumentRoots.add(document.documentElement);
    observeMutations(document.documentElement, (mutations) => {
      for (const mutation of mutations) {
        enqueueLegacyFromMutationTarget(mutation.target);

        if (mutation.target instanceof Element) {
          registerDocumentNode(mutation.target);
        }

        for (const node of mutation.addedNodes) {
          registerDocumentNode(node);
        }
      }
    });

    discoverExistingComments();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action !== "refresh") return;

    init()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error(error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  });

  observePage();
  await init();
})();
