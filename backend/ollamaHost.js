const { URL } = require('url');

/**
 * Resolves OLLAMA_HOST for Node HTTP clients. On Windows, `localhost` often
 * resolves to ::1 first while Ollama listens on 127.0.0.1, causing ECONNREFUSED.
 */
function getOllamaHost() {
  const raw = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').trim();
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '::1') {
      u.hostname = '127.0.0.1';
    }
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.replace(/\/$/, '');
  }
}

module.exports = { getOllamaHost };
