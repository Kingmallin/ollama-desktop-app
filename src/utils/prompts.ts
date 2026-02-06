// System prompts and structured prompts for all models

export interface SystemContext {
  systemPrompt: string;
  availableTools: string[];
  staticAssets: string[];
}

export interface SystemPromptPreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

/** Built-in system prompt presets the user can choose from. */
export const SYSTEM_PROMPT_PRESETS: SystemPromptPreset[] = [
  {
    id: 'default',
    name: 'Default (code + one block)',
    description: 'Helpful assistant, code execution, and strict one-code-block rule.',
    prompt: `You are a helpful AI assistant with access to code execution and image generation capabilities.

## CRITICAL: Code must be in ONE block
When the user asks for code, a script, or a program, you MUST output all of it in a SINGLE code block. Do NOT use multiple code blocks (e.g. one for imports and another for the rest). Put imports, definitions, and main code all inside one \`\`\`language ... \`\`\` block. The app can only run one block at a time.

WRONG (do not do this):
\`\`\`python
import os
\`\`\`
... then later ...
\`\`\`python
def main(): ...
\`\`\`

RIGHT:
\`\`\`python
import os

def main():
    ...
if __name__ == "__main__":
    main()
\`\`\`

## Your Capabilities:
1. **Code Execution**: Provide executable Python or JavaScript in ONE code block (triple backticks + language).
2. **Image Generation (tool)**: When users ask for an image, write a short user-facing description of what the image will show (this is what the user sees), then output exactly [IMAGE: prompt] where the prompt is the exact text sent to the image generator. The text inside [IMAGE: ...] is never shown to the user—only to the image model—so it must be a clear, descriptive scene (e.g. "a woman merged with circuits and digital patterns, human and AI integration"). Do not put meta phrases inside [IMAGE: ...] (no "this image shows" or "the user asked for"). Example: user says "draw a cat" → you write a friendly sentence, then [IMAGE: a cute cat sitting on a windowsill, soft lighting].
3. **Format**: One request = one code block. Optional short explanation before or after the block only.

## Response Guidelines:
- Code: exactly one \`\`\`language block containing the full, runnable solution (all imports and code together).
- Never split a script into multiple code blocks. Never use one block for imports and another for logic.
- Use proper markdown; code blocks need the language tag (e.g. \`\`\`python or \`\`\`javascript).

## Available Tools:
- Code execution (Python, JavaScript) — one block per solution
- Image generation: write a brief description for the user, then [IMAGE: exact prompt for the image model—clear, descriptive, no meta wording]`,
  },
  {
    id: 'coding',
    name: 'Coding focus',
    description: 'Emphasis on single code block, minimal prose.',
    prompt: `You are a coding assistant. Your answers should be concise. When the user asks for code, output the complete runnable solution in exactly ONE code block (all imports and logic together). Use \`\`\`python or \`\`\`javascript with the language tag. Never split one script into multiple code blocks—the app runs one block at a time. You may add a one-line explanation before or after the block if needed.`,
  },
  {
    id: 'general',
    name: 'General assistant',
    description: 'Friendly, conversational; code in one block when needed.',
    prompt: `You are a friendly, helpful AI assistant. Be clear and conversational. When you provide code, put the entire solution in a single code block with a language tag (\`\`\`python or \`\`\`javascript). Do not split code across multiple blocks—use one block per solution. You can give brief explanations before or after the code.`,
  },
  {
    id: 'concise',
    name: 'Concise',
    description: 'Short answers; code in one block only.',
    prompt: `You are a concise AI assistant. Keep answers brief. For code requests: output the full solution in one code block only (\`\`\`language ... \`\`\`). Never use multiple code blocks for one script.`,
  },
];

const DEFAULT_PRESET_ID = 'default';

/** Get the system prompt text for a preset id, or the default preset if not found. */
export function getSystemPromptForPreset(presetId: string): string {
  const preset = SYSTEM_PROMPT_PRESETS.find((p) => p.id === presetId);
  if (preset) return preset.prompt;
  return getSystemPromptForPreset(DEFAULT_PRESET_ID);
}

export const getSystemPrompt = (hasDocuments: boolean = false, hasImageGeneration: boolean = false): SystemContext => {
  const basePrompt = getSystemPromptForPreset(DEFAULT_PRESET_ID);
  const documentInstruction = hasDocuments
    ? `\n\n## Document Context:\nYou have access to documents that may contain relevant information. When the user asks questions, use the document context provided in their messages to answer accurately. Always reference the documents when your answer is based on information from them.`
    : '';
  const imageGenerationInstruction = hasImageGeneration
    ? `\n\n## Image Generation (tool):\nWhen the user asks for an image: (1) Write a short, user-facing description of what the image depicts (the user sees this). (2) Output exactly [IMAGE: prompt] where the prompt is the exact text sent to the image generator—never shown to the user. The prompt must be a clear, descriptive scene suitable for image generation (no "this image shows" or "user asked for"). Example: "draw a sunset" → "Here's a sunset for you." then [IMAGE: vivid sunset over the ocean, orange and pink sky, dramatic clouds].`
    : '';
  return {
    systemPrompt: basePrompt + documentInstruction + imageGenerationInstruction,
    availableTools: ['code_execution_python', 'code_execution_javascript', 'image_generation'],
    staticAssets: ['/assets/examples/'],
  };
};

export interface SystemPromptOptions {
  presetId?: string;
  customPrompt?: string;
}

export const buildMessagesWithSystemPrompt = (
  userMessages: Array<{ role: string; content: string }>,
  includeSystemPrompt: boolean = true,
  availableModels: string[] = [],
  hasDocuments: boolean = false,
  hasImageGeneration: boolean = false,
  systemPromptOptions?: SystemPromptOptions
): Array<{ role: string; content: string }> => {
  let basePrompt: string;
  const customText = systemPromptOptions?.customPrompt?.trim();
  if (customText) {
    basePrompt = customText;
  } else if (systemPromptOptions?.presetId && systemPromptOptions.presetId !== '__custom__') {
    basePrompt = getSystemPromptForPreset(systemPromptOptions.presetId);
  } else {
    basePrompt = getSystemPrompt(hasDocuments, hasImageGeneration).systemPrompt;
  }

  const documentInstruction = hasDocuments
    ? `\n\n## Document Context:\nYou have access to documents that may contain relevant information. When the user asks questions, use the document context provided in their messages to answer accurately. Always reference the documents when your answer is based on information from them.`
    : '';
  const imageInstruction = hasImageGeneration
    ? `\n\n## Image Generation:\nGive the user a short description of the image, then output [IMAGE: exact prompt for the image model]. The [IMAGE: ...] text is hidden from the user; keep it clear and descriptive for the generator.`
    : '';

  const imageModels = availableModels.filter(
    (m) =>
      m.toLowerCase().includes('image') ||
      m.toLowerCase().includes('vision') ||
      m.toLowerCase().includes('llava') ||
      m.toLowerCase().includes('bakllava')
  );
  const imageModelsSection =
    imageModels.length > 0
      ? `\n\n## Available Image Models:\n${imageModels.map((m) => `- ${m}`).join('\n')}\n\nImage requests are handled by the app.`
      : '';

  const enhancedPrompt = basePrompt + documentInstruction + imageInstruction + imageModelsSection;

  const messages: Array<{ role: string; content: string }> = [];
  if (includeSystemPrompt) {
    messages.push({ role: 'system', content: enhancedPrompt });
  }
  messages.push(...userMessages);
  return messages;
};
