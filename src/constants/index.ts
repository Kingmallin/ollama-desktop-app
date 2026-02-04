/**
 * Application Constants
 * 
 * Centralized configuration values for the Ollama Desktop App.
 * Update these values to change API endpoints, limits, and timeouts.
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: 'http://localhost:3001',
  OLLAMA_HOST: (import.meta.env?.VITE_OLLAMA_HOST as string | undefined) || 'http://localhost:11434',
} as const;

// API Endpoints
export const API_ENDPOINTS = {
  // Ollama endpoints
  OLLAMA: {
    MODELS: `${API_CONFIG.BASE_URL}/api/ollama/models`,
    INSTALL: `${API_CONFIG.BASE_URL}/api/ollama/install`,
    CHAT_STREAM: `${API_CONFIG.BASE_URL}/api/ollama/chat/stream`,
    CHAT_STOP: `${API_CONFIG.BASE_URL}/api/ollama/chat/stop`,
    LIBRARY: `${API_CONFIG.BASE_URL}/api/ollama/library`,
    DELETE_MODEL: (modelName: string) => `${API_CONFIG.BASE_URL}/api/ollama/models/${encodeURIComponent(modelName)}`,
  },
  
  // Sandbox endpoints
  SANDBOX: {
    EXECUTE: `${API_CONFIG.BASE_URL}/api/sandbox/execute`,
  },
  
  // Documents endpoints
  DOCUMENTS: {
    LIST: `${API_CONFIG.BASE_URL}/api/documents`,
    UPLOAD: `${API_CONFIG.BASE_URL}/api/documents/upload`,
    SEARCH: `${API_CONFIG.BASE_URL}/api/documents/search`,
    BROWSE: (path: string) => `${API_CONFIG.BASE_URL}/api/documents/browse?path=${encodeURIComponent(path)}`,
    CONTENT: (id: string) => `${API_CONFIG.BASE_URL}/api/documents/${id}/content`,
    DELETE: (id: string) => `${API_CONFIG.BASE_URL}/api/documents/${id}`,
    ASSIGN_MODELS: (id: string) => `${API_CONFIG.BASE_URL}/api/documents/${id}/assign-models`,
  },
  
  // Image endpoints
  IMAGE: {
    GENERATE: `${API_CONFIG.BASE_URL}/api/image/generate`,
    MODELS: `${API_CONFIG.BASE_URL}/api/image/models`,
    INSTALLED_MODELS: `${API_CONFIG.BASE_URL}/api/image/installed-models`,
    INSTALL_MODEL: `${API_CONFIG.BASE_URL}/api/image/install-model`,
    UNINSTALL_MODEL: `${API_CONFIG.BASE_URL}/api/image/uninstall-model`,
    STATUS: (autoInstall?: boolean) =>
      `${API_CONFIG.BASE_URL}/api/image/status${autoInstall ? '?autoInstall=true' : ''}`,
    SETTINGS: `${API_CONFIG.BASE_URL}/api/image/settings`,
    INSTALL_PACKAGES: `${API_CONFIG.BASE_URL}/api/image/install-packages`,
  },
} as const;

// Application Limits
export const LIMITS = {
  // RAG/Document limits
  MAX_CONTEXT_LENGTH: 8000, // Maximum characters for RAG context
  MAX_DOCUMENTS_PER_QUERY: 3, // Maximum documents to include per query
  MAX_CHUNKS_PER_DOCUMENT: 3, // Maximum chunks per document in search results
  MAX_DOCUMENT_CONTENT_LENGTH: 4000, // Maximum characters per document content
  MAX_DOCUMENT_PREVIEW_LENGTH: 2000, // Maximum characters for document preview
  
  // Code execution limits
  EXECUTION_TIMEOUT: 10000, // 10 seconds in milliseconds
  MAX_CODE_LENGTH: 100000, // Maximum code length for execution (100KB)
  
  // Image limits
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB in bytes
  
  // Message limits
  MAX_MESSAGE_LENGTH: 100000, // Maximum message length (100KB)
  MAX_CONVERSATION_MESSAGES: 1000, // Maximum messages per conversation
} as const;

// Port Configuration
export const PORTS = {
  BACKEND: 3001,
  FRONTEND: 5173,
  OLLAMA: 11434,
} as const;

// Timeouts (in milliseconds)
export const TIMEOUTS = {
  API_REQUEST: 30000, // 30 seconds
  STREAM_READ: 60000, // 60 seconds for streaming
  CODE_EXECUTION: 10000, // 10 seconds
  MODEL_INSTALL: 600000, // 10 minutes
  HTTP_REQUEST: 5000, // 5 seconds for HTTP requests
} as const;

// Image Generation Keywords (user message containing any of these goes straight to image API, not chat)
export const IMAGE_KEYWORDS = [
  'generate image',
  'generate an image',
  'generate a picture',
  'generate img',
  'create image',
  'create an image',
  'create a picture',
  'create img',
  'create an img',
  'draw',
  'make a picture',
  'make an image',
  'image of',
  'img of',
  'picture of',
  'show me a picture',
  'show me an image',
] as const;

// Supported Code Execution Languages
export const SUPPORTED_LANGUAGES = {
  EXECUTABLE: ['python', 'javascript', 'php', 'ruby', 'go'] as const,
  RENDERABLE: ['html'] as const,
} as const;

// Language Detection Map
export const LANGUAGE_MAP: Record<string, string> = {
  py: 'python',
  python: 'python',
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  php: 'php',
  html: 'html',
  rb: 'ruby',
  ruby: 'ruby',
  go: 'go',
  golang: 'go',
};

// File Upload Configuration
export const FILE_UPLOAD = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_TYPES: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ],
} as const;

// UI Configuration
export const UI_CONFIG = {
  SIDEBAR_DEFAULT_WIDTH: 280,
  CHAT_MAX_WIDTH: '3xl',
  CODE_BLOCK_MAX_HEIGHT: '600px',
  CODE_BLOCK_MIN_HEIGHT: '300px',
  MESSAGE_ANIMATION_DURATION: 300, // milliseconds
  /** Folder where all generated images are saved (same location for every run) */
  GENERATED_IMAGES_FOLDER: 'generated-images',
} as const;

// Storage Keys (for localStorage, etc.)
export const STORAGE_KEYS = {
  CONVERSATIONS: 'ollama-desktop-conversations',
  SETTINGS: 'ollama-desktop-settings',
  PROMPT_TEMPLATES: 'ollama-desktop-prompt-templates',
  LAST_SELECTED_MODEL: 'ollama-desktop-last-selected-model',
  SYSTEM_PROMPT_PRESET_ID: 'ollama-desktop-system-prompt-preset-id',
  SYSTEM_PROMPT_CUSTOM: 'ollama-desktop-system-prompt-custom',
} as const;
