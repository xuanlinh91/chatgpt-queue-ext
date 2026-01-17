# Pro-status throttling update (Sept 2024)

### Context
The background service-worker was re-initialising its in-memory timestamps on every wake-up.  
When the user navigated quickly between pages, the worker could spawn many times per minute, each time issuing a fresh `checkSub` request. This resulted in unnecessary load on the API and noisy network traffic.

### Minimal, backwards-compatible fixes

| Area | Change | Why it matters |
|------|--------|----------------|
| `background.js` | **`restoreStateFromStorage()`** loads `isPro`, throttling timestamps and back-off values from `chrome.storage.local` at start-up. | Persists state across service-worker restarts so throttling logic remains effective. |
| `tabs.onUpdated` listener | For non-ChatGPT pages we now read `lastSuccessfulCheckTimestamp` from storage and only run `checkProStatus` when the cached value is older than **`NON_PRO_CACHE_DURATION`** (1 h). | Eliminates redundant checks while the user browses around. |

_No functional changes were made to content-script queueing or UI behaviour._

### Regression-test checklist
- Startup ➜ single API call.
- Reload ChatGPT ➜ API call iff last one >30 min ago.
- Navigate external pages within 1 h ➜ **no** additional calls.
- Service-worker terminated then external page load ➜ still suppressed (storage guards in effect).

### Expected outcome
API traffic per user now respects the existing back-off & cache windows, dramatically reducing "spam" while keeping the real-time Pro-status experience intact. 