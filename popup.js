document.addEventListener("DOMContentLoaded", function () {
  // Hide sign out and email display - not needed for free extension
  document.getElementById("userEmail").style.display = "none";
  document.getElementById("signOutButton").classList.add("hidden");

  // Make all pro features available
  const proFeatures = document.getElementById("pro-features");
  if (proFeatures) {
    proFeatures.classList.remove("hidden");
  }

  // Enable bulk prompting
  const promptChainLink = document.getElementById("promptChainLink");
  const bulkInputContainer = document.getElementById("bulkInputContainer");
  const bulkQueueInput = document.getElementById("bulkQueueInput");
  const queueButton = document.getElementById("queueButton");

  if (promptChainLink) {
    promptChainLink.classList.remove("pro-feature");
    promptChainLink.removeAttribute("title");
    promptChainLink.addEventListener("click", function () {
      if (bulkInputContainer.style.display === "none") {
        bulkInputContainer.style.display = "block";
      } else {
        bulkInputContainer.style.display = "none";
      }
    });
  }

  if (bulkQueueInput) {
    bulkQueueInput.disabled = false;
  }

  if (queueButton) {
    queueButton.disabled = false;
    queueButton.addEventListener("click", function () {
      const bulkInput = document.getElementById("bulkQueueInput").value;
      const messages = bulkInput.split("~").map((msg) => msg.trim());

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "addToQueue", messages: messages },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error("Error:", chrome.runtime.lastError.message);
            } else {
              console.log("Messages added to queue");
              document.getElementById("bulkQueueInput").value = "";
            }
          }
        );
      });
    });
  }

  // Enable delay settings
  const delaySettingsLink = document.getElementById("delaySettingsLink");
  const delaySettingsContainer = document.getElementById("delaySettingsContainer");
  const promptDelayInput = document.getElementById("promptDelay");

  if (delaySettingsLink) {
    delaySettingsLink.classList.remove("pro-feature");
    delaySettingsLink.removeAttribute("title");
    delaySettingsLink.addEventListener("click", function () {
      if (delaySettingsContainer.style.display === "none") {
        delaySettingsContainer.style.display = "block";
      } else {
        delaySettingsContainer.style.display = "none";
      }
    });
  }

  // Load current delay setting
  chrome.storage.local.get(["promptDelay"], function (result) {
    if (promptDelayInput && typeof result.promptDelay !== "undefined") {
      promptDelayInput.value = result.promptDelay / 1000; // Convert ms to seconds
    }
  });

  // Save delay setting when changed
  if (promptDelayInput) {
    promptDelayInput.addEventListener("change", function () {
      const delayInSeconds = parseInt(this.value) || 0;
      const delayInMs = delayInSeconds * 1000;
      chrome.storage.local.set({ promptDelay: delayInMs }, function () {
        console.log("Prompt delay updated to:", delayInMs, "ms");
      });
    });
  }
});
