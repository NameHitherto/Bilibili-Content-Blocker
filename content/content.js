(async () => {
  const { getBlockMode, getEnabled, getRegexLibrary } = await import(
    chrome.runtime.getURL("utils/storage.js")
  );

  let isEnabled = false;
  let blockMode = "blackout";
  let regexPatterns = [];
  let processingGeneration = 0;

  async function init() {
    isEnabled = await getEnabled();
    blockMode = await getBlockMode();
    const library = await getRegexLibrary();
    regexPatterns = compilePatterns(library);

    if (isEnabled) {
      processAllComments();
      // Re-check for dynamically loaded comments
      [800, 2000, 4000].forEach((delay) => {
        setTimeout(processAllComments, delay);
      });
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

  function matchesAnyPattern(text) {
    if (!text) return false;
    for (const pattern of regexPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) return true;
    }
    return false;
  }

  // ========== Shadow DOM Comment Processing ==========

  function processAllComments() {
    if (!isEnabled) return;

    const biliComments = document.querySelector("#commentapp > bili-comments");
    if (biliComments?.shadowRoot) {
      processShadowDOM(biliComments.shadowRoot);
    }

    // Fallback to legacy light-DOM comment structure
    processLegacyComments();
  }

  function processShadowDOM(shadowRoot) {
    const threads = shadowRoot.querySelectorAll("#feed > bili-comment-thread-renderer");
    for (const thread of threads) {
      processThreadHost(thread);
    }
  }

  function processThreadHost(threadHost) {
    if (!threadHost.shadowRoot) return;

    // Main comment content
    const commentEl = threadHost.shadowRoot.querySelector("#comment");
    if (commentEl?.shadowRoot) {
      const richText = commentEl.shadowRoot.querySelector("#content > bili-rich-text");
      if (richText?.shadowRoot) {
        processRichText(richText, threadHost);
      }
    }

    // Replies to this thread
    const repliesEl = threadHost.shadowRoot.querySelector(
      "#replies > bili-comment-replies-renderer",
    );
    if (repliesEl?.shadowRoot) {
      const replyHosts = repliesEl.shadowRoot.querySelectorAll(
        "#expander-contents > bili-comment-reply-renderer",
      );
      for (const replyHost of replyHosts) {
        processReplyHost(replyHost);
      }
    }
  }

  function processReplyHost(replyHost) {
    if (!replyHost.shadowRoot) return;

    const richText = replyHost.shadowRoot.querySelector("#main > bili-rich-text");
    if (richText?.shadowRoot) {
      processRichText(richText, replyHost);
    }
  }

  function processRichText(richText, hostElement) {
    if (hostElement.dataset.bcbGen === String(processingGeneration)) return;

    const textSpan = richText.shadowRoot.querySelector("#contents > span");
    if (!textSpan) return;

    const matched = matchesAnyPattern(textSpan.textContent || "");

    // Clear any previous effects applied to this host
    clearShadowEffects(richText.shadowRoot, hostElement);

    if (!matched) return;

    hostElement.dataset.bcbGen = String(processingGeneration);

    if (blockMode === "blackout") {
      applyShadowHeimu(richText.shadowRoot);
    } else {
      applyShadowHide(hostElement);
    }
  }

  function clearShadowEffects(shadowRoot, hostElement) {
    const heimuStyle = shadowRoot.querySelector("#bcb-heimu-style");
    if (heimuStyle) heimuStyle.remove();

    hostElement.style.display = "";
  }

  function applyShadowHeimu(shadowRoot) {
    // Avoid injecting duplicate styles
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

  // ========== Legacy Light-DOM Processing ==========

  function processLegacyComments() {
    const commentEls = document.querySelectorAll(".reply-content");
    for (const el of commentEls) {
      processLegacyComment(el);
    }
  }

  function processLegacyComment(commentEl) {
    if (commentEl.dataset.bcbGen === String(processingGeneration)) return;

    const matched = matchesAnyPattern(commentEl.textContent || "");

    // Clear previous effects
    clearLegacyEffects(commentEl);

    if (!matched) return;

    commentEl.dataset.bcbGen = String(processingGeneration);

    if (blockMode === "blackout") {
      applyLegacyHeimu(commentEl);
    } else {
      applyLegacyHide(commentEl);
    }
  }

  function clearLegacyEffects(commentEl) {
    // Unwrap heimu spans
    const heimuSpans = commentEl.querySelectorAll(".bcb-heimu");
    for (const span of heimuSpans) {
      const textNode = document.createTextNode(span.textContent || "");
      span.parentNode?.replaceChild(textNode, span);
    }

    // Restore display on ancestor hidden in previous generation
    const hiddenAncestor = commentEl.closest(".bcb-hidden");
    if (hiddenAncestor) {
      hiddenAncestor.classList.remove("bcb-hidden");
    }
  }

  function applyLegacyHeimu(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
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

  function clearProcessedFlags() {
    processingGeneration++;
  }

  // ========== Dynamic Content Observation ==========

  function observePage() {
    // Watch for bili-comments being added to the DOM
    const domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === "BILI-COMMENTS" || node.querySelector?.("bili-comments")) {
              // Delay to allow shadow root to be populated
              setTimeout(processAllComments, 500);
              setTimeout(processAllComments, 1500);
            }
          }
        }
      }
    });

    domObserver.observe(document.body, { childList: true, subtree: true });

    // Periodic polling for dynamic content (first 3 minutes after script start)
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      processAllComments();
      pollCount++;
      if (pollCount >= 90) clearInterval(pollInterval);
    }, 2000);

    // Global click listener to catch interaction-triggered comment loads
    // (e.g. "view more replies" button clicks)
    document.addEventListener(
      "click",
      () => {
        setTimeout(processAllComments, 500);
        setTimeout(processAllComments, 1500);
      },
      { passive: true },
    );
  }

  // ========== Message Handling ==========

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "refresh") {
      clearProcessedFlags();
      init().then(() => {
        sendResponse({ success: true });
      });
      return true;
    }
  });

  // ========== Start ==========

  init();
  observePage();
})();
