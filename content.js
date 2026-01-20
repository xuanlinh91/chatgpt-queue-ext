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



      if (hiddenTA) {

        // 1. Put the message directly in the hidden textarea (source-of-truth for ProseMirror)
        hiddenTA.value = message;


        // 2. Dispatch an input event so ProseMirror ingests the textarea's contents
        hiddenTA.dispatchEvent(
          new InputEvent("input", { bubbles: true, cancelable: true })
        );

        // 3. Update the visible div for user feedback with proper paragraphs
        setProseMirrorContent(inputDiv, message);


      } else {
        // Fallback if the textarea isn't present (older UI)
        setProseMirrorContent(inputDiv, message);

      }

      // add 100ms delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Ensure React updates its internal state in the div version as well

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

// Listener for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addToQueue") {
    // No more pro check - all features are free
    messageQueue.push(...request.messages);
    updateQueueIndicator();
    updateMessageList();
    processMessageQueue();
    sendResponse({ success: true });
  } else if (request.action === "getConversation") {
    // Scrape full conversation from DOM
    const conversation = [];
    const messageElements = document.querySelectorAll('[data-message-author-role="assistant"]');

    messageElements.forEach((el) => {
      // Helper to get text content
      const textContent = el.innerText || el.textContent || '';

      // Clean up text: replace 2 or more newlines with a single newline to be compact
      // The user wants to remove 'double line break' in the download content
      let cleanText = textContent.trim().replace(/\n{2,}/g, '\n');

      if (cleanText) {
        conversation.push(cleanText);
      }
    });

    const fullText = conversation.join('\n');
    sendResponse({ conversation: fullText });
  }
  return true; // Keep channel open for async response if needed
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

  if (!divEl) return;
  divEl.focus();
  // Clear current content
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);

  const lines = text.split(/\n/);
  lines.forEach((line, idx) => {

    if (idx > 0) {
      // create a new paragraph
      document.execCommand("insertParagraph", false, null);
    }
    if (line.length > 0) {
      document.execCommand("insertText", false, line);
    }
  });

}
