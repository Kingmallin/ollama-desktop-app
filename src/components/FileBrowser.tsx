import { useState, useEffect } from 'react';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

interface FileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (filePath: string) => void;
  allowedExtensions?: string[];
  multiple?: boolean;
}

export default function FileBrowser({ 
  isOpen, 
  onClose, 
  onSelect, 
  allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
  multiple = false
}: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/mnt/c');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadDirectory('/mnt/c');
    }
  }, [isOpen]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`http://localhost:3001/api/documents/browse?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        return;
      }
      
      setCurrentPath(data.path);
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item: FileItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path);
    } else {
      // Check if file extension is allowed
      const ext = item.name.toLowerCase().substring(item.name.lastIndexOf('.'));
      if (allowedExtensions.includes(ext)) {
        if (multiple) {
          const newSelected = new Set(selectedFiles);
          if (newSelected.has(item.path)) {
            newSelected.delete(item.path);
          } else {
            newSelected.add(item.path);
          }
          setSelectedFiles(newSelected);
        } else {
          onSelect(item.path);
          onClose();
        }
      }
    }
  };

  const handleParentClick = () => {
    if (currentPath === '/mnt/c' || currentPath === '/mnt') {
      return;
    }
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/mnt/c';
    loadDirectory(parentPath);
  };

  const handleSelect = () => {
    if (selectedFiles.size > 0) {
      selectedFiles.forEach(path => onSelect(path));
      onClose();
    }
  };

  const formatPath = (path: string) => {
    // Convert /mnt/c/Users/... to C:\Users\... for display
    if (path.startsWith('/mnt/')) {
      const parts = path.split('/').filter(p => p);
      if (parts.length >= 2) {
        const drive = parts[1].toUpperCase();
        const rest = parts.slice(2).join('\\');
        return `${drive}:\\${rest || ''}`;
      }
    }
    return path;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-bg border border-dark-border rounded-lg w-[90vw] max-w-4xl h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-dark-border flex items-center justify-between">
          <h2 className="text-xl font-semibold">Select File{multiple ? 's' : ''}</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
          >
            Close
          </button>
        </div>

        {/* Path bar */}
        <div className="p-3 border-b border-dark-border bg-dark-border/30">
          <div className="flex items-center gap-2">
            {currentPath !== '/mnt/c' && (
              <button
                onClick={handleParentClick}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
              >
                ↑ Up
              </button>
            )}
            <div className="flex-1 px-3 py-1 bg-dark-bg rounded text-sm font-mono text-dark-text">
              {formatPath(currentPath)}
            </div>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-dark-muted py-8">Loading...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-center text-dark-muted py-8">This directory is empty</div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => {
                const ext = item.name.toLowerCase().substring(item.name.lastIndexOf('.'));
                const isSelectable = !item.isDirectory && allowedExtensions.includes(ext);
                const isSelected = selectedFiles.has(item.path);
                
                return (
                  <div
                    key={item.path}
                    onClick={() => handleItemClick(item)}
                    className={`p-3 rounded cursor-pointer transition-colors flex items-center gap-3 ${
                      item.isDirectory
                        ? 'hover:bg-blue-600/20'
                        : isSelectable
                        ? isSelected
                          ? 'bg-blue-600/30 border border-blue-500'
                          : 'hover:bg-dark-border'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-2xl">
                      {item.isDirectory ? '📁' : 
                       ext === '.pdf' ? '📄' :
                       ext === '.doc' || ext === '.docx' ? '📝' :
                       ext === '.xls' || ext === '.xlsx' ? '📊' :
                       ext === '.txt' ? '📃' : '📎'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-dark-text truncate">{item.name}</div>
                      {!item.isDirectory && (
                        <div className="text-xs text-dark-muted">
                          {(item.size / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>
                    {multiple && isSelectable && (
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-dark-border'
                      }`}>
                        {isSelected && <span className="text-white text-xs">✓</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {multiple && (
          <div className="p-4 border-t border-dark-border flex items-center justify-between">
            <div className="text-sm text-dark-muted">
              {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
            </div>
            <button
              onClick={handleSelect}
              disabled={selectedFiles.size === 0}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded"
            >
              Select {selectedFiles.size > 0 ? `(${selectedFiles.size})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
