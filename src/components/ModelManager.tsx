import { useState, useEffect } from 'react';
import Toast from './Toast';
import ModelInstallDialog from './ModelInstallDialog';
import { API_ENDPOINTS } from '../constants';

interface Model {
  name: string;
  modified_at?: string;
  size?: number;
}

interface ModelManagerProps {
  selectedModel: string;
  onModelSelect: (model: string) => void;
  onModelsLoaded?: (models: string[]) => void;
  refreshTrigger?: number; // Trigger to refresh models
  showInstallDialog?: boolean; // Control install dialog from parent
  onInstallDialogClose?: () => void; // Callback when dialog closes
  onInstallDialogOpen?: () => void; // Callback to request opening dialog
}

interface ConnectionIssue {
  title: string;
  message: string;
  hint?: string;
  code?: string;
}

export default function ModelManager({ selectedModel, onModelSelect, onModelsLoaded, refreshTrigger, showInstallDialog: controlledShowDialog, onInstallDialogClose, onInstallDialogOpen }: ModelManagerProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalShowDialog, setInternalShowDialog] = useState(false);
  const showInstallDialog = controlledShowDialog !== undefined ? controlledShowDialog : internalShowDialog;
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installStatus, setInstallStatus] = useState('');
  const [installingModelName, setInstallingModelName] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  });
  const [connectionIssue, setConnectionIssue] = useState<ConnectionIssue | null>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      fetchModels();
    }
  }, [refreshTrigger]);


  const openOllamaDownload = () => {
    const url = 'https://ollama.com/download';
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(url).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const openPythonDownload = () => {
    const url = 'https://www.python.org/downloads/';
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(url).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const fetchModels = async () => {
    setLoading(true);
    setConnectionIssue(null);
    try {
      const response = await fetch(API_ENDPOINTS.OLLAMA.MODELS);
      let data: {
        models?: unknown;
        error?: string;
        message?: string;
        code?: string;
        hint?: string;
      } = {};
      try {
        data = await response.json();
      } catch {
        data = { message: 'Unexpected response from the app server.' };
      }

      if (!response.ok) {
        setModels([]);
        const unreachable = data.code === 'OLLAMA_UNREACHABLE';
        setConnectionIssue({
          title: unreachable ? 'Ollama is not reachable' : 'Could not load models',
          message: data.message || data.error || `Request failed (${response.status})`,
          hint: data.hint,
          code: data.code,
        });
        onModelsLoaded?.([]);
        if (selectedModel) onModelSelect('');
        return;
      }

      const raw = data.models || [];
      const modelList: Model[] = raw.map((m: Model | string) =>
        typeof m === 'string' ? { name: m.trim() } : { name: (m.name || '').trim(), modified_at: m.modified_at, size: m.size }
      ).filter((m: Model) => m.name);
      setModels(modelList);
      setConnectionIssue(null);

      onModelsLoaded?.(modelList.map((m) => m.name));

      const names = modelList.map((m) => m.name);
      if (modelList.length > 0) {
        if (!selectedModel || !names.includes(selectedModel)) {
          onModelSelect(modelList[0].name);
        }
      } else if (selectedModel) {
        onModelSelect('');
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      const message = error instanceof Error ? error.message : String(error);
      setModels([]);
      setConnectionIssue({
        title: 'Could not reach the app server',
        message,
        hint: 'If the window just opened, wait a few seconds and click Refresh. Otherwise try restarting Ollama Desktop App.',
      });
      onModelsLoaded?.([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallModel = async (modelName: string) => {
    if (!modelName.trim()) return;

    const modelNameToInstall = modelName.trim();
    setInstalling(true);
    setInstallingModelName(modelNameToInstall);
    setInstallProgress(0);
    setInstallStatus('Starting installation...');
    if (controlledShowDialog === undefined) {
      setInternalShowDialog(false);
    } else if (onInstallDialogClose) {
      onInstallDialogClose();
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let abortController: AbortController | null = null;

    try {
      // Create abort controller to handle cleanup
      abortController = new AbortController();
      
      
      const response = await fetch(API_ENDPOINTS.OLLAMA.INSTALL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modelName: modelNameToInstall }),
        signal: abortController.signal,
      });


      // For SSE streams, we need to read the stream even if status isn't 200
      // The error will come through the SSE data
      if (!response.body) {
        throw new Error('Response body is not readable');
      }

      // Read the Server-Sent Events stream from the response
      reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      let streamEnded = false;


      while (!streamEnded) {
        const { done, value } = await reader.read();
        
        if (done) {
          streamEnded = true;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (trimmedLine.startsWith('data: ')) {
            try {
              const jsonStr = trimmedLine.slice(6);
              const data = JSON.parse(jsonStr);
              
              
              if (data.type === 'progress') {
                const progress = Math.max(0, Math.min(100, data.progress || 0));
                setInstallProgress(progress);
                setInstallStatus(data.message || `Installing... ${progress}%`);
              } else if (data.type === 'status') {
                setInstallStatus(data.message || 'Installing...');
                if (data.progress !== undefined) {
                  const progress = Math.max(0, Math.min(100, data.progress || 0));
                  setInstallProgress(progress);
                }
              } else if (data.type === 'complete') {
                streamEnded = true;
                setInstallProgress(100);
                setInstallStatus('Installation complete!');
                await fetchModels();
                setToast({
                  message: data.message || `Model ${modelNameToInstall} installed successfully!`,
                  type: 'success',
                  isVisible: true,
                });
                setTimeout(() => {
                  setInstalling(false);
                  setInstallProgress(0);
                  setInstallStatus('');
                  setInstallingModelName('');
                }, 2000);
                break;
              } else if (data.type === 'error') {
                streamEnded = true;
                setInstalling(false);
                setToast({
                  message: data.message || 'Installation failed',
                  type: 'error',
                  isVisible: true,
                });
                break;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e, trimmedLine);
            }
          }
        }
      }
      
      // Clean up reader
      if (reader) {
        try {
          await reader.cancel();
        } catch (e) {
          // Ignore cancel errors
        }
      }
    } catch (error: any) {
      console.error('Installation error:', error);
      
      // Clean up on error
      if (reader) {
        try {
          await reader.cancel();
        } catch (e) {
          // Ignore cancel errors
        }
      }
      
      if (error.name === 'AbortError') {
        setInstalling(false);
        return;
      }
      
      setInstalling(false);
      setToast({
        message: `Error installing model: ${error.message || 'Unknown error'}`,
        type: 'error',
        isVisible: true,
      });
    }
  };



  return (
    <div className="border-b border-white/[0.06] bg-dark-surface px-5 py-2.5">
      {connectionIssue && (
        <div
          className="mb-3 rounded-lg border border-desk-orange/35 bg-desk-orange/10 px-4 py-3 text-sm text-desk-yellow"
          role="alert"
        >
          <div className="font-semibold text-dark-text">{connectionIssue.title}</div>
          <p className="mt-1 text-dark-muted">{connectionIssue.message}</p>
          {connectionIssue.hint && <p className="mt-2 font-mono text-2xs opacity-90">{connectionIssue.hint}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(connectionIssue.code === 'OLLAMA_UNREACHABLE' ||
              connectionIssue.title.includes('Ollama')) && (
              <>
                <button
                  type="button"
                  onClick={openOllamaDownload}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-black hover:opacity-90"
                >
                  Download Ollama
                </button>
                <button
                  type="button"
                  onClick={openPythonDownload}
                  className="rounded-md border border-white/[0.12] px-3 py-1.5 text-xs text-dark-text hover:bg-dark-elevated"
                >
                  Python (images)
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => fetchModels()}
              className="rounded-md border border-white/[0.12] px-3 py-1.5 text-xs text-dark-muted hover:bg-dark-elevated hover:text-dark-text"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
      {/* Compact toolbar — mirrors example.html model strip */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedModel}
          onChange={(e) => {
            const v = e.target.value;
            onModelSelect(v);
          }}
          className="min-w-[10rem] flex-1 cursor-pointer rounded-md border border-white/[0.08] bg-dark-elevated px-2.5 py-[5px] font-syne text-[11.5px] text-dark-text focus:border-accent focus:outline-none disabled:opacity-50"
          disabled={loading || !!connectionIssue}
          aria-label="Select Ollama model"
        >
          {loading ? (
            <option>Loading models…</option>
          ) : connectionIssue ? (
            <option>Connect Ollama to list models</option>
          ) : models.length === 0 ? (
            <option>No models installed</option>
          ) : (
            <>
              <option value="">Select a model</option>
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </>
          )}
        </select>
        <button
          onClick={() => {
            if (controlledShowDialog === undefined) {
              setInternalShowDialog(true);
            } else if (onInstallDialogOpen) {
              onInstallDialogOpen();
            }
          }}
          disabled={installing || !!connectionIssue}
          className="shrink-0 rounded-md bg-gradient-to-br from-accent to-desk-blue px-3.5 py-2 text-center text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
        >
          {installing ? 'Installing…' : 'Browse & install'}
        </button>
        <button
          onClick={fetchModels}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/[0.1] bg-dark-raised text-dark-muted transition-colors hover:border-white/[0.14] hover:bg-dark-shelf hover:text-dark-text"
          title="Refresh models"
          type="button"
          aria-label="Refresh models"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
        </button>
      </div>

      {installing && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between font-mono text-2xs text-dark-muted">
            <span>{installStatus || `Installing ${installingModelName}…`}</span>
            <span className="text-accent">{installProgress}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-dark-raised">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-desk-blue transition-all duration-300"
              style={{ width: `${installProgress}%` }}
            />
          </div>
        </div>
      )}
      <ModelInstallDialog
        isOpen={showInstallDialog}
        onClose={() => {
          if (controlledShowDialog === undefined) {
            setInternalShowDialog(false);
          } else if (onInstallDialogClose) {
            onInstallDialogClose();
          }
        }}
        onInstall={handleInstallModel}
        isInstalling={installing}
      />
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />
    </div>
  );
}
