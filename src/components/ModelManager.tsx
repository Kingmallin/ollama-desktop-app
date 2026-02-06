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

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      fetchModels();
    }
  }, [refreshTrigger]);


  const fetchModels = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.OLLAMA.MODELS);
      const data = await response.json();
      const raw = data.models || [];
      // Normalize: support { name } or plain string from API
      const modelList: Model[] = raw.map((m: Model | string) =>
        typeof m === 'string' ? { name: m.trim() } : { name: (m.name || '').trim(), modified_at: m.modified_at, size: m.size }
      ).filter((m: Model) => m.name);
      setModels(modelList);

      if (onModelsLoaded) {
        onModelsLoaded(modelList.map((m) => m.name));
      }

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
    <div className="bg-dark-surface border-b border-dark-border p-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Select Model</label>
          <select
            value={selectedModel}
            onChange={(e) => {
              const v = e.target.value;
              onModelSelect(v);
            }}
            className="w-full min-w-[12rem] bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
            aria-label="Select Ollama model"
          >
            {loading ? (
              <option>Loading models...</option>
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
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Install New Model</label>
          <button
            onClick={() => {
              if (controlledShowDialog === undefined) {
                setInternalShowDialog(true);
              } else if (onInstallDialogOpen) {
                onInstallDialogOpen();
              }
            }}
            disabled={installing}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {installing ? 'Installing...' : 'Browse & Install Model'}
          </button>
        </div>
        <button
          onClick={fetchModels}
          className="px-4 py-2 bg-dark-bg hover:bg-dark-border border border-dark-border rounded-lg transition-colors"
          title="Refresh models"
        >
          🔄
        </button>
      </div>

      {installing && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-dark-muted">{installStatus || `Installing ${installingModelName}...`}</span>
            <span className="text-sm text-dark-muted font-semibold">{installProgress}%</span>
          </div>
          <div className="w-full bg-dark-bg rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
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
