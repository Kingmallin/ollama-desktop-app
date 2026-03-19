import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import CodeBlock from './CodeBlock';
import BrandWordmark from './BrandWordmark';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  codeBlocks?: string[];
  timestamp: Date;
  imageData?: string;
  imageMethod?: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isGenerating: boolean;
  isGeneratingImage?: boolean;
  onStopGeneration: () => void;
  selectedModel: string;
  usedDocuments?: string[];
  onClearConversation?: () => void;
  onNewConversation?: () => void;
  onOpenSystemPrompt?: () => void;
  systemPromptPreview?: string;
  /** Documents assigned to the active model (RAG capacity), not necessarily used in last reply */
  assignedDocumentsCount?: number;
}

function IconChatBubble(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M2 2h12a1 1 0 011 1v8a1 1 0 01-1 1H9l-3 2.5V12H2a1 1 0 01-1-1V3a1 1 0 011-1z" />
    </svg>
  );
}

function IconSend(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1 8L15 1 8 15l-2-5z" />
    </svg>
  );
}

function IconPlus(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1v14M1 8h14" />
    </svg>
  );
}

function IconClose(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isGenerating,
  isGeneratingImage = false,
  onStopGeneration,
  selectedModel,
  usedDocuments = [],
  onClearConversation,
  onNewConversation,
  onOpenSystemPrompt,
  systemPromptPreview = '',
  assignedDocumentsCount = 0,
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
      'Generating… This may take a moment depending on your system.',
      'Still working — hang tight.',
    ];
    const imageMessages = ['Generating image…', 'Creating image…'];
    const list = isGeneratingImage ? imageMessages : chatMessages;
    const interval = setInterval(() => {
      setGeneratingMessageIndex((i) => (i + 1) % list.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isGenerating, isGeneratingImage]);

  const generatingMessages = isGeneratingImage
    ? ['Generating image…', 'Creating image…']
    : [
        'Generating… This may take a moment depending on your system.',
        'Still working — hang tight.',
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

  const displayContent = (content: string, isAssistant: boolean) =>
    isAssistant
      ? content.replace(/\[IMAGE:[^\]]*\]/gi, '').replace(/\n{3,}/g, '\n\n').trim()
      : content;

  const splitContent = (content: string) => {
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const parts: Array<{ type: 'markdown' | 'code'; content: string; language?: string }> = [];
    let lastIndex = 0;
    let match;
    const matches: Array<{ index: number; length: number; language: string; code: string }> = [];

    while ((match = codeBlockRegex.exec(content)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        language: match[1] || 'text',
        code: match[2].trim(),
      });
    }

    for (const codeMatch of matches) {
      if (codeMatch.index > lastIndex) {
        const markdownContent = content.slice(lastIndex, codeMatch.index).trim();
        if (markdownContent) {
          parts.push({ type: 'markdown', content: markdownContent });
        }
      }
      parts.push({ type: 'code', content: codeMatch.code, language: codeMatch.language });
      lastIndex = codeMatch.index + codeMatch.length;
    }

    if (lastIndex < content.length) {
      const remainingContent = content.slice(lastIndex).trim();
      if (remainingContent) {
        parts.push({ type: 'markdown', content: remainingContent });
      }
    }

    return parts.length > 0 ? parts : [{ type: 'markdown' as const, content }];
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-dark-bg">
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-dark-surface px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-accent-dim">
            <IconChatBubble className="h-[13px] w-[13px] text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-dark-text">Chat</h1>
            <p className="font-mono text-2xs text-dark-dim">local · no data leaves your machine</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {assignedDocumentsCount > 0 && (
            <div className="hidden items-center gap-1.5 rounded-md border border-desk-purple/20 bg-desk-purple/10 px-2 py-1 font-mono text-[11px] text-desk-purple sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-desk-purple" />
              RAG · {assignedDocumentsCount} docs
            </div>
          )}
          {onClearConversation && (
            <button
              type="button"
              onClick={onClearConversation}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-transparent px-2.5 py-1 font-syne text-[11px] font-semibold text-dark-muted transition-colors hover:bg-dark-raised hover:text-dark-text"
            >
              <IconClose className="h-2.5 w-2.5" />
              Clear
            </button>
          )}
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-dark-raised px-2.5 py-1 font-syne text-[11px] font-semibold text-dark-text transition-colors hover:border-white/[0.14] hover:bg-dark-shelf"
            >
              <IconPlus className="h-2.5 w-2.5" />
              New chat
            </button>
          )}
        </div>
      </header>

      <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-[18px]">
        {messages.length === 0 && (
          <div className="mt-16 text-center">
            <h2 className="flex flex-wrap items-center justify-center gap-2 text-xl text-dark-muted">
              <span>Welcome to</span>
              <BrandWordmark className="!text-xl" />
            </h2>
            <p className="mt-2 text-sm text-dark-muted">Pick a model, type below, and go.</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`animate-fade-up flex max-w-[80%] gap-2.5 ${
              message.role === 'user' ? 'ml-auto flex-row-reverse self-end' : 'self-start'
            }`}
          >
            <div
              className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                message.role === 'user'
                  ? 'bg-gradient-to-br from-desk-blue to-desk-purple text-white'
                  : 'bg-gradient-to-br from-accent to-desk-blue text-black'
              }`}
            >
              {message.role === 'user' ? 'U' : 'DL'}
            </div>
            <div
              className={`border px-3.5 py-2.5 text-[13px] leading-[1.6] text-dark-text ${
                message.role === 'user'
                  ? 'rounded-[12px_4px_12px_12px] border-white/[0.06] bg-dark-raised'
                  : 'rounded-[4px_12px_12px_12px] border-white/[0.06] bg-dark-elevated'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="space-y-4">
                  {message.imageData && (
                    <div className="mb-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-mono text-2xs text-dark-muted">
                          Image {message.imageMethod && `· ${message.imageMethod}`}
                        </div>
                        <a
                          href={message.imageData}
                          download={`generated-image-${message.id}.png`}
                          className="font-mono text-2xs text-desk-blue hover:text-accent"
                        >
                          Download
                        </a>
                      </div>
                      <img
                        src={message.imageData}
                        alt="Generated"
                        className="max-h-[min(512px,50vh)] w-full cursor-pointer rounded-lg border border-white/[0.08] object-contain transition-opacity hover:opacity-90"
                        onClick={() => {
                          const w = window.open();
                          if (w) {
                            w.document.write(`<img src="${message.imageData}" style="max-width:100%" />`);
                          }
                        }}
                      />
                    </div>
                  )}
                  {splitContent(displayContent(message.content, true)).map((part, idx) => {
                    if (part.type === 'code') {
                      return <CodeBlock key={idx} code={part.content} language={part.language || 'text'} />;
                    }
                    return (
                      <div
                        key={idx}
                        className="prose prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-headings:text-dark-text prose-p:text-dark-text prose-li:text-dark-text prose-strong:text-dark-text [&_code]:rounded [&_code]:bg-dark-bg [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-accent"
                      >
                        <ReactMarkdown
                          components={{
                            code({ inline, className, children, ...props }) {
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
                  })}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="animate-fade-up flex max-w-md gap-2.5 self-start">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-desk-blue font-mono text-[10px] font-bold text-black">
              DL
            </div>
            <div className="rounded-[4px_12px_12px_12px] border border-white/[0.08] bg-dark-elevated px-4 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-dark-text">{generatingMessages[generatingMessageIndex]}</p>
                  <p className="mt-0.5 font-mono text-2xs text-dark-muted">Errors appear in the bubble if something fails</p>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {usedDocuments.length > 0 && !isGenerating && (
        <div className="shrink-0 border-t border-white/[0.06] bg-desk-purple/5 px-5 py-2">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-desk-purple">
            <span className="font-bold">RAG</span>
            {usedDocuments.map((docName, idx) => (
              <span key={idx} className="rounded border border-desk-purple/25 bg-desk-purple/10 px-2 py-0.5">
                {docName}
              </span>
            ))}
          </div>
        </div>
      )}

      <footer className="shrink-0 border-t border-white/[0.06] bg-dark-surface px-5 pb-4 pt-3">
        {assignedDocumentsCount > 0 && (
          <div className="mb-2 flex items-center gap-1.5 rounded-md border border-desk-purple/20 bg-desk-purple/10 px-2 py-[3px] font-mono text-[11px] text-desk-purple sm:hidden">
            <span className="h-1.5 w-1.5 rounded-full bg-desk-purple" />
            RAG · {assignedDocumentsCount} docs
          </div>
        )}
        {onOpenSystemPrompt && (
          <button
            type="button"
            onClick={onOpenSystemPrompt}
            className="mb-2.5 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-white/[0.06] bg-dark-elevated py-1.5 pl-2.5 pr-2 text-left transition-colors hover:border-white/[0.1]"
          >
            <span className="shrink-0 font-mono text-[10px] font-bold text-accent">SYSTEM</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-dark-dim">
              {systemPromptPreview || 'Configure how the assistant behaves…'}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-dark-dim">edit ↗</span>
          </button>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedModel
                ? `Message ${selectedModel}… (Shift+Enter for newline)`
                : 'Select a model first…'
            }
            disabled={isGenerating || !selectedModel}
            rows={1}
            className="min-h-[42px] max-h-[110px] flex-1 resize-none rounded-[9px] border border-white/[0.08] bg-dark-elevated px-[13px] py-2.5 font-syne text-[13px] text-dark-text placeholder:text-dark-dim focus:border-accent focus:outline-none disabled:opacity-50"
          />
          {isGenerating ? (
            <button
              type="button"
              onClick={onStopGeneration}
              className="flex h-[42px] shrink-0 items-center justify-center rounded-[9px] border border-desk-red/40 bg-desk-red/10 px-4 text-xs font-bold text-desk-red transition-colors hover:bg-desk-red/20"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !selectedModel}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[9px] bg-accent text-black transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Send"
            >
              <IconSend className="h-4 w-4" />
            </button>
          )}
        </form>
      </footer>
    </div>
  );
}
