import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { API_ENDPOINTS, SUPPORTED_LANGUAGES, LANGUAGE_MAP, UI_CONFIG } from '../constants';
import type { CodeBlockProps, CodeExecutionResult } from '../types';

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [executionResult, setExecutionResult] = useState<CodeExecutionResult | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleCopyResultForAI = async () => {
    if (!executionResult) return;
    const lines = [
      '--- Execution result (from running the code you suggested in the app) ---',
      `Exit code: ${executionResult.exitCode ?? '?'}`,
      '',
      ...(executionResult.stdout ? ['STDOUT:', executionResult.stdout, ''] : []),
      ...(executionResult.stderr ? ['STDERR:', executionResult.stderr, ''] : []),
      '--- Paste this back to the chat so the AI can fix the code ---',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const detectLanguage = (lang: string): string => {
    return LANGUAGE_MAP[lang.toLowerCase()] || lang;
  };

  /** Wrap HTML fragments in a minimal document so iframe renders them correctly */
  const htmlForPreview = (raw: string | null): string | null => {
    if (!raw || !raw.trim()) return null;
    const t = raw.trim();
    if (/^\s*<!DOCTYPE\s+html\s*>/i.test(t) || /^\s*<html[\s>]/i.test(t)) return t;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${t}</body></html>`;
  };

  const canExecute = (lang: string): boolean => {
    return SUPPORTED_LANGUAGES.EXECUTABLE.includes(lang.toLowerCase() as any);
  };

  const canRender = (lang: string): boolean => {
    return SUPPORTED_LANGUAGES.RENDERABLE.includes(lang.toLowerCase() as any);
  };

  const handleExecute = async () => {
    const detectedLang = detectLanguage(language);
    
    if (!canExecute(detectedLang)) {
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);
    setRenderedHtml(null);
    setShowPreview(false);

    try {
      const response = await fetch(API_ENDPOINTS.SANDBOX.EXECUTE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code.trim(),
          language: detectedLang,
        }),
      });

      const result = await response.json() as CodeExecutionResult;
      setExecutionResult(result);
      
      // If the result contains HTML, also set it for rendering (wrap fragments for iframe)
      if (result.html) {
        setRenderedHtml(htmlForPreview(result.html) ?? result.html);
        setShowPreview(true);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setExecutionResult({
        success: false,
        stdout: null,
        stderr: `Error: ${errorMessage}`,
        exitCode: null,
        html: null,
        isHtml: false,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRender = async () => {
    const detectedLang = detectLanguage(language);
    
    if (!canRender(detectedLang)) {
      return;
    }

    setIsRendering(true);
    setRenderedHtml(null);
    setShowPreview(false);

    try {
      const response = await fetch(API_ENDPOINTS.SANDBOX.EXECUTE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code.trim(),
          language: detectedLang,
        }),
      });

      const result = await response.json();
      
      if (result.html) {
        setRenderedHtml(htmlForPreview(result.html) ?? result.html);
        setShowPreview(true);
      } else {
        setRenderedHtml(htmlForPreview(code.trim()) || code.trim());
        setShowPreview(true);
      }
    } catch (error: unknown) {
      console.error('Error rendering HTML:', error);
    } finally {
      setIsRendering(false);
    }
  };

  const detectedLang = detectLanguage(language);
  const canExec = canExecute(detectedLang);
  const canRend = canRender(detectedLang);
  const hasButtons = canExec || canRend;

  const hasActionBar = hasButtons || true; // Copy is always shown

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-dark-border">
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={detectedLang}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            padding: '1rem',
          }}
        >
          {code}
        </SyntaxHighlighter>
        {hasActionBar && (
          <div className="flex items-center justify-end gap-2 px-3 py-2 bg-dark-surface border-t border-dark-border">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCopy();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="px-3 py-1.5 bg-dark-bg hover:bg-dark-border border border-dark-border text-dark-text text-sm rounded transition-colors cursor-pointer"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            {canExec && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleExecute();
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                disabled={isExecuting}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors cursor-pointer"
              >
                {isExecuting ? 'Executing...' : 'Execute'}
              </button>
            )}
            {canRend && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRender();
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                disabled={isRendering}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors cursor-pointer"
              >
                {isRendering ? 'Rendering...' : 'Render'}
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Execution Results */}
      {executionResult && (
        <div className="bg-dark-bg border border-dark-border rounded-lg p-4 font-mono text-sm">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <span className="text-dark-muted font-semibold">Execution result (paste back to chat so the AI can fix errors):</span>
            <button
              type="button"
              onClick={handleCopyResultForAI}
              className="shrink-0 px-2 py-1 text-xs bg-dark-surface border border-dark-border rounded text-dark-text hover:bg-dark-border transition-colors"
            >
              {copiedResult ? 'Copied!' : 'Copy result for AI'}
            </button>
          </div>
          {executionResult.success && executionResult.stdout && executionResult.stdout.trim() !== code.trim() && (
            <div className="text-green-400 mb-2">
              <div className="text-dark-muted mb-1 text-xs">STDOUT:</div>
              {executionResult.html ? (
                <p className="text-dark-muted text-xs mb-1">Output is HTML. Use &quot;Show HTML Preview&quot; below to view rendered.</p>
              ) : null}
              <pre className="whitespace-pre-wrap break-all">{executionResult.stdout}</pre>
            </div>
          )}
          {executionResult.success && executionResult.stdout && executionResult.stdout.trim() === code.trim() && (
            <div className="text-amber-400 mb-2 text-sm">
              No program output captured. The runner may have echoed the script instead of executing it — check that the interpreter runs the file (e.g. <code className="text-dark-muted">php script.php</code>).
            </div>
          )}
          {executionResult.stderr && (
            <div className="text-red-400 mb-2">
              <div className="text-dark-muted mb-1 text-xs">STDERR:</div>
              <pre className="whitespace-pre-wrap">{executionResult.stderr}</pre>
              <p className="text-dark-muted text-xs mt-2">
                Paste this back to the chat (or use &quot;Copy result for AI&quot;) so the AI can fix the code.
              </p>
              {(/\b(parse error|syntax error|unclosed|unexpected|expected|does not match)\b/i.test(executionResult.stderr)) && (
                <p className="text-dark-muted text-xs mt-1">
                  This looks like a syntax error. Check for unclosed brackets {'{ }'} or parentheses.
                </p>
              )}
            </div>
          )}
          {executionResult.success && !executionResult.stdout && !executionResult.stderr && (
            <div className="text-green-400">
              <div>Code executed successfully (no output)</div>
              <p className="text-dark-muted text-xs mt-2">
                Tip: If you expected output, add a <code className="text-dark-muted">print(...)</code> or call your function at the bottom of the script (e.g. <code className="text-dark-muted">print(call_fancy_style(&quot;uppercase&quot;, &quot;hi&quot;))</code>).
              </p>
            </div>
          )}
          {executionResult.html && (
            <div className="mt-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
              >
                {showPreview ? 'Hide' : 'Show'} HTML Preview
              </button>
            </div>
          )}
        </div>
      )}

      {/* HTML Preview Panel */}
      {showPreview && renderedHtml && (
        <div className="bg-dark-bg border border-dark-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-2 bg-dark-surface border-b border-dark-border">
            <span className="text-sm font-semibold text-dark-text">HTML Preview</span>
            <button
              onClick={() => {
                setShowPreview(false);
                if (!executionResult?.html) {
                  setRenderedHtml(null);
                }
              }}
              className="text-dark-muted hover:text-dark-text text-lg leading-none px-2"
            >
              ×
            </button>
          </div>
          <div className="bg-white" style={{ minHeight: UI_CONFIG.CODE_BLOCK_MIN_HEIGHT, maxHeight: UI_CONFIG.CODE_BLOCK_MAX_HEIGHT, overflow: 'auto' }}>
            <iframe
              srcDoc={htmlForPreview(renderedHtml) ?? renderedHtml ?? ''}
              className="w-full h-full border-0"
              style={{ minHeight: '300px' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title="HTML Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
