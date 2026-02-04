# Setup Checklist

Use this checklist to ensure you have everything set up correctly before running the app.

## Pre-Installation Checklist

- [ ] **Node.js installed** (v18+)
  - Check: `node --version`
  - Download: [nodejs.org](https://nodejs.org/)

- [ ] **npm installed** (comes with Node.js)
  - Check: `npm --version`
  - Should be v8.0.0 or higher

- [ ] **Ollama installed**
  - Check: `ollama --version`
  - Download: [ollama.ai/download](https://ollama.ai/download)

- [ ] **Python 3 installed** (for code execution)
  - Check: `python3 --version` (Linux/macOS) or `python --version` (Windows)
  - Download: [python.org](https://www.python.org/downloads/)

- [ ] **Git installed** (optional, for cloning)
  - Check: `git --version`
  - Download: [git-scm.com](https://git-scm.com/downloads)

## Installation Checklist

- [ ] **Repository cloned or downloaded**
  ```bash
  git clone <repository-url>
  cd ollama-desktop-app
  ```

- [ ] **Dependencies installed**
  ```bash
  npm install
  ```
  - No errors in the output
  - `node_modules` folder created

- [ ] **Ollama service running**
  ```bash
  ollama serve
  ```
  - Service starts without errors
  - Can access: `curl http://localhost:11434/api/tags`

- [ ] **At least one model installed** (optional but recommended)
  ```bash
  ollama pull llama3.2:3b
  ollama list  # Should show installed models
  ```

## Verification Checklist

- [ ] **All prerequisites verified**
  ```bash
  node --version    # ✓ v18.0.0+
  npm --version     # ✓ v8.0.0+
  ollama --version  # ✓ Installed
  python3 --version # ✓ Python 3.x
  ```

- [ ] **Ollama accessible**
  ```bash
  curl http://localhost:11434/api/tags
  ```
  - Returns JSON with models (or empty array if none installed)

- [ ] **Ports available**
  - Port 3001 (backend) - not in use
  - Port 5173 (frontend) - not in use
  - Check: `lsof -i :3001` and `lsof -i :5173` (macOS/Linux)
  - Or: `netstat -ano | findstr :3001` (Windows)

## First Run Checklist

- [ ] **Development server starts**
  ```bash
  npm run dev
  ```
  - Vite dev server starts (port 5173)
  - Express backend starts (port 3001)
  - Electron window opens

- [ ] **App interface loads**
  - No blank screen
  - Sidebar visible
  - Model selector visible

- [ ] **Model selection works**
  - Can see installed models in dropdown
  - Can select a model
  - Model name appears in UI

- [ ] **Chat functionality works**
  - Can type a message
  - Can send message (Enter or Send button)
  - Receives response from model

- [ ] **Code execution works** (if testing with code)
  - Code block appears in response
  - "Execute" button visible
  - Code executes successfully
  - Results displayed

## Troubleshooting Checklist

If something doesn't work:

- [ ] **Checked console for errors**
  - Terminal/console output
  - Browser DevTools (if Electron DevTools open)
  - No red error messages

- [ ] **Verified Ollama connection**
  ```bash
  curl http://localhost:11434/api/tags
  ollama list
  ```

- [ ] **Checked file permissions**
  - Can read project files
  - Can write to project directory
  - `node_modules` exists and is readable

- [ ] **Cleared caches** (if needed)
  ```bash
  npm cache clean --force
  rm -rf node_modules package-lock.json
  npm install
  ```

- [ ] **Restarted services**
  - Stopped and restarted Ollama
  - Killed any processes on ports 3001/5173
  - Restarted terminal/command prompt

## Platform-Specific Checklist

### Windows

- [ ] Python added to PATH during installation
- [ ] Running PowerShell/CMD as Administrator (if permission issues)
- [ ] Antivirus not blocking npm/node
- [ ] Windows Firewall allows Node.js

### macOS

- [ ] Xcode Command Line Tools installed (if build errors)
  ```bash
  xcode-select --install
  ```
- [ ] Homebrew installed (if using for dependencies)
- [ ] No permission errors with npm

### Linux

- [ ] Build tools installed
  ```bash
  sudo apt install build-essential  # Ubuntu/Debian
  ```
- [ ] Python development headers (if needed)
  ```bash
  sudo apt install python3-dev
  ```

### WSL (Windows Subsystem for Linux)

- [ ] Node.js installed in WSL (not just Windows)
- [ ] Ollama accessible (running on Windows or WSL)
- [ ] Can access Windows files from WSL
- [ ] Display server configured (if needed for Electron)

## Success Criteria

You're ready to use the app when:

✅ All prerequisites installed and verified  
✅ Dependencies installed without errors  
✅ Ollama running and accessible  
✅ At least one model installed  
✅ App starts with `npm run dev`  
✅ Can select a model and send messages  
✅ No errors in console  

## Next Steps

Once everything is checked:

1. **Read the [README.md](./README.md)** for usage instructions
2. **Explore features**:
   - Model management
   - Chat interface
   - Code execution
   - Document management
   - Image generation
3. **Check [INSTALLATION.md](./INSTALLATION.md)** for detailed setup
4. **Review [CODE_REVIEW.md](./CODE_REVIEW.md)** for development guidelines

## Getting Help

If you can't complete the checklist:

1. Review error messages carefully
2. Check [INSTALLATION.md](./INSTALLATION.md#common-issues) for solutions
3. Search GitHub Issues for similar problems
4. Create a new issue with:
   - Your operating system
   - Node.js version (`node --version`)
   - Error messages
   - Steps you've taken

---

*Print or save this checklist to track your setup progress!*
