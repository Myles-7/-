import type {
  PromptItem,
  PromptVersion,
  PromptVariableDescriptor,
  FilterOptions,
  DiffLine,
  ImportedPromptDraft,
  ParsedImportResult,
} from '../types/prompt.ts';

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
