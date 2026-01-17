# ChatGPT Queue Extension – Debugging & Integration Learnings

> A chronicle of what we discovered while making multi-line prompts and the queue system work reliably with the ever-changing ChatGPT front-end.

---

## 1. Anatomy of ChatGPT's Prompt Area

| Element | Purpose | Notes |
|---------|---------|-------|
| `<div id="prompt-textarea" contenteditable="true" class="ProseMirror">` | **Visible editor**. Users type here. Backed by a ProseMirror instance. | Newlines render as `<p>` paragraphs. `innerText` reflects what users see. |
| `<textarea class="…" style="display:none">` | **Hidden single-source-of-truth** for React/ProseMirror. | When the user *sends* a message, ProseMirror copies its internal doc into this textarea and React POSTs `textarea.value` to the backend. |
| `<script …>` | ProseMirror runtime script that wires the two nodes. | Sits between the textarea and the div. |

Sequence while a **human** types:

1. User edits the *div* (`contenteditable`).
2. ProseMirror updates its internal state **but not** the hidden `<textarea>` yet.
3. When the Send button is clicked or **Ctrl/⌘ + Enter** is pressed, ProseMirror serialises its doc → `textarea.value`, React notices, request is sent.

---

## 2. Failure Modes We Hit

| Symptom | Root Cause |
|---------|------------|
| Newlines disappeared after programmatic send. | We were only updating `div.textContent`; ProseMirror ignored it and sent flattened `textarea.value` (still empty → no `\n`). |
| Spaces/newlines collapsed *visually*. | Replacing `textContent` on the div removed `<p>` tags, leaving a single node. |
| Queue stuck after first message. | Editor wasn't cleared; `processMessageQueue()` saw non-empty prompt and assumed user was still typing. |
| Enter key no longer sent messages. | `getPromptText()` looked at hidden textarea first (still empty while typing), so the extension thought prompt was empty. |

---

## 3. Key Utilities & Strategies

### 3.1 `getPromptInput()`
Returns the **visible ProseMirror div** first, then falls back to legacy selectors.

```js
function getPromptInput() {
  return (
    document.querySelector('div#prompt-textarea[contenteditable="true"]') ||
    document.querySelector('div#prompt-textarea') ||
    document.querySelector('textarea#prompt-textarea')
  );
}
```

### 3.2 `getHiddenTextarea()`
Robust lookup for the hidden `<textarea>`:

* Looks for the sibling preceding `#prompt-textarea`.
* Fallback to any `textarea[style*="display: none"]`.

### 3.3 `setProseMirrorContent(div, text)`
Programmatically writes multi-line content into the ProseMirror div **preserving newlines**:

1. `execCommand('selectAll')` & `delete` → clear.
2. `text.split('\n')` → iterate lines.
3. For each line:
   * If `idx > 0` → `insertParagraph` (creates `<p>`).
   * `insertText` the line's text.

### 3.4 `attemptToSendMessage(message)` workflow

1. **Write** `message` into hidden textarea **and** visible div:
   ```js
   hiddenTA.value = message;
   hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true }));
   setProseMirrorContent(div, message);
   ```
2. Small `await` (100 ms) to give React a tick.
3. Dispatch synthetic `InputEvent` on the div (covers UI versions without textarea).
4. Find and click send button.
5. **Clear** textarea + div via `setProseMirrorContent(div, '')` so queue can proceed.

### 3.5 `getPromptText(el)`
Reads editor content without trimming:

* Prefer `el.innerText` (what the user sees while typing).
* Fallback to hidden textarea's `.value` (for queued messages we just injected).

---

## 4. Console Debugging Hooks

Added granular logs prefixed with `[QUEUE DEBUG]`:

* Hidden-textarea presence & values before/after injection.
* Line-by-line inserts into ProseMirror.
* `innerText`/`innerHTML` snapshots post-insertion.
* Synthetic `input` dispatch.

These let us confirm:

1. Which path (textarea vs div) was taken.
2. Whether newlines were translated into multiple `<p>` tags.
3. That the editor is empty right after sending.

---

## 5. Best Practices Learned

1. **Always update the hidden textarea when automating ChatGPT** – it's what ultimately gets POSTed.
2. Use `InputEvent` over generic `Event('input')` for modern editors (triggers React synthetic event system).
3. After programmatic send, **reset** both textarea and div to avoid "user-typing" false positives.
4. For multi-line support in contenteditable/ProseMirror, use `execCommand('insertParagraph')` rather than plain `innerHTML`.
5. When detecting current prompt text while the user is typing, rely on `div.innerText`; hidden textarea may still be empty.

---

## 6. Open Questions / Future Proofing

* ChatGPT front-end evolves frequently – keep selectors (`data-testid`, IDs) flexible and monitor for DOM changes.
* Investigate ProseMirror's official API (if exposed) instead of `execCommand` (deprecated but still widely supported).
* Consider MutationObserver to detect when a message actually starts streaming, rather than relying solely on send-button click.

---

**End of document** 