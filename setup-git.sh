#!/bin/bash
# Run this in WSL from ~/repos/ollama-desktop-app to initialize git and connect to GitHub

set -e
cd "$(dirname "$0")"

echo "Initializing git repository..."
git init

echo "Staging all files..."
git add -A

echo "Creating initial commit..."
git commit -m "Initial commit: Ollama desktop app with Electron, React, Vite"

echo "Adding GitHub remote..."
git remote add origin https://github.com/Kingmallin/ollama-desktop-app.git

echo "Setting main branch..."
git branch -M main

echo ""
echo "Done! Now run this to push:"
echo "  git push -u origin main"
echo ""
