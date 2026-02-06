const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { URL } = require('url');

// Hugging Face hub cache: ~/.cache/huggingface/hub or HF_HUB_CACHE
function getHfCacheDir() {
  if (process.env.HF_HUB_CACHE) return process.env.HF_HUB_CACHE;
  const home = os.homedir();
  return path.join(home, '.cache', 'huggingface', 'hub');
}

// List installed image models (cached in HF hub) – only models that are fully downloaded.
// HF creates the folder when download starts, so we require a complete snapshot (model_index.json).
async function listInstalledImageModels() {
  const cacheDir = getHfCacheDir();
  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    const installed = [];
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith('models--')) continue;
      const modelId = e.name.slice('models--'.length).replace(/--/g, '/');
      const repoPath = path.join(cacheDir, e.name);
      const snapshotsPath = path.join(repoPath, 'snapshots');
      try {
        const snapshots = await fs.readdir(snapshotsPath, { withFileTypes: true });
        const revisionDir = snapshots.find((d) => d.isDirectory());
        if (!revisionDir) continue;
        const modelIndexPath = path.join(snapshotsPath, revisionDir.name, 'model_index.json');
        await fs.access(modelIndexPath);
        installed.push(modelId);
      } catch {
        // No snapshots, or no model_index.json – still downloading or not a diffusers model
        continue;
      }
    }
    return installed;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Uninstall (delete cached) an image model
async function uninstallImageModel(modelId) {
  const cacheDir = getHfCacheDir();
  const folderName = 'models--' + modelId.replace(/\//g, '--');
  const modelPath = path.join(cacheDir, folderName);
  try {
    await fs.rm(modelPath, { recursive: true });
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return true;
    throw err;
  }
}

// Image generation settings storage
const SETTINGS_FILE = path.join(__dirname, '../../image-settings.json');
const VENV_DIR = path.join(__dirname, '../../venv-image-gen');
const VENV_PYTHON = path.join(VENV_DIR, 'bin', 'python3');
const VENV_PIP = path.join(VENV_DIR, 'bin', 'pip');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Local image models: all run with same Python env (diffusers + AutoPipelineForText2Image).
// No API key needed for local. SD 1.4/1.5 are public; Stability AI 2.x/SDXL are gated — for those, accept the license on the model page and run: huggingface-cli login (once).
const LOCAL_IMAGE_MODELS = [
  { id: 'runwayml/stable-diffusion-v1-5', name: 'Stable Diffusion v1.5', size: '~4GB' },
  { id: 'CompVis/stable-diffusion-v1-4', name: 'Stable Diffusion v1.4', size: '~4GB' },
  { id: 'stabilityai/stable-diffusion-2-base', name: 'Stable Diffusion 2.0 Base', size: '~5GB' },
  { id: 'stabilityai/stable-diffusion-2-1', name: 'Stable Diffusion 2.1', size: '~5GB' },
  { id: 'stabilityai/stable-diffusion-2-1-base', name: 'SD 2.1 Base', size: '~5GB' },
  { id: 'stabilityai/sdxl-turbo', name: 'SDXL Turbo (fast)', size: '~6GB' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', name: 'SDXL 1.0 Base', size: '~6GB' },
];

// Default settings (reword uses selected chat model from frontend; no separate rewordModel)
const defaultSettings = {
  method: 'auto',
  huggingFaceApiKey: '',
  defaultModel: 'runwayml/stable-diffusion-v1-5',
  useCpu: false,
  rewordWithOllama: true,
};

// Read settings
async function readSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch (error) {
    return defaultSettings;
  }
}

// Write settings
async function writeSettings(settings) {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Reword user image request into a safe, effective prompt using Ollama
function rewordPromptWithOllama(userPrompt, modelName = 'llama3.2') {
  const url = new URL(`${OLLAMA_HOST}/api/generate`);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const systemPrompt = `You are an image prompt rewriter. Your job is to turn the user's request into a single, clear image generation prompt suitable for Stable Diffusion or similar models.

Rules:
- Output ONLY the rewritten prompt: no quotes, no "Prompt:", no explanation.
- Keep it one short sentence or phrase (under 200 characters when possible).
- Use descriptive, visual language (style, lighting, composition).
- Keep content safe for work and within typical content policies (no violence, nudity, etc.).
- If the user's request is vague, make it concrete and visually specific.`;

  const fullPrompt = `${systemPrompt}\n\nUser request: ${userPrompt}\n\nRewritten prompt:`;

  const body = JSON.stringify({
    model: modelName,
    prompt: fullPrompt,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const reworded = (parsed.response || '').trim();
          if (reworded) {
            resolve(reworded);
          } else {
            resolve(userPrompt);
          }
        } catch (e) {
          resolve(userPrompt);
        }
      });
    });

    req.on('error', () => resolve(userPrompt));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(userPrompt);
    });
    req.write(body);
    req.end();
  });
}

// Check if virtual environment exists
async function venvExists() {
  try {
    await fs.access(VENV_PYTHON);
    return true;
  } catch {
    return false;
  }
}

// Create virtual environment
async function createVirtualEnvironment() {
  return new Promise((resolve) => {
    console.log('📦 Creating virtual environment...');
    const venv = spawn('python3', ['-m', 'venv', VENV_DIR]);
    
    let output = '';
    let errorOutput = '';

    venv.stdout.on('data', (data) => {
      output += data.toString();
    });

    venv.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    venv.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Virtual environment created');
        resolve({ success: true, message: 'Virtual environment created' });
      } else {
        console.error('❌ Failed to create virtual environment:', errorOutput);
        resolve({ 
          success: false, 
          message: 'Failed to create virtual environment',
          error: errorOutput || 'Creation failed'
        });
      }
    });

    venv.on('error', (err) => {
      console.error('❌ Error creating virtual environment:', err);
      resolve({ 
        success: false, 
        message: 'Failed to create virtual environment',
        error: err.message 
      });
    });
  });
}

// Install required Python packages in virtual environment
async function installPythonPackages() {
  return new Promise(async (resolve) => {
    console.log('📦 Installing required Python packages...');
    
    // First, ensure virtual environment exists
    const venvExistsCheck = await venvExists();
    if (!venvExistsCheck) {
      const venvResult = await createVirtualEnvironment();
      if (!venvResult.success) {
        resolve(venvResult);
        return;
      }
    }
    
    const packages = ['diffusers', 'torch', 'transformers', 'accelerate'];
    
    // Use pip from virtual environment
    const pip = spawn(VENV_PIP, ['install', '--quiet', ...packages]);
    
    let output = '';
    let errorOutput = '';

    pip.stdout.on('data', (data) => {
      output += data.toString();
      console.log('pip output:', data.toString());
    });

    pip.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log('pip stderr:', data.toString());
    });

    pip.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Python packages installed successfully');
        resolve({ 
          success: true, 
          message: 'Packages installed successfully',
          output: output 
        });
      } else {
        console.error('❌ Failed to install packages:', errorOutput);
        resolve({ 
          success: false, 
          message: 'Failed to install packages',
          error: errorOutput || 'Installation failed',
          output: output
        });
      }
    });

    pip.on('error', (err) => {
      console.error('❌ Error running pip:', err);
      resolve({ 
        success: false, 
        message: 'Failed to run pip install',
        error: err.message 
      });
    });
  });
}

// Check if Python and required libraries are available
async function checkPythonEnvironment(autoInstall = false) {
  return new Promise(async (resolve) => {
    // First check if Python3 exists
    const checkPython = spawn('python3', ['--version']);
    let pythonVersion = '';
    
    checkPython.stdout.on('data', (data) => {
      pythonVersion += data.toString();
    });
    
    checkPython.on('close', async (pythonCode) => {
      if (pythonCode !== 0) {
        resolve({ 
          available: false, 
          message: 'Python3 not found. Please install Python 3.8+',
          error: 'Python3 command not available'
        });
        return;
      }
      
      // Check if virtual environment exists and has required libraries
      const venvExistsCheck = await venvExists();
      const pythonToUse = venvExistsCheck ? VENV_PYTHON : 'python3';
      
      // Check for required libraries
      const checkLibs = spawn(pythonToUse, ['-c', 'import diffusers, torch; print("OK")']);
      let output = '';
      let errorOutput = '';

      checkLibs.stdout.on('data', (data) => {
        output += data.toString();
      });

      checkLibs.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      checkLibs.on('close', async (code) => {
        if (code === 0 && output.includes('OK')) {
          resolve({ 
            available: true, 
            message: venvExistsCheck 
              ? 'Python environment ready (using virtual environment)'
              : 'Python environment ready',
            pythonVersion: pythonVersion.trim(),
            usingVenv: venvExistsCheck
          });
        } else {
          // Check if we should auto-install
          if (autoInstall) {
            console.log('📦 Auto-installing missing Python packages...');
            const installResult = await installPythonPackages();
            
            if (installResult.success) {
              // Re-check after installation using venv Python
              const recheck = spawn(VENV_PYTHON, ['-c', 'import diffusers, torch; print("OK")']);
              let recheckOutput = '';
              
              recheck.stdout.on('data', (data) => {
                recheckOutput += data.toString();
              });
              
              recheck.on('close', (recheckCode) => {
                if (recheckCode === 0 && recheckOutput.includes('OK')) {
                  resolve({ 
                    available: true, 
                    message: 'Python environment ready (packages auto-installed in virtual environment)',
                    pythonVersion: pythonVersion.trim(),
                    autoInstalled: true,
                    usingVenv: true
                  });
                } else {
                  resolve({ 
                    available: false, 
                    message: 'Packages installed but still not working. Please restart the application.',
                    error: 'Recheck failed after installation',
                    autoInstalled: true
                  });
                }
              });
              
              recheck.on('error', () => {
                resolve({ 
                  available: false, 
                  message: 'Packages installed but verification failed. Please restart the application.',
                  error: 'Recheck error',
                  autoInstalled: true
                });
              });
            } else {
              resolve({ 
                available: false, 
                message: `Failed to auto-install packages: ${installResult.error || 'Unknown error'}`,
                error: installResult.error || 'Auto-install failed',
                installationHint: 'Click "Install Packages Now" to set up automatically'
              });
            }
          } else {
            // Provide helpful installation instructions
            let missingLibs = [];
            if (errorOutput.includes('diffusers')) missingLibs.push('diffusers');
            if (errorOutput.includes('torch')) missingLibs.push('torch');
            
            resolve({ 
              available: false, 
              message: `Missing required libraries: ${missingLibs.join(', ')}`,
              error: errorOutput || 'Library check failed',
              installationHint: 'Click "Install Packages Now" to set up automatically',
              canAutoInstall: true
            });
          }
        }
      });

      checkLibs.on('error', (err) => {
        resolve({ 
          available: false, 
          message: 'Failed to check Python libraries',
          error: err.message 
        });
      });
    });
    
    checkPython.on('error', (err) => {
      resolve({ 
        available: false, 
        message: 'Python3 not found',
        error: err.message 
      });
    });
  });
}

// Install (download) an image model so it's ready for local generation.
// If user has configured a Hugging Face token, pass it so gated repos (e.g. Stability AI) can be downloaded.
async function installImageModel(modelName) {
  const settings = await readSettings();
  const scriptPath = path.join(__dirname, '../scripts/install_image_model.py');
  const venvExistsCheck = await venvExists();
  const pythonToUse = venvExistsCheck ? VENV_PYTHON : 'python3';

  const env = { ...process.env };
  if (settings.huggingFaceApiKey && settings.huggingFaceApiKey.trim()) {
    env.HF_TOKEN = settings.huggingFaceApiKey.trim();
  }

  return new Promise((resolve, reject) => {
    try {
      const python = spawn(pythonToUse, [
        scriptPath,
        '--model', modelName,
        '--use-cpu', settings.useCpu ? 'true' : 'false',
      ], { env });

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        const s = data.toString();
        output += s;
        console.log('[image-install stdout]', s.trim());
      });

      python.stderr.on('data', (data) => {
        const s = data.toString();
        errorOutput += s;
        console.log('[image-install stderr]', s.trim());
      });

      python.on('close', (code) => {
        if (code === 0 && output.includes('INSTALL_OK')) {
          console.log('[image-install] Model installed:', modelName);
          resolve({ success: true, message: `Model ${modelName} installed successfully` });
        } else {
          console.error('[image-install] Failed, code:', code, 'stderr:', errorOutput);
          reject(new Error(errorOutput || 'Model installation failed'));
        }
      });

      python.on('error', (err) => {
        reject(new Error(`Failed to start Python: ${err.message}`));
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Generate image using local Python script
async function generateImageLocal(prompt, modelName = null) {
  const settings = await readSettings();
  const model = modelName || settings.defaultModel;
  
  // Create a Python script to generate the image
  // __dirname is backend/routes, so ../scripts is backend/scripts
  const scriptPath = path.join(__dirname, '../scripts/generate_image.py');
  const outputDir = path.join(__dirname, '../../generated-images');
  
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });
  
  // Verify script exists
  try {
    await fs.access(scriptPath);
  } catch (error) {
    reject(new Error(`Image generation script not found at ${scriptPath}. Please ensure the script exists.`));
    return;
  }
  
  // Use virtual environment Python if it exists, otherwise fall back to system Python
  const venvExistsCheck = await venvExists();
  const pythonToUse = venvExistsCheck ? VENV_PYTHON : 'python3';
  
  console.log(`Using Python: ${pythonToUse}`);
  console.log(`Script path: ${scriptPath}`);
  console.log(`Output dir: ${outputDir}`);
  
  const env = { ...process.env };
  if (settings.huggingFaceApiKey && settings.huggingFaceApiKey.trim()) {
    env.HF_TOKEN = settings.huggingFaceApiKey.trim();
  }

  return new Promise((resolve, reject) => {
    const python = spawn(pythonToUse, [
      scriptPath,
      '--prompt', prompt,
      '--model', model,
      '--output-dir', outputDir,
      '--use-cpu', settings.useCpu ? 'true' : 'false'
    ], { env });

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      const s = data.toString();
      output += s;
      console.log('[image-gen stdout]', s.trim());
    });

    python.stderr.on('data', (data) => {
      const s = data.toString();
      errorOutput += s;
      console.log('[image-gen stderr]', s.trim());
    });

    python.on('close', (code) => {
      if (code === 0) {
        const match = output.match(/IMAGE_PATH:(.+)/);
        if (match) {
          const imagePath = match[1].trim();
          console.log('[image-gen] Success, image:', imagePath);
          resolve({ success: true, imagePath, method: 'local' });
        } else {
          console.error('[image-gen] No IMAGE_PATH in output. stdout:', output, 'stderr:', errorOutput);
          reject(new Error('Image generation succeeded but no image path found. Check server logs for Python output.'));
        }
      } else {
        console.error('[image-gen] Process failed, code:', code, 'stderr:', errorOutput);
        reject(new Error(`Image generation failed: ${errorOutput || 'Unknown error'}`));
      }
    });

    python.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}

// Generate image using Hugging Face Inference API
async function generateImageHuggingFace(prompt, modelName = null) {
  const settings = await readSettings();
  const model = modelName || settings.defaultModel;
  const apiKey = settings.huggingFaceApiKey;

  if (!apiKey) {
    throw new Error('Hugging Face API key not configured');
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ inputs: prompt });
    const url = new URL(`https://api-inference.huggingface.co/models/${model}`);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = Buffer.alloc(0);

      res.on('data', (chunk) => {
        data = Buffer.concat([data, chunk]);
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          // Save image to file
          const outputDir = path.join(__dirname, '../../generated-images');
          const imagePath = path.join(outputDir, `generated-${Date.now()}.png`);
          
          fs.mkdir(outputDir, { recursive: true })
            .then(() => fs.writeFile(imagePath, data))
            .then(() => {
              resolve({ 
                success: true, 
                imagePath: imagePath,
                method: 'huggingface-api' 
              });
            })
            .catch(reject);
        } else {
          const errorText = data.toString();
          if (res.statusCode === 503) {
            reject(new Error('Model is loading, please try again in a few seconds'));
          } else {
            reject(new Error(`Hugging Face API error: ${res.statusCode} - ${errorText}`));
          }
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Check environment status
router.get('/status', async (req, res) => {
  try {
    const autoInstall = req.query.autoInstall === 'true';
    const pythonCheck = await checkPythonEnvironment(autoInstall);
    const settings = await readSettings();
    
    res.json({
      python: pythonCheck,
      settings: {
        method: settings.method,
        hasApiKey: !!settings.huggingFaceApiKey,
        defaultModel: settings.defaultModel
      },
      availableMethods: {
        local: pythonCheck.available,
        huggingface: !!settings.huggingFaceApiKey
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Install Python packages endpoint
router.post('/install-packages', async (req, res) => {
  try {
    console.log('📦 Manual package installation requested');
    const installResult = await installPythonPackages();
    
    if (installResult.success) {
      // Verify installation
      const verifyCheck = await checkPythonEnvironment(false);
      res.json({
        success: true,
        message: 'Packages installed successfully',
        verified: verifyCheck.available,
        pythonStatus: verifyCheck
      });
    } else {
      res.status(500).json({
        success: false,
        error: installResult.error || 'Installation failed',
        message: installResult.message
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get/Update settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await readSettings();
    // Don't send API key in response
    const { huggingFaceApiKey, ...safeSettings } = settings;
    res.json({ 
      ...safeSettings,
      hasApiKey: !!huggingFaceApiKey
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const currentSettings = await readSettings();
    const newSettings = {
      ...currentSettings,
      ...req.body
    };
    await writeSettings(newSettings);
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List local image models (for UI dropdown)
router.get('/models', (req, res) => {
  res.json({ models: LOCAL_IMAGE_MODELS });
});

// List installed (cached) image models
router.get('/installed-models', async (req, res) => {
  try {
    const installed = await listInstalledImageModels();
    res.json({ installed });
  } catch (error) {
    console.error('List installed models error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Install (download) a local image model before first use
router.post('/install-model', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model || !String(model).trim()) {
      return res.status(400).json({ success: false, error: 'Model ID is required' });
    }
    const modelId = String(model).trim();
    await installImageModel(modelId);
    res.json({ success: true, message: `Model ${modelId} installed successfully` });
  } catch (error) {
    console.error('Install model error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'Check that the model ID is valid and you have enough disk space. First install can take several minutes.',
    });
  }
});

// Uninstall (delete cache for) a local image model
router.post('/uninstall-model', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model || !String(model).trim()) {
      return res.status(400).json({ success: false, error: 'Model ID is required' });
    }
    const modelId = String(model).trim();
    await uninstallImageModel(modelId);
    res.json({ success: true, message: `Model ${modelId} removed from cache` });
  } catch (error) {
    console.error('Uninstall model error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate image
router.post('/generate', async (req, res) => {
  try {
    const { prompt, model, rewordWithOllama: bodyReword, rewordModel: selectedChatModel } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const settings = await readSettings();
    const rewordEnabled = bodyReword !== false && settings.rewordWithOllama !== false;
    // Use selected chat model (selected AI) for rewording when provided
    const rewordModel = selectedChatModel && selectedChatModel.trim() ? selectedChatModel.trim() : null;

    let promptToUse = prompt.trim();
    if (rewordEnabled && rewordModel) {
      console.log('Rewording image prompt with selected model:', rewordModel);
      try {
        const reworded = await rewordPromptWithOllama(promptToUse, rewordModel);
        if (reworded && reworded !== promptToUse) {
          console.log('Reworded prompt:', reworded);
          promptToUse = reworded;
        }
      } catch (e) {
        console.warn('Ollama reword failed, using original prompt:', e.message);
      }
    }

    let result;

    try {
      if (settings.method === 'local' || (settings.method === 'auto' && (await checkPythonEnvironment()).available)) {
        console.log('Attempting local image generation...');
        result = await generateImageLocal(promptToUse, model);
      } else if (settings.method === 'huggingface-api' || settings.huggingFaceApiKey) {
        console.log('Using Hugging Face API for image generation...');
        result = await generateImageHuggingFace(promptToUse, model);
      } else {
        const pythonCheck = await checkPythonEnvironment();
        if (pythonCheck.available) {
          result = await generateImageLocal(promptToUse, model);
        } else if (settings.huggingFaceApiKey) {
          result = await generateImageHuggingFace(promptToUse, model);
        } else {
          throw new Error('No image generation method available. Please configure Python environment or Hugging Face API key.');
        }
      }

      const imageBuffer = await fs.readFile(result.imagePath);
      const base64Image = imageBuffer.toString('base64');
      const imageDataUrl = `data:image/png;base64,${base64Image}`;

      res.json({
        success: true,
        image: imageDataUrl,
        method: result.method,
        prompt: promptToUse,
        originalPrompt: prompt.trim(),
      });
    } catch (error) {
      console.error('Image generation error:', error);
      res.status(500).json({
        error: error.message,
        suggestion: error.message.includes('Python')
          ? 'Try using Hugging Face API or install Python with diffusers and torch'
          : 'Check your API key or try local generation',
      });
    }
  } catch (error) {
    console.error('Error in image generation endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
