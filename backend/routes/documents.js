const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Document storage directory
const DOCUMENTS_DIR = path.join(__dirname, '../../documents');
const METADATA_FILE = path.join(DOCUMENTS_DIR, 'metadata.json');

// Ensure documents directory exists
async function ensureDocumentsDir() {
  try {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
    // Initialize metadata file if it doesn't exist
    try {
      await fs.access(METADATA_FILE);
    } catch {
      await fs.writeFile(METADATA_FILE, JSON.stringify([]));
    }
  } catch (error) {
    console.error('Error creating documents directory:', error);
  }
}

// Initialize on module load
ensureDocumentsDir();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureDocumentsDir();
    cb(null, DOCUMENTS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

// Read metadata
async function readMetadata() {
  try {
    const data = await fs.readFile(METADATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Write metadata
async function writeMetadata(metadata) {
  await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

// Chunk text into smaller pieces with overlap for better retrieval
function chunkText(text, chunkSize = 1000, overlap = 200) {
  if (!text || text.length === 0) {
    return [];
  }
  
  const chunks = [];
  let start = 0;
  const textLength = text.length;
  
  while (start < textLength) {
    let end = start + chunkSize;
    
    // If not the last chunk, try to break at a sentence or word boundary
    if (end < textLength) {
      // Look for sentence endings first (., !, ?)
      const sentenceEnd = Math.max(
        text.lastIndexOf('.', end),
        text.lastIndexOf('!', end),
        text.lastIndexOf('?', end)
      );
      
      if (sentenceEnd > start + chunkSize * 0.5) {
        // Found a sentence boundary, use it
        end = sentenceEnd + 1;
      } else {
        // Look for word boundary (space, newline)
        const wordEnd = Math.max(
          text.lastIndexOf(' ', end),
          text.lastIndexOf('\n', end)
        );
        
        if (wordEnd > start + chunkSize * 0.5) {
          end = wordEnd + 1;
        }
      }
    } else {
      end = textLength;
    }
    
    const chunkText = text.substring(start, end).trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        start: start,
        end: end,
        index: chunks.length
      });
    }
    
    // Move start position with overlap
    start = end - overlap;
    if (start >= textLength) break;
  }
  
  return chunks;
}

// Normalize file path for WSL/Windows compatibility
function normalizePath(filePath) {
  if (!filePath) return filePath;
  
  // Handle Windows UNC paths (\\server\share\...)
  if (filePath.startsWith('\\\\')) {
    // UNC paths are not directly accessible from WSL, return as-is
    // These would need special handling if needed
    return filePath;
  }
  
  // Convert Windows path to WSL path if needed
  // e.g., C:\Users\... -> /mnt/c/Users/...
  // e.g., C:/Users/... -> /mnt/c/Users/...
  // Handle both backslash and forward slash separators
  const windowsPathMatch = filePath.match(/^([A-Za-z]):[\\\/]?(.+)$/i);
  if (windowsPathMatch) {
    const drive = windowsPathMatch[1].toLowerCase();
    let rest = windowsPathMatch[2].replace(/\\/g, '/');
    // Remove leading slash if present (C:/Users -> Users)
    rest = rest.replace(/^\/+/, '');
    const wslPath = `/mnt/${drive}/${rest}`;
    console.log(`Normalized Windows path: ${filePath} -> ${wslPath}`);
    return wslPath;
  }
  
  // Handle WSL paths that might be in Windows format but accessed from WSL
  // e.g., if someone passes /mnt/c/... directly, keep it
  if (filePath.startsWith('/mnt/')) {
    return filePath;
  }
  
  // Already a WSL/Unix path
  return filePath;
}

// Extract text from document
async function extractText(filePath, fileType, originalPath = null) {
  return new Promise((resolve, reject) => {
    // Use the filePath directly - it should already be in WSL filesystem
    // Only normalize if it looks like a Windows path
    let normalizedPath = filePath;
    if (filePath.match(/^[A-Za-z]:[\\\/]/)) {
      // It's a Windows path, try to normalize it
      normalizedPath = normalizePath(filePath);
    }
    
    const ext = path.extname(normalizedPath).toLowerCase();
    
    // Helper function to try multiple paths
    const tryPaths = async (paths, operation) => {
      for (const tryPath of paths) {
        try {
          return await operation(tryPath);
        } catch (err) {
          console.log(`Failed to access ${tryPath}, trying next path...`);
          continue;
        }
      }
      throw new Error('All path attempts failed');
    };
    
    if (ext === '.txt') {
      // Try the file path as-is first (should be in WSL), then normalized if different
      const pathsToTry = [filePath];
      if (normalizedPath !== filePath) {
        pathsToTry.push(normalizedPath);
      }
      
      tryPaths(pathsToTry, (p) => fs.readFile(p, 'utf8'))
        .then(resolve)
        .catch(reject);
    } else if (ext === '.pdf') {
      // Use pdf-parse library (no external dependencies required)
      const pathsToTry = [filePath];
      if (normalizedPath !== filePath) {
        pathsToTry.push(normalizedPath);
      }
      
      const tryPdfExtraction = async (tryPath) => {
        try {
          // Check if file exists
          await fs.access(tryPath);
          console.log(`Attempting PDF extraction from: ${tryPath}`);
          
          // Read the PDF file as a buffer
          const dataBuffer = await fs.readFile(tryPath);
          
          // Parse PDF using pdf-parse
          const pdfData = await pdfParse(dataBuffer);
          
          if (pdfData.text && pdfData.text.trim().length > 0) {
            console.log(`PDF extraction successful: ${pdfData.text.length} characters extracted from ${pdfData.numpages} pages`);
            return pdfData.text;
          } else {
            throw new Error('PDF appears to be empty or contains no extractable text');
          }
        } catch (err) {
          console.error(`PDF extraction error at ${tryPath}:`, err.message);
          throw err;
        }
      };
      
      tryPaths(pathsToTry, tryPdfExtraction)
        .then(resolve)
        .catch((error) => {
          console.error(`All PDF extraction attempts failed:`, error.message);
          reject(new Error(`Failed to extract text from PDF: ${error.message}`));
        });
    } else if (ext === '.docx' || ext === '.doc') {
      // Try the file path as-is first (should be in WSL), then normalized if different
      const pathsToTry = [filePath];
      if (normalizedPath !== filePath) {
        pathsToTry.push(normalizedPath);
      }
      
      if (ext === '.docx') {
        // Use mammoth library for .docx files (no external dependencies)
        const tryDocxExtraction = async (tryPath) => {
          try {
            await fs.access(tryPath);
            console.log(`Attempting DOCX extraction from: ${tryPath}`);
            
            // Read the file as a buffer
            const dataBuffer = await fs.readFile(tryPath);
            
            // Extract text using mammoth
            const result = await mammoth.extractRawText({ buffer: dataBuffer });
            
            if (result.value && result.value.trim().length > 0) {
              console.log(`DOCX extraction successful: ${result.value.length} characters extracted`);
              return result.value;
            } else {
              throw new Error('DOCX appears to be empty or contains no extractable text');
            }
          } catch (err) {
            console.error(`DOCX extraction error at ${tryPath}:`, err.message);
            throw err;
          }
        };
        
        tryPaths(pathsToTry, tryDocxExtraction)
          .then(resolve)
          .catch((error) => {
            console.error(`All DOCX extraction attempts failed:`, error.message);
            reject(new Error(`Failed to extract text from DOCX: ${error.message}`));
          });
      } else {
        // .doc files still require antiword (old format), but we'll try to provide helpful error
        const tryDocExtraction = (tryPath) => {
          return new Promise((resolveDoc, rejectDoc) => {
            const process = spawn('antiword', [tryPath]);
            let text = '';
            
            process.stdout.on('data', (data) => {
              text += data.toString();
            });
            
            process.on('close', (code) => {
              if (code === 0 && text.trim().length > 0) {
                resolveDoc(text);
              } else {
                rejectDoc(new Error(`antiword exited with code ${code}`));
              }
            });
            
            process.on('error', (err) => {
              if (err.code === 'ENOENT') {
                rejectDoc(new Error('antiword not found. .doc files require antiword. Consider converting to .docx format.'));
              } else {
                rejectDoc(err);
              }
            });
          });
        };
        
        tryPaths(pathsToTry, tryDocExtraction)
          .then(resolve)
          .catch((error) => {
            console.error(`.doc extraction failed:`, error.message);
            reject(new Error(`Failed to extract text from .doc file: ${error.message}. Note: .doc files require antiword. Consider converting to .docx format.`));
          });
      }
    } else if (ext === '.xlsx' || ext === '.xls') {
      // Excel files require special handling
      resolve(`Excel file: ${path.basename(normalizedPath)} (text extraction requires additional libraries)`);
    } else {
      resolve(`File: ${path.basename(normalizedPath)}`);
    }
  });
}

// Get all documents
router.get('/', async (req, res) => {
  try {
    const metadata = await readMetadata();
    res.json({ documents: metadata });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents', message: error.message });
  }
});

// Browse directories and files (for custom file picker)
// IMPORTANT: This must be defined BEFORE parameterized routes like /:id
router.get('/browse', async (req, res) => {
  try {
    const dirPath = req.query.path || '/mnt/c';
    
    // Security: Only allow paths under /mnt/c (Windows drives) or /home (WSL home)
    if (!dirPath.startsWith('/mnt/') && !dirPath.startsWith('/home/')) {
      return res.status(403).json({ error: 'Access denied. Only Windows drives (/mnt/c, /mnt/d, etc.) and WSL home are accessible.' });
    }
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = [];
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          items.push({
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: stats.size,
            modified: stats.mtime
          });
        } catch (err) {
          // Skip entries we can't stat (permissions, etc.)
          console.log(`Skipping ${fullPath}:`, err.message);
        }
      }
      
      // Sort: directories first, then files, both alphabetically
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      res.json({ 
        path: dirPath,
        items: items,
        parent: dirPath !== '/mnt' && dirPath !== '/mnt/c' ? path.dirname(dirPath) : null
      });
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
      res.status(500).json({ 
        error: 'Failed to read directory', 
        message: error.message,
        path: dirPath
      });
    }
  } catch (error) {
    console.error('Error in browse endpoint:', error);
    res.status(500).json({ error: 'Failed to browse directory', message: error.message });
  }
});

// Upload document
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // If filePath is provided in form data, use it (for cross-filesystem access)
    const originalFilePath = req.body.filePath;
    const filePath = req.file.path; // This is the path in WSL where multer saved the file
    const fileName = req.file.originalname || (originalFilePath ? path.basename(originalFilePath) : 'document');
    const fileSize = req.file.size;
    const fileType = path.extname(fileName).toLowerCase();
    
    console.log(`File uploaded: ${fileName}`);
    console.log(`Saved to WSL path: ${filePath}`);
    console.log(`Original Windows path: ${originalFilePath || 'N/A'}`);
    console.log(`File size: ${fileSize} bytes`);
    
    // Verify the file exists in WSL
    try {
      await fs.access(filePath);
      console.log(`Verified file exists at: ${filePath}`);
    } catch (err) {
      console.error(`ERROR: Uploaded file not found at ${filePath}:`, err);
      return res.status(500).json({ error: 'Uploaded file not found', message: err.message });
    }
    
    // Extract text from the uploaded file (already copied to documents folder)
    // IMPORTANT: Only use the uploaded file path (in WSL), NOT the original Windows path
    // The file is now in the WSL documents folder, so we can access it directly
    let textContent = '';
    try {
      // Only use the uploaded file path - it's now in WSL and accessible
      console.log(`Extracting text from uploaded file: ${filePath}`);
      textContent = await extractText(filePath, fileType, null);
      console.log(`Successfully extracted ${textContent.length} characters from ${fileName}`);
    } catch (error) {
      console.error('Error extracting text from uploaded file:', error);
      textContent = `File: ${fileName} (text extraction failed: ${error.message})`;
    }
    
    // Create chunks from the extracted text (only if we have valid text content)
    let chunks = [];
    if (textContent && !textContent.includes('text extraction failed') && !textContent.includes('File:')) {
      chunks = chunkText(textContent, 1000, 200); // 1000 char chunks with 200 char overlap
      console.log(`Created ${chunks.length} chunks from ${fileName}`);
    }
    
    // Create document metadata
    const document = {
      id: Date.now().toString(),
      name: fileName,
      filename: req.file.filename,
      path: filePath,
      originalPath: originalFilePath || null, // Store original path for reference
      size: fileSize,
      type: fileType,
      textContent: textContent.substring(0, 10000), // Store first 10k chars for preview
      fullTextLength: textContent.length,
      chunks: chunks, // Store document chunks for better retrieval
      assignedModels: [], // Array of model names this document is assigned to
      uploadedAt: new Date().toISOString()
    };

    // Save metadata
    const metadata = await readMetadata();
    metadata.push(document);
    await writeMetadata(metadata);

    res.json({ 
      success: true, 
      document: {
        id: document.id,
        name: document.name,
        size: document.size,
        type: document.type,
        uploadedAt: document.uploadedAt
      }
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document', message: error.message });
  }
});

// Delete document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const metadata = await readMetadata();
    const documentIndex = metadata.findIndex(doc => doc.id === id);
    
    if (documentIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = metadata[documentIndex];
    
    // Delete file
    try {
      await fs.unlink(document.path);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    // Remove from metadata
    metadata.splice(documentIndex, 1);
    await writeMetadata(metadata);

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document', message: error.message });
  }
});

// Get document content (for RAG)
router.get('/:id/content', async (req, res) => {
  try {
    const { id } = req.params;
    const metadata = await readMetadata();
    const document = metadata.find(doc => doc.id === id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`Extracting content for document: ${document.name} (${document.type})`);
    console.log(`File path: ${document.path}`);
    
    // Check if file exists first
    try {
      await fs.access(document.path);
      console.log(`File exists at: ${document.path}`);
    } catch (err) {
      console.error(`File not found at ${document.path}:`, err.message);
      return res.status(404).json({ 
        error: 'Document file not found', 
        message: `File not accessible at: ${document.path}`,
        path: document.path
      });
    }

    // Re-extract full text if needed, or return stored content
    // Use original path if available for better cross-filesystem access
    try {
      const fullText = await extractText(document.path, document.type, document.originalPath || null);
      
      if (!fullText || fullText.trim().length === 0) {
        console.warn(`No text extracted from ${document.name}`);
        return res.json({ 
          success: false, 
          content: '',
          error: 'No text could be extracted from this document',
          document: {
            id: document.id,
            name: document.name
          }
        });
      }
      
      // Check if it's just a placeholder message
      if (fullText.includes('text extraction requires') || fullText.includes('File:')) {
        console.warn(`Extraction returned placeholder for ${document.name}`);
        return res.json({ 
          success: false, 
          content: '',
          error: fullText,
          document: {
            id: document.id,
            name: document.name
          }
        });
      }
      
      console.log(`Successfully extracted ${fullText.length} characters from ${document.name}`);
      
      res.json({ 
        success: true, 
        content: fullText,
        document: {
          id: document.id,
          name: document.name
        }
      });
    } catch (extractError) {
      console.error(`Error extracting text:`, extractError);
      return res.status(500).json({ 
        error: 'Failed to extract document content', 
        message: extractError.message,
        document: {
          id: document.id,
          name: document.name
        }
      });
    }
  } catch (error) {
    console.error('Error fetching document content:', error);
    res.status(500).json({ error: 'Failed to fetch document content', message: error.message });
  }
});

// Search documents - now searches within chunks for better precision
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('Searching documents for query:', query);
    const metadata = await readMetadata();
    console.log('Total documents in metadata:', metadata.length);
    const results = [];
    const queryLower = query.toLowerCase().trim();
    // Extract keywords - remove common stop words and short words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
    const queryWords = queryLower.split(/\s+/)
      .filter(w => w.length > 2) // Remove very short words
      .filter(w => !stopWords.has(w)); // Remove stop words
    
    // If no meaningful words after filtering, use original words
    const searchWords = queryWords.length > 0 ? queryWords : queryLower.split(/\s+/).filter(w => w.length > 0);

    for (const doc of metadata) {
      let matchedChunks = [];
      
      // If document has chunks, search within chunks
      if (doc.chunks && doc.chunks.length > 0) {
        for (const chunk of doc.chunks) {
          const chunkTextLower = chunk.text.toLowerCase();
          
          // Calculate relevance score for this chunk
          let relevance = 0;
          let exactMatch = false;
          let proximityBonus = 0;
          
          // Check for exact phrase match (highest score)
          if (chunkTextLower.includes(queryLower)) {
            exactMatch = true;
            relevance += 20; // Higher weight for exact phrase
            // Count occurrences
            const occurrences = chunkTextLower.split(queryLower).length - 1;
            relevance += occurrences * 3;
          }
          
          // Check for individual keyword matches with fuzzy matching
          let wordMatches = 0;
          let matchedWordPositions = [];
          
          for (const word of searchWords) {
            // Exact word match
            if (chunkTextLower.includes(word)) {
              wordMatches++;
              relevance += 2;
              
              // Find all positions of this word for proximity calculation
              let pos = chunkTextLower.indexOf(word);
              while (pos !== -1) {
                matchedWordPositions.push(pos);
                pos = chunkTextLower.indexOf(word, pos + 1);
              }
            } else {
              // Fuzzy match: check if word is a substring of any word in chunk
              const chunkWords = chunkTextLower.split(/\s+/);
              for (const chunkWord of chunkWords) {
                if (chunkWord.includes(word) || word.includes(chunkWord)) {
                  wordMatches++;
                  relevance += 1; // Lower score for fuzzy match
                  break;
                }
              }
            }
          }
          
          // Proximity bonus: if multiple words match and they're close together
          if (matchedWordPositions.length >= 2) {
            matchedWordPositions.sort((a, b) => a - b);
            let totalDistance = 0;
            for (let i = 1; i < matchedWordPositions.length; i++) {
              totalDistance += matchedWordPositions[i] - matchedWordPositions[i - 1];
            }
            const avgDistance = totalDistance / (matchedWordPositions.length - 1);
            // Bonus for words being close together (within 50 chars)
            if (avgDistance < 50) {
              proximityBonus = Math.max(0, 10 - Math.floor(avgDistance / 5));
            }
          }
          
          // Bonus if all words match
          if (wordMatches === searchWords.length && searchWords.length > 1) {
            relevance += 8;
          }
          
          // Bonus for exact match
          if (exactMatch) {
            relevance += 5;
          }
          
          // Add proximity bonus
          relevance += proximityBonus;
          
          // Normalize by chunk length (prefer shorter, more focused chunks)
          const lengthFactor = Math.min(1.0, 1000 / chunk.text.length);
          relevance = Math.round(relevance * lengthFactor);
          
          // Only include chunks with meaningful relevance
          if (relevance > 0) {
            matchedChunks.push({
              chunkIndex: chunk.index,
              text: chunk.text,
              start: chunk.start,
              end: chunk.end,
              relevance: relevance,
              exactMatch: exactMatch,
              wordMatches: wordMatches,
              totalWords: searchWords.length
            });
          }
        }
        
        // Sort chunks by relevance
        matchedChunks.sort((a, b) => b.relevance - a.relevance);
        
        if (matchedChunks.length > 0) {
          // Calculate document-level relevance (sum of top chunk relevances)
          const topChunksRelevance = matchedChunks.slice(0, 3).reduce((sum, chunk) => sum + chunk.relevance, 0);
          
          results.push({
            id: doc.id,
            name: doc.name,
            type: doc.type,
            relevance: topChunksRelevance,
            matchedChunks: matchedChunks.slice(0, 5), // Return top 5 most relevant chunks
            totalChunks: doc.chunks.length,
            matchedChunkCount: matchedChunks.length
          });
          console.log(`Found ${matchedChunks.length} relevant chunks in ${doc.name} (top relevance: ${topChunksRelevance})`);
        }
      } else {
        // Fallback: search in full text if no chunks available (for backwards compatibility)
        let content = doc.textContent || '';
        
        if (doc.fullTextLength && doc.fullTextLength > content.length) {
          try {
            const fullText = await extractText(doc.path, doc.type, doc.originalPath || null);
            content = fullText;
          } catch (err) {
            console.log(`Could not extract full text for ${doc.name}, using preview`);
          }
        }
        
        const contentLower = content.toLowerCase();
        
        if (contentLower.includes(queryLower)) {
          const occurrences = contentLower.split(queryLower).length - 1;
          results.push({
            id: doc.id,
            name: doc.name,
            type: doc.type,
            relevance: occurrences,
            matchedChunks: [], // No chunks available
            totalChunks: 0
          });
          console.log(`Found match in ${doc.name} (${occurrences} occurrences, no chunks)`);
        }
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    console.log(`Search returned ${results.length} results with chunk-level matching`);

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents', message: error.message });
  }
});

// Assign models to a document
router.post('/:id/assign-models', async (req, res) => {
  try {
    const { id } = req.params;
    const { modelNames } = req.body; // Array of model names
    
    if (!Array.isArray(modelNames)) {
      return res.status(400).json({ error: 'modelNames must be an array' });
    }

    const metadata = await readMetadata();
    const documentIndex = metadata.findIndex(doc => doc.id === id);
    
    if (documentIndex === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update assigned models
    metadata[documentIndex].assignedModels = modelNames || [];
    await writeMetadata(metadata);

    res.json({ 
      success: true, 
      document: metadata[documentIndex],
      message: 'Models assigned successfully' 
    });
  } catch (error) {
    console.error('Error assigning models:', error);
    res.status(500).json({ error: 'Failed to assign models', message: error.message });
  }
});

// Get documents assigned to a specific model
router.get('/model/:modelName', async (req, res) => {
  try {
    const { modelName } = req.params;
    const metadata = await readMetadata();
    
    const assignedDocuments = metadata.filter(doc => 
      doc.assignedModels && doc.assignedModels.includes(modelName)
    );

    res.json({ 
      success: true, 
      documents: assignedDocuments 
    });
  } catch (error) {
    console.error('Error fetching documents for model:', error);
    res.status(500).json({ error: 'Failed to fetch documents', message: error.message });
  }
});

module.exports = router;
