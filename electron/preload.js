const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Expose any Electron-specific APIs if needed
  platform: process.platform,
  // Listen for menu actions
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => {
      callback(action);
    });
  },
  // Remove menu action listener
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action');
  },
  // File dialog for document selection
  showOpenDialog: (options) => {
    return ipcRenderer.invoke('show-open-dialog', options);
  },
  // Read file from path (for cross-filesystem access)
  readFile: (filePath) => {
    return ipcRenderer.invoke('read-file', filePath);
  },
  // Listen for file drops from Electron
  onFileDrop: (callback) => {
    window.addEventListener('electron-file-drop', (event) => {
      callback(event.detail);
    });
    // Also listen for IPC messages
    ipcRenderer.on('files-dropped', (event, filePaths) => {
      const path = require('path');
      callback({ files: filePaths.map(function(p) { return { path: p, name: path.basename(p) }; }) });
    });
  },
  // Remove file drop listener
  removeFileDropListener: () => {
    window.removeEventListener('electron-file-drop', () => {});
    ipcRenderer.removeAllListeners('files-dropped');
  }
});
