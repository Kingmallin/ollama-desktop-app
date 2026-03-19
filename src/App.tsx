import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import ModelManager from './components/ModelManager';
import OllamaSetupPromptModal from './components/OllamaSetupPromptModal';
import DocumentsPanel from './components/DocumentsPanel';
import { buildMessagesWithSystemPrompt } from './utils/prompts';
import { API_ENDPOINTS, LIMITS, SESSION_STORAGE_KEYS } from './constants';
import SystemPromptSettings from './components/SystemPromptSettings';
import {
  getStoredSystemPromptPresetId,
  getStoredSystemPromptCustom,
  CUSTOM_PRESET_ID,
  getSystemPromptBarPreview,
} from './components/SystemPromptSettings';
import type { Message, Document, ConversationSummary } from './types';

/**
 * Image tool runs only if the *user* clearly asked for a generated image/picture/drawing.
 * Stops false triggers when the model hallucinates [IMAGE: …] on generic prompts (“make something awesome”).
 */
function userRequestedImageGeneration(userText: string): boolean {
  const t = userText.trim().toLowerCase();
  if (!t) return false;
  if (
    /\b(draw|sketch|paint|illustrat|visuali[sz]e|dall-?e|midjourney|stable\s*diff(?:usion)?|sdxl|text-?to-?image|img2img)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(generate|create|make|give\s+me|show\s+me)\s+(an?\s+)?(image|picture|photo|illustration|artwork|wallpaper|banner|thumbnail)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(image|picture|photo|illustration|artwork)\s+(of|showing|for|depicting)\b/.test(t)) {
    return true;
  }
  if (/\b(emoji|icon)\s+(image|picture|asset)\b/.test(t) || /🎨/.test(userText)) {
    return true;
  }
  return false;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelRefreshTrigger, setModelRefreshTrigger] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showModelInstallDialog, setShowModelInstallDialog] = useState(false);
  const [showDocumentsPanel, setShowDocumentsPanel] = useState(false);
  const [showSystemPromptSettings, setShowSystemPromptSettings] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [lastUsedDocuments, setLastUsedDocuments] = useState<string[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [showOllamaSetupPrompt, setShowOllamaSetupPrompt] = useState(false);

  const handleSendMessage = async (content: string) => {
    if (!selectedModel || !content.trim()) return;

    setLastUsedDocuments([]);

    // RAG only when at least one library doc is assigned to the active model — skip all document API calls otherwise (faster TTFT).
    const assignedDocs =
      documents.length > 0
        ? documents.filter((doc: Document) => doc.assignedModels?.includes(selectedModel))
        : [];

    // All messages go to the AI; image generation runs only if the model emits [IMAGE: …] (see extractImagePrompt after stream).
    let ragContext = '';
    if (assignedDocs.length > 0) {
      try {
          // Try to search first, but if no results, still include all assigned documents
          let docContents: string[] = [];
          
          try {
            const searchResponse = await fetch(API_ENDPOINTS.DOCUMENTS.SEARCH, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query: content }),
            });
            const searchResult = await searchResponse.json();
            
            if (searchResult.success && searchResult.results.length > 0) {
              // Filter results to only include documents assigned to current model
              const assignedResults = searchResult.results.filter((result: { id: string; name: string }) => {
                const doc = assignedDocs.find((d: Document) => d.id === result.id);
                return doc !== undefined;
              });
              
              if (assignedResults.length > 0) {
                // Use chunks from search results (more precise than full documents)
                const topDocs = assignedResults.slice(0, LIMITS.MAX_DOCUMENTS_PER_QUERY);
                
                for (const result of topDocs) {
                  if ((result as any).matchedChunks && (result as any).matchedChunks.length > 0) {
                    // Use the most relevant chunks from this document
                    const topChunks = (result as any).matchedChunks.slice(0, LIMITS.MAX_CHUNKS_PER_DOCUMENT);
                    const chunkTexts = topChunks.map((chunk: { chunkIndex: number; text: string }) => 
                      `[Section ${chunk.chunkIndex + 1} from "${result.name}"]:\n${chunk.text}`
                    );
                    const combinedChunks = `From document "${result.name}" (${topChunks.length} relevant sections):\n${chunkTexts.join('\n\n---\n\n')}`;
                    docContents.push(combinedChunks);
                  } else {
                    // Fallback: if no chunks, fetch full content (for backwards compatibility)
                    try {
                      const contentResponse = await fetch(API_ENDPOINTS.DOCUMENTS.CONTENT(result.id));
                      const contentData = await contentResponse.json();
                      if (contentData.success && contentData.content && contentData.content.trim().length > 0) {
                        if (!contentData.content.includes('text extraction requires') && 
                            !contentData.content.includes('File:') &&
                            !contentData.content.includes('Failed to extract')) {
                          const docContent = contentData.content.substring(0, LIMITS.MAX_DOCUMENT_PREVIEW_LENGTH);
                          docContents.push(`From document "${result.name}":\n${docContent}`);
                        }
                      }
                    } catch (error) {
                      console.error(`Error fetching content for document ${result.id}:`, error);
                    }
                  }
                }
              }
            }
          } catch (searchError) {
            console.error('🔍 RAG: Search error:', searchError);
          }
          
          // If search didn't find results, include all assigned documents (up to limit to avoid token limits)
          if (docContents.length === 0 && assignedDocs.length > 0) {
            const docsToInclude = assignedDocs.slice(0, LIMITS.MAX_DOCUMENTS_PER_QUERY);
            const allDocContents = await Promise.all(
              docsToInclude.map(async (doc: Document) => {
                try {
                  const contentResponse = await fetch(API_ENDPOINTS.DOCUMENTS.CONTENT(doc.id));
                  const contentData = await contentResponse.json();
                  if (contentData.success && contentData.content && contentData.content.trim().length > 0) {
                    // Check if it's actual content or just an error message
                    if (contentData.content.includes('text extraction requires') || 
                        contentData.content.includes('File:') ||
                        contentData.content.includes('Failed to extract')) {
                      return '';
                    }
                    // Use up to max document content length
                    const docContent = contentData.content.substring(0, LIMITS.MAX_DOCUMENT_CONTENT_LENGTH);
                    return `From document "${doc.name}":\n${docContent}`;
                  } else {
                    return '';
                  }
                } catch (error) {
                  console.error(`Error fetching content for document ${doc.id}:`, error);
                  return '';
                }
              })
            );
            docContents = allDocContents.filter(c => c && c.trim().length > 0);
          }
          
          if (docContents.length > 0) {
            // Limit total context to avoid token limits
            let totalContext = '';
            const usedDocuments: string[] = [];
            
            for (const docContent of docContents) {
              if (totalContext.length + docContent.length > LIMITS.MAX_CONTEXT_LENGTH) {
                // Add partial content if there's room
                const remaining = LIMITS.MAX_CONTEXT_LENGTH - totalContext.length;
                if (remaining > 500) {
                  totalContext += docContent.substring(0, remaining) + '\n\n... (truncated)';
                  // Extract document name from content string
                  const docMatch = docContent.match(/From document "([^"]+)"/);
                  if (docMatch) usedDocuments.push(docMatch[1]);
                }
                break;
              }
              totalContext += docContent + '\n\n---\n\n';
              // Extract document name
              const docMatch = docContent.match(/From document "([^"]+)"/);
              if (docMatch) usedDocuments.push(docMatch[1]);
            }
            
            ragContext = '\n\n=== RELEVANT CONTEXT FROM YOUR DOCUMENTS ===\n' + 
                        totalContext.trim() + 
                        '\n\n=== END OF DOCUMENT CONTEXT ===\n\nPlease use the information from the documents above to answer the user\'s question.';
            
            // Store which documents were used for this message
            setLastUsedDocuments(usedDocuments);
          }
      } catch (error) {
        console.error('Error searching documents:', error);
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsGenerating(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Add RAG context to the user message - make it very clear
      const userContentWithContext = ragContext 
        ? `${content}\n\n${ragContext}` 
        : content;
      
      const response = await fetch(API_ENDPOINTS.OLLAMA.CHAT_STREAM, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: buildMessagesWithSystemPrompt(
            [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: userContentWithContext },
            ],
            true,
            availableModels,
            ragContext.length > 0,
            true,
            {
              presetId: getStoredSystemPromptPresetId(),
              customPrompt: getStoredSystemPromptPresetId() === CUSTOM_PRESET_ID ? getStoredSystemPromptCustom() : undefined,
            }
          ),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error(`Failed to get response: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      let assistantContent = '';
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        codeBlocks: [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      // Image generation is a tool call only: the model must emit [IMAGE: natural-language prompt].
      // We do not infer intent from prose (“I’ll draw…”) — avoids false triggers during HTML/code replies.
      const extractImagePrompt = (text: string): string | null => {
        const textWithoutCode = text.replace(/```[\s\S]*?```/g, '').trim();
        if (!textWithoutCode) return null;

        const looksLikeHtmlOrMarkup = (s: string): boolean => {
          const t = s.trim();
          if (!t) return true;
          if (/[<>]/.test(t)) return true;
          if (/^\s*["']?\s*<!DOCTYPE\s/i.test(t) || /\b(html|body|head|div|span|img|src|href|class|style)\s*=/i.test(t)) return true;
          if (/\b(\d+(px|rem|em)|#[0-9a-f]{3,8}\b|flexbox|grid-template|margin\s*:|padding\s*:)/i.test(t)) return true;
          if (/\b(image|img)\s+(tag|tags|element|attribute|gallery|sprite|map)\b/i.test(t)) return true;
          return false;
        };

        const structuredMatch = textWithoutCode.match(/\[IMAGE:\s*([^\]]+)\]/i);
        if (structuredMatch && structuredMatch[1].trim().length > 2) {
          const raw = structuredMatch[1].trim();
          if (!looksLikeHtmlOrMarkup(raw)) {
            return raw;
          }
        }

        return null;
      };

      // Throttle UI updates during stream so we don't re-render on every tiny chunk (smoother + less CPU)
      const STREAM_UPDATE_INTERVAL_MS = 32;
      let lastUpdateTime = 0;

      const flushStreamUpdate = (content: string, isFinal: boolean) => {
        const now = Date.now();
        if (!isFinal && now - lastUpdateTime < STREAM_UPDATE_INTERVAL_MS) return;
        lastUpdateTime = now;
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        const codeBlocks: string[] = [];
        let match;
        while ((match = codeBlockRegex.exec(content)) !== null) {
          codeBlocks.push(match[2]);
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content, codeBlocks: [...codeBlocks] }
              : msg
          )
        );
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            flushStreamUpdate(assistantContent, true);
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            if (trimmedLine.startsWith('data: ')) {
              try {
                const jsonStr = trimmedLine.slice(6).trim();
                if (!jsonStr) continue;

                const data = JSON.parse(jsonStr);

                if (data.content) {
                  assistantContent += data.content;
                  flushStreamUpdate(assistantContent, false);
                }

                if (data.error) {
                  throw new Error(data.error);
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, 'Line:', trimmedLine);
              }
            }
          }
        }
        
        // After stream: image tool only if model emitted [IMAGE:] *and* user asked for a visual.
        const finalContent = assistantContent.trim();
        if (finalContent) {
          const imagePrompt = extractImagePrompt(finalContent);
          const imageAllowed = Boolean(imagePrompt && userRequestedImageGeneration(content));

          if (imagePrompt && !imageAllowed) {
            const cleaned = finalContent.replace(/\s*\[IMAGE:\s*[^\]]+\]\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: cleaned } : msg))
            );
          }

          if (imageAllowed && imagePrompt) {
            setIsGeneratingImage(true);
            // Update the assistant message with the final content first (if not already updated)
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, content: finalContent } : msg
              )
            );
            // Then trigger image generation
            try {
              const imageResponse = await fetch(API_ENDPOINTS.IMAGE.GENERATE, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  prompt: imagePrompt,
                  rewordModel: selectedModel,
                }),
              });

              const imageResult = await imageResponse.json();

              if (imageResult.success && imageResult.image) {
                setMessages((prev) => 
                  prev.map((msg) => 
                    msg.id === assistantMessageId 
                      ? { 
                          ...msg, 
                          imageData: imageResult.image,
                          imageMethod: imageResult.method,
                          content: finalContent.replace(/\{.*?\}/g, '').trim()
                        }
                      : msg
                  )
                );
              } else {
                const errMsg = imageResult.error || 'Unknown error';
                const suggestion = imageResult.suggestion || 'Try installing the model in Image Settings (Install / Download this model).';
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: `${finalContent}\n\n---\n**Image generation failed:** ${errMsg}\n\n${suggestion}`,
                        }
                      : msg
                  )
                );
              }
            } catch (error: any) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: `${finalContent}\n\n---\n**Image generation error:** ${error.message}\n\nCheck Image Settings and try again. All images save to the same folder when generation succeeds.`,
                      }
                    : msg
                )
              );
            } finally {
              setIsGeneratingImage(false);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error:', error);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `Error: ${error.message}`,
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      setIsGenerating(false);
      setIsGeneratingImage(false);
      setAbortController(null);
      // Auto-save after stream completes (delay so state has updated)
      setTimeout(() => saveCurrentConversation(), 300);
    }
  };

  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const loadConversations = async () => {
    setConversationsLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.CONVERSATIONS.LIST);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setConversationsLoading(false);
    }
  };

  const saveCurrentConversation = async (messagesToSave?: Message[]) => {
    const msgs = messagesToSave ?? messages;
    if (msgs.length === 0) return;
    try {
      if (currentConversationId) {
        await fetch(API_ENDPOINTS.CONVERSATIONS.UPDATE(currentConversationId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: msgs,
            model: selectedModel,
          }),
        });
        await loadConversations();
      } else {
        const createRes = await fetch(API_ENDPOINTS.CONVERSATIONS.CREATE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel }),
        });
        const created = await createRes.json();
        if (created.id) {
          setCurrentConversationId(created.id);
          await fetch(API_ENDPOINTS.CONVERSATIONS.UPDATE(created.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: msgs,
              model: selectedModel,
            }),
          });
          await loadConversations();
        }
      }
    } catch (e) {
      console.error('Failed to save conversation:', e);
    }
  };

  const handleNewConversation = async () => {
    if (messages.length > 0 && currentConversationId) {
      await saveCurrentConversation();
    }
    setMessages([]);
    setCurrentConversationId(null);
  };

  const handleSelectConversation = async (id: string) => {
    if (id === currentConversationId) return;
    if (messages.length > 0 && currentConversationId) {
      await saveCurrentConversation();
    }
    setConversationsLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.CONVERSATIONS.GET(id));
      const data = await res.json();
      setMessages(data.messages || []);
      if (data.model) setSelectedModel(data.model);
      setCurrentConversationId(id);
    } catch (e) {
      console.error('Failed to load conversation:', e);
    } finally {
      setConversationsLoading(false);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await fetch(API_ENDPOINTS.CONVERSATIONS.DELETE(id), { method: 'DELETE' });
      await loadConversations();
      if (id === currentConversationId) {
        setMessages([]);
        setCurrentConversationId(null);
      }
    } catch (e) {
      console.error('Failed to delete conversation:', e);
    }
  };

  const handleClearConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
  };

  const handleModelDeleted = () => {
    // Refresh available models when a model is deleted
    setAvailableModels([]);
    if (selectedModel) {
      setSelectedModel('');
    }
    // Trigger refresh in ModelManager
    setModelRefreshTrigger(prev => prev + 1);
  };

  // Load conversation list on mount
  useEffect(() => {
    loadConversations();
  }, []);

  /** First-launch style prompt when Ollama is missing (same category as Image Settings → Python). */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_STORAGE_KEYS.OLLAMA_SETUP_PROMPT_SKIPPED)) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(API_ENDPOINTS.OLLAMA.STATUS);
        const data = await res.json();
        if (cancelled) return;
        if (!data.available) {
          setShowOllamaSetupPrompt(true);
        }
      } catch {
        if (!cancelled) setShowOllamaSetupPrompt(true);
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Fetch documents on mount and when model changes
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.DOCUMENTS.LIST);
        const data = await response.json();
        setDocuments(data.documents || []);
      } catch (error) {
        console.error('Error fetching documents:', error);
      }
    };
    fetchDocuments();
  }, [selectedModel]);

  // Add global drag event listeners to allow file drops
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Add listeners to document to catch all drag events
    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('drop', handleGlobalDrop);

    // Listen for file drops from Electron (works even in WSL)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onFileDrop) {
      const handleElectronFileDrop = (detail: any) => {
        // If documents panel is not open and we have valid files, open it
        if (!showDocumentsPanel && detail.files && detail.files.length > 0) {
          const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
          const hasValidFiles = detail.files.some((file: any) => {
            const ext = '.' + file.name.split('.').pop()?.toLowerCase();
            return allowedTypes.includes(ext) || file.type === 'application/pdf';
          });
          
          if (hasValidFiles) {
            setShowDocumentsPanel(true);
          }
        }
      };

      (window as any).electronAPI.onFileDrop(handleElectronFileDrop);

      return () => {
        document.removeEventListener('dragover', handleGlobalDragOver);
        document.removeEventListener('drop', handleGlobalDrop);
        if ((window as any).electronAPI?.removeFileDropListener) {
          (window as any).electronAPI.removeFileDropListener();
        }
      };
    }

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, [showDocumentsPanel]);

  // Listen for menu actions from Electron
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.onMenuAction((action: string) => {
        switch (action) {
          case 'new-chat':
            handleNewConversation();
            break;
          case 'clear-conversation':
            handleClearConversation();
            break;
          case 'toggle-sidebar':
            setSidebarOpen(prev => !prev);
            break;
          case 'manage-models':
            setShowModelInstallDialog(true);
            break;
          case 'manage-documents':
            setShowDocumentsPanel(true);
            break;
          case 'show-about':
            alert('DeskLlama\nVersion 1.0.0\n\nLocal chat, documents, code, and image generation with Ollama.');
            break;
          case 'model-deleted':
            handleModelDeleted();
            break;
        }
      });

      return () => {
        if ((window as any).electronAPI?.removeMenuActionListener) {
          (window as any).electronAPI.removeMenuActionListener();
        }
      };
    }
  }, []);

  // Handle drag events at the root level to allow file drops
  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Allow drops - this prevents the "not allowed" cursor
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only open documents panel if it's not already open and files are being dropped
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && !showDocumentsPanel) {
      // Check if any files are valid document types
      const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
      const hasValidFiles = files.some(file => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        return allowedTypes.includes(ext) || file.type === 'application/pdf';
      });
      
      if (hasValidFiles) {
        setShowDocumentsPanel(true);
      }
    }
  };

  return (
    <div
      className="flex h-screen flex-col bg-dark-bg font-syne text-dark-text"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
    >
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          onNewConversation={handleNewConversation}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          conversations={conversations}
          currentConversationId={currentConversationId}
          conversationsLoading={conversationsLoading}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(prev => !prev)}
          onManageDocuments={() => setShowDocumentsPanel(true)}
          onOpenImageSettings={() => {}}
          onOpenSystemPrompt={() => setShowSystemPromptSettings(true)}
          onBrowseModels={() => setShowModelInstallDialog(true)}
          onDocumentsChange={async () => {
            // Refresh documents when assignments change
            try {
              const response = await fetch(API_ENDPOINTS.DOCUMENTS.LIST);
              const data = await response.json();
              setDocuments(data.documents || []);
            } catch (error) {
              console.error('Error refreshing documents:', error);
            }
          }}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
            <ModelManager
              selectedModel={selectedModel}
              onModelSelect={setSelectedModel}
              onModelsLoaded={setAvailableModels}
              refreshTrigger={modelRefreshTrigger}
              showInstallDialog={showModelInstallDialog}
              onInstallDialogClose={() => setShowModelInstallDialog(false)}
              onInstallDialogOpen={() => setShowModelInstallDialog(true)}
            />
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isGenerating={isGenerating}
            isGeneratingImage={isGeneratingImage}
            onStopGeneration={handleStopGeneration}
            selectedModel={selectedModel}
            usedDocuments={lastUsedDocuments}
            onClearConversation={handleClearConversation}
            onNewConversation={handleNewConversation}
            onOpenSystemPrompt={() => setShowSystemPromptSettings(true)}
            systemPromptPreview={getSystemPromptBarPreview()}
            assignedDocumentsCount={
              selectedModel
                ? documents.filter((d) => d.assignedModels?.includes(selectedModel)).length
                : 0
            }
          />
        </div>
      </div>
      <SystemPromptSettings
        isOpen={showSystemPromptSettings}
        onClose={() => setShowSystemPromptSettings(false)}
      />
      <DocumentsPanel
        isOpen={showDocumentsPanel}
        onClose={() => setShowDocumentsPanel(false)}
        availableModels={availableModels}
        onDocumentsChange={async () => {
          // Refresh documents list when documents change
          try {
            const response = await fetch(API_ENDPOINTS.DOCUMENTS.LIST);
            const data = await response.json();
            const updatedDocs = data.documents || [];
            setDocuments(updatedDocs);
          } catch (error) {
            console.error('Error fetching documents:', error);
          }
        }}
      />
      <OllamaSetupPromptModal
        isOpen={showOllamaSetupPrompt}
        onDismissForSession={() => {
          sessionStorage.setItem(SESSION_STORAGE_KEYS.OLLAMA_SETUP_PROMPT_SKIPPED, '1');
          setShowOllamaSetupPrompt(false);
        }}
        onOllamaAvailable={() => {
          setShowOllamaSetupPrompt(false);
          setModelRefreshTrigger((t) => t + 1);
        }}
      />
    </div>
  );
}

export default App;
