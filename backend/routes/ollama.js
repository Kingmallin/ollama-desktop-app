const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const http = require('http');
const { URL } = require('url');

// Ollama API base URL - uses local Ollama instance
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Helper to make HTTP GET request
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Helper to stream HTTP POST request
function httpPostStream(url, body, onChunk) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(body);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    
    console.log('Request options:', options);
    
    let isDone = false;
    
    const req = http.request(options, (res) => {
      console.log('Ollama response status:', res.statusCode);
      console.log('Ollama response headers:', res.headers);
      
      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', (chunk) => { errorData += chunk.toString(); });
        res.on('end', () => {
          reject(new Error(`Ollama API error ${res.statusCode}: ${errorData}`));
        });
        return;
      }
      
      let buffer = '';
      let totalBytes = 0;
      
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue; // Skip empty lines
          
          // Ollama uses NDJSON (newline-delimited JSON), not SSE format
          // Each line is a complete JSON object
          try {
            const data = JSON.parse(trimmedLine);
            onChunk(data);
            
            if (data.done && !isDone) {
              isDone = true;
              resolve();
              return;
            }
          } catch (e) {
            // Skip invalid JSON
            console.log('Parse error for line:', trimmedLine.substring(0, 100), e.message);
          }
        }
      });
      
      res.on('end', () => {
        if (!isDone) {
          resolve();
        }
      });
      
      res.on('error', (err) => {
        console.error('Ollama stream error:', err);
        if (!isDone) {
          reject(err);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });
    
    req.write(postData);
    req.end();
    
    console.log('Request sent to Ollama');
  });
}

// Get all installed models
router.get('/models', async (req, res) => {
  try {
    console.log('Fetching models from:', `${OLLAMA_HOST}/api/tags`);
    const data = await httpGet(`${OLLAMA_HOST}/api/tags`);
    console.log('Models fetched:', data.models?.length || 0, 'models');
    res.json({ models: data.models || [] });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models', message: error.message });
  }
});

// Delete a model
router.delete('/models/:modelName', async (req, res) => {
  const { modelName } = req.params;
  
  if (!modelName) {
    return res.status(400).json({ error: 'Model name is required' });
  }

  // Decode the model name (in case it has special characters)
  const decodedModelName = decodeURIComponent(modelName);
  
  try {
    console.log('Deleting model:', decodedModelName);
    
    const isWindows = process.platform === 'win32';
    const deleteProcess = spawn('ollama', ['rm', decodedModelName], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWindows,
    });

    let stdout = '';
    let stderr = '';

    deleteProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    deleteProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    deleteProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Model deleted successfully:', decodedModelName);
        res.json({ success: true, message: `Model ${decodedModelName} deleted successfully` });
      } else {
        console.error('Delete failed, exit code:', code);
        console.error('stderr:', stderr);
        const errorMsg = stderr.trim() || stdout.trim() || 'Failed to delete model';
        res.status(500).json({ 
          success: false, 
          error: 'Delete failed', 
          message: errorMsg 
        });
      }
    });

    deleteProcess.on('error', (error) => {
      console.error('Delete process error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to start delete process', 
        message: error.message 
      });
    });
  } catch (error) {
    console.error('Error deleting model:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Delete error', 
      message: error.message 
    });
  }
});

// Get available models from Ollama library
router.get('/library', async (req, res) => {
  try {
    const https = require('https');
    
    // Try to fetch from Ollama's registry API
    // Ollama uses a Docker registry format, so we can try to query it
    const registryUrl = 'registry.ollama.ai';
    
    // Try to get catalog from registry (Docker registry v2 API)
    return new Promise((resolve) => {
      const options = {
        hostname: registryUrl,
        path: '/v2/_catalog',
        method: 'GET',
        headers: {
          'User-Agent': 'Ollama-Desktop-App',
        },
        timeout: 5000,
      };

      const req = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          try {
            if (response.statusCode === 200) {
              const catalog = JSON.parse(data);
              if (catalog.repositories && Array.isArray(catalog.repositories)) {
                // Parse model names and try to get tags for each
                const models = catalog.repositories.map(name => ({ name, tags: ['latest'] }));
                console.log('Fetched models from registry:', models.length);
                res.json({ models });
                resolve();
                return;
              }
            }
          } catch (parseError) {
            console.log('Could not parse registry response, using fallback');
          }
          // Fallback to curated list
          returnFallbackList(res, resolve);
        });
      });

      req.on('error', (error) => {
        console.log('Registry fetch failed, using fallback:', error.message);
        returnFallbackList(res, resolve);
      });

      req.on('timeout', () => {
        req.destroy();
        console.log('Registry fetch timeout, using fallback');
        returnFallbackList(res, resolve);
      });

      req.end();
    });
  } catch (error) {
    console.error('Error in library endpoint:', error);
    returnFallbackList(res, () => {});
  }
});

// Helper function to return fallback model list
function returnFallbackList(res, resolve) {
  const modelsWithTags = [
    { name: 'llama3.2', tags: ['latest', '1b', '3b'] },
    { name: 'llama3.1', tags: ['latest', '8b', '70b', '405b'] },
    { name: 'llama3', tags: ['latest', '8b', '70b'] },
    { name: 'llama2', tags: ['latest', '7b', '13b', '70b'] },
    { name: 'mistral', tags: ['latest', '7b', '7b-instruct'] },
    { name: 'mixtral', tags: ['latest', '8x7b', '8x22b'] },
    { name: 'codellama', tags: ['latest', '7b', '13b', '34b', '7b-instruct', '13b-instruct', '34b-instruct'] },
    { name: 'codegemma', tags: ['latest', '2b', '7b', '7b-instruct'] },
    { name: 'phi3', tags: ['latest', 'mini', 'medium', 'mini-instruct', 'medium-instruct'] },
    { name: 'gemma', tags: ['latest', '2b', '7b', '2b-instruct', '7b-instruct'] },
    { name: 'qwen', tags: ['latest', '0.5b', '1.8b', '2.5b', '4b', '7b', '14b', '32b', '72b'] },
    { name: 'neural-chat', tags: ['latest', '7b', '7b-v3-1', '7b-v3-2'] },
    { name: 'starling-lm', tags: ['latest', '7b', '7b-beta'] },
    { name: 'orca-mini', tags: ['latest', '3b', '7b', '13b'] },
    { name: 'vicuna', tags: ['latest', '7b', '13b', '33b'] },
    { name: 'wizardcoder', tags: ['latest', '7b', '13b', '34b'] },
    { name: 'wizard-vicuna', tags: ['latest', '7b', '13b', '30b'] },
    { name: 'falcon', tags: ['latest', '7b', '40b', '7b-instruct', '40b-instruct'] },
    { name: 'dolphin-mixtral', tags: ['latest', '8x7b', '8x22b'] },
    { name: 'solar', tags: ['latest', '10.7b', '10.7b-instruct'] },
  ];
  res.json({ models: modelsWithTags });
  if (resolve) resolve();
}

// Install a new model with progress streaming
router.post('/install', async (req, res) => {
  const { modelName } = req.body;
  
  if (!modelName || typeof modelName !== 'string' || !modelName.trim()) {
    return res.status(400).json({ error: 'Model name is required and must be a non-empty string' });
  }
  
  const trimmedModelName = modelName.trim();
  
  // Validate model name format (should be alphanumeric with :, -, _, . allowed)
  if (!/^[a-zA-Z0-9._-]+(:[a-zA-Z0-9._-]+)?$/.test(trimmedModelName)) {
    return res.status(400).json({ error: 'Invalid model name format. Use format: model or model:tag' });
  }

  // Set up Server-Sent Events (only after validation passes)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'status', message: 'Starting installation...', progress: 0 })}\n\n`);

  try {
    // Start the pull process with validated model name
    console.log('Installing model:', trimmedModelName);
    console.log('Spawning ollama pull command...');
    
    // Use shell: true on Windows, false on Unix-like systems
    const isWindows = process.platform === 'win32';
    const pullProcess = spawn('ollama', ['pull', trimmedModelName], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWindows, // Use shell on Windows
    });
    
    console.log('Process spawned, PID:', pullProcess.pid);
    console.log('Platform:', process.platform);
    
    // Check if process started successfully
    if (!pullProcess.pid) {
      const errorMsg = 'Failed to start ollama process. Make sure Ollama is installed and in your PATH.';
      console.error(errorMsg);
      res.write(`data: ${JSON.stringify({ type: 'error', success: false, message: errorMsg, progress: 0 })}\n\n`);
      res.end();
      return;
    }
    
    // Set a flag to track if we've already responded
    let hasResponded = false;

    let stdout = '';
    let stderr = '';
    let lastProgress = 0;

    pullProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      
      // Log raw output for debugging
      console.log('Ollama stdout chunk:', JSON.stringify(output.substring(0, 200)));
      
      // Parse progress from ollama output - Ollama outputs JSON lines with progress
      // Try to parse as JSON first (newer Ollama versions)
      const lines = output.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        // Try JSON format first (e.g., {"status":"pulling manifest","completed":50,"total":100})
        try {
          const jsonData = JSON.parse(line);
          if (jsonData.completed !== undefined && jsonData.total !== undefined) {
            const progress = Math.round((jsonData.completed / jsonData.total) * 100);
            if (progress > lastProgress && progress <= 100) {
              lastProgress = progress;
              const statusMsg = jsonData.status || 'Installing...';
              res.write(`data: ${JSON.stringify({ type: 'progress', progress, message: `${statusMsg}... ${progress}%` })}\n\n`);
            }
          }
          if (jsonData.status) {
            res.write(`data: ${JSON.stringify({ type: 'status', message: jsonData.status, progress: lastProgress })}\n\n`);
          }
          continue;
        } catch (e) {
          // Not JSON, try text parsing
        }
        
        // Parse text format progress (e.g., "pulling manifest... 50%")
        const progressMatches = line.match(/(\d+)%/g);
        if (progressMatches) {
          for (const match of progressMatches) {
            const progress = parseInt(match);
            if (progress > lastProgress && progress <= 100) {
              lastProgress = progress;
              res.write(`data: ${JSON.stringify({ type: 'progress', progress, message: `Installing... ${progress}%` })}\n\n`);
            }
          }
        }
        
        // Check for status messages
        if (line.includes('pulling manifest')) {
          res.write(`data: ${JSON.stringify({ type: 'status', message: 'Pulling manifest...', progress: lastProgress })}\n\n`);
        } else if (line.includes('downloading') || line.includes('Downloading')) {
          res.write(`data: ${JSON.stringify({ type: 'status', message: 'Downloading model...', progress: lastProgress })}\n\n`);
        } else if (line.includes('verifying') || line.includes('Verifying')) {
          res.write(`data: ${JSON.stringify({ type: 'status', message: 'Verifying model...', progress: lastProgress })}\n\n`);
        } else if (line.includes('writing') || line.includes('Writing')) {
          res.write(`data: ${JSON.stringify({ type: 'status', message: 'Writing model files...', progress: lastProgress })}\n\n`);
        }
      }
    });

    pullProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.log('Ollama stderr chunk:', JSON.stringify(output));
      
      // Some progress info might come through stderr
      const lines = output.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        // Try JSON format
        try {
          const jsonData = JSON.parse(line);
          if (jsonData.completed !== undefined && jsonData.total !== undefined) {
            const progress = Math.round((jsonData.completed / jsonData.total) * 100);
            if (progress > lastProgress && progress <= 100) {
              lastProgress = progress;
              const statusMsg = jsonData.status || 'Installing...';
              res.write(`data: ${JSON.stringify({ type: 'progress', progress, message: `${statusMsg}... ${progress}%` })}\n\n`);
            }
          }
        } catch (e) {
          // Not JSON, try text parsing
          const progressMatches = line.match(/(\d+)%/g);
          if (progressMatches) {
            for (const match of progressMatches) {
              const progress = parseInt(match);
              if (progress > lastProgress && progress <= 100) {
                lastProgress = progress;
                res.write(`data: ${JSON.stringify({ type: 'progress', progress, message: `Installing... ${progress}%` })}\n\n`);
              }
            }
          }
        }
      }
    });

    // Helper to strip ANSI escape codes more thoroughly
    const stripAnsi = (str) => {
      if (!str) return '';
      return str
        // Remove all ANSI escape sequences
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
        // Remove cursor control sequences
        .replace(/\x1B\[[?25][hl]/g, '')
        // Remove specific control characters
        .replace(/\[2K/g, '')
        .replace(/\[1G/g, '')
        .replace(/\[25[hl]/g, '')
        // Remove spinner characters
        .replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '')
        .trim();
    };

    pullProcess.on('close', (code, signal) => {
      console.log('=== PULL PROCESS CLOSED ===');
      console.log('Exit code:', code);
      console.log('Signal:', signal);
      console.log('stdout length:', stdout.length, 'stderr length:', stderr.length);
      console.log('stdout (raw):', JSON.stringify(stdout));
      console.log('stderr (raw):', JSON.stringify(stderr));
      
      // If exit code is null, the process was likely killed or didn't start properly
      if (code === null) {
        const killMsg = signal 
          ? `Process was terminated (signal: ${signal}). Ollama may not be running or the command failed.`
          : 'Process exited unexpectedly. Make sure Ollama is installed and running.';
        
        console.error('Process exited with null code:', killMsg);
        res.write(`data: ${JSON.stringify({ type: 'error', success: false, message: killMsg, progress: lastProgress })}\n\n`);
        res.end();
        return;
      }
      
      if (hasResponded) {
        console.log('Already responded, ignoring close event');
        return;
      }
      
      if (code === 0) {
        hasResponded = true;
        // Ensure we send 100% before completion
        if (lastProgress < 100) {
          res.write(`data: ${JSON.stringify({ type: 'progress', progress: 100, message: 'Installation complete!' })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: 'complete', success: true, message: `Model ${trimmedModelName} installed successfully`, progress: 100 })}\n\n`);
        res.end();
      } else {
        // Clean up error message - strip ANSI codes and extract meaningful error
        // Combine both stdout and stderr as Ollama may output errors to either
        const combinedOutput = (stderr + '\n' + stdout).trim();
        let errorMessage = combinedOutput || 'Installation failed';
        const originalError = errorMessage;
        
        console.log('=== ERROR DEBUG ===');
        console.log('Exit code:', code);
        console.log('Combined output length:', combinedOutput.length);
        console.log('Original stderr (first 500 chars):', stderr.substring(0, 500));
        console.log('Original stdout (first 500 chars):', stdout.substring(0, 500));
        
        errorMessage = stripAnsi(errorMessage);
        console.log('After ANSI strip (first 500 chars):', errorMessage.substring(0, 500));
        console.log('===================');
        
        // Try to extract the actual error from the output
        let extractedError = null;
        
        // Pattern 1: "Error: pull model manifest: file does not exist"
        const fullErrorMatch = errorMessage.match(/[Ee]rror:?\s*(pull model manifest:?\s*)?([^\n]+)/i);
        if (fullErrorMatch) {
          extractedError = fullErrorMatch[2] || fullErrorMatch[1] || fullErrorMatch[0];
          extractedError = extractedError.trim();
        }
        
        // Pattern 2: "pull model manifest: file does not exist"
        if (!extractedError || extractedError.length < 10) {
          const manifestMatch = errorMessage.match(/pull model manifest:?\s*([^\n]+)/i);
          if (manifestMatch && manifestMatch[1]) {
            extractedError = manifestMatch[1].trim();
          }
        }
        
        // Pattern 3: "file does not exist" or similar
        if (!extractedError || extractedError.length < 10) {
          const notExistMatch = errorMessage.match(/(file does not exist[^\n]*|model.*not found[^\n]*|manifest.*not found[^\n]*)/i);
          if (notExistMatch) {
            extractedError = notExistMatch[1].trim();
          }
        }
        
        // Pattern 4: Look for any line containing "error", "failed", or "not found"
        if (!extractedError || extractedError.length < 10) {
          const lines = errorMessage.split('\n');
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine && cleanLine.length > 10 && (
              cleanLine.toLowerCase().includes('error') || 
              cleanLine.toLowerCase().includes('failed') ||
              cleanLine.toLowerCase().includes('does not exist') ||
              cleanLine.toLowerCase().includes('not found')
            )) {
              extractedError = cleanLine;
              break;
            }
          }
        }
        
        // Use extracted error or construct helpful message
        if (extractedError && extractedError.length > 10) {
          errorMessage = extractedError;
          console.log('Using extracted error:', errorMessage);
        } else {
          console.log('No error extracted, trying fallback...');
          // Fallback: use the last meaningful line that's not just spinner text
          const lines = errorMessage.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 5 && !l.match(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s]+$/));
          
          console.log('Filtered lines:', lines);
          
          if (lines.length > 0) {
            // Get the last line that looks like an error
            for (let i = lines.length - 1; i >= 0; i--) {
              if (lines[i].length > 10 && (
                lines[i].toLowerCase().includes('error') ||
                lines[i].toLowerCase().includes('failed') ||
                lines[i].toLowerCase().includes('not found') ||
                lines[i].toLowerCase().includes('does not exist')
              )) {
                errorMessage = lines[i];
                console.log('Using line as error:', errorMessage);
                break;
              }
            }
            
            // If still no good line, use the last non-empty line
            if (errorMessage === combinedOutput || errorMessage.length < 10) {
              const lastLine = lines[lines.length - 1];
              if (lastLine && lastLine.length > 5) {
                errorMessage = lastLine;
                console.log('Using last line:', errorMessage);
              }
            }
          }
          
          // If still not good, provide a helpful message
          if (!errorMessage || errorMessage.length < 10 || errorMessage === combinedOutput) {
            // Try one more time with a simpler extraction
            const simpleMatch = combinedOutput.match(/([Ee]rror[^\n]+|file does not exist[^\n]+|not found[^\n]+)/i);
            if (simpleMatch) {
              errorMessage = stripAnsi(simpleMatch[1]).trim();
              console.log('Using simple match:', errorMessage);
            } else {
              errorMessage = `Model "${trimmedModelName}" not found. The model or tag may not exist in Ollama's registry. Try checking available tags for this model.`;
              console.log('Using default error message');
            }
          }
        }
        
        // Final cleanup - remove spinner artifacts and extra whitespace
        errorMessage = errorMessage
          .replace(/pulling manifest[^\n]*/gi, '')
          .replace(/^[\s\n\r]+|[\s\n\r]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        // If we still have the generic message, try one more aggressive extraction
        if (errorMessage === 'Installation failed' || errorMessage.length < 10) {
          // Look for ANY text that might be an error in the original output
          const allText = stripAnsi(combinedOutput);
          const errorKeywords = ['error', 'failed', 'not found', 'does not exist', 'manifest', 'pull'];
          const lines = allText.split('\n');
          
          for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (errorKeywords.some(keyword => lowerLine.includes(keyword)) && line.trim().length > 10) {
              errorMessage = line.trim();
              console.log('Found error line with keywords:', errorMessage);
              break;
            }
          }
          
          // Last resort: use a portion of the cleaned output
          if (errorMessage === 'Installation failed' || errorMessage.length < 10) {
            const cleaned = allText.replace(/pulling manifest[^\n]*/gi, '').trim();
            const lastMeaningfulPart = cleaned.split('\n').filter(l => l.trim().length > 10).pop();
            if (lastMeaningfulPart) {
              errorMessage = lastMeaningfulPart.trim().substring(0, 200);
              console.log('Using last meaningful part:', errorMessage);
            }
          }
        }
        
        console.error('=== FINAL ERROR MESSAGE ===');
        console.error('Message:', errorMessage);
        console.error('Length:', errorMessage.length);
        console.error('==========================');
        
        if (!hasResponded) {
          hasResponded = true;
          res.write(`data: ${JSON.stringify({ type: 'error', success: false, message: errorMessage, progress: lastProgress })}\n\n`);
          res.end();
        }
      }
    });

    pullProcess.on('error', (error) => {
      console.error('=== PULL PROCESS ERROR EVENT ===');
      console.error('Error object:', error);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error signal:', error.signal);
      console.error('================================');
      
      if (hasResponded) {
        console.log('Already responded, ignoring error event');
        return;
      }
      
      let errorMsg = 'Failed to start installation';
      if (error.code === 'ENOENT') {
        errorMsg = 'Ollama command not found. Please make sure Ollama is installed and available in your PATH.';
      } else if (error.message) {
        errorMsg = `Failed to start installation: ${error.message}`;
      }
      
      hasResponded = true;
      res.write(`data: ${JSON.stringify({ type: 'error', success: false, message: errorMsg, progress: lastProgress })}\n\n`);
      res.end();
    });

    // Handle client disconnect - give process a moment to start before killing
    let clientDisconnected = false;
    req.on('close', () => {
      console.log('Client disconnected');
      clientDisconnected = true;
      // Don't kill immediately - give it a few seconds in case it's just starting
      // Only kill if process hasn't produced any output after a delay
      setTimeout(() => {
        if (clientDisconnected && !pullProcess.killed && pullProcess.pid && stdout.length === 0 && stderr.length === 0) {
          console.log('Client disconnected and no output after delay, killing process');
          pullProcess.kill('SIGTERM');
        }
      }, 2000);
    });
    
    // Handle process exit (different from close - this fires on actual exit)
    pullProcess.on('exit', (code, signal) => {
      console.log('Process exited - code:', code, 'signal:', signal);
      if (code === null && !hasResponded) {
        const errorMsg = signal 
          ? `Process was killed (${signal}). Ollama may have crashed or been terminated.`
          : 'Process exited unexpectedly. Check if Ollama is running and the model name is correct.';
        console.error('Process exit with null code:', errorMsg);
        if (!hasResponded) {
          hasResponded = true;
          res.write(`data: ${JSON.stringify({ type: 'error', success: false, message: errorMsg, progress: lastProgress })}\n\n`);
          res.end();
        }
      }
    });
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', success: false, message: `Installation error: ${error.message}`, progress: 0 })}\n\n`);
    res.end();
  }
});

// Stream chat completion
router.post('/chat/stream', async (req, res) => {
  const { model, messages } = req.body;

  console.log('Chat stream request received:', { model, messageCount: messages?.length });

  if (!model || !messages) {
    return res.status(400).json({ error: 'Model and messages are required' });
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    let streamEnded = false;
    let chunkCount = 0;

    console.log('Connecting to Ollama at:', `${OLLAMA_HOST}/api/chat`);
    console.log('Request body:', JSON.stringify({ model, messages: messages.map(m => ({ role: m.role, content: m.content.substring(0, 50) + '...' })) }));

    try {
      await httpPostStream(
        `${OLLAMA_HOST}/api/chat`,
        { model, messages, stream: true },
        (data) => {
          if (streamEnded) return;

          // Ollama sends chunks with message.content
          if (data.message?.content) {
            chunkCount++;
            res.write(`data: ${JSON.stringify({ content: data.message.content, done: false })}\n\n`);
          }
          
          // Check for errors from Ollama
          if (data.error) {
            console.error('Ollama returned error:', data.error);
            streamEnded = true;
            res.write(`data: ${JSON.stringify({ error: data.error, done: true })}\n\n`);
            res.end();
            return;
          }
          
          // Only send done if we actually got the done flag from Ollama
          if (data.done) {
            streamEnded = true;
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
          }
        }
      );

      // If stream completed without explicit done flag
      if (!streamEnded) {
        console.log('Stream ended without done flag, total chunks:', chunkCount);
        if (chunkCount === 0) {
          console.warn('WARNING: No content chunks received from Ollama!');
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    } catch (streamError) {
      console.error('Error in httpPostStream:', streamError);
      if (!streamEnded && !res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: streamError.message, done: true })}\n\n`);
        res.end();
      } else if (!streamEnded) {
        res.end();
      }
    }
  } catch (error) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
    } else {
      res.end();
    }
  }
});

// Stop generation (placeholder - would need to implement cancellation)
router.post('/chat/stop', async (req, res) => {
  // Ollama doesn't have a direct stop API, but we can acknowledge the request
  res.json({ success: true, message: 'Stop request received' });
});

module.exports = router;
