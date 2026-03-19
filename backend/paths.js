const path = require('path');

/**
 * Root for writable files (conversations, documents, image settings, venv, generated images).
 * Electron sets OLLAMA_DESKTOP_USER_DATA to app.getPath('userData') before requiring routes
 * so writes never target app.asar (which causes ENOTDIR / read-only errors when packaged).
 */
function getWritableRoot() {
  if (process.env.OLLAMA_DESKTOP_USER_DATA) {
    return process.env.OLLAMA_DESKTOP_USER_DATA;
  }
  return path.join(__dirname, '..');
}

module.exports = { getWritableRoot };
