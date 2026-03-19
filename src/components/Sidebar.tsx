import { useState } from 'react';
import BrandWordmark from './BrandWordmark';
import ModelDocumentsPanel from './ModelDocumentsPanel';
import ImageSettings from './ImageSettings';
import type { ConversationSummary } from '../types';

interface SidebarProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
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
  onBrowseModels?: () => void;
}

export default function Sidebar({
  selectedModel,
  onModelChange,
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
  onBrowseModels,
}: SidebarProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const [showImageSettings, setShowImageSettings] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalIsOpen((prev) => !prev);
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

  const navBtn =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-dark-muted transition-all hover:bg-dark-raised hover:text-dark-text';
  const navBtnActive = 'relative bg-dark-raised text-accent before:absolute before:left-0 before:top-1/4 before:bottom-1/4 before:w-0.5 before:rounded-sm before:bg-accent';

  return (
    <>
      {isOpen && (
        <aside className="flex w-[210px] shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-dark-surface">
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-3.5 pb-3 pt-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-desk-blue font-mono text-[12px] font-bold text-black">
              DL
            </div>
            <div className="min-w-0 leading-tight">
              <div className="leading-tight">
                <BrandWordmark />
              </div>
              <div className="font-mono text-2xs text-dark-dim">local AI workspace</div>
            </div>
          </div>

          <nav className="nav-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2.5">
            <div className="mb-1">
              <div className="px-2 pb-1 pt-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-dark-dim">
                Chat
              </div>
              {onNewConversation && (
                <button
                  type="button"
                  onClick={onNewConversation}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-accent to-desk-blue py-2.5 text-center text-xs font-bold text-black transition-opacity hover:opacity-90"
                >
                  <span>＋</span> New chat
                </button>
              )}
            </div>

            {onSelectConversation && (
              <div className="mt-1">
                <div className="px-2 pb-1 pt-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-dark-dim">
                  History
                </div>
                {conversationsLoading ? (
                  <p className="px-2 py-2 font-mono text-2xs text-dark-muted">Loading…</p>
                ) : conversations.length === 0 ? (
                  <p className="px-2 py-2 text-2xs text-dark-muted">No chats yet</p>
                ) : (
                  <ul className="max-h-44 space-y-0.5 overflow-y-auto">
                    {conversations.map((c) => (
                      <li key={c.id} className="group flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onSelectConversation(c.id)}
                          className={`flex-1 truncate rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                            c.id === currentConversationId
                              ? navBtnActive
                              : 'text-dark-muted hover:bg-dark-raised hover:text-dark-text'
                          }`}
                          title={c.title}
                        >
                          <span className="block truncate font-medium">{c.title || 'New chat'}</span>
                          <span className="block font-mono text-2xs opacity-70">{formatDate(c.updatedAt)}</span>
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
                            className="rounded p-1 text-dark-dim opacity-0 transition-opacity hover:bg-desk-red/10 hover:text-desk-red group-hover:opacity-100"
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

            <div className="mt-2">
              <div className="px-2 pb-1 pt-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-dark-dim">
                Tools
              </div>
              <button type="button" onClick={onManageDocuments} className={navBtn}>
                <span className="w-4 text-center opacity-70">📄</span>
                Documents
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImageSettings(true);
                  onOpenImageSettings?.();
                }}
                className={navBtn}
              >
                <span className="w-4 text-center opacity-70">🎨</span>
                Image gen
              </button>
              <button type="button" onClick={() => onOpenSystemPrompt?.()} className={navBtn}>
                <span className="w-4 text-center opacity-70">⚙</span>
                System prompt
              </button>
            </div>
          </nav>

          <div className="mt-auto flex flex-col gap-2 border-t border-white/[0.06] px-2.5 pb-3.5 pt-2.5">
            {onBrowseModels && (
              <button
                type="button"
                onClick={onBrowseModels}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-accent to-desk-blue py-2.5 text-xs font-bold text-black transition-opacity hover:opacity-90"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path d="M8 1v9M4 7l4 4 4-4M2 13h12" />
                </svg>
                Browse &amp; install
              </button>
            )}
            <div className="rounded-lg border border-white/[0.08] bg-dark-elevated px-2.5 py-2">
              <div className="font-mono text-2xs uppercase tracking-wide text-dark-dim">Active model</div>
              <div className="truncate font-mono text-[11px] font-medium text-accent">{selectedModel || '—'}</div>
            </div>
            <ModelDocumentsPanel selectedModel={selectedModel} onDocumentsChange={onDocumentsChange} />
          </div>
        </aside>
      )}
      <ImageSettings isOpen={showImageSettings} onClose={() => setShowImageSettings(false)} />
      <button
        type="button"
        onClick={handleToggle}
        className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-lg border border-white/[0.08] border-l-0 bg-dark-surface px-2 py-3 font-mono text-dark-muted shadow-desk transition-colors hover:bg-dark-elevated hover:text-dark-text"
        aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isOpen ? '◀' : '▶'}
      </button>
    </>
  );
}
