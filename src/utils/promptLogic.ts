import type {
  PromptItem,
  PromptVersion,
  PromptVariableDescriptor,
  PromptChain,
  PromptChainStep,
  FilterOptions,
  DiffLine,
  ImportedPromptDraft,
  ParsedImportResult,
} from '../types/prompt.ts';

/**
 * Resolves the effective template content for a workflow chain step.
 * Uses the linked PromptItem's latest content if `promptId` exists, otherwise falls back to `customContent`.
 */
export function resolveChainStepContent(
  step: PromptChainStep,
  promptsMap: Record<string, PromptItem>
): string {
  if (step.promptId && promptsMap[step.promptId]) {
    return promptsMap[step.promptId].content;
  }
  return step.customContent || '';
}

/**
 * Analyzes all steps in a PromptChain to identify per-step variables and shared cross-step variables.
 */
export function analyzeChainVariables(
  chain: PromptChain,
  promptsMap: Record<string, PromptItem>
): {
  stepDescriptors: Record<string, PromptVariableDescriptor[]>;
  sharedVarNames: string[];
} {
  const stepDescriptors: Record<string, PromptVariableDescriptor[]> = {};
  const occurrenceCount = new Map<string, number>();

  for (const step of chain.steps) {
    const content = resolveChainStepContent(step, promptsMap);
    const descs = extractVariableDescriptors(content);
    stepDescriptors[step.id] = descs;
    for (const d of descs) {
      occurrenceCount.set(d.name, (occurrenceCount.get(d.name) || 0) + 1);
    }
  }

  const sharedVarNames = Array.from(occurrenceCount.entries())
    .filter(([, count]) => count >= 2)
    .map(([name]) => name);

  return { stepDescriptors, sharedVarNames };
}

/**
 * Assembles the final prompt for a specific step in a PromptChain, automatically wiring any
 * upstream step's output into its `handoffVarName` (and immediate previous step into `上一步产出`).
 */
export function assembleChainStepPrompt(
  chain: PromptChain,
  stepIndex: number,
  promptsMap: Record<string, PromptItem>,
  variableValues: Record<string, string>,
  stepOutputs: Record<string, string>
): {
  assembled: string;
  effectiveValues: Record<string, string>;
  handoffFromPrev?: { prevStepTitle: string; targetVarName: string; hasOutput: boolean };
} {
  const step = chain.steps[stepIndex];
  if (!step) {
    return { assembled: '', effectiveValues: variableValues };
  }

  const effectiveValues: Record<string, string> = { ...variableValues };
  let handoffFromPrev:
    | { prevStepTitle: string; targetVarName: string; hasOutput: boolean }
    | undefined;

  // Wire all completed upstream step handoff outputs (Steps 0 .. stepIndex - 1)
  for (let i = 0; i < stepIndex; i++) {
    const upstreamStep = chain.steps[i];
    if (!upstreamStep) continue;
    const upstreamOutput = (stepOutputs[upstreamStep.id] || '').trim();
    if (upstreamStep.handoffVarName && upstreamOutput && !effectiveValues[upstreamStep.handoffVarName]?.trim()) {
      effectiveValues[upstreamStep.handoffVarName] = upstreamOutput;
    }
  }

  if (stepIndex > 0) {
    const prevStep = chain.steps[stepIndex - 1];
    const prevOutput = (stepOutputs[prevStep.id] || '').trim();
    if (prevStep.handoffVarName) {
      handoffFromPrev = {
        prevStepTitle: prevStep.title,
        targetVarName: prevStep.handoffVarName,
        hasOutput: Boolean(prevOutput),
      };
    }
    if (prevOutput && !effectiveValues['上一步产出']?.trim()) {
      effectiveValues['上一步产出'] = prevOutput;
    }
  }

  const rawContent = resolveChainStepContent(step, promptsMap);
  const assembled = interpolatePrompt(rawContent, effectiveValues, true);

  return { assembled, effectiveValues, handoffFromPrev };
}

/**
 * Exports a PromptChain and its current compiled prompts / recorded outputs as a structured Markdown SOP document.
 */
export function exportChainAsMarkdown(
  chain: PromptChain,
  promptsMap: Record<string, PromptItem>,
  variableValues: Record<string, string>,
  stepOutputs: Record<string, string>
): string {
  const lines: string[] = [
    `# ${chain.title}`,
    '',
    `> **场景说明**：${chain.description || '多步提示词串联工作流'}`,
    `> **所属领域**：${chain.category} · **步骤总数**：${chain.steps.length} 步`,
    '',
  ];

  chain.steps.forEach((step, idx) => {
    const { assembled } = assembleChainStepPrompt(
      chain,
      idx,
      promptsMap,
      variableValues,
      stepOutputs
    );
    const output = (stepOutputs[step.id] || '').trim();
    lines.push(`## Step ${String(idx + 1).padStart(2, '0')}. ${step.title}`);
    if (step.stepNote) {
      lines.push(`- **执行说明**：${step.stepNote}`);
    }
    if (step.handoffVarName) {
      lines.push(`- **产出传递变量**：\`{{${step.handoffVarName}}}\``);
    }
    lines.push('');
    lines.push('### 提示词内容');
    lines.push('```markdown');
    lines.push(assembled);
    lines.push('```');
    if (output) {
      lines.push('');
      lines.push('### 本步执行产出');
      lines.push(output);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Automatically wires an ordered list of PromptItems from the library into a connected PromptChain.
 * Downstream steps automatically receive a reference to the previous step's `handoffVarName`
 * so the user gets an out-of-the-box working relay without manual variable syntax configuration.
 */
export function buildChainFromPromptItems(
  selectedPrompts: PromptItem[],
  options: {
    id?: string;
    title: string;
    description?: string;
    category?: string;
    nowIso?: string;
  }
): PromptChain {
  const now = options.nowIso || new Date().toISOString();
  const steps: PromptChainStep[] = selectedPrompts.map((p, idx) => {
    const isLast = idx === selectedPrompts.length - 1;
    const handoffVarName = isLast ? undefined : `阶段0${idx + 1}_${p.title.slice(0, 6).replace(/\s+/g, '')}产出`;
    const prevPrompt = idx > 0 ? selectedPrompts[idx - 1] : undefined;
    const prevHandoffVar =
      idx > 0
        ? `阶段0${idx}_${prevPrompt!.title.slice(0, 6).replace(/\s+/g, '')}产出`
        : undefined;

    // If this is step >= 1, append the upstream handoff block so it automatically relays
    const customContent = prevHandoffVar
      ? `${p.content}\n\n【上游传入 · ${prevHandoffVar}】：\n{{${prevHandoffVar}}}`
      : undefined;

    return {
      id: `step-${Date.now()}-${idx + 1}`,
      title: p.title,
      promptId: idx === 0 ? p.id : undefined,
      customContent,
      handoffVarName,
      stepNote:
        idx === 0
          ? `基于词库《${p.title}》作为起点，产出结果将自动注入下一步。`
          : `承接上一步《${prevHandoffVar}》并结合《${p.title}》继续深入。`,
    };
  });

  return {
    id: options.id || `chain-${Date.now()}`,
    title: options.title.trim() || '词库组合串联任务流',
    description:
      options.description?.trim() ||
      `由 ${selectedPrompts.length} 个词库模板自动串联生成，支持跨步变量共享与产出接力。`,
    category: options.category || selectedPrompts[0]?.category || '编程与架构',
    steps,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generates deterministic sample variable values and step outputs for a full-chain interactive demo playthrough.
 */
export function simulateChainRunState(
  chain: PromptChain,
  promptsMap: Record<string, PromptItem>,
  sampleStepOutputsDict: Record<string, string> = {}
): {
  varValues: Record<string, string>;
  stepOutputs: Record<string, string>;
  completedSteps: Record<string, boolean>;
} {
  const varValues: Record<string, string> = {};
  const stepOutputs: Record<string, string> = {};
  const completedSteps: Record<string, boolean> = {};

  const sampleInputFallbacks: Record<string, string> = {
    技术栈与架构: 'React 19 + TypeScript + Tailwind CSS',
    所属系统模块: '场景任务流画布工作台 (Workflow Studio)',
    所属模块: '场景任务流画布工作台 (Workflow Studio)',
    需求描述: '支持可视化节点串联、上游产出自动注入下游变量、一键全流程模拟演示与词库节点速插。',
    审查侧重点: '空状态与边界异常回滚',
    发布版本标识: 'v2.4.0 场景任务流正式版',
    研究赛道与主题: 'AI 提示词工程与多步 Agent 编排工作台',
    核心技术或产品方向: '轻量化本地优先 (Local-First) 提示词串联画布',
    核心素材内容: '传统单次 Prompt 难以应对复杂长链路任务，而重型节点编程工具学习成本过高。',
    对比评估维度: '上手门槛、跨步变量复用率、SOP 沉淀效率',
    汇报受众: '产品与研发负责人',
    文章核心主题: '为什么复杂 AI 任务需要从「单点提示词」升级为「多步场景任务流」',
    目标读者画像: '高频使用 AI 辅助研发、调研与写作的专业创作者',
    核心论点素材: '拆解单一职责节点 + 显式检验阶段产出 + 上下游变量自动接力',
    文风偏好: '克制锋利的工程实践派',
    润色强度: '深度去套话与长短句节奏重塑',
    目标主题: '核心业务模块重构与性能优化',
    原始背景描述: '现有模块耦合度较高，需拆分为独立纯函数层与可视化交互层。',
    核心任务目标: '构建高内聚、易上手的多步提示词串联画布',
  };

  const handoffNames = new Set(
    chain.steps.map((s) => s.handoffVarName?.trim()).filter(Boolean) as string[]
  );

  for (let idx = 0; idx < chain.steps.length; idx++) {
    const step = chain.steps[idx];
    const content = resolveChainStepContent(step, promptsMap);
    const descs = extractVariableDescriptors(content);

    for (const d of descs) {
      if (handoffNames.has(d.name)) continue;
      if (!varValues[d.name]) {
        if (d.options && d.options.length > 0) {
          varValues[d.name] = d.options[0];
        } else {
          varValues[d.name] =
            sampleInputFallbacks[d.name] || `示例${d.name}参数内容`;
        }
      }
    }

    const handoffKey = step.handoffVarName || '';
    const presetSample = handoffKey ? sampleStepOutputsDict[handoffKey] : undefined;
    stepOutputs[step.id] =
      presetSample ||
      `【Step 0${idx + 1} · ${step.title} 阶段结论】\n1. 已完成本阶段核心目标分析与结构化拆解；\n2. 关键输出已就绪，自动作为变量 {{${
        handoffKey || '上一步产出'
      }}} 传递至下一节点。`;
    completedSteps[step.id] = true;
  }

  return { varValues, stepOutputs, completedSteps };
}

/**
 * Normalizes prompt content for high-density card previews by stripping standalone code fence lines
 * and collapsing consecutive blank lines so multi-line previews never waste vertical lines on empty gaps.
 */
export function formatCompactPromptPreview(content: string): string {
  if (!content) return '';
  return content
    .split(/\r?\n/)
    .filter((line) => !/^\s*```[a-zA-Z0-9_-]*\s*$/.test(line))
    .map((line) => line.trimEnd())
    .filter((line, idx, arr) => {
      // Remove empty lines altogether so every preview line has actual content
      if (line.trim() === '') return false;
      return idx >= 0 && arr.length > 0;
    })
    .join('\n')
    .trim();
}

/**
 * Parses an inner `{{...}}` token supporting both standard `{{变量名}}`
 * and inline enum options `{{变量名:选项A|选项B|选项C}}`.
 */
export function parseRawVariableToken(rawInner: string): PromptVariableDescriptor {
  const trimmed = rawInner.trim();
  const colonMatch = trimmed.match(/^([^:：]+?)(?:[:：](.+))?$/);
  if (!colonMatch) {
    return { name: trimmed };
  }
  const name = colonMatch[1].trim();
  const rawOptions = colonMatch[2];
  if (!rawOptions) {
    return { name };
  }
  const options = rawOptions
    .split(/[|｜]+/)
    .map((opt) => opt.trim())
    .filter(Boolean);

  return options.length > 0 ? { name, options } : { name };
}

/**
 * Extracts unique variable descriptors (including inline enum options) in order of appearance.
 */
export function extractVariableDescriptors(content: string): PromptVariableDescriptor[] {
  if (!content) return [];
  const regex = /\{\{\s*([^{}\n]+?)\s*\}\}/g;
  const byName = new Map<string, PromptVariableDescriptor>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const parsed = parseRawVariableToken(match[1]);
    if (!parsed.name) continue;
    const existing = byName.get(parsed.name);
    if (!existing) {
      byName.set(parsed.name, parsed);
    } else if (!existing.options && parsed.options) {
      byName.set(parsed.name, {
        name: existing.name,
        options: parsed.options,
      });
    }
  }
  return Array.from(byName.values());
}

/**
 * Extracts unique `{{variable}}` names from a prompt template in order of appearance.
 * Supports both `{{变量名}}` and `{{变量名:选项1|选项2}}`.
 */
export function extractVariables(content: string): string[] {
  return extractVariableDescriptors(content).map((d) => d.name);
}

/**
 * Interpolates a prompt template with provided variable values.
 * If a variable value is empty/undefined, keeps clean `{{variable}}` (stripping enum option syntax)
 * or uses empty string if `keepUnfilledPlaceholders` is false.
 */
export function interpolatePrompt(
  content: string,
  values: Record<string, string>,
  keepUnfilledPlaceholders = true
): string {
  if (!content) return '';
  return content.replace(/\{\{\s*([^{}\n]+?)\s*\}\}/g, (_fullMatch, rawInner: string) => {
    const { name } = parseRawVariableToken(rawInner);
    const val = values[name];
    if (val !== undefined && val.trim() !== '') {
      return val;
    }
    return keepUnfilledPlaceholders ? `{{${name}}}` : '';
  });
}

/**
 * Normalizes a tag list (trims, removes leading #, deduplicates, removes empty strings).
 */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const cleaned = raw.trim().replace(/^#+/, '').trim();
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      out.push(cleaned);
    }
  }
  return out;
}

/**
 * Filters and sorts prompt items according to active view, primary category, sub-category,
 * tags, search query, and sort field. Optimized for large 10,000+ item collections.
 */
export function filterAndSortPrompts(prompts: PromptItem[], options: FilterOptions): PromptItem[] {
  const {
    view,
    categoryId,
    subCategoryId = 'all',
    selectedTags,
    searchQuery,
    sortBy,
    categoriesMap = {},
    subCategoriesMap = {},
  } = options;

  const queryTokens = searchQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const normalizedSelectedTags = selectedTags.map((t) => t.toLowerCase());

  const filtered = prompts.filter((item) => {
    // 1. View filter
    if (view === 'favorites' && !item.isFavorite) {
      return false;
    }
    if (view === 'recent' && !item.lastUsedAt && item.usageCount === 0) {
      return false;
    }

    // 2. Primary Category filter
    if (categoryId && categoryId !== 'all' && item.categoryId !== categoryId) {
      return false;
    }

    // 3. Sub-Category filter (二级分类)
    if (subCategoryId && subCategoryId !== 'all' && item.subCategoryId !== subCategoryId) {
      return false;
    }

    // 4. Tags filter (AND logic: must contain all selected tags)
    if (normalizedSelectedTags.length > 0) {
      const itemTagsLower = item.tags.map((t) => t.toLowerCase());
      const hasAllTags = normalizedSelectedTags.every((t) => itemTagsLower.includes(t));
      if (!hasAllTags) return false;
    }

    // 5. Search query filter
    if (queryTokens.length > 0) {
      const categoryName = (categoriesMap[item.categoryId] || '').toLowerCase();
      const subCategoryName = (
        item.subCategoryId ? subCategoriesMap[item.subCategoryId] || '' : ''
      ).toLowerCase();
      const versionNotes = item.versions.map((v) => v.note.toLowerCase()).join(' ');
      const searchableText = [
        item.title.toLowerCase(),
        item.description.toLowerCase(),
        item.content.toLowerCase(),
        categoryName,
        subCategoryName,
        item.tags.join(' ').toLowerCase(),
        versionNotes,
      ].join(' ');

      const matchesAllTokens = queryTokens.every((token) => searchableText.includes(token));
      if (!matchesAllTokens) return false;
    }

    return true;
  });

  // Sort results (Pinned items always stay at the top, then sort by selected field)
  return [...filtered].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1;
    }

    if (view === 'recent') {
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
    }

    switch (sortBy) {
      case 'usageCount':
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case 'createdAt':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'title':
        return a.title.localeCompare(b.title, 'zh-CN');
      case 'updatedAt':
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });
}

export interface TemplateSegment {
  type: 'text' | 'variable';
  value: string;
  rawVariable?: string;
  options?: string[];
  filled?: boolean;
}

/**
 * Splits a prompt template into plain text and variable segments so UI can highlight `{{变量}}`
 * or filled variable values cleanly without exposing raw `:选项A|选项B` syntax.
 */
export function tokenizeTemplateSegments(
  content: string,
  values?: Record<string, string>
): TemplateSegment[] {
  if (!content) return [];
  const regex = /\{\{\s*([^{}\n]+?)\s*\}\}/g;
  const segments: TemplateSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, match.index),
      });
    }
    const { name: varName, options } = parseRawVariableToken(match[1]);
    const filledValue = values?.[varName]?.trim();
    if (filledValue) {
      segments.push({
        type: 'variable',
        value: filledValue,
        rawVariable: varName,
        options,
        filled: true,
      });
    } else {
      segments.push({
        type: 'variable',
        value: `{{${varName}}}`,
        rawVariable: varName,
        options,
        filled: false,
      });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Clones an existing prompt as a clean v1 derivative so users can branch off scenarios effortlessly.
 */
export function duplicatePromptItem(
  source: PromptItem,
  nowIso: string = new Date().toISOString()
): PromptItem {
  return {
    ...source,
    id: `prompt-copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `${source.title} (副本)`,
    isPinned: false,
    usageCount: 0,
    lastUsedAt: undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    currentVersion: 1,
    versions: [
      {
        version: 1,
        content: source.content,
        note: `衍生自「${source.title}」v${source.currentVersion}`,
        createdAt: nowIso,
      },
    ],
    variableDefaults: source.variableDefaults
      ? { ...source.variableDefaults }
      : undefined,
    variablePresets: source.variablePresets
      ? source.variablePresets.map((preset) => ({
          ...preset,
          values: { ...preset.values },
        }))
      : undefined,
  };
}

/**
 * Applies an edit to an existing prompt.
 * When `content` changes (or `forceNewVersion` is true), records a new version in `versions` array
 * so multi-round prompt refinement is always preserved and traceable.
 */
export function applyPromptRevision(
  prompt: PromptItem,
  update: {
    title: string;
    description: string;
    content: string;
    categoryId: string;
    subCategoryId?: string;
    tags: string[];
    note?: string;
    forceNewVersion?: boolean;
    variableDefaults?: Record<string, string>;
  },
  nowIso: string = new Date().toISOString()
): PromptItem {
  const normalizedNewContent = update.content.replace(/\r\n/g, '\n').trim();
  const normalizedOldContent = prompt.content.replace(/\r\n/g, '\n').trim();
  const contentChanged = normalizedNewContent !== normalizedOldContent;

  const cleanedTags = normalizeTags(update.tags);

  if (contentChanged || update.forceNewVersion) {
    const maxExistingVersion = prompt.versions.reduce(
      (max, v) => (v.version > max ? v.version : max),
      prompt.currentVersion || 1
    );
    const nextVersionNumber = maxExistingVersion + 1;
    const newVersionEntry: PromptVersion = {
      version: nextVersionNumber,
      content: update.content,
      note: update.note?.trim() || `第 ${nextVersionNumber} 轮修改`,
      createdAt: nowIso,
    };

    return {
      ...prompt,
      title: update.title.trim(),
      description: update.description.trim(),
      content: update.content,
      categoryId: update.categoryId,
      subCategoryId: update.subCategoryId ?? prompt.subCategoryId,
      tags: cleanedTags,
      updatedAt: nowIso,
      currentVersion: nextVersionNumber,
      versions: [...prompt.versions, newVersionEntry],
      variableDefaults: update.variableDefaults ?? prompt.variableDefaults,
    };
  }

  // Metadata-only update (or note update on latest version)
  const updatedVersions = [...prompt.versions];
  if (update.note?.trim() && updatedVersions.length > 0) {
    const lastIdx = updatedVersions.length - 1;
    updatedVersions[lastIdx] = {
      ...updatedVersions[lastIdx],
      note: update.note.trim(),
    };
  }

  return {
    ...prompt,
    title: update.title.trim(),
    description: update.description.trim(),
    categoryId: update.categoryId,
    subCategoryId: update.subCategoryId ?? prompt.subCategoryId,
    tags: cleanedTags,
    updatedAt: nowIso,
    versions: updatedVersions,
    variableDefaults: update.variableDefaults ?? prompt.variableDefaults,
  };
}

/**
 * Restores a prompt to a previous version while preserving the full iteration history.
 */
export function restorePromptVersion(
  prompt: PromptItem,
  targetVersionNumber: number,
  nowIso: string = new Date().toISOString()
): PromptItem {
  const target = prompt.versions.find((v) => v.version === targetVersionNumber);
  if (!target) return prompt;

  if (target.content.trim() === prompt.content.trim()) {
    return prompt;
  }

  return applyPromptRevision(
    prompt,
    {
      title: prompt.title,
      description: prompt.description,
      content: target.content,
      categoryId: prompt.categoryId,
      subCategoryId: prompt.subCategoryId,
      tags: prompt.tags,
      note: `回滚自 v${targetVersionNumber}（${target.note}）`,
      forceNewVersion: true,
    },
    nowIso
  );
}

/**
 * Computes a clean, deterministic line-by-line diff (LCS-based) between two prompt versions.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.replace(/\r\n/g, '\n').split('\n');
  const newLines = newText.replace(/\r\n/g, '\n').split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({
        type: 'same',
        text: oldLines[i],
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({
        type: 'removed',
        text: oldLines[i],
        oldLineNumber: oldLineNum++,
      });
      i++;
    } else {
      result.push({
        type: 'added',
        text: newLines[j],
        newLineNumber: newLineNum++,
      });
      j++;
    }
  }

  while (i < m) {
    result.push({
      type: 'removed',
      text: oldLines[i],
      oldLineNumber: oldLineNum++,
    });
    i++;
  }

  while (j < n) {
    result.push({
      type: 'added',
      text: newLines[j],
      newLineNumber: newLineNum++,
    });
    j++;
  }

  return result;
}

/**
 * RFC-4180 compliant CSV parser that handles multiline quoted fields.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const text = csvText.replace(/\r\n/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nextCh = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && nextCh === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (ch === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function splitTwoLevelCategory(rawCategory?: string): {
  categoryName?: string;
  subCategoryName?: string;
} {
  if (!rawCategory) return {};
  const parts = String(rawCategory)
    .split(/[/／>]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { categoryName: parts[0], subCategoryName: parts[1] };
  }
  return { categoryName: parts[0] };
}

/**
 * Parses external prompts from JSON, CSV (including GitHub awesome-chatgpt-prompts `"act","prompt"`),
 * Markdown (`#` or `##` sections), or plain text. Supports `一级分类 / 二级子分类` notation.
 */
export function parseExternalPrompts(
  rawInput: string,
  formatHint: 'auto' | 'json' | 'csv' | 'markdown' = 'auto'
): ParsedImportResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      detectedFormat: 'text',
      items: [],
      errors: ['输入内容为空，请粘贴或选择有效的提示词文件。'],
    };
  }

  let format: 'json' | 'csv' | 'markdown' | 'text' = formatHint === 'auto' ? 'text' : formatHint;
  if (formatHint === 'auto') {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      format = 'json';
    } else if (
      /^"?(act|title|name|标题|名称)"?\s*,\s*"?(prompt|content|text|提示词|内容)"?/i.test(
        trimmed.split('\n')[0] || ''
      )
    ) {
      format = 'csv';
    } else if (/^#{1,3}\s+.+/m.test(trimmed)) {
      format = 'markdown';
    } else {
      format = 'text';
    }
  }

  if (format === 'json') {
    try {
      const parsed = JSON.parse(trimmed);
      const rawList = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.prompts)
        ? parsed.prompts
        : Array.isArray(parsed?.items)
        ? parsed.items
        : [parsed];

      const items: ImportedPromptDraft[] = [];
      for (const entry of rawList) {
        if (!entry || typeof entry !== 'object') continue;
        const title = String(
          entry.title || entry.name || entry.act || entry.role || '未命名导入提示词'
        ).trim();
        const content = String(
          entry.content || entry.prompt || entry.template || entry.text || entry.systemPrompt || ''
        ).trim();
        if (!content) continue;

        const description = String(
          entry.description || entry.scenario || entry.note || ''
        ).trim();

        const parsedCat = splitTwoLevelCategory(
          entry.categoryName || entry.category
        );
        const explicitSub = entry.subCategoryName || entry.subCategory;

        const rawTags = Array.isArray(entry.tags)
          ? entry.tags.map(String)
          : typeof entry.tags === 'string'
          ? entry.tags.split(/[,，\s#]+/)
          : [];

        const versions: PromptVersion[] | undefined = Array.isArray(entry.versions)
          ? entry.versions
              .filter((v: any) => v && typeof v.content === 'string')
              .map((v: any, idx: number) => ({
                version: Number(v.version) || idx + 1,
                content: String(v.content),
                note: String(v.note || `导入版本 v${idx + 1}`),
                createdAt: String(v.createdAt || new Date().toISOString()),
              }))
          : undefined;

        items.push({
          title,
          description,
          content,
          categoryName: parsedCat.categoryName,
          subCategoryName: explicitSub
            ? String(explicitSub).trim()
            : parsedCat.subCategoryName,
          tags: normalizeTags(rawTags),
          versions,
        });
      }

      if (items.length === 0) {
        return {
          detectedFormat: 'json',
          items: [],
          errors: ['JSON 解析成功，但未找到包含有效 content/prompt 字段的提示词条目。'],
        };
      }

      return { detectedFormat: 'json', items, errors: [] };
    } catch (err: any) {
      return {
        detectedFormat: 'json',
        items: [],
        errors: [`JSON 格式解析失败：${err?.message || '语法错误'}`],
      };
    }
  }

  if (format === 'csv') {
    const rows = parseCsvRows(trimmed);
    if (rows.length < 2) {
      return {
        detectedFormat: 'csv',
        items: [],
        errors: ['CSV 内容至少需要包含表头行和一行数据。'],
      };
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const titleIdx = headers.findIndex((h) =>
      ['act', 'title', 'name', 'role', '标题', '名称', '角色'].includes(h)
    );
    const contentIdx = headers.findIndex((h) =>
      ['prompt', 'content', 'text', 'template', '提示词', '内容'].includes(h)
    );
    const descIdx = headers.findIndex((h) =>
      ['description', 'scenario', 'note', '描述', '场景', '说明'].includes(h)
    );
    const catIdx = headers.findIndex((h) =>
      ['category', 'folder', 'group', '分类', '类别'].includes(h)
    );
    const subCatIdx = headers.findIndex((h) =>
      ['subcategory', 'sub_category', '二级分类', '子分类'].includes(h)
    );
    const tagsIdx = headers.findIndex((h) => ['tags', 'tag', '标签'].includes(h));

    const resolvedTitleIdx = titleIdx >= 0 ? titleIdx : 0;
    const resolvedContentIdx = contentIdx >= 0 ? contentIdx : headers.length > 1 ? 1 : 0;

    const items: ImportedPromptDraft[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const content = (row[resolvedContentIdx] || '').trim();
      if (!content) continue;
      const title = (row[resolvedTitleIdx] || `导入提示词 #${i}`).trim();
      const description = descIdx >= 0 ? (row[descIdx] || '').trim() : '';
      const rawCat = catIdx >= 0 ? (row[catIdx] || '').trim() : undefined;
      const parsedCat = splitTwoLevelCategory(rawCat);
      const explicitSub =
        subCatIdx >= 0 ? (row[subCatIdx] || '').trim() : undefined;

      const tagsRaw =
        tagsIdx >= 0 && row[tagsIdx] ? row[tagsIdx].split(/[,，;；\s#]+/) : [];

      items.push({
        title,
        description,
        content,
        categoryName: parsedCat.categoryName,
        subCategoryName: explicitSub || parsedCat.subCategoryName,
        tags: normalizeTags(tagsRaw),
      });
    }

    return {
      detectedFormat: 'csv',
      items,
      errors: items.length === 0 ? ['未在 CSV 中解析到有效的提示词数据行。'] : [],
    };
  }

  if (format === 'markdown') {
    const lines = trimmed.replace(/\r\n/g, '\n').split('\n');
    const items: ImportedPromptDraft[] = [];

    let currentTitle = '';
    let currentLines: string[] = [];

    const flushSection = () => {
      const rawBody = currentLines.join('\n').trim();
      if (!currentTitle && !rawBody) return;

      let description = '';
      let categoryName: string | undefined;
      let subCategoryName: string | undefined;
      const tags: string[] = [];
      const bodyLines: string[] = [];

      for (const line of rawBody.split('\n')) {
        const tagMatch = line.match(/^(?:标签|Tags?)\s*[:：]\s*(.+)$/i);
        const catMatch = line.match(/^(?:分类|Category)\s*[:：]\s*(.+)$/i);
        const descMatch = line.match(/^(?:场景|描述|说明|Description)\s*[:：]\s*(.+)$/i);

        if (tagMatch) {
          tags.push(...tagMatch[1].split(/[,，\s#]+/));
        } else if (catMatch) {
          const split = splitTwoLevelCategory(catMatch[1].trim());
          categoryName = split.categoryName;
          subCategoryName = split.subCategoryName;
        } else if (descMatch && !description) {
          description = descMatch[1].trim();
        } else {
          bodyLines.push(line);
        }
      }

      let finalContent = bodyLines.join('\n').trim();
      const codeBlockMatch = finalContent.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
      if (codeBlockMatch) {
        finalContent = codeBlockMatch[1].trim();
      }

      if (finalContent) {
        items.push({
          title: currentTitle || finalContent.slice(0, 28) + (finalContent.length > 28 ? '...' : ''),
          description,
          content: finalContent,
          categoryName,
          subCategoryName,
          tags: normalizeTags(tags),
        });
      }
    };

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
      if (headingMatch) {
        flushSection();
        currentTitle = headingMatch[1].trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
    flushSection();

    return {
      detectedFormat: 'markdown',
      items,
      errors: items.length === 0 ? ['未在 Markdown 中识别到有效的提示词章节。'] : [],
    };
  }

  const blocks = trimmed
    .split(/\n\s*---+\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const items: ImportedPromptDraft[] = blocks.map((block, index) => {
    const firstLine = block.split('\n')[0].trim();
    const hasShortFirstLine = block.includes('\n') && firstLine.length <= 45;
    const title = hasShortFirstLine
      ? firstLine.replace(/^[-*•#\s]+/, '')
      : `导入提示词 #${index + 1}`;
    const content = hasShortFirstLine
      ? block.split('\n').slice(1).join('\n').trim()
      : block;

    return {
      title,
      description: '外部文本导入',
      content: content || block,
      tags: ['外部导入'],
    };
  });

  return {
    detectedFormat: 'text',
    items,
    errors: [],
  };
}
