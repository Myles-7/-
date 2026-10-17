import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  FileText,
  Check,
  AlertCircle,
  Copy,
} from 'lucide-react';
import type { Category, ImportedPromptDraft, PromptItem } from '../types/prompt';
import { parseExternalPrompts } from '../utils/promptLogic';
import { EXTERNAL_IMPORT_TEMPLATES } from '../data/seedPrompts';

interface ImportExportModalProps {
  initialTab: 'import' | 'export';
  prompts: PromptItem[];
  categories: Category[];
  onClose: () => void;
  onImportPrompts: (
    drafts: ImportedPromptDraft[],
    fallbackCategoryId: string
  ) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  initialTab,
  prompts,
  categories,
  onClose,
  onImportPrompts,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>(initialTab);
  const [rawInput, setRawInput] = useState('');
  const [formatHint, setFormatHint] = useState<
    'auto' | 'json' | 'csv' | 'markdown'
  >('auto');
  const [fallbackCategoryId, setFallbackCategoryId] = useState(
    categories.find((c) => c.id === 'cat-imported')?.id ||
      categories[0]?.id ||
      'cat-coding'
  );
  const [copiedBackup, setCopiedBackup] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedResult = useMemo(() => {
    if (!rawInput.trim()) return null;
    return parseExternalPrompts(rawInput, formatHint);
  }, [rawInput, formatHint]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.csv')) setFormatHint('csv');
    else if (file.name.endsWith('.json')) setFormatHint('json');
    else if (file.name.endsWith('.md')) setFormatHint('markdown');
    else setFormatHint('auto');

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawInput(reader.result);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmImport = () => {
    if (!parsedResult || parsedResult.items.length === 0) return;
    onImportPrompts(parsedResult.items, fallbackCategoryId);
    onClose();
  };

  const generateJsonBackup = () => {
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    const payload = {
      app: 'PromptVault',
      exportedAt: new Date().toISOString(),
      categories,
      prompts: prompts.map((p) => ({
        ...p,
        categoryName: catMap[p.categoryId] || '未分类',
      })),
    };
    return JSON.stringify(payload, null, 2);
  };

  const generateMarkdownExport = () => {
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    return prompts
      .map((p) => {
        const lines = [
          `## ${p.title}`,
          `分类: ${catMap[p.categoryId] || '未分类'}`,
        ];
        if (p.tags.length > 0) {
          lines.push(`标签: ${p.tags.map((t) => `#${t}`).join(' ')}`);
        }
        if (p.description) {
          lines.push(`场景: ${p.description}`);
        }
        lines.push('', p.content, '');
        return lines.join('\n');
      })
      .join('\n---\n\n');
  };

  const downloadFile = (
    filename: string,
    content: string,
    mimeType: string
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyBackup = async () => {
    const json = generateJsonBackup();
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = json;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-export-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2
              id="import-export-modal-title"
              className="text-base font-bold text-slate-900"
            >
              外部提示词导入与本地备份
            </h2>
            <div
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'import'}
                onClick={() => setActiveTab('import')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'import'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                导入外部提示词
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'export'}
                onClick={() => setActiveTab('export')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'export'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                导出与本地备份
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭导入导出弹窗"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'import' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600">
                  支持直接粘贴或上传 <strong>GitHub CSV (act,prompt)</strong>、
                  <strong>Markdown 笔记 (## 标题)</strong> 或 <strong>JSON</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv,.md,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>选择本地文件 (.json / .csv / .md)</span>
                  </button>
                </div>
              </div>

              {/* One-click Sample Template Loaders */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-medium text-slate-500">
                  一键填充外部格式示例：
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFormatHint('csv');
                    setRawInput(EXTERNAL_IMPORT_TEMPLATES.githubCsv);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-md transition-colors whitespace-nowrap"
                >
                  GitHub CSV 格式示例
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormatHint('markdown');
                    setRawInput(EXTERNAL_IMPORT_TEMPLATES.markdownNotes);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-md transition-colors whitespace-nowrap"
                >
                  Markdown 批量笔记示例
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormatHint('json');
                    setRawInput(EXTERNAL_IMPORT_TEMPLATES.jsonFormat);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-md transition-colors whitespace-nowrap"
                >
                  JSON 数组示例
                </button>
              </div>

              {/* Format & Category Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="import-format-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    解析格式识别
                  </label>
                  <select
                    id="import-format-select"
                    value={formatHint}
                    onChange={(e) =>
                      setFormatHint(
                        e.target.value as 'auto' | 'json' | 'csv' | 'markdown'
                      )
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
                  >
                    <option value="auto">自动识别格式 (推荐)</option>
                    <option value="csv">
                      CSV 表格 (兼容 GitHub awesome-chatgpt-prompts)
                    </option>
                    <option value="markdown">
                      Markdown 标题分段 (## 提示词标题)
                    </option>
                    <option value="json">JSON 数组或备份文件</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="import-category-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    默认归入分类（若条目未自带分类）
                  </label>
                  <select
                    id="import-category-select"
                    value={fallbackCategoryId}
                    onChange={(e) => setFallbackCategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Raw Input Area */}
              <div>
                <label
                  htmlFor="import-raw-textarea"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  粘贴外部提示词文本或文件内容
                </label>
                <textarea
                  id="import-raw-textarea"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  rows={7}
                  placeholder="在此粘贴 JSON、CSV、Markdown 笔记或单条提示词内容..."
                  className="w-full p-3 text-xs font-mono leading-relaxed bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 text-slate-900"
                />
              </div>

              {/* Live Parsed Preview */}
              {parsedResult && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  {parsedResult.errors.length > 0 ? (
                    <div className="flex items-center gap-2 text-xs text-red-600">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{parsedResult.errors[0]}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">
                          解析成功：共识别到{' '}
                          <span className="font-mono text-blue-600 tabular-nums">
                            {parsedResult.items.length}
                          </span>{' '}
                          条提示词（格式：{parsedResult.detectedFormat.toUpperCase()}）
                        </span>
                      </div>
                      <div className="max-h-36 overflow-y-auto divide-y divide-slate-200/70 border border-slate-200 rounded-lg bg-white">
                        {parsedResult.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-slate-900">
                                {item.title}
                              </span>
                              <span className="text-slate-400 mx-1.5">·</span>
                              <span className="text-slate-500 truncate">
                                {item.content.slice(0, 50)}...
                              </span>
                            </div>
                            <span className="text-slate-400 shrink-0 font-mono text-[11px]">
                              {item.categoryName || '默认分类'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!parsedResult || parsedResult.items.length === 0}
                  onClick={handleConfirmImport}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    确认导入{' '}
                    {parsedResult && parsedResult.items.length > 0
                      ? `(${parsedResult.items.length} 条)`
                      : ''}
                  </span>
                </button>
              </div>
            </>
          ) : (
            /* Export & Backup Tab */
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      1. 完整 JSON 备份（含全部分类与多轮历史版本）
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      包含您当前的 {prompts.length} 条提示词、所有历史迭代版本以及分类目录，可随时在新设备或浏览器中完整恢复。
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyBackup}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {copiedBackup ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>已复制 JSON</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>复制 JSON</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadFile(
                          `promptvault-backup-${new Date()
                            .toISOString()
                            .slice(0, 10)}.json`,
                          generateJsonBackup(),
                          'application/json;charset=utf-8'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>下载 JSON 备份</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    2. 导出为 Markdown 提示词手册 (.md)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    生成排版清晰的 Markdown 文档，适合直接放入 Obsidian、Notion 或 Git 仓库留存阅读。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      `promptvault-handbook-${new Date()
                        .toISOString()
                        .slice(0, 10)}.md`,
                      generateMarkdownExport(),
                      'text/markdown;charset=utf-8'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>导出 Markdown</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
