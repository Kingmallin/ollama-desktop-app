/**
 * Type Definitions
 * 
 * Shared TypeScript interfaces and types for the Ollama Desktop App.
 */

// Message Types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  codeBlocks?: string[];
  timestamp: Date;
  imageData?: string; // Base64 image data URL
  imageMethod?: 'local' | 'huggingface-api';
}

// Document Types
export interface Document {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
  assignedModels?: string[];
  metadata?: DocumentMetadata;
}

export interface DocumentMetadata {
  pageCount?: number;
  wordCount?: number;
  extractedText?: string;
  preview?: string;
}

export interface DocumentSearchResult {
  id: string;
  name: string;
  relevance: number;
  matchedChunks?: DocumentChunk[];
}

export interface DocumentChunk {
  chunkIndex: number;
  text: string;
  startIndex?: number;
  endIndex?: number;
}

// Model Types
export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
  digest?: string;
}

export interface ModelInstallProgress {
  type: 'status' | 'progress' | 'complete' | 'error';
  message?: string;
  progress?: number;
  success?: boolean;
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface APIError {
  success: false;
  error: string;
  message?: string;
  code?: string;
  statusCode?: number;
}

// Code Execution Types
export interface CodeExecutionRequest {
  code: string;
  language: string;
}

// Image Generation Types
export interface ImageGenerationRequest {
  prompt: string;
  method?: 'local' | 'huggingface-api';
}

export interface ImageGenerationResponse {
  success: boolean;
  image?: string; // Base64 data URL
  method?: 'local' | 'huggingface-api';
  error?: string;
  suggestion?: string;
}

// Chat Types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatStreamChunk {
  content?: string;
  done?: boolean;
  error?: string;
}

// Conversation Types
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

// Prompt Template Types
export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  template: string;
  category?: string;
  tags?: string[];
  variables?: TemplateVariable[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  description?: string;
  defaultValue?: string;
  required?: boolean;
}

// Settings Types
export interface AppSettings {
  defaultModel?: string;
  theme?: 'light' | 'dark' | 'auto';
  autoSaveConversations?: boolean;
  codeExecutionTimeout?: number;
  maxContextLength?: number;
  imageGenerationMethod?: 'local' | 'huggingface-api';
}

// Component Prop Types
export interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isGenerating: boolean;
  isGeneratingImage?: boolean;
  onStopGeneration: () => void;
  selectedModel: string;
  usedDocuments?: string[];
}

export interface CodeBlockProps {
  code: string;
  language: string;
}

// Code Execution Result (separate from request)
export interface CodeExecutionResult {
  success: boolean;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  html?: string | null;
  isHtml?: boolean;
}

export interface SidebarProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  onClearConversation: () => void;
  isOpen: boolean;
  onToggle: () => void;
  onManageDocuments: () => void;
  onOpenImageSettings: () => void;
  onOpenSystemPrompt?: () => void;
  onDocumentsChange?: () => void | Promise<void>;
}

// Error Types
export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Utility Types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
