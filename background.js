// Define an object to store extension state
let extensionState = {
  textareaFound: false,
  currentInteraction: "Idle",
  queuedMessages: [],
  lastMessageStatus: "No messages sent yet.",
};

// Add this near the top of the file, with other initialization code
chrome.runtime.setUninstallURL("https://www.chataiqueue.com/goodbye", () => {
  if (chrome.runtime.lastError) {
    console.error("Error setting uninstall URL:", chrome.runtime.lastError);
  } else {
    console.log("Uninstall URL set successfully");
  }
});

// Function to handle item deletion from queue
function deleteQueueItem(index) {
  chrome.storage.local.get("queuedMessages", (data) => {
    const queuedMessages = data.queuedMessages || [];
    if (index >= 0 && index < queuedMessages.length) {
      queuedMessages.splice(index, 1);
      chrome.storage.local.set({ queuedMessages }, () => {
        notifyQueueUpdated();
      });
    }
  });
}

function notifyQueueUpdated() {
  chrome.tabs.query({}, function (tabs) {
    for (let tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "queueUpdated" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log(
            "Error sending message:",
            chrome.runtime.lastError.message
          );
        }
      });
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "deleteQueueItem") {
    deleteQueueItem(request.index);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["promptDelay"], function (result) {
    if (typeof result.promptDelay === "undefined") {
      chrome.storage.local.set({ promptDelay: 0 });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openPopup") {
    chrome.action.openPopup();
  } else if (request.action === "getTabId") {
    // Return the tab ID to the content script
    sendResponse({ tabId: sender.tab?.id });
  }
  return true; // Keep the message channel open for async responses
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    if (changeInfo.url && chrome.scripting) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
      });
    }
  }
});
