import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import ModelManager from './components/ModelManager';
import DocumentsPanel from './components/DocumentsPanel';
import { buildMessagesWithSystemPrompt } from './utils/prompts';
import { API_ENDPOINTS, LIMITS, IMAGE_KEYWORDS } from './constants';
import SystemPromptSettings from './components/SystemPromptSettings';
import { getStoredSystemPromptPresetId, getStoredSystemPromptCustom, CUSTOM_PRESET_ID } from './components/SystemPromptSettings';
import type { Message, Document } from './types';

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

  const handleSendMessage = async (content: string) => {
    if (!selectedModel || !content.trim()) return;

    // Check if this is an image generation request
    const isImageRequest = IMAGE_KEYWORDS.some(keyword => 
      content.toLowerCase().includes(keyword)
    );

    // If it's an image request, handle it separately
    if (isImageRequest) {
      try {
        setIsGeneratingImage(true);
        setIsGenerating(true);
        console.log('🎨 Image generation request detected');
        
        // Extract prompt (remove image request keywords for cleaner prompt)
        let prompt = content;
        for (const keyword of IMAGE_KEYWORDS) {
          prompt = prompt.replace(new RegExp(keyword, 'gi'), '').trim();
        }
        if (!prompt) prompt = content; // Fallback to original if nothing left
        
        const response = await fetch(API_ENDPOINTS.IMAGE.GENERATE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            rewordModel: selectedModel,
          }),
        });

        const result = await response.json();

        if (result.success && result.image) {
          // Add user message and image response
          const userMsg: Message = {
            id: (Date.now() - 1).toString(),
            role: 'user',
            content,
            timestamp: new Date(),
          };
          
          const imageMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `Generated image for: "${prompt}"`,
            imageData: result.image,
            imageMethod: result.method,
            timestamp: new Date(),
          };
          
          setMessages((prev) => [...prev, userMsg, imageMessage]);
        } else {
          const errorMsg = result.error || 'Unknown error';
          const suggestion = result.suggestion || 'Check that your image model is installed (Image Settings → Install this model) and try again.';
          setMessages((prev) => [...prev, {
            id: (Date.now() - 1).toString(),
            role: 'user',
            content,
            timestamp: new Date(),
          }, {
            id: Date.now().toString(),
            role: 'assistant',
            content: `Something went wrong while generating the image.\n\n**Error:** ${errorMsg}\n\n**Suggestion:** ${suggestion}\n\nAll images save to the same folder when generation succeeds.`,
            timestamp: new Date(),
          }]);
        }
      } catch (error: any) {
        setMessages((prev) => [...prev, {
          id: (Date.now() - 1).toString(),
          role: 'user',
          content,
          timestamp: new Date(),
        }, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Something went wrong.\n\n**Error:** ${error.message}\n\nCheck your connection and that the app is running. If you're using a local model, install it first in Image Settings (Install / Download this model). All images save to the same folder when generation succeeds.`,
          timestamp: new Date(),
        }]);
      } finally {
        setIsGeneratingImage(false);
        setIsGenerating(false);
      }
      return;
    }

    setIsGeneratingImage(false);
    // Search documents for relevant context if we have documents assigned to this model
    let ragContext = '';
    if (documents.length > 0 && selectedModel) {
      try {
        // Filter documents assigned to the current model
        const assignedDocs = documents.filter((doc: Document) => 
          doc.assignedModels && doc.assignedModels.includes(selectedModel)
        );
        
        console.log(`🔍 RAG: Searching in ${assignedDocs.length} documents assigned to "${selectedModel}"`);
        console.log(`🔍 RAG: Assigned documents:`, assignedDocs.map((d: Document) => d.name));
        console.log(`🔍 RAG: Search query: "${content}"`);
        
        if (assignedDocs.length > 0) {
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
            
            console.log('🔍 RAG: Search results:', searchResult);
            
            if (searchResult.success && searchResult.results.length > 0) {
              // Filter results to only include documents assigned to current model
              const assignedResults = searchResult.results.filter((result: { id: string; name: string }) => {
                const doc = assignedDocs.find((d: Document) => d.id === result.id);
                return doc !== undefined;
              });
              
              console.log(`🔍 RAG: ${assignedResults.length} search results match assigned documents`);
              
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
                    console.log(`✅ Using ${topChunks.length} chunks from ${result.name} (relevance: ${(result as any).relevance})`);
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
                          console.log(`✅ Fallback: Extracted ${docContent.length} chars from ${result.name}`);
                        }
                      }
                    } catch (error) {
                      console.error(`❌ Error fetching content for document ${result.id}:`, error);
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
            console.log(`🔍 RAG: No search matches, including all ${assignedDocs.length} assigned documents`);
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
                      console.warn(`⚠️ Document ${doc.name} has no extractable content:`, contentData.content);
                      return '';
                    }
                    // Use up to max document content length
                    const docContent = contentData.content.substring(0, LIMITS.MAX_DOCUMENT_CONTENT_LENGTH);
                    console.log(`✅ Extracted ${docContent.length} chars from ${doc.name}`);
                    return `From document "${doc.name}":\n${docContent}`;
                  } else {
                    console.warn(`⚠️ Document ${doc.name} extraction failed:`, contentData.error || 'No content');
                    return '';
                  }
                } catch (error) {
                  console.error(`❌ Error fetching content for document ${doc.id}:`, error);
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
            
            console.log(`✅ RAG: Added context from ${usedDocuments.length} documents (${ragContext.length} chars)`);
            console.log(`✅ RAG: Documents used:`, usedDocuments);
            console.log(`✅ RAG: Context preview:`, ragContext.substring(0, 200) + '...');
            
            // Store which documents were used for this message
            setLastUsedDocuments(usedDocuments);
          } else {
            console.log('⚠️ RAG: No document content could be extracted');
          }
        } else {
          console.log(`RAG: No documents assigned to model ${selectedModel}`);
        }
      } catch (error) {
        console.error('Error searching documents:', error);
      }
    } else {
      console.log(`RAG: Skipped - documents: ${documents.length}, model: ${selectedModel}`);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    // Clear used documents when sending new message
    setLastUsedDocuments([]);
    setIsGenerating(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      console.log('📤 Sending chat request to:', API_ENDPOINTS.OLLAMA.CHAT_STREAM);
      
      // Add RAG context to the user message - make it very clear
      const userContentWithContext = ragContext 
        ? `${content}\n\n${ragContext}` 
        : content;
      
      // Log what we're sending
      if (ragContext) {
        console.log('📤 RAG Context being sent:', ragContext.substring(0, 500) + '...');
        console.log('📤 Full user message length:', userContentWithContext.length);
      } else {
        console.log('📤 No RAG context - user message only');
      }
      
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

      console.log('Response status:', response.status, response.statusText);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

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
      
      // Only trigger image generation when the assistant explicitly says they are generating an image
      // (e.g. "I'll generate an image of..."). Do NOT trigger on code, variable names, or explanations
      // that merely mention "image" (e.g. "this code loads an image" or "the image variable").
      const extractImagePrompt = (text: string): string | null => {
        const textWithoutCode = text.replace(/```[\s\S]*?```/g, '').trim();
        if (!textWithoutCode) return null;

        const looksLikeCode = (s: string): boolean => {
          const t = s.trim();
          return (
            /^\s*(def |class |import |from |print\s*\(|if __name__|#.*\n\s*\n)/m.test(t) ||
            t.includes('```') ||
            (t.split('\n').length > 3 && /^\s{2,}/m.test(t))
          );
        };

        // Require explicit first-person offer: only when the model says it will generate/create an image.
        // This avoids false positives from code (e.g. "image = load_image()") or explanations ("the image of the data").
        const explicitOfferPatterns = [
          /(?:I'll|I will|Let me|I can)\s+(?:generate|create|make|draw)\s+(?:an?\s+)?(?:image|picture|photo)\s+(?:of|showing|with|featuring)?\s*[:—]?\s*(.+?)(?:\.|$|{)/i,
          /(?:Generating|Creating|Drawing)\s+(?:an?\s+)?(?:image|picture|photo)\s+(?:of|showing|with|featuring)?\s*[:—]?\s*(.+?)(?:\.|$|{)/i,
          /(?:Here'?s?|Here is)\s+(?:an?\s+)?(?:image|picture|photo)\s+(?:of|showing|with|featuring)\s+(.+?)(?:\.|$|{)/i,
        ];

        for (const pattern of explicitOfferPatterns) {
          const match = textWithoutCode.match(pattern);
          if (match && match[1]) {
            let prompt = match[1].trim();
            prompt = prompt.replace(/\s*(?:using|with|by|via).*$/i, '');
            prompt = prompt.replace(/\s*\{.*$/, '');
            if (prompt.length > 5 && !looksLikeCode(prompt)) {
              return prompt;
            }
          }
        }

        return null;
      };

      // Throttle UI updates during stream so we don't re-render on every tiny chunk (smoother + less CPU)
      const STREAM_UPDATE_INTERVAL_MS = 50;
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
        
        // After stream is complete, check if assistant response mentions image generation
        const finalContent = assistantContent.trim();
        if (finalContent) {
          const imagePrompt = extractImagePrompt(finalContent);
          if (imagePrompt) {
            console.log('🎨 Detected image generation request in assistant response:', imagePrompt);
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
                console.log('✅ Image generated and added to message');
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
    }
  };

  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleClearConversation = () => {
    setMessages([]);
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

  // Fetch documents on mount and when model changes
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.DOCUMENTS.LIST);
        const data = await response.json();
        setDocuments(data.documents || []);
        console.log('📄 Documents loaded:', data.documents.length);
        if (selectedModel) {
          const assigned = data.documents.filter((doc: Document) => 
            doc.assignedModels && doc.assignedModels.includes(selectedModel)
          );
          console.log(`📄 Documents assigned to "${selectedModel}":`, assigned.length, assigned.map((d: Document) => d.name));
        }
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
            handleClearConversation();
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
            alert('Ollama Desktop App\nVersion 1.0.0\n\nA modern desktop application for interacting with locally running Ollama LLM instances.');
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
      className="flex h-screen bg-dark-bg text-dark-text flex-col"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
    >
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          onClearConversation={handleClearConversation}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(prev => !prev)}
          onManageDocuments={() => setShowDocumentsPanel(true)}
          onOpenImageSettings={() => {}}
          onOpenSystemPrompt={() => setShowSystemPromptSettings(true)}
          onDocumentsChange={async () => {
            // Refresh documents when assignments change
            try {
              const response = await fetch(API_ENDPOINTS.DOCUMENTS.LIST);
              const data = await response.json();
              setDocuments(data.documents || []);
              console.log('Documents refreshed after assignment change:', data.documents.length);
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
            console.log(`Documents refreshed: ${updatedDocs.length} total documents`);
            // Log document assignments for debugging
            updatedDocs.forEach((doc: Document) => {
              if (doc.assignedModels && doc.assignedModels.length > 0) {
                console.log(`Document "${doc.name}" assigned to: ${doc.assignedModels.join(', ')}`);
              }
            });
          } catch (error) {
            console.error('Error fetching documents:', error);
          }
        }}
      />
    </div>
  );
}

export default App;
