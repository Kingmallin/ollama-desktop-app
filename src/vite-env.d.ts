/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    platform: string;
    openExternal?: (url: string) => Promise<void>;
  };
}
