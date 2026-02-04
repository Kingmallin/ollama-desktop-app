import { useState, useEffect } from 'react';
import { SYSTEM_PROMPT_PRESETS } from '../utils/prompts';
import { STORAGE_KEYS } from '../constants';

export const CUSTOM_PRESET_ID = '__custom__';

interface SystemPromptSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function getStoredSystemPromptPresetId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT_PRESET_ID);
    if (id && (SYSTEM_PROMPT_PRESETS.some((p) => p.id === id) || id === CUSTOM_PRESET_ID)) return id;
  } catch (_) {}
  return SYSTEM_PROMPT_PRESETS[0]?.id ?? 'default';
}

export function getStoredSystemPromptCustom(): string {
  try {
    const s = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT_CUSTOM);
    if (typeof s === 'string') return s;
  } catch (_) {}
  return '';
}

export default function SystemPromptSettings({ isOpen, onClose }: SystemPromptSettingsProps) {
  const [presetId, setPresetId] = useState<string>(() => getStoredSystemPromptPresetId());
  const [customPrompt, setCustomPrompt] = useState<string>(() => getStoredSystemPromptCustom());

  useEffect(() => {
    if (isOpen) {
      setPresetId(getStoredSystemPromptPresetId());
      setCustomPrompt(getStoredSystemPromptCustom());
    }
  }, [isOpen]);

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT_PRESET_ID, presetId);
      localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT_CUSTOM, presetId === CUSTOM_PRESET_ID ? customPrompt : '');
    } catch (e) {
      console.error('Failed to save system prompt settings', e);
    }
    onClose();
  };

  if (!isOpen) return null;

  const isCustom = presetId === CUSTOM_PRESET_ID;
  const selectedPreset = SYSTEM_PROMPT_PRESETS.find((p) => p.id === presetId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-surface border border-dark-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">System Prompt</h2>
            <button
              onClick={onClose}
              className="text-dark-muted hover:text-dark-text transition-colors text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-dark-muted mb-4">
            Choose a preset or write a custom system prompt. This sets the AI’s behavior for every chat.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Preset</label>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SYSTEM_PROMPT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={CUSTOM_PRESET_ID}>Custom</option>
            </select>
            {selectedPreset && !isCustom && (
              <p className="text-xs text-dark-muted mt-1">{selectedPreset.description}</p>
            )}
          </div>

          {isCustom && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Custom system prompt</label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter your full system prompt..."
                rows={12}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-dark-border">
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-dark-bg hover:bg-dark-border border border-dark-border rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
