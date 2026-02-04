const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let expressServer;

// Start Express server for backend API
function startExpressServer() {
  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json());

  // Import backend routes
  const ollamaRoutes = require('../backend/routes/ollama');
  const sandboxRoutes = require('../backend/routes/sandbox');
  const documentsRoutes = require('../backend/routes/documents');
  const imageRoutes = require('../backend/routes/image');
  
  expressApp.use('/api/ollama', ollamaRoutes);
  expressApp.use('/api/sandbox', sandboxRoutes);
  expressApp.use('/api/documents', documentsRoutes);
  expressApp.use('/api/image', imageRoutes);

  expressServer = expressApp.listen(3001, () => {
    console.log('Backend server running on http://localhost:3001');
  });
}

// Fetch models from the backend API
async function fetchModels() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/ollama/models',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData.models || []);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Delete a model via the backend API
async function deleteModel(modelName) {
  return new Promise((resolve, reject) => {
    const encodedModelName = encodeURIComponent(modelName);
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: `/api/ollama/models/${encodedModelName}`,
      method: 'DELETE'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Build the Models submenu dynamically
async function buildModelsSubmenu() {
  const modelsSubmenu = [
    {
      label: 'Install New Model...',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('menu-action', 'manage-models');
        }
      }
    },
    { type: 'separator' }
  ];

  try {
    const models = await fetchModels();
    
    if (models.length === 0) {
      modelsSubmenu.push({
        label: 'No models installed',
        enabled: false
      });
    } else {
      models.forEach((model) => {
        const modelSize = model.size ? ` (${(model.size / 1024 / 1024 / 1024).toFixed(2)} GB)` : '';
        modelsSubmenu.push({
          label: model.name + modelSize,
          submenu: [
            {
              label: 'Delete',
              click: async () => {
                if (mainWindow) {
                  const result = await dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    buttons: ['Cancel', 'Delete'],
                    defaultId: 0,
                    cancelId: 0,
                    title: 'Delete Model',
                    message: `Are you sure you want to delete "${model.name}"?`,
                    detail: 'This will permanently remove the model from your system. This action cannot be undone.'
                  });

                  if (result.response === 1) {
                    try {
                      await deleteModel(model.name);
                      // Refresh the menu
                      createMenu();
                      // Notify renderer to refresh
                      mainWindow.webContents.send('menu-action', 'model-deleted');
                    } catch (error) {
                      dialog.showErrorBox('Delete Failed', `Failed to delete model: ${error.message}`);
                    }
                  }
                }
              }
            }
          ]
        });
      });
    }
  } catch (error) {
    console.error('Error fetching models for menu:', error);
    modelsSubmenu.push({
      label: 'Error loading models',
      enabled: false
    });
  }

  return modelsSubmenu;
}

function createMenu() {
  // Build models submenu asynchronously
  buildModelsSubmenu().then((modelsSubmenu) => {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Chat',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('menu-action', 'new-chat');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Models',
            id: 'models-menu',
            submenu: modelsSubmenu
          },
          { type: 'separator' },
          {
            label: 'Documents',
            submenu: [
              {
                label: 'Manage Documents...',
                click: () => {
                  if (mainWindow) {
                    mainWindow.webContents.send('menu-action', 'manage-documents');
                  }
                }
              }
            ]
          },
          { type: 'separator' },
          {
            label: process.platform === 'darwin' ? 'Quit' : 'Exit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo'
        },
        {
          label: 'Redo',
          accelerator: process.platform === 'darwin' ? 'Shift+Cmd+Z' : 'Ctrl+Y',
          role: 'redo'
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        },
        { type: 'separator' },
        {
          label: 'Clear Conversation',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', 'clear-conversation');
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', 'toggle-sidebar');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.reload();
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          role: 'resetZoom'
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          role: 'zoomIn'
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut'
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            require('electron').shell.openExternal('https://github.com/ollama/ollama');
          }
        },
        {
          label: 'About',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', 'show-about');
            }
          }
        }
      ]
    }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  });
}

// Listen for model changes to refresh menu
ipcMain.on('refresh-models-menu', () => {
  createMenu();
});

// Handle file dialog requests
ipcMain.handle('show-open-dialog', async (event, options) => {
  if (!mainWindow) return { canceled: true };
  
  // Default to Windows Documents folder
  // Even when Electron is launched from WSL, we need to use Windows paths
  // Electron's file dialog runs on Windows and needs Windows paths
  const os = require('os');
  const fs = require('fs');
  let defaultPath;
  
  // Function to get Windows username and construct Windows Documents path
  const getWindowsDocumentsPath = () => {
    // Method 1: Check if USERPROFILE is set (Windows environment variable)
    if (process.env.USERPROFILE) {
      const userProfile = process.env.USERPROFILE;
      // USERPROFILE is like C:\Users\Username
      // Use path.join but ensure Windows separators
      const docsPath = path.join(userProfile, 'Documents').replace(/\//g, '\\');
      // Check if it exists (try both Windows and WSL path)
      if (fs.existsSync(docsPath)) {
        return docsPath;
      }
      // Also try checking via WSL mount
      const wslPath = docsPath.replace(/^([A-Za-z]):\\/, '/mnt/$1/').replace(/\\/g, '/');
      if (fs.existsSync(wslPath)) {
        return docsPath; // Return Windows format
      }
      return userProfile; // Fallback to user profile
    }
    
    // Method 2: Try to read from /mnt/c/Users to find Windows user
    try {
      const usersDir = '/mnt/c/Users';
      if (fs.existsSync(usersDir)) {
        const users = fs.readdirSync(usersDir);
        // Filter out system folders and find a user directory
        const userDirs = users.filter(u => {
          const userPath = path.join(usersDir, u);
          try {
            return !['Public', 'Default', 'Default User', 'All Users', 'desktop.ini'].includes(u) &&
                   fs.statSync(userPath).isDirectory();
          } catch {
            return false;
          }
        });
        
        if (userDirs.length > 0) {
          const windowsUser = userDirs[0];
          // Convert to Windows path format
          const docsPath = `C:\\Users\\${windowsUser}\\Documents`;
          // Check if it exists via WSL mount
          const wslDocsPath = `/mnt/c/Users/${windowsUser}/Documents`;
          if (fs.existsSync(wslDocsPath)) {
            return docsPath; // Return Windows format path
          }
          return `C:\\Users\\${windowsUser}`; // Fallback to user home
        }
      }
    } catch (e) {
      console.log('Could not read /mnt/c/Users:', e.message);
    }
    
    // Method 3: Try to get from os.homedir() and convert if it's a WSL path
    const homeDir = os.homedir();
    if (homeDir.startsWith('/mnt/')) {
      // It's a WSL path, convert to Windows
      const parts = homeDir.split('/').filter(p => p);
      if (parts.length >= 3) {
        const drive = parts[1].toUpperCase();
        const rest = parts.slice(2).join('\\');
        return `${drive}:\\${rest}\\Documents`;
      }
    } else if (homeDir.includes('\\')) {
      // Already Windows path
      return path.join(homeDir, 'Documents').replace(/\//g, '\\');
    }
    
    // Method 4: Last resort - try common Windows username
    const possibleUser = process.env.USERNAME || process.env.USER || 'User';
    return `C:\\Users\\${possibleUser}\\Documents`;
  };
  
  // Always use Windows path format for Electron's file dialog
  // Electron's dialog.showOpenDialog on Windows expects Windows paths (C:\Users\...)
  defaultPath = getWindowsDocumentsPath();
  console.log('File dialog default path (initial):', defaultPath);
  
  // Ensure defaultPath is in Windows format (backslashes) for Electron dialog
  // Electron's dialog on Windows expects Windows path format
  if (defaultPath && defaultPath.includes('/') && !defaultPath.startsWith('/mnt/')) {
    // Convert forward slashes to backslashes for Windows paths
    defaultPath = defaultPath.replace(/\//g, '\\');
  }
  
  // If we have a WSL path (/mnt/c/...), convert to Windows path (C:\...)
  if (defaultPath && defaultPath.startsWith('/mnt/')) {
    const parts = defaultPath.split('/').filter(p => p);
    if (parts.length >= 2) {
      const drive = parts[1].toUpperCase();
      const rest = parts.slice(2).join('\\');
      defaultPath = `${drive}:\\${rest}`;
      console.log('Converted WSL path to Windows path for dialog:', defaultPath);
    }
  }
  
  // Final validation: ensure we have a valid Windows path format
  // If defaultPath doesn't look like a Windows path, use C:\ as fallback
  if (!defaultPath || (!defaultPath.match(/^[A-Za-z]:\\/) && !defaultPath.startsWith('\\\\'))) {
    console.log('Default path not in Windows format, using C:\\ as fallback');
    defaultPath = 'C:\\';
  }
  
  console.log('File dialog final default path:', defaultPath);
  
  const dialogOptions = {
    title: options.title || 'Select Document',
    defaultPath: defaultPath,
    filters: options.filters || [
      { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: options.properties || ['openFile', 'multiSelections'],
    ...options
  };
  
  // Remove properties from options to avoid conflicts
  delete dialogOptions.multiSelect;
  
  console.log('Opening file dialog with options:', dialogOptions);
  console.log('Platform:', process.platform);
  console.log('Default path:', defaultPath);
  
  const result = await dialog.showOpenDialog(mainWindow, dialogOptions);
  console.log('File dialog result:', result);
  
  return result;
});

// Handle file drops from Windows (works even in WSL because Electron runs on Windows)
ipcMain.on('file-drop', async (event, filePaths) => {
  console.log('Files dropped:', filePaths);
  // Forward to renderer
  if (mainWindow) {
    mainWindow.webContents.send('files-dropped', filePaths);
  }
});

// Handle file reading requests (for cross-filesystem access)
const fs = require('fs').promises;
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    console.log('Reading file from path:', filePath);
    
    // Electron runs in Windows, so it can read Windows paths directly
    // Also try to handle WSL paths if needed
    let normalizedPath = filePath;
    const pathsToTry = [];
    
    // When Electron runs in WSL, it can read WSL paths directly
    // Try WSL path first, then Windows path format
    if (filePath.startsWith('/mnt/')) {
      // It's a WSL path - try it first (works when Electron runs in WSL)
      pathsToTry.push(filePath);
      
      // Also try Windows path format (in case Electron can access Windows directly)
      const parts = filePath.split('/').filter(p => p);
      if (parts.length >= 2) {
        const drive = parts[1].toUpperCase();
        const rest = parts.slice(2).join('\\');
        const windowsPath = `${drive}:\\${rest}`;
        console.log('Also trying Windows path format:', windowsPath);
        pathsToTry.push(windowsPath);
      }
    } else if (filePath.match(/^[A-Za-z]:[\\\/]/)) {
      // It's a Windows path - try it first, then WSL format
      pathsToTry.push(filePath);
      
      // Also try WSL path format
      const wslPath = filePath.replace(/^([A-Za-z]):[\\\/]/, '/mnt/$1/').replace(/\\/g, '/');
      console.log('Also trying WSL path format:', wslPath);
      pathsToTry.push(wslPath);
    } else {
      // Other paths - try as-is
      pathsToTry.push(filePath);
    }
    
    // Try to read the file from multiple possible paths
    let fileBuffer;
    let usedPath = null;
    let lastError = null;
    
    for (const tryPath of pathsToTry) {
      try {
        fileBuffer = await fs.readFile(tryPath);
        usedPath = tryPath;
        console.log('Successfully read file from:', tryPath);
        break;
      } catch (err) {
        console.log(`Failed to read from path "${tryPath}":`, err.message);
        lastError = err;
        continue;
      }
    }
    
    if (!fileBuffer) {
      throw lastError || new Error('Failed to read file from all attempted paths');
    }
    
    // Convert buffer to base64 for transfer
    return {
      success: true,
      data: fileBuffer.toString('base64'),
      path: filePath,
      originalPath: filePath,
      usedPath: usedPath
    };
  } catch (error) {
    console.error('Error reading file:', error.message, 'Path:', filePath);
    return {
      success: false,
      error: error.message,
      path: filePath
    };
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#0f172a',
    titleBarStyle: 'default',
  });

  // Handle file drops at the Electron window level
  // This works even when running in WSL because Electron runs on Windows
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    // Prevent navigation when files are dropped
    event.preventDefault();
  });

  // Listen for file drops
  mainWindow.webContents.on('dom-ready', () => {
    // Inject script to handle file drops
    mainWindow.webContents.executeJavaScript(`
      // Prevent default drag behaviors
      document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
      
      document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    `);
  });

  // Load the app - in development, always use Vite dev server
  const isDev = process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    // Load from Vite dev server (wait-on ensures it's ready)
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle file drops from Windows Explorer
  // This is the key - Electron can receive Windows file drops even in WSL
  // We need to inject this early and ensure it persists
  const injectDragDropHandlers = () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          // Remove existing listeners if any
          const existingHandler = window.__electronDragHandler;
          if (existingHandler) {
            document.removeEventListener('dragover', existingHandler.dragover);
            document.removeEventListener('drop', existingHandler.drop);
          }
          
          // Create new handlers
          const dragoverHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            return false;
          };
          
          const dropHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
              // Send files to renderer via custom event
              window.dispatchEvent(new CustomEvent('electron-file-drop', {
                detail: { 
                  files: Array.from(files).map(f => ({
                    name: f.name,
                    path: f.path || f.name,
                    size: f.size,
                    type: f.type
                  })) 
                }
              }));
            }
            return false;
          };
          
          // Store handlers for cleanup
          window.__electronDragHandler = {
            dragover: dragoverHandler,
            drop: dropHandler
          };
          
          // Add listeners to document
          document.addEventListener('dragover', dragoverHandler, false);
          document.addEventListener('drop', dropHandler, false);
          
          // Also add to window for maximum coverage
          window.addEventListener('dragover', dragoverHandler, false);
          window.addEventListener('drop', dropHandler, false);
        })();
      `).catch(err => console.error('Error injecting drag handlers:', err));
    }
  };

  // Inject handlers when page loads
  mainWindow.webContents.on('did-finish-load', injectDragDropHandlers);
  
  // Also inject after navigation
  mainWindow.webContents.on('dom-ready', injectDragDropHandlers);
}

app.whenReady().then(() => {
  startExpressServer();
  createMenu();
  
  // Wait a moment for Express server to start, then create window
  setTimeout(() => {
    createWindow();
  }, 500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (expressServer) {
    expressServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (expressServer) {
    expressServer.close();
  }
});
