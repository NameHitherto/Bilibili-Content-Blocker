import { getBlockMode, getEnabled, getRegexLibrary } from "../utils/storage.js";

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
    subtree: true,
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
