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

  // Enable download responses section
  const downloadResponsesLink = document.getElementById("downloadResponsesLink");
  const downloadResponsesContainer = document.getElementById("downloadResponsesContainer");
  const downloadButton = document.getElementById("downloadButton");

  if (downloadResponsesLink) {
    downloadResponsesLink.addEventListener("click", function () {
      if (downloadResponsesContainer.style.display === "none") {
        downloadResponsesContainer.style.display = "block";
      } else {
        downloadResponsesContainer.style.display = "none";
      }
    });
  }

  // Handle download button click
  if (downloadButton) {
    downloadButton.addEventListener("click", function () {
      chrome.storage.local.get(['chatGptResponses'], function (result) {
        const responses = result.chatGptResponses || [];

        if (responses.length === 0) {
          alert("No responses saved yet. Start chatting with ChatGPT to save responses!");
          return;
        }

        // Create text content from responses
        let textContent = `ChatGPT Response History\n`;
        textContent += `Generated: ${new Date().toLocaleString()}\n`;
        textContent += `Total Responses: ${responses.length}\n`;
        textContent += `${"=".repeat(80)}\n\n`;

        responses.forEach((response, index) => {
          textContent += `Response ${index + 1}\n`;
          textContent += `Timestamp: ${new Date(response.timestamp).toLocaleString()}\n`;
          textContent += `${"-".repeat(80)}\n`;
          textContent += `${response.text}\n`;
          textContent += `\n${"=".repeat(80)}\n\n`;
        });

        // Create a blob and download it
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chatgpt-responses-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log("Downloaded", responses.length, "responses");
      });
    });
  }
});
