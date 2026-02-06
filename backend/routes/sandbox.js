const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Create a temporary directory for sandbox execution
const SANDBOX_DIR = path.join(os.tmpdir(), 'ollama-sandbox');

if (!fs.existsSync(SANDBOX_DIR)) {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

// Execute code in sandbox
router.post('/execute', async (req, res) => {
  const { code, language } = req.body;

  if (!code || !language) {
    return res.status(400).json({ error: 'Code and language are required' });
  }

  const lang = language.toLowerCase();
  
  // Handle HTML - return it for rendering
  if (lang === 'html') {
    return res.json({
      success: true,
      html: code.trim(),
      stdout: null,
      stderr: null,
      isHtml: true,
    });
  }

  if (!['python', 'javascript', 'php', 'ruby', 'go'].includes(lang)) {
    return res.status(400).json({ error: 'Only Python, JavaScript, PHP, Ruby, and Go are supported for execution' });
  }

  try {
    const timestamp = Date.now();
    let fileName, filePath, command, args;

    if (lang === 'python') {
      fileName = `code_${timestamp}.py`;
      filePath = path.join(SANDBOX_DIR, fileName);
      command = 'python3';
      args = [filePath];
    } else if (lang === 'javascript') {
      fileName = `code_${timestamp}.js`;
      filePath = path.join(SANDBOX_DIR, fileName);
      command = 'node';
      args = [filePath];
    } else if (lang === 'php') {
      fileName = `code_${timestamp}.php`;
      filePath = path.join(SANDBOX_DIR, fileName);
      command = 'php';
      args = ['-f', filePath]; // -f = run file (avoids runner echoing source)
    } else if (lang === 'ruby') {
      fileName = `code_${timestamp}.rb`;
      filePath = path.join(SANDBOX_DIR, fileName);
      command = 'ruby';
      args = [filePath];
    } else if (lang === 'go') {
      fileName = `code_${timestamp}.go`;
      filePath = path.join(SANDBOX_DIR, fileName);
      command = 'go';
      args = ['run', filePath];
    }

    // Write code to temporary file (UTF-8 so comments and special chars work in PHP/Python/etc.)
    fs.writeFileSync(filePath, code, 'utf8');

    // Execute in isolated process with timeout
    const executionProcess = spawn(command, args, {
      cwd: SANDBOX_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000, // 10 second timeout
      env: {
        ...process.env,
        // Restrict environment variables for security
        PATH: process.env.PATH,
      },
    });

    let stdout = '';
    let stderr = '';
    let hasError = false;
    let responded = false;

    const cleanup = () => {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error cleaning up file:', err);
      }
    };

    const sendResponse = (data) => {
      if (!responded) {
        responded = true;
        cleanup();
        res.json(data);
      }
    };

    // Handle timeout
    const timeoutId = setTimeout(() => {
      if (!executionProcess.killed) {
        executionProcess.kill();
        sendResponse({
          success: false,
          stdout: null,
          stderr: 'Execution timeout (10 seconds)',
          exitCode: -1,
        });
      }
    }, 10000);

    executionProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    executionProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      hasError = true;
    });

    executionProcess.on('close', (exitCode) => {
      clearTimeout(timeoutId);
      const capturedOut = String(stdout || '').trim();
      const codeTrimmed = String(code || '').trim();
      // If stdout is identical to the script, runner echoed the script — don't send as result
      const stdoutForClient =
        capturedOut && capturedOut !== codeTrimmed ? (stdout || null) : null;

      const output = stdout || '';
      const hasFullDocument = /<html[\s>]|<body[\s>]|<!DOCTYPE\s+html/i.test(output);
      const hasHtmlFragments = /<\w+[\s\/>]/.test(output);
      const hasHtml = hasFullDocument || hasHtmlFragments;

      sendResponse({
        success: exitCode === 0 && !hasError,
        stdout: stdoutForClient,
        stderr: stderr || null,
        exitCode: exitCode,
        html: hasHtml ? output : null,
        isHtml: hasHtml,
      });
    });

    executionProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      cleanup();
      if (!responded) {
        responded = true;
        res.status(500).json({
          success: false,
          error: error.message,
          stdout: null,
          stderr: `Failed to execute: ${error.message}`,
        });
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stdout: null,
      stderr: error.message,
    });
  }
});

module.exports = router;
