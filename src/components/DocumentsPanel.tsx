import { useState, useEffect } from 'react';
import DocumentManager from './DocumentManager';
import Toast from './Toast';

interface Document {
  id: string;
  name: string;
  size: number;
  type: string;
  assignedModels?: string[];
  uploadedAt: string;
}

interface DocumentsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: string[];
  onDocumentsChange?: () => void;
}

export default function DocumentsPanel({ isOpen, onClose, availableModels, onDocumentsChange }: DocumentsPanelProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  });

  useEffect(() => {
    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedDocument) {
      loadDocumentPreview(selectedDocument.id);
    } else {
      setDocumentPreview('');
      setShowPreview(false);
    }
  }, [selectedDocument]);

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

  const loadDocumentPreview = async (documentId: string) => {
    setLoadingPreview(true);
    try {
      const response = await fetch(`http://localhost:3001/api/documents/${documentId}/content`);
      const data = await response.json();
      
      if (data.success && data.content && !data.content.includes('text extraction requires') && 
          !data.content.includes('File:') && !data.content.includes('Failed to extract')) {
        // Show first 5000 chars as preview
        setDocumentPreview(data.content.substring(0, 5000));
        if (data.content.length > 5000) {
          setDocumentPreview(prev => prev + '\n\n... (truncated, full document available for RAG)');
        }
      } else {
        setDocumentPreview(data.error || 'No preview available');
      }
    } catch (error: any) {
      setDocumentPreview(`Error loading preview: ${error.message}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleAssignModels = async (documentId: string, modelNames: string[]) => {
    try {
      const response = await fetch(`http://localhost:3001/api/documents/${documentId}/assign-models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modelNames }),
      });

      const result = await response.json();

      if (result.success) {
        setToast({
          message: 'Models assigned successfully',
          type: 'success',
          isVisible: true,
        });
        await fetchDocuments();
        if (onDocumentsChange) {
          onDocumentsChange();
        }
      } else {
        setToast({
          message: result.error || 'Failed to assign models',
          type: 'error',
          isVisible: true,
        });
      }
    } catch (error: any) {
      setToast({
        message: `Error assigning models: ${error.message}`,
        type: 'error',
        isVisible: true,
      });
    }
  };

  const getFileIcon = (type: string) => {
    if (type === '.pdf') return '📄';
    if (type === '.doc' || type === '.docx') return '📝';
    if (type === '.xls' || type === '.xlsx') return '📊';
    if (type === '.txt') return '📃';
    return '📎';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  // Handle drag events on the modal to allow drops
  const handleModalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleModalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Let DocumentManager handle the actual drop
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
      onClick={onClose}
      onDragOver={handleModalDragOver}
      onDrop={handleModalDrop}
    >
      <div 
        className="bg-dark-surface border border-dark-border rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-xl font-semibold">Documents Management</h2>
          <button
            onClick={onClose}
            className="text-dark-muted hover:text-dark-text transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Documents List */}
          <div className="w-1/2 border-r border-dark-border overflow-y-auto">
            <div 
              className="p-4 border-b border-dark-border"
              onDragOver={(e) => {
                // Allow drag events to pass through to DocumentManager
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                // Prevent default drop behavior on the container
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <DocumentManager 
                onDocumentsChange={async () => {
                  await fetchDocuments();
                  if (onDocumentsChange) {
                    onDocumentsChange();
                  }
                }} 
              />
            </div>
            
            <div className="p-4">
              <h3 className="text-sm font-medium mb-3">All Documents</h3>
              {loading ? (
                <div className="text-center text-dark-muted py-8">Loading...</div>
              ) : documents.length === 0 ? (
                <div className="text-center text-dark-muted py-8">
                  <p>No documents uploaded yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocument(doc)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedDocument?.id === doc.id
                          ? 'bg-blue-600/20 border border-blue-500'
                          : 'bg-dark-bg hover:bg-dark-border'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getFileIcon(doc.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-dark-text truncate">{doc.name}</div>
                          <div className="text-xs text-dark-muted">
                            {formatFileSize(doc.size)} • {new Date(doc.uploadedAt).toLocaleDateString()}
                            {doc.fullTextLength && (
                              <> • {Math.round(doc.fullTextLength / 5)} words</>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {doc.chunks && doc.chunks.length > 0 && (
                              <span className="text-xs text-green-400">
                                ✓ {doc.chunks.length} chunks
                              </span>
                            )}
                            {doc.assignedModels && doc.assignedModels.length > 0 && (
                              <span className="text-xs text-blue-400">
                                📌 {doc.assignedModels.length} model(s)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Model Assignment Panel */}
          <div className="w-1/2 p-4 overflow-y-auto flex flex-col">
            {selectedDocument ? (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Document Details</h3>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                  >
                    {showPreview ? 'Hide' : 'Show'} Preview
                  </button>
                </div>
                
                <div className="mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{getFileIcon(selectedDocument.type)}</span>
                    <div className="flex-1">
                      <div className="font-medium">{selectedDocument.name}</div>
                      <div className="text-sm text-dark-muted">
                        {formatFileSize(selectedDocument.size)} • {new Date(selectedDocument.uploadedAt).toLocaleDateString()}
                        {selectedDocument.fullTextLength && (
                          <> • {Math.round(selectedDocument.fullTextLength / 5)} words</>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {selectedDocument.chunks && selectedDocument.chunks.length > 0 ? (
                          <span className="text-xs text-green-400">
                            ✓ {selectedDocument.chunks.length} chunks ready for RAG
                          </span>
                        ) : (
                          <span className="text-xs text-yellow-400">
                            ⚠ No chunks (may need re-upload)
                          </span>
                        )}
                        {selectedDocument.fullTextLength && (
                          <span className="text-xs text-dark-muted">
                            {selectedDocument.fullTextLength.toLocaleString()} chars extracted
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Preview */}
                {showPreview && (
                  <div className="mb-4 border border-dark-border rounded-lg overflow-hidden">
                    <div className="bg-dark-surface p-2 border-b border-dark-border">
                      <h4 className="text-sm font-semibold">Document Preview</h4>
                    </div>
                    <div className="p-3 bg-dark-bg max-h-64 overflow-y-auto">
                      {loadingPreview ? (
                        <div className="text-center text-dark-muted py-4">Loading preview...</div>
                      ) : (
                        <pre className="text-xs text-dark-text whitespace-pre-wrap font-mono">
                          {documentPreview || 'No preview available'}
                        </pre>
                      )}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2">Assign Models</h4>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Select Models (multiple selection)
                  </label>
                  {availableModels.length === 0 ? (
                    <div className="text-sm text-dark-muted p-3 bg-dark-bg rounded">
                      No models available. Please install a model first.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {availableModels.map((modelName) => {
                        const isAssigned = selectedDocument.assignedModels?.includes(modelName) || false;
                        return (
                          <label
                            key={modelName}
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                              isAssigned
                                ? 'bg-blue-600/20 border border-blue-500'
                                : 'bg-dark-bg hover:bg-dark-border border border-dark-border'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={(e) => {
                                const currentModels = selectedDocument.assignedModels || [];
                                let newModels: string[];
                                if (e.target.checked) {
                                  newModels = [...currentModels, modelName];
                                } else {
                                  newModels = currentModels.filter(m => m !== modelName);
                                }
                                handleAssignModels(selectedDocument.id, newModels);
                                // Update local state immediately for better UX
                                setSelectedDocument({
                                  ...selectedDocument,
                                  assignedModels: newModels
                                });
                              }}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm">{modelName}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedDocument.assignedModels && selectedDocument.assignedModels.length > 0 && (
                  <div className="mt-4 p-3 bg-blue-600/10 border border-blue-500/30 rounded-lg">
                    <div className="text-sm font-medium mb-2 text-blue-400">
                      Assigned to {selectedDocument.assignedModels.length} model(s):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedDocument.assignedModels.map((modelName) => (
                        <span
                          key={modelName}
                          className="text-xs px-2 py-1 bg-blue-600/20 text-blue-300 rounded"
                        >
                          {modelName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-dark-muted">
                <div className="text-center">
                  <p className="text-lg mb-2">Select a document</p>
                  <p className="text-sm">Choose a document from the list to assign models</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast({ ...toast, isVisible: false })}
        />
      </div>
    </div>
  );
}
