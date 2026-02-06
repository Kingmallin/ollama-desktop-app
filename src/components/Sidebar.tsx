import { useState } from 'react';
import ModelDocumentsPanel from './ModelDocumentsPanel';
import ImageSettings from './ImageSettings';
import type { ConversationSummary } from '../types';

interface SidebarProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  onClearConversation: () => void;
  onNewConversation?: () => void;
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  conversations?: ConversationSummary[];
  currentConversationId?: string | null;
  conversationsLoading?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  onManageDocuments?: () => void;
  onDocumentsChange?: () => void;
  onOpenImageSettings?: () => void;
  onOpenSystemPrompt?: () => void;
}

export default function Sidebar({
  selectedModel,
  onModelChange,
  onClearConversation,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  conversations = [],
  currentConversationId = null,
  conversationsLoading = false,
  isOpen: controlledIsOpen,
  onToggle,
  onManageDocuments,
  onDocumentsChange,
  onOpenImageSettings,
  onOpenSystemPrompt,
}: SidebarProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const [showImageSettings, setShowImageSettings] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen(prev => !prev);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
    } catch {
      return '';
    }
  };

  return (
    <>
      {isOpen && (
        <div className="w-64 bg-dark-surface border-r border-dark-border flex flex-col">
          <div className="p-4 border-b border-dark-border">
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Selected Model</label>
                <div className="text-sm text-dark-muted bg-dark-bg p-2 rounded">
                  {selectedModel || 'None'}
                </div>
              </div>
              {onNewConversation && (
                <button
                  onClick={onNewConversation}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  ➕ New Conversation
                </button>
              )}
              <button
                onClick={onClearConversation}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors mb-2"
              >
                Clear Conversation
              </button>
            </div>

            {/* Conversation list */}
            {onSelectConversation && conversations.length > 0 && (
              <div className="px-4 pb-2 border-t border-dark-border pt-2">
                <h3 className="text-sm font-medium text-dark-muted mb-2">Conversations</h3>
                {conversationsLoading ? (
                  <p className="text-sm text-dark-muted">Loading...</p>
                ) : (
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {conversations.map((c) => (
                      <li key={c.id} className="flex items-center gap-1 group">
                        <button
                          type="button"
                          onClick={() => onSelectConversation(c.id)}
                          className={`flex-1 text-left text-sm px-2 py-1.5 rounded truncate ${
                            c.id === currentConversationId
                              ? 'bg-blue-600/30 text-white'
                              : 'hover:bg-dark-bg text-dark-text'
                          }`}
                          title={c.title}
                        >
                          <span className="block truncate">{c.title || 'New chat'}</span>
                          <span className="block text-xs opacity-75">{formatDate(c.updatedAt)}</span>
                        </button>
                        {onDeleteConversation && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(c.id);
                              onDeleteConversation(c.id);
                              setDeletingId(null);
                            }}
                            disabled={deletingId === c.id}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-600/50 text-red-400 transition-opacity"
                            title="Delete"
                            aria-label="Delete conversation"
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="p-4 pt-2 space-y-2">
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
