# Installation & Setup Guide

This guide will walk you through installing and setting up the Ollama Desktop App on your system.

## Table of Contents

- [System Requirements](#system-requirements)
- [Prerequisites](#prerequisites)
- [Installation Steps](#installation-steps)
  - [Windows](#windows)
  - [macOS](#macos)
  - [Linux](#linux)
  - [WSL (Windows Subsystem for Linux)](#wsl-windows-subsystem-for-linux)
- [Post-Installation Setup](#post-installation-setup)
- [Verification](#verification)
- [Common Issues](#common-issues)

---

## System Requirements

### Minimum Requirements

- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **RAM**: 4 GB (8 GB recommended)
- **Storage**: 2 GB free space (more for model storage)
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher (comes with Node.js)

### Recommended Requirements

- **RAM**: 16 GB or more (for running larger models)
- **Storage**: 20+ GB (for multiple models)
- **CPU**: Multi-core processor (for better performance)

---

## Prerequisites

Before installing the Ollama Desktop App, you need to install the following:

### 1. Node.js and npm

#### Windows

1. Download Node.js from [nodejs.org](https://nodejs.org/)
2. Choose the LTS (Long Term Support) version
3. Run the installer and follow the setup wizard
4. Verify installation:
   ```powershell
   node --version
   npm --version
   ```

#### macOS

**Using Homebrew (Recommended):**
```bash
brew install node
```

**Or download from nodejs.org:**
1. Visit [nodejs.org](https://nodejs.org/)
2. Download the macOS installer
3. Run the installer
4. Verify installation:
   ```bash
   node --version
   npm --version
   ```

#### Linux (Ubuntu/Debian)

```bash
# Update package list
sudo apt update

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

#### Linux (Other Distributions)

Visit [nodejs.org](https://nodejs.org/) for distribution-specific instructions.

### 2. Ollama

Ollama must be installed and running for the app to work.

#### Windows

1. Download from [ollama.ai](https://ollama.ai/download)
2. Run the installer
3. Ollama will start automatically as a service
4. Verify it's running:
   ```powershell
   ollama --version
   ```

#### macOS

```bash
# Using Homebrew
brew install ollama

# Or download from ollama.ai
# Visit https://ollama.ai/download and download the macOS installer
```

Start Ollama:
```bash
ollama serve
```

#### Linux

```bash
# Install using the official script
curl -fsSL https://ollama.ai/install.sh | sh

# Or download from ollama.ai
# Visit https://ollama.ai/download for distribution-specific packages
```

Start Ollama:
```bash
ollama serve
```

**Note**: On Linux, you may want to set up Ollama as a systemd service to run automatically:

```bash
# Create systemd service file
sudo nano /etc/systemd/system/ollama.service
```

Add the following content:
```ini
[Unit]
Description=Ollama Service
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
ExecStart=/usr/local/bin/ollama serve
Restart=always

[Install]
WantedBy=multi-user.target
```

Then enable and start the service:
```bash
sudo systemctl enable ollama
sudo systemctl start ollama
```

### 3. Python 3 (for Code Execution)

Required for executing Python code in the sandbox.

#### Windows

1. Download from [python.org](https://www.python.org/downloads/)
2. **Important**: Check "Add Python to PATH" during installation
3. Verify installation:
   ```powershell
   python --version
   # or
   python3 --version
   ```

#### macOS

Python 3 is usually pre-installed. Verify:
```bash
python3 --version
```

If not installed:
```bash
brew install python3
```

#### Linux

```bash
# Usually pre-installed, verify:
python3 --version

# If not installed:
sudo apt update
sudo apt install python3
```

### 4. Git (Optional but Recommended)

For cloning the repository.

#### Windows

Download from [git-scm.com](https://git-scm.com/download/win)

#### macOS

```bash
brew install git
```

#### Linux

```bash
sudo apt update
sudo apt install git
```

---

## Installation Steps

### Windows

1. **Open PowerShell or Command Prompt**

2. **Clone the repository** (if using Git):
   ```powershell
   git clone https://github.com/Kingmallin/ollama-desktop-app.git
   cd ollama-desktop-app
   ```
   
   Or download and extract the ZIP file from GitHub.

3. **Install dependencies**:
   ```powershell
   npm install
   ```
   
   This may take a few minutes. If you encounter errors:
   - Make sure you're using Node.js 18+
   - Try running PowerShell as Administrator
   - Check if antivirus is blocking npm

4. **Verify installation**:
   ```powershell
   npm list --depth=0
   ```

### macOS

1. **Open Terminal**

2. **Clone the repository** (if using Git):
   ```bash
   git clone https://github.com/Kingmallin/ollama-desktop-app.git
   cd ollama-desktop-app
   ```
   
   Or download and extract the ZIP file from GitHub.

3. **Install dependencies**:
   ```bash
   npm install
   ```
   
   If you encounter permission errors:
   ```bash
   sudo npm install
   ```
   
   Or fix npm permissions (recommended):
   ```bash
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'
   echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bash_profile
   source ~/.bash_profile
   ```

4. **Verify installation**:
   ```bash
   npm list --depth=0
   ```

### Linux

1. **Open Terminal**

2. **Clone the repository** (if using Git):
   ```bash
   git clone https://github.com/Kingmallin/ollama-desktop-app.git
   cd ollama-desktop-app
   ```
   
   Or download and extract the ZIP file from GitHub.

3. **Install dependencies**:
   ```bash
   npm install
   ```
   
   If you encounter permission errors, you may need to install build tools:
   ```bash
   # Ubuntu/Debian
   sudo apt install build-essential
   
   # Fedora
   sudo dnf install gcc-c++ make
   ```

4. **Verify installation**:
   ```bash
   npm list --depth=0
   ```

### WSL (Windows Subsystem for Linux)

If you're using WSL (like the project workspace suggests), follow the Linux instructions above, but note:

1. **Use WSL Terminal** (not PowerShell):
   ```bash
   # In WSL terminal
   cd /mnt/c/path/to/your/project
   # or if project is in WSL home
   cd ~/repos/ollama-desktop-app
   ```

2. **Install Node.js in WSL**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Ollama in WSL**:
   - You can run Ollama in WSL, or
   - Run Ollama on Windows and connect to it from WSL
   - If running on Windows, use `http://localhost:11434` (WSL can access Windows localhost)

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Running the app from WSL**:
   - Electron will run on Windows even when launched from WSL
   - The backend Express server will run in WSL
   - Make sure ports 3001 (backend) and 5173 (Vite) are accessible

---

## Post-Installation Setup

### 1. Configure Environment Variables (Optional)

Create a `.env` file in the project root for custom configuration:

```env
# Ollama API endpoint (default: http://localhost:11434)
OLLAMA_HOST=http://localhost:11434

# Backend server port (default: 3001)
BACKEND_PORT=3001

# Frontend dev server port (default: 5173)
FRONTEND_PORT=5173
```

### 2. Install Your First Model

Before using the app, you should install at least one Ollama model:

```bash
# Example: Install Llama 3.2 (3B parameters)
ollama pull llama3.2:3b

# Or install a larger model
ollama pull llama3.2

# List installed models
ollama list
```

**Recommended models for testing:**
- `llama3.2:3b` - Small, fast, good for testing
- `llama3.2` - Medium size, good balance
- `mistral` - Alternative model
- `phi3` - Microsoft's efficient model

### 3. Verify Ollama is Running

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Or test with a simple request
ollama run llama3.2:3b "Hello, how are you?"
```

---

## Verification

### 1. Check All Prerequisites

Run these commands to verify everything is installed:

```bash
# Check Node.js
node --version  # Should be v18.0.0 or higher

# Check npm
npm --version  # Should be v8.0.0 or higher

# Check Ollama
ollama --version

# Check Python
python3 --version  # Should be Python 3.x

# Check if Ollama is running
curl http://localhost:11434/api/tags
```

### 2. Test the Installation

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Expected behavior**:
   - Vite dev server starts on `http://localhost:5173`
   - Express backend starts on `http://localhost:3001`
   - Electron window opens automatically
   - You should see the app interface

3. **Test features**:
   - Select a model from the dropdown
   - Send a test message
   - Verify code execution works (if applicable)

### 3. Check for Errors

If something doesn't work:

1. **Check console output** for error messages
2. **Check browser console** (if Electron DevTools are open)
3. **Verify ports are not in use**:
   ```bash
   # Windows PowerShell
   netstat -ano | findstr :3001
   netstat -ano | findstr :5173
   
   # macOS/Linux
   lsof -i :3001
   lsof -i :5173
   ```

---

## Common Issues

### Issue: "Command not found: node" or "Command not found: npm"

**Solution:**
- Verify Node.js is installed: `node --version`
- If installed but not found, add Node.js to your PATH
- Restart your terminal after installation

### Issue: "EACCES: permission denied" (macOS/Linux)

**Solution:**
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

Or use `sudo npm install` (not recommended for security reasons).

### Issue: "Cannot connect to Ollama" or "Models not loading"

**Solutions:**
1. Verify Ollama is running:
   ```bash
   ollama serve
   ```

2. Check if Ollama is accessible:
   ```bash
   curl http://localhost:11434/api/tags
   ```

3. If using WSL, ensure Ollama is running on Windows or configure the correct host

4. Check firewall settings (Windows)

### Issue: "Port 3001 already in use" or "Port 5173 already in use"

**Solutions:**
1. Find and kill the process using the port:
   ```bash
   # Windows
   netstat -ano | findstr :3001
   taskkill /PID <PID> /F
   
   # macOS/Linux
   lsof -ti:3001 | xargs kill -9
   ```

2. Or change the port in your configuration

### Issue: "Python code execution fails"

**Solutions:**
1. Verify Python 3 is installed: `python3 --version`
2. Check Python is in PATH: `which python3`
3. On Windows, ensure "Add Python to PATH" was checked during installation
4. Try using `python` instead of `python3` (Windows)

### Issue: "npm install fails with network errors"

**Solutions:**
1. Check your internet connection
2. Clear npm cache: `npm cache clean --force`
3. Try using a different registry: `npm config set registry https://registry.npmjs.org/`
4. If behind a proxy, configure npm proxy settings

### Issue: "Electron app doesn't open" (WSL)

**Solution:**
- Electron runs on Windows even when launched from WSL
- Ensure you have a display server configured (X11 or Windows X Server)
- Or run from Windows PowerShell instead

### Issue: "Module not found" errors

**Solutions:**
1. Delete `node_modules` and `package-lock.json`:
   ```bash
   rm -rf node_modules package-lock.json
   ```

2. Reinstall dependencies:
   ```bash
   npm install
   ```

3. If specific modules fail, try installing them individually

---

## Next Steps

After successful installation:

1. **Read the [README.md](./README.md)** for usage instructions
2. **Check [CODE_REVIEW.md](./CODE_REVIEW.md)** for code standards and best practices
3. **Explore the features**:
   - Model management
   - Chat interface
   - Code execution
   - Document management (RAG)
   - Image generation

4. **Join the community** (if applicable):
   - Report issues on GitHub
   - Contribute improvements
   - Share feedback

---

## Getting Help

If you encounter issues not covered here:

1. Check the [Troubleshooting](#common-issues) section
2. Review error messages in the console
3. Check GitHub Issues for similar problems
4. Create a new issue with:
   - Your operating system
   - Node.js version
   - Error messages
   - Steps to reproduce

---

## Uninstallation

To uninstall the Ollama Desktop App:

1. **Stop the application** if running
2. **Delete the project directory**:
   ```bash
   rm -rf ollama-desktop-app  # Linux/macOS
   # Or delete the folder in Windows Explorer
   ```

3. **Optional: Remove global dependencies** (if any were installed globally):
   ```bash
   npm uninstall -g <package-name>
   ```

**Note**: This does not uninstall Node.js, Ollama, or Python. To uninstall those, follow their respective uninstallation procedures.

---

*Last updated: February 4, 2026*
