import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import CodeBlock from './CodeBlock';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  codeBlocks?: string[];
  timestamp: Date;
  imageData?: string; // Base64 image data URL
  imageMethod?: string; // 'local' or 'huggingface-api'
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isGenerating: boolean;
  isGeneratingImage?: boolean;
  onStopGeneration: () => void;
  selectedModel: string;
  usedDocuments?: string[];
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isGenerating,
  isGeneratingImage = false,
  onStopGeneration,
  selectedModel,
  usedDocuments = [],
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [generatingMessageIndex, setGeneratingMessageIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isGenerating) {
      setGeneratingMessageIndex(0);
      return;
    }
    const chatMessages = [
      'Generating... This may take a moment depending on your system specs.',
      'Still loading... We\'re working on it.',
    ];
    const imageMessages = [
      'Generating image...',
      'Creating image... This may take a moment.',
    ];
    const list = isGeneratingImage ? imageMessages : chatMessages;
    const interval = setInterval(() => {
      setGeneratingMessageIndex((i) => (i + 1) % list.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isGenerating, isGeneratingImage]);

  const generatingMessages = isGeneratingImage
    ? ['Generating image...', 'Creating image... This may take a moment.']
    : [
        'Generating... This may take a moment depending on your system specs.',
        'Still loading... We\'re working on it.',
      ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isGenerating && selectedModel) {
      onSendMessage(input);
      setInput('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  // Hide [IMAGE: ...] from display — the prompt is sent to the image generator only; user sees the rest.
  const displayContent = (content: string, isAssistant: boolean) =>
    isAssistant
      ? content.replace(/\[IMAGE:[^\]]*\]/gi, '').replace(/\n{3,}/g, '\n\n').trim()
      : content;

  // Split content into markdown and code blocks
  const splitContent = (content: string) => {
    // Improved regex to match code blocks with optional language
    // Matches: ```lang\ncode\n``` or ```\ncode\n```
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const parts: Array<{ type: 'markdown' | 'code'; content: string; language?: string }> = [];
    let lastIndex = 0;
    let match;
    const matches: Array<{ index: number; length: number; language: string; code: string }> = [];

    // Collect all matches first
    while ((match = codeBlockRegex.exec(content)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        language: match[1] || 'text',
        code: match[2].trim(),
      });
    }

    // Process matches
    for (const codeMatch of matches) {
      if (codeMatch.index > lastIndex) {
        const markdownContent = content.slice(lastIndex, codeMatch.index).trim();
        if (markdownContent) {
          parts.push({
            type: 'markdown',
            content: markdownContent,
          });
        }
      }
      parts.push({
        type: 'code',
        content: codeMatch.code,
        language: codeMatch.language,
      });
      lastIndex = codeMatch.index + codeMatch.length;
    }

    // Add remaining content
    if (lastIndex < content.length) {
      const remainingContent = content.slice(lastIndex).trim();
      if (remainingContent) {
        parts.push({
          type: 'markdown',
          content: remainingContent,
        });
      }
    }

    return parts.length > 0 ? parts : [{ type: 'markdown', content }];
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-dark-muted mt-20">
            <h2 className="text-2xl font-semibold mb-2">Welcome to Ollama Desktop</h2>
            <p>Select a model and start chatting!</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-dark-surface border border-dark-border'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="space-y-4">
                  {/* Display generated image if present */}
                  {message.imageData && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-dark-muted">
                          🎨 Generated image {message.imageMethod && `(${message.imageMethod})`}
                        </div>
                        <a
                          href={message.imageData}
                          download={`generated-image-${message.id}.png`}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          💾 Download
                        </a>
                      </div>
                      <div className="relative group">
                        <img 
                          src={message.imageData} 
                          alt="Generated image"
                          className="max-w-full h-auto rounded-lg border border-dark-border cursor-pointer hover:opacity-90 transition-opacity"
                          style={{ maxHeight: '512px' }}
                          onClick={() => {
                            // Open image in new tab for full view
                            const newWindow = window.open();
                            if (newWindow) {
                              newWindow.document.write(`<img src="${message.imageData}" style="max-width: 100%; height: auto;" />`);
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {splitContent(displayContent(message.content, true)).map((part, idx) => {
                    if (part.type === 'code') {
                      return (
                        <CodeBlock
                          key={idx}
                          code={part.content}
                          language={part.language || 'text'}
                        />
                      );
                    } else {
                      return (
                        <div key={idx} className="prose prose-invert max-w-none">
                          <ReactMarkdown
                            components={{
                              code({ node, inline, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {part.content}
                          </ReactMarkdown>
                        </div>
                      );
                    }
                  })}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-dark-surface border border-dark-border rounded-lg p-4 max-w-md">
              <div className="flex items-center gap-3">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"
                  aria-hidden
                />
                <div>
                  <p className="text-dark-text font-medium">
                    {generatingMessages[generatingMessageIndex]}
                  </p>
                  <p className="text-xs text-dark-muted mt-0.5">
                    If something goes wrong, you&apos;ll see an error message below.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Show which documents were used in the last response */}
      {usedDocuments.length > 0 && !isGenerating && (
        <div className="flex-shrink-0 border-t border-dark-border px-4 py-2 bg-blue-600/10">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-blue-400 font-semibold">📄 Using documents:</span>
            <div className="flex flex-wrap gap-1">
              {usedDocuments.map((docName, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-blue-600/20 text-blue-300 rounded"
                >
                  {docName}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 border-t border-dark-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={selectedModel ? "Type your message..." : "Select a model first..."}
            disabled={isGenerating || !selectedModel}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-32"
            rows={1}
          />
          {isGenerating ? (
            <button
              type="button"
              onClick={onStopGeneration}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !selectedModel}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Send
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
