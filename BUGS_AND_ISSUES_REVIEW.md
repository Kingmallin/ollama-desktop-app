# Bug & Issue Review

**Date:** February 4, 2026  
**Scope:** Bugs, security, and unforeseen issues in the current app.

---

## Critical (fixed in code)

### 1. Ollama `httpGet` crash on empty or invalid JSON
- **Where:** `backend/routes/ollama.js` – `httpGet()` in `res.on('end')`
- **Issue:** If Ollama returns 200 with an empty body or non-JSON, `JSON.parse(data)` throws and can crash the route or leave the request hanging.
- **Fix:** Wrap `JSON.parse(data)` in try/catch and reject with a clear error.

### 2. Path traversal in documents browse
- **Where:** `backend/routes/documents.js` – `GET /browse?path=...`
- **Issue:** A path like `/mnt/c/../../etc` passes the `startsWith('/mnt/')` check but resolves outside the intended directory, allowing listing of arbitrary folders.
- **Fix:** Resolve the path with `path.normalize` and ensure the resolved path is still under the allowed roots (`/mnt/` or `/home/`).

### 3. Express server port in use
- **Where:** `electron/main.js` – `expressApp.listen(3001, ...)`
- **Issue:** No `error` handler on the server. If port 3001 is already in use, the app throws an unhandled exception and may fail to start without a clear message.
- **Fix:** Add `.on('error', (err) => { ... })` and show a user-visible error (e.g. dialog or console).

### 4. No JSON body size limit
- **Where:** `electron/main.js` – `expressApp.use(express.json())`
- **Issue:** A very large JSON body (e.g. chat with huge messages) could cause high memory use or DoS.
- **Fix:** Add a reasonable limit, e.g. `express.json({ limit: '10mb' })`.

---

## Medium (recommended / optional)

### 5. `read-file` IPC and path safety
- **Where:** `electron/main.js` – `ipcMain.handle('read-file', ...)`
- **Issue:** The renderer can send any path; the main process will try to read it. In this app the renderer is trusted (our code), but if `read-file` is ever called with user-controlled input (e.g. from a text field), an attacker could read arbitrary files.
- **Recommendation:** Only ever call `read-file` with paths that come from the system file dialog (or another trusted source). If you add features that take path input from the user, validate or restrict paths (e.g. under a known root) before calling `read-file`.

### 6. Chat stream request size
- **Where:** `backend/routes/ollama.js` – `POST /chat/stream`
- **Issue:** No limit on `messages` array length or total content size. An extremely large request could slow or crash the backend or Ollama.
- **Recommendation:** Add optional limits (e.g. max messages, max total characters) and return 400 if exceeded.

### 7. Hardcoded API base URL in some components
- **Where:** `DocumentsPanel.tsx`, `ModelDocumentsPanel.tsx`, `DocumentManager.tsx`, `FileBrowser.tsx`, `ModelInstallDialog.tsx`
- **Issue:** Some components use `'http://localhost:3001/...'` instead of `API_ENDPOINTS` from `constants`. If the backend port or base URL changes, these will break.
- **Recommendation:** Use `API_ENDPOINTS` (or a single config) everywhere.

---

## Low / nice to have

### 8. Chat “Stop” does not stop Ollama
- **Where:** `backend/routes/ollama.js` – `POST /chat/stop`
- **Issue:** Handler only returns success; it does not actually cancel an in-flight Ollama generation. The frontend aborts the fetch, so the stream stops for the UI, but Ollama may still be running.
- **Note:** Ollama’s API may not support cancellation; this is a limitation rather than a bug. Document it for users.

### 9. Sandbox cleanup on crash
- **Where:** `backend/routes/sandbox.js`
- **Issue:** If the Node process crashes before `cleanup()` runs, temporary files in `SANDBOX_DIR` can accumulate. Not a security issue because files are in `os.tmpdir()` and overwritten by timestamp.
- **Recommendation:** Optional periodic cleanup of old files in `SANDBOX_DIR` (e.g. older than 1 hour).

### 10. DevTools open by default in dev
- **Where:** `electron/main.js` – `mainWindow.webContents.openDevTools()` when `isDev`
- **Issue:** Can be surprising or noisy; some prefer to open DevTools manually.
- **Recommendation:** Consider removing or making it configurable (e.g. env var).

---

## Summary

- **Critical:** 4 items identified and fixed (ollama httpGet, browse path traversal, server error handler, JSON body limit).
- **Medium:** 3 items documented for follow-up (read-file usage, chat size limits, consistent API base URL).
- **Low:** 3 items noted (stop behavior, sandbox temp files, DevTools in dev).

After applying the fixes, run the app and test: model list, chat stream, document upload/browse, and image generation.
