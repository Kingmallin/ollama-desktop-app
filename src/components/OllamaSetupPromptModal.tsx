import { useState, useEffect, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../constants';

interface OllamaStatusResponse {
  available: boolean;
  message: string;
  modelsCount?: number;
  installationHint?: string;
  code?: string;
}

interface OllamaSetupPromptModalProps {
  isOpen: boolean;
  onDismissForSession: () => void;
  onOllamaAvailable: () => void;
}

function openExternalUrl(url: string) {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function OllamaSetupPromptModal({
  isOpen,
  onDismissForSession,
  onOllamaAvailable,
}: OllamaSetupPromptModalProps) {
  const [status, setStatus] = useState<OllamaStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const onAvailableRef = useRef(onOllamaAvailable);
  onAvailableRef.current = onOllamaAvailable;

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.OLLAMA.STATUS);
      const data = (await res.json()) as OllamaStatusResponse;
      setStatus(data);
      if (data.available) {
        onAvailableRef.current();
      }
    } catch {
      setStatus({
        available: false,
        message: 'Could not reach the app server.',
        installationHint:
          'Wait a few seconds after launch and click “Check again”. If this persists, restart Ollama Desktop App.',
        code: 'APP_SERVER',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStatus(null);
      return;
    }
    void fetchStatus();
  }, [isOpen, fetchStatus]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ollama-setup-title"
    >
      <div className="mx-4 w-full max-w-lg rounded-lg border border-white/[0.08] bg-dark-surface shadow-desk">
        <div className="border-b border-white/[0.08] p-4">
          <h2 id="ollama-setup-title" className="text-xl font-semibold text-dark-text">
            Environment status: Ollama
          </h2>
          <p className="mt-1 text-sm text-dark-muted">
            Same idea as <strong className="text-dark-text">Image Generation → Environment Status</strong> for Python:
            chat needs Ollama installed and running on your PC.
          </p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          {loading && !status ? (
            <div className="flex items-center justify-center gap-2 py-8 text-dark-muted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              <span className="text-sm">Checking Ollama…</span>
            </div>
          ) : status ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-white/[0.08] bg-dark-elevated p-4">
                <h3 className="mb-3 text-sm font-semibold">Ollama (required for chat)</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-dark-muted">Connection:</span>
                  <span className={status.available ? 'text-green-400' : 'text-red-400'}>
                    {status.available ? '✓ Available' : '✗ Not available'}
                  </span>
                </div>
                {status.available ? (
                  <p className="mt-2 text-xs text-green-400/90">{status.message}</p>
                ) : (
                  <div className="mt-2 text-xs text-red-400">
                    <p>{status.message}</p>
                    {status.installationHint ? (
                      <div className="mt-3 rounded bg-dark-surface p-3 font-mono text-[11px] leading-relaxed whitespace-pre-line text-red-200/90">
                        {status.installationHint}
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {status.code === 'OLLAMA_UNREACHABLE' && (
                        <button
                          type="button"
                          onClick={() => openExternalUrl('https://ollama.com/download')}
                          className="w-full rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                        >
                          Download Ollama
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void fetchStatus()}
                        disabled={loading}
                        className="w-full rounded bg-purple-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-600"
                      >
                        {loading ? 'Checking…' : 'Check again'}
                      </button>
                      <button
                        type="button"
                        onClick={onDismissForSession}
                        className="w-full rounded border border-dark-border px-3 py-2 text-xs text-dark-muted transition-colors hover:bg-dark-bg hover:text-dark-text"
                      >
                        Continue without Ollama (hide until next launch)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-dark-muted">
                For <strong className="text-dark-text">local image generation</strong>, open image settings and follow the
                Python / packages prompts there.
              </p>
            </div>
          ) : null}
        </div>

        {status?.available ? (
          <div className="border-t border-dark-border p-4">
            <button
              type="button"
              onClick={onDismissForSession}
              className="w-full rounded bg-dark-bg px-3 py-2 text-sm text-dark-text ring-1 ring-dark-border hover:bg-dark-border"
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
