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
      <div className="rounded-lg border border-white/[0.08] bg-dark-elevated p-2.5">
        <p className="text-center font-mono text-2xs text-dark-muted">Select a model for RAG assignments</p>
      </div>
    );
  }

  const assignedCount = documents.filter(d => d.assignedModels?.includes(selectedModel)).length;

  return (
    <>
      <div className="space-y-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-dark-dim">RAG · {selectedModel}</h3>
          <p className="mt-0.5 font-mono text-2xs text-dark-muted">Toggle docs for this model</p>
        </div>

        {loadingDocuments ? (
          <div className="py-3 text-center font-mono text-2xs text-dark-muted">Loading…</div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-white/[0.08] bg-dark-elevated py-3 text-center text-2xs text-dark-muted">
            <p>No uploads yet</p>
            <p className="mt-1 font-mono text-[10px]">Open Documents to add files</p>
          </div>
        ) : (
          <>
            <div className="chat-scroll max-h-48 space-y-1.5 overflow-y-auto">
              {documents.map((doc) => {
                const isAssigned = doc.assignedModels?.includes(selectedModel) || false;
                return (
                  <label
                    key={doc.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs transition-colors ${
                      isAssigned
                        ? 'border-accent-mid bg-accent-dim'
                        : 'border-white/[0.08] bg-dark-elevated hover:border-white/[0.12]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={(e) => handleDocumentToggle(doc.id, isAssigned)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-dark-border text-accent focus:ring-accent"
                    />
                    <span className="flex-shrink-0 text-base leading-none opacity-90">{getFileIcon(doc.type)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-dark-text">{doc.name}</div>
                      <div className="font-mono text-[10px] text-dark-muted">
                        {isAssigned ? '✓ RAG' : 'off'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="text-center font-mono text-[10px] text-dark-dim">
              {assignedCount}/{documents.length} for model
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
