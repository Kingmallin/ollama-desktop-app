import { useState, useEffect } from 'react';
import Toast from './Toast';

interface Document {
  id: string;
  name: string;
  size: number;
  type: string;
  assignedModels?: string[];
  uploadedAt: string;
}

interface ModelDocumentsPanelProps {
  selectedModel: string;
  onDocumentsChange?: () => void;
}

export default function ModelDocumentsPanel({ selectedModel, onDocumentsChange }: ModelDocumentsPanelProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  });

  useEffect(() => {
    if (selectedModel) {
      fetchDocuments();
    }
  }, [selectedModel]);

  const fetchDocuments = async () => {
    setLoadingDocuments(true);
    try {
      const response = await fetch('http://localhost:3001/api/documents');
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoadingDocuments(false);
    }
  };

  const handleDocumentToggle = async (documentId: string, isAssigned: boolean) => {
    if (!selectedModel) return;

    try {
      // Get current document assignments
      const document = documents.find(d => d.id === documentId);
      if (!document) return;

      const currentModels = document.assignedModels || [];
      let newModels: string[];

      if (isAssigned) {
        // Remove model from assignments
        newModels = currentModels.filter((m: string) => m !== selectedModel);
      } else {
        // Add model to assignments
        newModels = [...currentModels, selectedModel];
      }

      const response = await fetch(`http://localhost:3001/api/documents/${documentId}/assign-models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modelNames: newModels }),
      });

      const result = await response.json();

      if (result.success) {
        // Update local state
        setDocuments(docs => 
          docs.map(doc => 
            doc.id === documentId 
              ? { ...doc, assignedModels: newModels }
              : doc
          )
        );
        
        if (onDocumentsChange) {
          onDocumentsChange();
        }
      } else {
        setToast({
          message: result.error || 'Failed to update document assignment',
          type: 'error',
          isVisible: true,
        });
      }
    } catch (error: any) {
      setToast({
        message: `Error updating assignment: ${error.message}`,
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

  if (!selectedModel) {
    return (
      <div className="mt-4 p-3 bg-dark-bg rounded-lg border border-dark-border">
        <p className="text-sm text-dark-muted text-center">
          Select a model to assign documents
        </p>
      </div>
    );
  }

  const assignedCount = documents.filter(d => d.assignedModels?.includes(selectedModel)).length;

  return (
    <>
      <div className="mt-4 border-t border-dark-border pt-4">
        <h3 className="text-sm font-semibold text-dark-text mb-2">
          Documents for "{selectedModel}"
        </h3>
        <p className="text-xs text-dark-muted mb-3">
          Select which documents this model can access for RAG
        </p>

        {loadingDocuments ? (
          <div className="text-center text-dark-muted py-4 text-sm">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="text-center text-dark-muted py-4 bg-dark-bg rounded-lg border border-dark-border text-sm">
            <p>No documents uploaded yet.</p>
            <p className="text-xs mt-1">Upload documents to enable RAG</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {documents.map((doc) => {
                const isAssigned = doc.assignedModels?.includes(selectedModel) || false;
                return (
                  <label
                    key={doc.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                      isAssigned
                        ? 'bg-blue-600/20 border border-blue-500'
                        : 'bg-dark-bg hover:bg-dark-border border border-dark-border'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={(e) => handleDocumentToggle(doc.id, isAssigned)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 flex-shrink-0"
                    />
                    <span className="text-lg flex-shrink-0">{getFileIcon(doc.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-dark-text truncate">{doc.name}</div>
                      <div className="text-xs text-dark-muted">
                        {isAssigned ? '✓ Assigned' : 'Not assigned'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            
            <div className="mt-3 text-xs text-dark-muted text-center">
              {assignedCount} of {documents.length} documents assigned
            </div>
          </>
        )}
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />
    </>
  );
}
