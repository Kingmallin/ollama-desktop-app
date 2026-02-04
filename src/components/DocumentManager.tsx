import { useState, useEffect } from 'react';
import Toast from './Toast';
import FileBrowser from './FileBrowser';

interface Document {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface DocumentManagerProps {
  onDocumentsChange?: () => void;
}

export default function DocumentManager({ onDocumentsChange }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  });

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/documents');
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      setToast({
        message: 'Failed to load documents',
        type: 'error',
        isVisible: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = () => {
    // Open custom file browser that can navigate Windows paths via /mnt/c
    setShowFileBrowser(true);
  };

  const handleFileSelect = async (filePath: string | string[]) => {
    const filePaths = Array.isArray(filePath) ? filePath : [filePath];
    
    if (filePaths.length === 0) return;

    setUploading(true);
    setShowFileBrowser(false);

    // Upload each selected file
    for (const selectedPath of filePaths) {
      try {
        // Read file using Electron API (can access both Windows and WSL paths)
        if (typeof window !== 'undefined' && (window as any).electronAPI?.readFile) {
          const fileData = await (window as any).electronAPI.readFile(selectedPath);
          
          if (!fileData.success) {
            setToast({
              message: `Error reading file: ${fileData.error}`,
              type: 'error',
              isVisible: true,
            });
            continue;
          }

          const fileName = selectedPath.split(/[/\\]/).pop() || 'document';
          // Convert base64 back to binary
          const binaryString = atob(fileData.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const file = new File([bytes], fileName);
          
          const formData = new FormData();
          formData.append('document', file, fileName);
          // Send WSL path (selectedPath is already in WSL format /mnt/c/...)
          formData.append('filePath', selectedPath);

          const response = await fetch('http://localhost:3001/api/documents/upload', {
            method: 'POST',
            body: formData,
          });

          const uploadResult = await response.json();

          if (uploadResult.success) {
            setToast({
              message: `Document "${uploadResult.document.name}" uploaded successfully`,
              type: 'success',
              isVisible: true,
            });
          } else {
            setToast({
              message: uploadResult.error || `Failed to upload ${fileName}`,
              type: 'error',
              isVisible: true,
            });
          }
        } else {
          // Fallback: try to read file via fetch (if backend can serve it)
          setToast({
            message: 'Electron API not available. Please use the browser version.',
            type: 'error',
            isVisible: true,
          });
        }
      } catch (error: any) {
        setToast({
          message: `Error uploading file: ${error.message}`,
          type: 'error',
          isVisible: true,
        });
      }
    }

    await fetchDocuments();
    if (onDocumentsChange) {
      onDocumentsChange();
    }
    setUploading(false);
  };

  const handleDeleteDocument = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"?\n\nThis will permanently remove the document from your system.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:3001/api/documents/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setToast({
          message: `Document "${name}" deleted successfully`,
          type: 'success',
          isVisible: true,
        });
        await fetchDocuments();
        if (onDocumentsChange) {
          onDocumentsChange();
        }
      } else {
        setToast({
          message: result.error || 'Failed to delete document',
          type: 'error',
          isVisible: true,
        });
      }
    } catch (error: any) {
      setToast({
        message: `Error deleting document: ${error.message}`,
        type: 'error',
        isVisible: true,
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type === '.pdf') return '📄';
    if (type === '.doc' || type === '.docx') return '📝';
    if (type === '.xls' || type === '.xlsx') return '📊';
    if (type === '.txt') return '📃';
    return '📎';
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're actually leaving the component
    // Check if the related target is outside the component
    const currentTarget = e.currentTarget as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement;
    
    // If relatedTarget is null or not a child of currentTarget, we're leaving
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    console.log('Drop event triggered', e.dataTransfer.files);
    const files = Array.from(e.dataTransfer.files);
    console.log('Files dropped:', files.length, files.map(f => ({ name: f.name, type: f.type })));
    if (files.length === 0) {
      console.log('No files in drop event');
      return;
    }

    // Filter allowed file types
    const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
    const validFiles = files.filter(file => {
      const fileName = file.name.toLowerCase();
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
      // Also check MIME type as fallback
      const mimeType = file.type.toLowerCase();
      const isPdfByMime = mimeType === 'application/pdf';
      const isPdfByExt = ext === '.pdf';
      const isValidType = allowedTypes.includes(ext) || isPdfByMime;
      
      console.log('File check:', { fileName, ext, mimeType, isValidType });
      return isValidType;
    });

    if (validFiles.length === 0) {
      setToast({
        message: 'No valid document files found. Allowed types: PDF, Word, Excel, or text files.',
        type: 'error',
        isVisible: true,
      });
      return;
    }

    if (validFiles.length < files.length) {
      setToast({
        message: `${files.length - validFiles.length} file(s) skipped (invalid type).`,
        type: 'info',
        isVisible: true,
      });
    }

    setUploading(true);

    // Upload each file
    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append('document', file, file.name);
        // Note: drag and drop doesn't provide file path, so we don't send filePath

        const response = await fetch('http://localhost:3001/api/documents/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadResult = await response.json();

        if (uploadResult.success) {
          setToast({
            message: `Document "${uploadResult.document.name}" uploaded successfully`,
            type: 'success',
            isVisible: true,
          });
        } else {
          setToast({
            message: uploadResult.error || `Failed to upload ${file.name}`,
            type: 'error',
            isVisible: true,
          });
        }
      } catch (error: any) {
        setToast({
          message: `Error uploading file: ${error.message}`,
          type: 'error',
          isVisible: true,
        });
      }
    }

    await fetchDocuments();
    if (onDocumentsChange) {
      onDocumentsChange();
    }
    setUploading(false);
  };

  return (
    <div 
      className={`document-manager p-4 transition-all ${
        isDragging ? 'border-blue-500 border-2 bg-blue-500/10 rounded-lg' : ''
      }`}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDragEnter(e);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDragOver(e);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDragLeave(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDrop(e);
      }}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Upload Documents</h2>
          <button
            onClick={handleFileUpload}
            disabled={uploading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {uploading ? 'Uploading...' : '📁 Select Files'}
          </button>
        </div>
        <p className="text-xs text-dark-muted bg-blue-600/10 border border-blue-500/30 rounded p-2 mt-2">
          <strong>📌 WSL Limitation:</strong> Drag-and-drop from Windows Explorer doesn't work in WSLg (no OLE-to-Wayland bridge). 
          The <strong>"📁 Select Files"</strong> button opens a custom file browser that can navigate Windows files via <code>/mnt/c</code>.
        </p>
      </div>

      {loading ? (
        <div className="text-center text-dark-muted py-8">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div 
          className={`text-center py-8 border-2 border-dashed rounded-lg transition-all ${
            isDragging 
              ? 'border-blue-500 bg-blue-500/10 text-blue-400' 
              : 'border-dark-border text-dark-muted'
          }`}
        >
          <p className="text-lg mb-2">
            {isDragging ? '📂 Drop files here to upload' : 'No documents uploaded yet.'}
          </p>
          <p className="text-sm mt-2">
            {isDragging 
              ? 'Release to upload your documents' 
              : 'Upload PDF, Word, Excel, or text files to use them with the AI.'}
          </p>
          <p className="text-xs mt-2 text-dark-muted">
            💡 <strong>Tip:</strong> Click "📁 Select Files" to use Electron's native Windows file picker - it works perfectly with Windows files even when running from WSL.
          </p>
        </div>
      ) : (
        <div 
          className={`space-y-2 max-h-64 overflow-y-auto transition-all ${
            isDragging ? 'opacity-50' : ''
          }`}
        >
          {isDragging && (
            <div className="text-center py-4 border-2 border-dashed border-blue-500 bg-blue-500/10 rounded-lg mb-2">
              <p className="text-blue-400 font-medium">Drop files here to upload</p>
            </div>
          )}
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 bg-dark-bg rounded-lg hover:bg-dark-border transition-colors group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-2xl">{getFileIcon(doc.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-dark-text truncate">{doc.name}</div>
                  <div className="text-xs text-dark-muted">
                    {formatFileSize(doc.size)} • {new Date(doc.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDeleteDocument(doc.id, doc.name)}
                className="ml-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title={`Delete ${doc.name}`}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />

      <FileBrowser
        isOpen={showFileBrowser}
        onClose={() => setShowFileBrowser(false)}
        onSelect={handleFileSelect}
        multiple={true}
        allowedExtensions={['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt']}
      />
    </div>
  );
}
