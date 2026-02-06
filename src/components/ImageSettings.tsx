import { useState, useEffect } from 'react';
import Toast from './Toast';
import { API_ENDPOINTS, UI_CONFIG } from '../constants';

interface ImageSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LocalImageModel {
  id: string;
  name: string;
  size?: string;
}

interface ImageSettings {
  method: 'auto' | 'local' | 'huggingface-api';
  huggingFaceApiKey: string;
  defaultModel: string;
  useCpu: boolean;
  rewordWithOllama: boolean;
}

interface EnvironmentStatus {
  python: {
    available: boolean;
    message: string;
    pythonVersion?: string;
    installationHint?: string;
  };
  settings: {
    method: string;
    hasApiKey: boolean;
    defaultModel: string;
  };
  availableMethods: {
    local: boolean;
    huggingface: boolean;
  };
}

export default function ImageSettings({ isOpen, onClose }: ImageSettingsProps) {
  const [settings, setSettings] = useState<ImageSettings>({
    method: 'auto',
    huggingFaceApiKey: '',
    defaultModel: 'runwayml/stable-diffusion-v1-5',
    useCpu: false,
    rewordWithOllama: true,
  });
  const [localModels, setLocalModels] = useState<LocalImageModel[]>([]);
  const [installedModelIds, setInstalledModelIds] = useState<string[]>([]);
  const [modelSelectMode, setModelSelectMode] = useState<'preset' | 'custom'>('preset');
  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [installProgress, setInstallProgress] = useState<string>('');
  const [installingModel, setInstallingModel] = useState(false);
  const [uninstallingModel, setUninstallingModel] = useState(false);
  const [installModelError, setInstallModelError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  });

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      fetchSettings();
      fetchLocalModels();
      fetchInstalledModels();
    }
  }, [isOpen]);

  const fetchInstalledModels = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.IMAGE.INSTALLED_MODELS);
      if (!res.ok) {
        // 404 = backend may not have this route yet (restart app to get installed-models support)
        setInstalledModelIds([]);
        return;
      }
      const data = await res.json();
      setInstalledModelIds(Array.isArray(data.installed) ? data.installed : []);
    } catch {
      setInstalledModelIds([]);
    }
  };

  useEffect(() => {
    if (localModels.length && settings.defaultModel && !localModels.some(m => m.id === settings.defaultModel)) {
      setModelSelectMode('custom');
    }
  }, [localModels, settings.defaultModel]);

  const fetchLocalModels = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.IMAGE.MODELS);
      const data = await response.json();
      setLocalModels(data.models || []);
    } catch {
      setLocalModels([]);
    }
  };

  const fetchStatus = async (autoInstall = false) => {
    setLoading(true);
    try {
      const url = autoInstall
        ? API_ENDPOINTS.IMAGE.STATUS(true)
        : API_ENDPOINTS.IMAGE.STATUS();
      const response = await fetch(url);
      const data = await response.json();
      setStatus(data);
      
      // If auto-install was attempted and succeeded, show success message
      if (autoInstall && data.python?.autoInstalled) {
        setToast({
          message: 'Python packages installed successfully!',
          type: 'success',
          isVisible: true,
        });
      }
    } catch (error: any) {
      setToast({
        message: `Error checking environment: ${error.message}`,
        type: 'error',
        isVisible: true,
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleInstallPackages = async () => {
    setLoading(true);
    setInstallProgress('Creating virtual environment...');
    try {
      // Use EventSource or polling for progress updates
      // For now, show progress messages
      const progressSteps = [
        'Creating virtual environment...',
        'Installing diffusers...',
        'Installing torch (this may take a few minutes)...',
        'Installing transformers...',
        'Installing accelerate...',
        'Verifying installation...'
      ];
      
      let stepIndex = 0;
      const progressInterval = setInterval(() => {
        if (stepIndex < progressSteps.length - 1) {
          stepIndex++;
          setInstallProgress(progressSteps[stepIndex]);
        }
      }, 3000);
      
      const response = await fetch(API_ENDPOINTS.IMAGE.INSTALL_PACKAGES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      clearInterval(progressInterval);
      setInstallProgress('Finalizing...');
      
      const result = await response.json();
      
      if (result.success) {
        setInstallProgress('');
        setToast({
          message: result.verified 
            ? 'Packages installed and verified successfully!'
            : 'Packages installed. Please refresh to verify.',
          type: 'success',
          isVisible: true,
        });
        // Refresh status after installation
        setTimeout(() => fetchStatus(false), 1000);
      } else {
        setInstallProgress('');
        setToast({
          message: `Installation failed: ${result.error || result.message}`,
          type: 'error',
          isVisible: true,
        });
      }
    } catch (error: any) {
      setInstallProgress('');
      setToast({
        message: `Error installing packages: ${error.message}`,
        type: 'error',
        isVisible: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.IMAGE.SETTINGS);
      const data = await response.json();
      setSettings({
        ...settings,
        method: data.method || 'auto',
        defaultModel: data.defaultModel || 'runwayml/stable-diffusion-v1-5',
        useCpu: data.useCpu || false,
        rewordWithOllama: data.rewordWithOllama !== false,
      });
    } catch (error: any) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(API_ENDPOINTS.IMAGE.SETTINGS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      const result = await response.json();

      if (result.success) {
        setToast({
          message: 'Image generation settings saved successfully',
          type: 'success',
          isVisible: true,
        });
        await fetchStatus();
        setTimeout(() => onClose(), 1000);
      } else {
        setToast({
          message: result.error || 'Failed to save settings',
          type: 'error',
          isVisible: true,
        });
      }
    } catch (error: any) {
      setToast({
        message: `Error saving settings: ${error.message}`,
        type: 'error',
        isVisible: true,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-dark-surface border border-dark-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Image Generation Settings</h2>
            <button
              onClick={onClose}
              className="text-dark-muted hover:text-dark-text transition-colors text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="text-dark-muted mb-4">
                {installProgress || 'Checking environment...'}
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="text-sm text-dark-muted">Please wait, this may take a few minutes...</span>
              </div>
              {installProgress && (
                <div className="mt-4 text-xs text-dark-muted max-w-md mx-auto">
                  {installProgress.includes('torch') && (
                    <p>Installing PyTorch can take 5-10 minutes depending on your connection speed.</p>
                  )}
                  {installProgress.includes('Creating') && (
                    <p>Setting up isolated Python environment...</p>
                  )}
                </div>
              )}
            </div>
          ) : status ? (
            <div className="space-y-6">
              {/* Environment Status */}
              <div className="p-4 bg-dark-bg rounded-lg border border-dark-border">
                <h3 className="text-sm font-semibold mb-3">Environment Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-dark-muted">Local Generation:</span>
                    <span className={status.availableMethods.local ? 'text-green-400' : 'text-red-400'}>
                      {status.availableMethods.local ? '✓ Available' : '✗ Not Available'}
                    </span>
                  </div>
                  {status.python.available ? (
                    <div className="text-xs text-green-400 mt-1">
                      {status.python.pythonVersion || 'Python ready'}
                      {status.python.autoInstalled && (
                        <span className="ml-2 text-xs">(auto-installed)</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-red-400 mt-1">
                      {status.python.message}
                      {status.python.installationHint && (
                        <div className="mt-2 space-y-2">
                          <div className="font-mono bg-dark-surface p-2 rounded text-xs">
                            {status.python.installationHint}
                          </div>
                          {status.python.canAutoInstall && (
                            <button
                              onClick={() => fetchStatus(true)}
                              disabled={loading}
                              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
                            >
                              {loading ? 'Installing...' : '🔧 Auto-Install Packages'}
                            </button>
                          )}
                          <button
                            onClick={handleInstallPackages}
                            disabled={loading}
                            className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
                          >
                            {loading ? 'Installing...' : '📦 Install Packages Now'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-dark-muted">Hugging Face API:</span>
                    <span className={status.availableMethods.huggingface ? 'text-green-400' : 'text-yellow-400'}>
                      {status.availableMethods.huggingface ? '✓ Configured' : '⚠ Not Configured'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Generation Method */}
              <div>
                <label className="block text-sm font-medium mb-2">Generation Method</label>
                <select
                  value={settings.method}
                  onChange={(e) => setSettings({ ...settings, method: e.target.value as any })}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="auto">Auto (Try local, fallback to API)</option>
                  <option value="local" disabled={!status.availableMethods.local}>
                    Local (Python/diffusers)
                  </option>
                  <option value="huggingface-api" disabled={!status.availableMethods.huggingface}>
                    Hugging Face API
                  </option>
                </select>
                <p className="text-xs text-dark-muted mt-1">
                  {settings.method === 'auto' && 'Will try local generation first, then use API if needed'}
                  {settings.method === 'local' && 'Requires Python with diffusers and torch installed'}
                  {settings.method === 'huggingface-api' && 'Requires Hugging Face API key'}
                </p>
              </div>

              {/* Hugging Face API Key */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Hugging Face API Key</label>
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.huggingFaceApiKey}
                  onChange={(e) => setSettings({ ...settings, huggingFaceApiKey: e.target.value })}
                  placeholder="hf_..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-dark-muted mt-1">
                  Required for &quot;Hugging Face API&quot;. For local: needed to install/use gated models (SD 2.x, SDXL). Get your key from{' '}
                  <a 
                    href="https://huggingface.co/settings/tokens" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Hugging Face Settings
                  </a>
                </p>
              </div>

              {/* Local image model selection – same Python env for all */}
              <div>
                <label className="block text-sm font-medium mb-2">Local image model</label>
                <p className="text-xs text-dark-muted mb-2">
                  Select which model to use for local image generation. All use the same Python environment; each model is downloaded on first use.
                </p>
                <select
                  value={modelSelectMode === 'custom' ? '__custom__' : settings.defaultModel}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__custom__') {
                      setModelSelectMode('custom');
                    } else {
                      setSettings({ ...settings, defaultModel: v });
                      setModelSelectMode('preset');
                    }
                  }}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {localModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.size ? `(${m.size})` : ''}
                    </option>
                  ))}
                  <option value="__custom__">Custom (enter Hugging Face model ID below)</option>
                </select>
                {modelSelectMode === 'custom' && (
                  <input
                    type="text"
                    value={settings.defaultModel}
                    onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value })}
                    placeholder="e.g. runwayml/stable-diffusion-v1-5"
                    className="mt-2 w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                {(settings.method === 'local' || settings.method === 'auto') && status?.availableMethods?.local && settings.defaultModel?.trim() && (
                  <div className="mt-3">
                    {installedModelIds.includes(settings.defaultModel.trim()) ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setUninstallingModel(true);
                          setInstallModelError(null);
                          try {
                            const res = await fetch(API_ENDPOINTS.IMAGE.UNINSTALL_MODEL, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ model: settings.defaultModel.trim() }),
                            });
                            const data = await res.json();
                            if (data.success) {
                              await fetchInstalledModels();
                              setToast({ message: `Model "${settings.defaultModel}" removed from cache.`, type: 'success', isVisible: true });
                            } else {
                              setInstallModelError(data.error || 'Uninstall failed');
                              setToast({ message: data.error || 'Uninstall failed', type: 'error', isVisible: true });
                            }
                          } catch (e: any) {
                            setInstallModelError(e.message || 'Network error');
                            setToast({ message: e.message || 'Failed to remove model', type: 'error', isVisible: true });
                          } finally {
                            setUninstallingModel(false);
                          }
                        }}
                        disabled={uninstallingModel}
                        className="w-full px-3 py-2 bg-red-600/80 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        {uninstallingModel ? (
                          <>
                            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Removing…
                          </>
                        ) : (
                          'Remove this model from cache'
                        )}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!settings.defaultModel?.trim()) return;
                            setInstallingModel(true);
                            setInstallModelError(null);
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 45 * 60 * 1000);
                            try {
                              const res = await fetch(API_ENDPOINTS.IMAGE.INSTALL_MODEL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ model: settings.defaultModel.trim() }),
                                signal: controller.signal,
                              });
                              clearTimeout(timeoutId);
                              const data = await res.json();
                              if (data.success) {
                                await fetchInstalledModels();
                                setToast({ message: `Model "${settings.defaultModel}" installed successfully.`, type: 'success', isVisible: true });
                              } else {
                                setInstallModelError(data.error || data.suggestion || 'Install failed');
                                setToast({ message: data.error || 'Install failed', type: 'error', isVisible: true });
                              }
                            } catch (e: any) {
                              clearTimeout(timeoutId);
                              if (e.name === 'AbortError') {
                                setInstallModelError('Request timed out after 45 minutes. The model may still be downloading in the background—check the app terminal.');
                                setToast({ message: 'Install timed out. Check the terminal—download may still be running.', type: 'error', isVisible: true });
                              } else {
                                setInstallModelError(e.message || 'Network error');
                                setToast({ message: e.message || 'Failed to install model', type: 'error', isVisible: true });
                              }
                            } finally {
                              setInstallingModel(false);
                            }
                          }}
                          disabled={installingModel || !settings.defaultModel?.trim()}
                          className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          {installingModel ? (
                            <>
                              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Downloading… Usually 10–30 min (4–6GB). Don&apos;t close the app.
                            </>
                          ) : (
                            'Install / Download this model'
                          )}
                        </button>
                        {installModelError && (
                          <p className="mt-2 text-xs text-red-400">{installModelError}</p>
                        )}
                      </>
                    )}
                    <p className="text-xs text-dark-muted mt-1">
                      {installedModelIds.includes(settings.defaultModel?.trim() ?? '')
                        ? 'All generated images save to: '
                        : 'First install usually takes 10–30 minutes (models are 4–6GB). Watch the terminal for progress. All generated images save to: '}
                      <code className="bg-dark-bg px-1 rounded">{UI_CONFIG.GENERATED_IMAGES_FOLDER}/</code>
                    </p>
                  </div>
                )}
              </div>

              {/* Reword prompt with selected chat model */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rewordWithOllama"
                    checked={settings.rewordWithOllama}
                    onChange={(e) => setSettings({ ...settings, rewordWithOllama: e.target.checked })}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="rewordWithOllama" className="text-sm font-medium">
                    Reword image request with selected chat model
                  </label>
                </div>
                <p className="text-xs text-dark-muted">
                  Uses the AI model you have selected in the sidebar to turn your request into a clear, safe prompt.
                </p>
              </div>

              {/* CPU Option */}
              {settings.method === 'local' && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useCpu"
                    checked={settings.useCpu}
                    onChange={(e) => setSettings({ ...settings, useCpu: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="useCpu" className="text-sm">
                    Force CPU usage (slower but works without GPU)
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-dark-border">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-dark-bg hover:bg-dark-border border border-dark-border rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-dark-muted">Failed to load status</div>
          )}
        </div>

        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast({ ...toast, isVisible: false })}
        />
      </div>
    </div>
  );
}
