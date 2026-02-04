# Ollama Desktop App

A modern desktop application for interacting with locally running Ollama LLM instances. Built with Electron, React, and Node.js.

## 📚 Documentation

- **[INSTALLATION.md](./INSTALLATION.md)** - Complete installation and setup guide
- **[SETUP_CHECKLIST.md](./SETUP_CHECKLIST.md)** - Quick setup verification checklist
- **[CODE_REVIEW.md](./CODE_REVIEW.md)** - Code standards and architecture review
- **[README.md](./README.md)** - This file (overview and quick start)

## Features

- **Model Management**: View and install Ollama models directly from the app
- **Streaming Chat Interface**: Real-time streaming responses from Ollama
- **Split View**: Separate Markdown explanations and code blocks
- **Code Sandbox**: Execute Python and JavaScript code in an isolated environment
- **Modern UI**: Dark-themed interface built with Tailwind CSS
- **Responsive Layout**: Sidebar for settings and conversation history

## Prerequisites

Before installing, ensure you have:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **Ollama** installed and running locally - [Download here](https://ollama.ai/download)
- **Python 3** (for executing Python code) - [Download here](https://www.python.org/downloads/)
- **npm** (comes with Node.js) or **yarn**

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/ollama-desktop-app.git
cd ollama-desktop-app
```

Or download and extract the ZIP file from GitHub.

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages. It may take a few minutes.

### 3. Start Ollama

Make sure Ollama is installed and running:

```bash
# Start Ollama service
ollama serve

# In another terminal, verify it's working
ollama list
```

### 4. Install a Model (Optional but Recommended)

Before first use, install at least one model:

```bash
# Install a small model for testing
ollama pull llama3.2:3b

# Or install a larger model
ollama pull llama3.2
```

### 5. Run the Application

```bash
npm run dev
```

This will:
- Start the Vite dev server for the React frontend (port 5173)
- Start the Express backend server (port 3001)
- Launch the Electron app automatically

## Detailed Installation

For detailed installation instructions, troubleshooting, and platform-specific setup, see **[INSTALLATION.md](./INSTALLATION.md)**.

The installation guide covers:
- System requirements
- Step-by-step installation for Windows, macOS, and Linux
- WSL (Windows Subsystem for Linux) setup
- Post-installation configuration
- Common issues and solutions

**Quick Setup Checklist**: See **[SETUP_CHECKLIST.md](./SETUP_CHECKLIST.md)** for a step-by-step checklist to verify your installation.

## Development

Run the development server:
```bash
npm run dev
```

This will:
- Start the Vite dev server for the React frontend
- Launch the Electron app
- Start the Express backend server on port 3001

## Building

Build for production:
```bash
npm run build
```

Build Electron app:
```bash
npm run build:electron
```

## Usage

1. **Select a Model**: Use the dropdown to select an installed Ollama model, or install a new one using the "Install New Model" field.

2. **Chat**: Type your message and press Enter (or click Send) to start a conversation.

3. **Execute Code**: When the LLM generates code blocks, click the "Execute" button to run the code in a sandboxed environment.

4. **Stop Generation**: Click the "Stop" button to cancel an ongoing generation.

5. **Clear Conversation**: Use the "Clear Conversation" button in the sidebar to reset the chat.

## Project Structure

```
ollama-desktop-app/
├── electron/          # Electron main process and preload scripts
├── backend/           # Express API routes
│   ├── routes/
│   │   ├── ollama.js  # Ollama API integration
│   │   └── sandbox.js # Code execution sandbox
├── src/               # React frontend
│   ├── components/    # React components
│   ├── App.tsx        # Main app component
│   └── main.tsx       # React entry point
├── package.json
└── README.md
```

## API Endpoints

### Ollama Routes (`/api/ollama`)
- `GET /models` - Get list of installed models
- `POST /install` - Install a new model
- `POST /chat/stream` - Stream chat completion
- `POST /chat/stop` - Stop generation (placeholder)

### Sandbox Routes (`/api/sandbox`)
- `POST /execute` - Execute code in sandbox

## Security Notes

- Code execution is sandboxed using Node.js `child_process` with restricted permissions
- Execution has a 10-second timeout
- Only Python and JavaScript execution is supported
- Temporary files are automatically cleaned up after execution

## Troubleshooting

### Quick Fixes

- **Models not loading**: 
  - Ensure Ollama is running: `ollama serve`
  - Verify connection: `curl http://localhost:11434/api/tags`
  - Check if you have models installed: `ollama list`

- **Code execution fails**: 
  - Verify Python 3 is installed: `python3 --version`
  - Check Python is in PATH: `which python3` (Linux/macOS) or `where python` (Windows)
  - On Windows, ensure "Add Python to PATH" was checked during installation

- **Port conflicts**: 
  - Backend runs on port 3001, frontend on 5173
  - Find processes using ports: `lsof -i :3001` (macOS/Linux) or `netstat -ano | findstr :3001` (Windows)
  - Kill conflicting processes or change ports in configuration

- **Installation errors**: 
  - Ensure Node.js 18+ is installed: `node --version`
  - Clear npm cache: `npm cache clean --force`
  - Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

For more detailed troubleshooting, see **[INSTALLATION.md](./INSTALLATION.md#common-issues)**.

## License

MIT
