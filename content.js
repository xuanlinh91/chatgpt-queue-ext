// Define a queue to store messages
let messageQueue = [];
let sendingInProgress = false;
let userInput = "";
let currentURL = window.location.href;
const listenerMap = new WeakMap();
let userTyping = false;
let currentTypedMessage = "";
let lastMessageTime = 0;
let countdownInterval = null;
let chatGptResponses = [];
let lastResponseElement = null;
let currentTabId = null;

// Initialize tab ID immediately when script loads
(async function initializeTabId() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTabId' });
    if (response && response.tabId) {
      currentTabId = response.tabId;
      console.log('[RESPONSE HISTORY] Tab ID initialized:', currentTabId);
    } else {
      // Fallback to timestamp-based ID if tab ID is unavailable
      currentTabId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.warn('[RESPONSE HISTORY] Using fallback tab ID:', currentTabId);
    }
  } catch (error) {
    console.error('[RESPONSE HISTORY] Error initializing tab ID:', error);
    // Fallback to timestamp-based ID with random component
    currentTabId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
})();

// Add this utility function near the top of the file
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setUniqueEventListener(element, eventType, listener, options) {
  if (!listenerMap.has(element)) {
    listenerMap.set(element, new Map());
  }

  const elementListeners = listenerMap.get(element);

  if (!elementListeners.has(eventType)) {
    element.addEventListener(eventType, listener, options);
    elementListeners.set(eventType, listener);
  }
}

// Function to save ChatGPT response to history (max 20 responses)
async function saveResponseToHistory(responseText) {
  if (!responseText || responseText.trim().length === 0) {
    return;
  }

  // Wait for tab ID to be initialized if it's not ready yet
  let retries = 0;
  while (currentTabId === null && retries < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }

  if (currentTabId === null) {
    console.error('[RESPONSE HISTORY] Tab ID not initialized after waiting');
    return;
  }

  try {
    // Use tab-specific storage key
    const storageKey = `chatGptResponses_tab${currentTabId}`;
    console.log('[RESPONSE HISTORY] Using storage key:', storageKey);

    const result = await chrome.storage.local.get([storageKey]);
    let responses = result[storageKey] || [];

    // Add new response with timestamp
    responses.push({
      text: responseText,
      timestamp: new Date().toISOString()
    });

    // Keep only the last 20 responses per tab
    if (responses.length > 20) {
      responses = responses.slice(-20);
    }

    // Save back to storage with tab-specific key
    await chrome.storage.local.set({ [storageKey]: responses });
    console.log('[RESPONSE HISTORY] Saved response to', storageKey, '. Total responses:', responses.length);
  } catch (error) {
    console.error('[RESPONSE HISTORY] Error saving response:', error);
  }
}

async function attemptToSendMessage(message) {
  const inputDiv = getPromptInput();

  console.log("Attempting to send message:", message);

  if (!inputDiv) {
    console.log("Prompt input element not found – aborting send");
    return false;
  }

  if (sendingInProgress) {
    console.log("Sending already in progress, aborting");
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));

  const continueButton = Array.from(
    document.querySelectorAll("button.btn")
  ).find((btn) => btn.textContent.includes("Continue generating"));

  if (continueButton) {
    continueButton.click();
    console.log("Continue button found, clicking");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    sendingInProgress = false;
    return;
  }

  if (getPromptText(inputDiv).length && messageQueue.length > 0) {
    console.log("User is still typing, aborting");
    userTyping = true;
    updateMessageList(); // Update to show "waiting for user" message
    return false;
  }

  userTyping = false;
  sendingInProgress = true;

  try {
    const loading =
      document.querySelector('button[data-testid="stop-button"]') ||
      document.querySelector('button[aria-label="Stop generating"]') ||
      document.querySelector('button[data-testid="fruitjuice-stop-button"]') ||
      document.querySelector('button[aria-label="Stop streaming"]');

    console.log("Loading state:", loading ? "active" : "inactive");

    if (!loading && inputDiv) {
      console.log("Setting message in input div");
      const hiddenTA = getHiddenTextarea();
      console.log("[QUEUE DEBUG] Hidden textarea present:", !!hiddenTA);
      console.log("[QUEUE DEBUG] Original message length:", message.length);

      if (hiddenTA) {
        console.log("[QUEUE DEBUG] hiddenTA value BEFORE:", JSON.stringify(hiddenTA.value));
        // 1. Put the message directly in the hidden textarea (source-of-truth for ProseMirror)
        hiddenTA.value = message;
        console.log("[QUEUE DEBUG] hiddenTA value AFTER:", JSON.stringify(hiddenTA.value));

        // 2. Dispatch an input event so ProseMirror ingests the textarea's contents
        hiddenTA.dispatchEvent(
          new InputEvent("input", { bubbles: true, cancelable: true })
        );

        // 3. Update the visible div for user feedback with proper paragraphs
        setProseMirrorContent(inputDiv, message);
        console.log("[QUEUE DEBUG] Visible div after setProseMirrorContent – innerText:", JSON.stringify(inputDiv.innerText));
        console.log("[QUEUE DEBUG] Visible div after setProseMirrorContent – innerHTML:", inputDiv.innerHTML);
      } else {
        // Fallback if the textarea isn't present (older UI)
        setProseMirrorContent(inputDiv, message);
        console.log("[QUEUE DEBUG] Fallback div update – innerText:", JSON.stringify(inputDiv.innerText));
      }

      // add 100ms delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Ensure React updates its internal state in the div version as well
      console.log("[QUEUE DEBUG] Dispatching synthetic input event on visible div");
      inputDiv.dispatchEvent(
        new InputEvent("input", { bubbles: true, cancelable: true })
      );

      // Optional blur so the send button becomes enabled in some UI versions
      inputDiv.blur();

      console.log("Looking for send button");
      const button =
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[aria-label="Send message"]') ||
        document.querySelector(
          'button[data-testid="fruitjuice-send-button"]'
        ) ||
        document.querySelector('button[aria-label="Send prompt"]');

      if (button) {
        button.disabled = false;
        button.dispatchEvent(
          new Event("click", {
            bubbles: true,
            cancelable: true,
          })
        );

        console.log("Send button found, clicking", button);

        // Clear editor content so the queue can proceed to next item
        if (hiddenTA) {
          hiddenTA.value = "";
        }
        // Replace visible content with an empty paragraph so ProseMirror is truly empty
        setProseMirrorContent(inputDiv, "");

        return true;
      } else {
        console.log("Send button not found");
        return false;
      }
    } else {
      console.log("Loading active or input div not found");
      return false;
    }
  } catch (error) {
    console.error("Error during message sending:", error);
    return false;
  } finally {
    sendingInProgress = false;
    console.log("Sending process completed");
  }
}

function updateQueueIndicator() {
  let queueIndicator = document.querySelector("#queue-indicator");
  const inputDiv = getPromptInput();
  if (!queueIndicator) {
    queueIndicator = document.createElement("span");
    queueIndicator.id = "queue-indicator";
    queueIndicator.style.cssText =
      "position: absolute; z-index: 999; top: 0; right: 30px; background-color: red; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px;";
    inputDiv.parentNode.insertBefore(queueIndicator, inputDiv.nextSibling);
  }
  queueIndicator.textContent = messageQueue.length.toString();
  queueIndicator.style.display = messageQueue.length > 0 ? "flex" : "none";
}

function updateMessageList(remainingDelay = 0) {
  let messageList = document.querySelector("#message-list");

  // If there are no messages and no delay, clear any existing countdown
  if (messageQueue.length === 0 && remainingDelay === 0) {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (messageList) {
      messageList.style.display = "none";
    }
    return;
  }

  if (!messageList) {
    messageList = document.createElement("div");
    messageList.id = "message-list";
    messageList.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 200px;
      max-height: 300px;
      background-color: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      color: black;
      padding: 10px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    `;
    document.body.appendChild(messageList);

    const style = document.createElement("style");
    style.textContent = `
      @media (prefers-color-scheme: dark) {
        #message-list {
          background-color: rgba(0, 0, 0, 0.9);
          color: #fff;
          border-color: #666;
        }
        #message-list li {
          border-bottom-color: #555;
        }
      }
      #message-list li:hover {
        text-decoration: underline;
        text-decoration-color: red;
      }
    `;
    document.head.appendChild(style);
  }

  messageList.style.display = "block";
  let content = '<ul style="list-style: none; padding: 0; margin: 0;">';

  // Use escapeHtml when displaying messages in the queue
  content += messageQueue
    .map(
      (msg, index) =>
        `<li style="margin-bottom: 8px; padding: 5px; border-bottom: 1px solid #eee; cursor: pointer;" data-index="${index}">${escapeHtml(msg)}</li>`
    )
    .join("");

  if (userTyping) {
    content += `<li style="font-size: 12px; margin-top: 8px; padding: 5px; font-style: italic; color: #888;">Waiting for user to finish typing...</li>`;
  }

  if (remainingDelay > 0) {
    const secondsRemaining = Math.ceil(remainingDelay / 1000);
    content += `<li style="font-size: 12px; margin-top: 8px; padding: 5px; font-style: italic; color: #888;">Waiting ${secondsRemaining}s before next message...</li>`;
  }

  content += "</ul>";
  messageList.innerHTML = content;

  // Reattach click handlers
  messageList.querySelectorAll("li[data-index]").forEach((item) => {
    item.addEventListener("click", (event) => {
      const index = parseInt(event.target.getAttribute("data-index"));
      deleteQueueItem(index);
    });
  });
}

function deleteQueueItem(index) {
  chrome.runtime.sendMessage({ type: "deleteQueueItem", index }, () => {
    messageQueue.splice(index, 1);
    updateQueueIndicator();
    updateMessageList();
  });
}

function handleKeyDown(event) {
  const sendButton =
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[data-testid="fruitjuice-send-button"]') ||
    document.querySelector('button[aria-label="Send prompt"]');

  const loading =
    document.querySelector('button[data-testid="stop-button"]') ||
    document.querySelector('button[aria-label="Stop generating"]') ||
    document.querySelector('button[data-testid="fruitjuice-stop-button"]') ||
    document.querySelector('button[aria-label="Stop streaming"]');

  const inputDiv = getPromptInput();
  const currentInputValue = inputDiv ? getPromptText(inputDiv) : "";

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();

    // Store the raw message without any escaping
    if (currentInputValue !== currentTypedMessage) {
      currentTypedMessage = currentInputValue;
    }

    if (messageQueue.length === 0 && !loading && currentTypedMessage) {
      attemptToSendMessage(currentTypedMessage);
      return;
    }

    if (currentTypedMessage) {
      // Store the raw message in the queue - no more isPro check
      messageQueue.push(currentTypedMessage);
      const clearEl = getPromptInput();
      if (clearEl) {
        if (clearEl.tagName.toLowerCase() === "textarea") {
          clearEl.value = "";
        } else {
          clearEl.textContent = "";
        }
        clearEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
      currentTypedMessage = "";
      console.log("Message queued:", currentTypedMessage);
      processMessageQueue();
    } else {
      console.log(
        "Message not queued:",
        currentTypedMessage,
        "Queue length:",
        messageQueue.length,
        "Send button:",
        sendButton,
        "Loading:",
        loading
      );
    }
  }
}

function reinjectUIComponents() {
  const inputDiv = getPromptInput();

  if (inputDiv) {
    inputDiv.removeEventListener("keydown", handleKeyDown);
    inputDiv.removeEventListener("input", handleInput);
    inputDiv.hasListener = false;
    addEventListeners();
  }
}

function addEventListeners() {
  const inputDiv = getPromptInput();

  if (inputDiv) {
    if (!inputDiv.hasListener) {
      inputDiv.addEventListener("keydown", handleKeyDown, {
        capture: true,
        passive: false,
      });
      inputDiv.addEventListener("input", handleInput);
      inputDiv.hasListener = true;
    }
  }
}

function handleInput(event) {
  currentTypedMessage = getPromptText(event.target);
}

function scheduleQueueProcessing() {
  setTimeout(async () => {
    if (!sendingInProgress && messageQueue.length > 0) {
      await processMessageQueue();
    }
    scheduleQueueProcessing();
  }, 1000);
}
setInterval(() => {
  if (window.location.href !== currentURL) {
    currentURL = window.location.href;
    reinjectUIComponents();
  }

  const inputDiv = getPromptInput();
  if (inputDiv) {
    const currentValue = getPromptText(inputDiv);
    if (currentValue !== userInput) {
      userInput = currentValue;
      reinjectUIComponents();
    }
  }
}, 2000);

(function injectUI(retryCount = 0) {
  function handleInjection(inputDiv) {
    inputDiv.addEventListener("keydown", handleKeyDown, {
      capture: true,
      passive: false,
    });
    inputDiv.addEventListener("input", handleInput);
    inputDiv.hasListener = true;
    scheduleQueueProcessing();
    setupContinueButtonWatcher();
  }

  let inputDiv = getPromptInput();
  if (inputDiv) {
    handleInjection(inputDiv);
  } else {
    const observer = new MutationObserver((mutations, obs) => {
      inputDiv = getPromptInput();
      if (inputDiv) {
        handleInjection(inputDiv);
        obs.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    if (retryCount < 50) {
      setTimeout(() => injectUI(retryCount + 1), 500);
    }
  }
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addToQueue") {
    // No more pro check - all features are free
    messageQueue.push(...request.messages);
    updateQueueIndicator();
    updateMessageList();
    processMessageQueue();
    sendResponse({ success: true });
  }
  return true;
});

async function processMessageQueue() {
  if (sendingInProgress || messageQueue.length === 0) return;

  // Remove pro status check - unlimited queue for everyone
  const inputDiv = getPromptInput();
  if (inputDiv && getPromptText(inputDiv).length > 0) {
    userTyping = true;
    updateMessageList();
    return;
  }

  // Check if we need to wait due to delay
  const now = Date.now();
  const result = await chrome.storage.local.get(["promptDelay"]);
  const promptDelay = result.promptDelay || 0;
  const timeToWait = Math.max(0, lastMessageTime + promptDelay - now);

  if (timeToWait > 0) {
    // Clear any existing countdown
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }

    // Start a new countdown
    let remainingTime = timeToWait;
    updateMessageList(remainingTime);

    countdownInterval = setInterval(() => {
      remainingTime = Math.max(0, remainingTime - 1000);
      updateMessageList(remainingTime);

      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);

    await new Promise((resolve) => setTimeout(resolve, timeToWait));
  }

  userTyping = false;
  const message = messageQueue[0];
  const success = await attemptToSendMessage(message);

  if (success) {
    lastMessageTime = Date.now();
    messageQueue.shift();
    chrome.storage.local.set({ queuedMessages: messageQueue });
  }

  updateQueueIndicator();
  updateMessageList();
}

function setupContinueButtonWatcher() {
  let lastClickTime = 0;
  const CLICK_COOLDOWN = 2000; // 2 seconds cooldown between clicks
  let wasGenerating = false;

  const observer = new MutationObserver((mutations) => {
    const now = Date.now();

    // Check for continue button
    if (now - lastClickTime >= CLICK_COOLDOWN) {
      const continueButton = Array.from(
        document.querySelectorAll("button.btn")
      ).find((btn) => btn.textContent.includes("Continue generating"));

      if (continueButton) {
        console.log("Continue button found, clicking automatically");
        continueButton.click();
        lastClickTime = now;
      }
    }

    // Check if ChatGPT is currently generating
    const stopButton =
      document.querySelector('button[data-testid="stop-button"]') ||
      document.querySelector('button[aria-label="Stop generating"]') ||
      document.querySelector('button[data-testid="fruitjuice-stop-button"]') ||
      document.querySelector('button[aria-label="Stop streaming"]');

    if (stopButton) {
      wasGenerating = true;
    } else if (wasGenerating) {
      // ChatGPT just finished generating
      wasGenerating = false;

      // Wait a bit for the DOM to settle, then capture the response
      setTimeout(() => {
        captureLastResponse();
      }, 500);
    }
  });

  // Reduce the scope of what we're observing and optimize the configuration
  const chatArea = document.querySelector("main") || document.body;
  observer.observe(chatArea, {
    childList: true,
    subtree: true,
    attributes: false, // We don't need attribute changes
    characterData: false, // We don't need text changes
  });

  return observer;
}

// Function to capture the last ChatGPT response
function captureLastResponse() {
  try {
    // Find all assistant message containers
    // ChatGPT uses data-message-author-role="assistant" for AI responses
    const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');

    if (assistantMessages.length === 0) {
      console.log('[RESPONSE HISTORY] No assistant messages found');
      return;
    }

    // Get the last assistant message
    const lastMessage = assistantMessages[assistantMessages.length - 1];

    // Avoid capturing the same response multiple times
    if (lastMessage === lastResponseElement) {
      console.log('[RESPONSE HISTORY] Response already captured');
      return;
    }

    lastResponseElement = lastMessage;

    // Extract the text content from the message
    // The actual text is usually in a div with class containing "markdown" or direct text content
    const messageText = lastMessage.innerText || lastMessage.textContent || '';

    if (messageText && messageText.trim().length > 0) {
      console.log('[RESPONSE HISTORY] Capturing response:', messageText.substring(0, 100) + '...');
      saveResponseToHistory(messageText.trim());
    }
  } catch (error) {
    console.error('[RESPONSE HISTORY] Error capturing response:', error);
  }
}

// Utility: returns the current prompt input element (textarea or contentEditable div)
function getPromptInput() {
  return (
    document.querySelector("div#prompt-textarea[contenteditable='true']") ||
    document.querySelector("div#prompt-textarea") ||
    document.querySelector("textarea#prompt-textarea")
  );
}

// Utility: returns the text currently inside the prompt element regardless of type
function getPromptText(el) {
  if (el && el.innerText) {
    return el.innerText;
  }
  const ta = getHiddenTextarea();
  if (ta) {
    return ta.value;
  }
  return "";
}

// Utility: returns the hidden textarea used by ProseMirror (if any)
function getHiddenTextarea() {
  // Most recent ChatGPT markup: <textarea ... style="display:none"></textarea> <script></script> <div id="prompt-textarea" contenteditable>
  // Grab textarea that is a sibling of, or lives inside the same wrapper as, the prompt div.
  const promptDiv = document.getElementById("prompt-textarea");
  if (promptDiv && promptDiv.previousElementSibling && promptDiv.previousElementSibling.tagName === "TEXTAREA") {
    return promptDiv.previousElementSibling;
  }

  // Fallback: any textarea that is visually hidden but inside ProseMirror wrapper
  const candidate = document.querySelector("textarea[style*='display: none']");
  if (candidate) return candidate;

  // Ultimate fallback: first textarea on the page (least preferred)
  return document.querySelector("textarea");
}

// For ProseMirror contentEditable div: insert text preserving newlines
function setProseMirrorContent(divEl, text) {
  console.log("[QUEUE DEBUG] setProseMirrorContent invoked. Line count:", text.split(/\n/).length);
  if (!divEl) return;
  divEl.focus();
  // Clear current content
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);

  const lines = text.split(/\n/);
  lines.forEach((line, idx) => {
    console.log("[QUEUE DEBUG] Inserting line", idx, JSON.stringify(line));
    if (idx > 0) {
      // create a new paragraph
      document.execCommand("insertParagraph", false, null);
    }
    if (line.length > 0) {
      document.execCommand("insertText", false, line);
    }
  });
  console.log("[QUEUE DEBUG] divEl.innerHTML after insert:", divEl.innerHTML);
}
