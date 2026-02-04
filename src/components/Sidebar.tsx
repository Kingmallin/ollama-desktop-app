import { useState } from 'react';
import ModelDocumentsPanel from './ModelDocumentsPanel';
import ImageSettings from './ImageSettings';

interface SidebarProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  onClearConversation: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  onManageDocuments?: () => void;
  onDocumentsChange?: () => void;
  onOpenImageSettings?: () => void;
  onOpenSystemPrompt?: () => void;
}

export default function Sidebar({ selectedModel, onModelChange, onClearConversation, isOpen: controlledIsOpen, onToggle, onManageDocuments, onDocumentsChange, onOpenImageSettings, onOpenSystemPrompt }: SidebarProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const [showImageSettings, setShowImageSettings] = useState(false);
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen(prev => !prev);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="w-64 bg-dark-surface border-r border-dark-border flex flex-col">
          <div className="p-4 border-b border-dark-border">
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <div className="flex-1 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Selected Model</label>
              <div className="text-sm text-dark-muted bg-dark-bg p-2 rounded">
                {selectedModel || 'None'}
              </div>
            </div>
            <button
              onClick={onClearConversation}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors mb-2"
            >
              Clear Conversation
            </button>
            <button
              onClick={onManageDocuments}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              📄 Manage Documents
            </button>
            <button
              onClick={() => {
                setShowImageSettings(true);
                if (onOpenImageSettings) onOpenImageSettings();
              }}
              className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              🎨 Image Generation Settings
            </button>
            <button
              onClick={() => onOpenSystemPrompt?.()}
              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              📝 System Prompt
            </button>
          </div>
          
          {/* Document Assignment Section */}
          <div className="p-4 border-t border-dark-border">
            <ModelDocumentsPanel 
              selectedModel={selectedModel}
              onDocumentsChange={onDocumentsChange}
            />
          </div>
        </div>
      )}
      <ImageSettings
        isOpen={showImageSettings}
        onClose={() => setShowImageSettings(false)}
      />
      <button
        onClick={handleToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 bg-dark-surface border border-dark-border rounded-r-lg p-2 hover:bg-dark-bg transition-colors"
      >
        {isOpen ? '◀' : '▶'}
      </button>
    </>
  );
}
