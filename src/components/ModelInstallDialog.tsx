import { useState, useEffect } from 'react';

interface ModelInstallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: (modelName: string) => void;
  isInstalling: boolean;
}

interface LibraryModel {
  name: string;
  tags: string[];
}

const POPULAR_MODELS_FALLBACK = [
  { name: 'llama3.2', display: 'Llama 3.2', description: 'Latest Llama model' },
  { name: 'llama3.1', display: 'Llama 3.1', description: 'Llama 3.1 model' },
  { name: 'llama3', display: 'Llama 3', description: 'Llama 3 model' },
  { name: 'llama2', display: 'Llama 2', description: 'Llama 2 model' },
  { name: 'mistral', display: 'Mistral', description: 'Mistral AI model' },
  { name: 'mixtral', display: 'Mixtral', description: 'Mixtral 8x7B model' },
  { name: 'codellama', display: 'Code Llama', description: 'Code generation model' },
  { name: 'codegemma', display: 'CodeGemma', description: 'Google CodeGemma model' },
  { name: 'phi3', display: 'Phi-3', description: 'Microsoft Phi-3 model' },
  { name: 'gemma', display: 'Gemma', description: 'Google Gemma model' },
  { name: 'qwen', display: 'Qwen', description: 'Qwen model' },
  { name: 'neural-chat', display: 'Neural Chat', description: 'Neural Chat model' },
  { name: 'starling-lm', display: 'Starling LM', description: 'Starling language model' },
];

// Common model tags/sizes
const COMMON_TAGS = [
  { tag: 'latest', label: 'Latest (default)', description: 'Latest version' },
  { tag: '1b', label: '1B', description: '1 billion parameters' },
  { tag: '2b', label: '2B', description: '2 billion parameters' },
  { tag: '3b', label: '3B', description: '3 billion parameters' },
  { tag: '7b', label: '7B', description: '7 billion parameters' },
  { tag: '8b', label: '8B', description: '8 billion parameters' },
  { tag: '13b', label: '13B', description: '13 billion parameters' },
  { tag: '34b', label: '34B', description: '34 billion parameters' },
  { tag: '70b', label: '70B', description: '70 billion parameters' },
  { tag: 'instruct', label: 'Instruct', description: 'Instruction-tuned variant' },
  { tag: 'chat', label: 'Chat', description: 'Chat-optimized variant' },
  { tag: 'code', label: 'Code', description: 'Code-specialized variant' },
];

export default function ModelInstallDialog({ isOpen, onClose, onInstall, isInstalling }: ModelInstallDialogProps) {
  const [customModelName, setCustomModelName] = useState('');
  const [selectedBaseModel, setSelectedBaseModel] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>('latest');
  const [customTag, setCustomTag] = useState('');
  const [useCustomTag, setUseCustomTag] = useState(false);
  const [libraryModels, setLibraryModels] = useState<LibraryModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchLibraryModels();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedBaseModel && libraryModels.length > 0) {
      const model = libraryModels.find(m => m.name === selectedBaseModel);
      if (model) {
        setAvailableTags(model.tags);
        // Set default tag to 'latest' if available, otherwise first tag
        if (model.tags.includes('latest')) {
          setSelectedTag('latest');
        } else if (model.tags.length > 0) {
          setSelectedTag(model.tags[0]);
        }
      } else {
        // Fallback to common tags if model not found
        setAvailableTags(COMMON_TAGS.map(t => t.tag));
      }
    }
  }, [selectedBaseModel, libraryModels]);

  const fetchLibraryModels = async () => {
    setLoadingModels(true);
    try {
      const response = await fetch('http://localhost:3001/api/ollama/library');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        setLibraryModels(data.models);
      }
    } catch (error) {
      console.error('Error fetching library models:', error);
      // Use fallback models if fetch fails
      setLibraryModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const getDisplayModels = () => {
    if (libraryModels.length > 0) {
      return libraryModels.map(model => ({
        name: model.name,
        display: model.name.charAt(0).toUpperCase() + model.name.slice(1).replace(/([A-Z])/g, ' $1'),
        description: `${model.tags.length} variants available`,
      }));
    }
    return POPULAR_MODELS_FALLBACK;
  };

  if (!isOpen) return null;

  const handleInstall = () => {
    let modelToInstall = '';
    
    if (customModelName.trim()) {
      // If custom model name is provided, use it as-is (may already include tag)
      modelToInstall = customModelName.trim();
    } else if (selectedBaseModel) {
      // Build model:tag from selected base model and tag
      const tag = useCustomTag ? customTag.trim() : selectedTag;
      if (tag && tag !== 'latest') {
        modelToInstall = `${selectedBaseModel}:${tag}`;
      } else {
        // For 'latest' or no tag, just use model name (Ollama defaults to latest)
        modelToInstall = selectedBaseModel;
      }
    }
    
    if (modelToInstall) {
      onInstall(modelToInstall);
      // Reset state
      setCustomModelName('');
      setSelectedBaseModel(null);
      setSelectedTag('latest');
      setCustomTag('');
      setUseCustomTag(false);
    } else {
      console.error('No model selected for installation');
    }
  };

  const handleModelSelect = (modelName: string) => {
    setSelectedBaseModel(modelName);
    setCustomModelName(''); // Clear custom input when selecting from list
    setSelectedTag('latest'); // Reset to latest
    setUseCustomTag(false);
  };

  const getFullModelName = () => {
    if (customModelName.trim()) {
      return customModelName.trim();
    }
    if (selectedBaseModel) {
      const tag = useCustomTag ? customTag.trim() : selectedTag;
      return tag ? `${selectedBaseModel}:${tag}` : selectedBaseModel;
    }
    return '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-surface border border-dark-border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-dark-text">Install New Model</h2>
          <button
            onClick={onClose}
            disabled={isInstalling}
            className="text-dark-muted hover:text-dark-text text-2xl leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-dark-text">Select Model</label>
            {loadingModels && <span className="text-xs text-dark-muted">Loading models...</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {getDisplayModels().map((model) => (
              <button
                key={model.name}
                onClick={() => handleModelSelect(model.name)}
                disabled={isInstalling}
                className={`p-3 text-left border rounded-lg transition-colors ${
                  selectedBaseModel === model.name
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-dark-bg border-dark-border text-dark-text hover:bg-dark-surface'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="font-semibold">{model.display}</div>
                <div className={`text-xs ${selectedBaseModel === model.name ? 'text-blue-100' : 'text-dark-muted'}`}>
                  {model.description}
                </div>
                <div className={`text-xs mt-1 ${selectedBaseModel === model.name ? 'text-blue-200' : 'text-dark-muted'}`}>
                  {model.name}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Tag/Size Selection - shown when a model is selected */}
        {selectedBaseModel && (
          <div className="mb-4 p-4 bg-dark-bg border border-dark-border rounded-lg">
            <label className="block text-sm font-medium mb-2 text-dark-text">
              Select Size/Tag for <span className="text-blue-400">{selectedBaseModel}</span>
            </label>
            
            <div className="mb-3">
              <div className="grid grid-cols-3 gap-2 mb-2">
                {availableTags.length > 0 ? (
                  // Show available tags from library
                  availableTags.map((tag) => {
                    const tagInfo = COMMON_TAGS.find(t => t.tag === tag) || { 
                      tag, 
                      label: tag, 
                      description: 'Available variant' 
                    };
                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          setSelectedTag(tag);
                          setUseCustomTag(false);
                          setCustomTag('');
                        }}
                        disabled={isInstalling}
                        className={`p-2 text-left border rounded transition-colors text-sm ${
                          !useCustomTag && selectedTag === tag
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-dark-surface border-dark-border text-dark-text hover:bg-dark-bg'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <div className="font-semibold">{tagInfo.label}</div>
                        <div className={`text-xs ${!useCustomTag && selectedTag === tag ? 'text-blue-100' : 'text-dark-muted'}`}>
                          {tagInfo.description}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  // Fallback to common tags
                  COMMON_TAGS.map((tagOption) => (
                    <button
                      key={tagOption.tag}
                      onClick={() => {
                        setSelectedTag(tagOption.tag);
                        setUseCustomTag(false);
                        setCustomTag('');
                      }}
                      disabled={isInstalling}
                      className={`p-2 text-left border rounded transition-colors text-sm ${
                        !useCustomTag && selectedTag === tagOption.tag
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-dark-surface border-dark-border text-dark-text hover:bg-dark-bg'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="font-semibold">{tagOption.label}</div>
                      <div className={`text-xs ${!useCustomTag && selectedTag === tagOption.tag ? 'text-blue-100' : 'text-dark-muted'}`}>
                        {tagOption.description}
                      </div>
                    </button>
                  ))
                )}
              </div>
              
              <div className="mt-2">
                <label className="flex items-center gap-2 text-sm text-dark-text">
                  <input
                    type="checkbox"
                    checked={useCustomTag}
                    onChange={(e) => {
                      setUseCustomTag(e.target.checked);
                      if (!e.target.checked) {
                        setCustomTag('');
                      }
                    }}
                    disabled={isInstalling}
                    className="rounded"
                  />
                  <span>Use custom tag</span>
                </label>
                {useCustomTag && (
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder="e.g., 1b-instruct, 7b-code"
                    disabled={isInstalling}
                    className="w-full mt-2 bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                )}
              </div>
            </div>
            
            <div className="text-sm text-dark-muted bg-dark-surface p-2 rounded">
              <strong>Selected:</strong> <code className="text-blue-400">{getFullModelName()}</code>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-dark-text">Or enter full model name</label>
          <input
            type="text"
            value={customModelName}
            onChange={(e) => {
              setCustomModelName(e.target.value);
              if (e.target.value.trim()) {
                setSelectedBaseModel(null); // Clear selection when typing custom name
                setUseCustomTag(false);
              }
            }}
            placeholder="e.g., codegemma:2b, codegemma:7b, llama3.2:1b"
            disabled={isInstalling}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && getFullModelName()) {
                handleInstall();
              }
            }}
          />
          <p className="text-xs text-dark-muted mt-1">
            Enter full model name with tag: <code className="bg-dark-bg px-1 rounded">model:tag</code>
          </p>
        </div>

        <div className="flex items-center justify-between mb-4 p-3 bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg">
          <div className="text-sm">
            <span className="text-dark-muted">Installing:</span>{' '}
            <code className="text-blue-400 font-semibold">{getFullModelName() || 'No model selected'}</code>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={isInstalling}
            className="px-4 py-2 bg-dark-bg hover:bg-dark-border border border-dark-border rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling || !getFullModelName()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {isInstalling ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  );
}
