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


  // Download button is now always visible
  const downloadButton = document.getElementById("downloadButton");
  const responseCountInput = document.getElementById("responseCount");

  // Allow Enter key on input to trigger download
  if (responseCountInput && downloadButton) {
    responseCountInput.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        downloadButton.click();
      }
    });
  }


  // Handle download button click
  if (downloadButton) {
    downloadButton.addEventListener("click", function () {
      // Get the number of responses to download from the input field
      const responseCountInput = document.getElementById("responseCount");
      let responseCount = parseInt(responseCountInput.value) || 1;

      // Ensure the count is within valid range
      responseCount = Math.max(1, Math.min(20, responseCount));

      // Get the current tab to download only its responses
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const currentTab = tabs[0];

        // Get the storage key for the current tab
        const currentTabStorageKey = `chatGptResponses_tab${currentTab.id}`;

        chrome.storage.local.get([currentTabStorageKey], function (result) {
          const responses = result[currentTabStorageKey] || [];

          if (responses.length === 0) {
            alert("No responses saved yet in this tab. Start chatting with ChatGPT to save responses!");
            return;
          }

          // Sort by timestamp (oldest to newest)
          responses.sort((a, b) => {
            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);
            return dateA - dateB;
          });

          // Get only the latest N responses
          const latestResponses = responses.slice(-responseCount);

          // Create text content from responses (only raw text, no metadata)
          let textContent = '';

          latestResponses.forEach((response, index) => {
            // Replace double line breaks with single line breaks inside the response
            const processedText = response.text.replace(/\n\n/g, '\n');
            textContent += `${processedText}\n`;
          });

          // Create a blob and download it
          const blob = new Blob([textContent], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `chatgpt-tab${currentTab.id}-responses-${new Date().toISOString().split('T')[0]}.txt`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          console.log(`Downloaded ${latestResponses.length} responses from current tab (ID: ${currentTab.id})`);
        });
      });
    });
  }
});
