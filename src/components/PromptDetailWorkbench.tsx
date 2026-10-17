import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Copy,
  Check,
  Edit3,
  History,
  Sliders,
  Star,
  Trash2,
  RotateCcw,
  GitCompare,
  X,
  RefreshCw,
  Pin,
  CopyPlus,
  BookmarkCheck,
  Layers,
  Plus,
  Braces,
} from 'lucide-react';
import type { Category, PromptItem, PromptSnippet } from '../types/prompt';
import {
  extractVariableDescriptors,
  interpolatePrompt,
  computeLineDiff,
  tokenizeTemplateSegments,
} from '../utils/promptLogic';
import { SnippetPickerPopover } from './SnippetPickerPopover';

interface PromptDetailWorkbenchProps {
  prompt: PromptItem;
  categories: Category[];
  snippets: PromptSnippet[];
  rememberedVars?: Record<string, string>;
  onUpdateRememberedVars: (
    promptId: string,
    values: Record<string, string>
  ) => void;
  onSaveVariableDefaults: (
    promptId: string,
    defaults: Record<string, string>
  ) => void;
  onSaveVariablePreset: (
    promptId: string,
    presetName: string,
    values: Record<string, string>
  ) => void;
  onDeleteVariablePreset: (promptId: string, presetId: string) => void;
  onAddSnippet: (data: {
    title: string;
    category: PromptSnippet['category'];
    content: string;
  }) => void;
  onDeleteSnippet: (snippetId: string) => void;
  onClose: () => void;
  onEditPrompt: (prompt: PromptItem) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDuplicatePrompt: (prompt: PromptItem) => void;
  onDeletePrompt: (id: string) => void;
  onRecordUsage: (id: string) => void;
  onRestoreVersion: (promptId: string, versionNumber: number) => void;
  onSaveQuickIteration: (
    promptId: string,
    newContent: string,
    note: string
  ) => void;
}

export const PromptDetailWorkbench: React.FC<PromptDetailWorkbenchProps> = ({
  prompt,
  categories,
  snippets,
  rememberedVars,
  onUpdateRememberedVars,
  onSaveVariableDefaults,
  onSaveVariablePreset,
  onDeleteVariablePreset,
  onAddSnippet,
  onDeleteSnippet,
  onClose,
  onEditPrompt,
  onToggleFavorite,
  onTogglePin,
  onDuplicatePrompt,
  onDeletePrompt,
  onRecordUsage,
  onRestoreVersion,
  onSaveQuickIteration,
}) => {
  const [activeTab, setActiveTab] = useState<'use' | 'history'>('use');
  const [copiedState, setCopiedState] = useState<'assembled' | 'raw' | null>(
    null
  );

  // Quick inline iteration state
  const [isQuickEditing, setIsQuickEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(prompt.content);
  const [draftNote, setDraftNote] = useState('');
  const quickTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Variable preset creation state
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // History inspection state
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<number>(
    prompt.currentVersion
  );
  const [showDiff, setShowDiff] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const variableDescriptors = useMemo(
    () => extractVariableDescriptors(prompt.content),
    [prompt.content]
  );

  const variables = useMemo(
    () => variableDescriptors.map((d) => d.name),
    [variableDescriptors]
  );

  // Merge defaults (or first enum option) with remembered session values
  const variableValues = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const desc of variableDescriptors) {
      const v = desc.name;
      if (rememberedVars?.[v] !== undefined) {
        merged[v] = rememberedVars[v];
      } else if (prompt.variableDefaults?.[v] !== undefined) {
        merged[v] = prompt.variableDefaults[v];
      } else if (desc.options && desc.options.length > 0) {
        merged[v] = desc.options[0];
      } else {
        merged[v] = '';
      }
    }
    return merged;
  }, [variableDescriptors, rememberedVars, prompt.variableDefaults]);

  const handleVarChange = (varName: string, val: string) => {
    onUpdateRememberedVars(prompt.id, {
      ...variableValues,
      [varName]: val,
    });
  };

  const handleApplyPreset = (presetValues: Record<string, string>) => {
    onUpdateRememberedVars(prompt.id, {
      ...variableValues,
      ...presetValues,
    });
  };

  const handleCreatePreset = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    onSaveVariablePreset(prompt.id, trimmed, variableValues);
    setNewPresetName('');
    setIsAddingPreset(false);
  };

  useEffect(() => {
    setDraftContent(prompt.content);
    setDraftNote('');
    setIsQuickEditing(false);
    setIsAddingPreset(false);
    setNewPresetName('');
    setSelectedHistoryVersion(prompt.currentVersion);
    setConfirmDelete(false);
  }, [prompt.id, prompt.content, prompt.currentVersion]);

  const assembledPrompt = useMemo(
    () => interpolatePrompt(prompt.content, variableValues, true),
    [prompt.content, variableValues]
  );

  const previewSegments = useMemo(
    () => tokenizeTemplateSegments(prompt.content, variableValues),
    [prompt.content, variableValues]
  );

  const unfilledCount = useMemo(
    () =>
      variables.filter((v) => !variableValues[v] || !variableValues[v].trim())
        .length,
    [variables, variableValues]
  );

  const categoryObj = categories.find((c) => c.id === prompt.categoryId);
  const categoryName = categoryObj?.name || '未分类';
  const subCategoryName = prompt.subCategoryId
    ? categoryObj?.subCategories?.find((s) => s.id === prompt.subCategoryId)?.name
    : undefined;

  const handleCopy = async (text: string, type: 'assembled' | 'raw') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    onRecordUsage(prompt.id);
    setCopiedState(type);
    setTimeout(() => setCopiedState(null), 1800);
  };

  const handleInsertQuickText = (snippetText: string) => {
    const el = quickTextareaRef.current;
    if (!el) {
      setDraftContent((prev) => `${prev}${snippetText}`);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const next =
      draftContent.slice(0, start) + snippetText + draftContent.slice(end);
    setDraftContent(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(
        start + snippetText.length,
        start + snippetText.length
      );
    }, 0);
  };

  const handleQuickSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftContent.trim()) return;
    onSaveQuickIteration(
      prompt.id,
      draftContent,
      draftNote.trim() || `第 ${prompt.currentVersion + 1} 轮调优修改`
    );
    setIsQuickEditing(false);
    setDraftNote('');
  };

  const sortedVersions = useMemo(
    () => [...prompt.versions].sort((a, b) => b.version - a.version),
    [prompt.versions]
  );

  const activeVersionObj =
    sortedVersions.find((v) => v.version === selectedHistoryVersion) ||
    sortedVersions[0];

  const previousVersionObj = useMemo(() => {
    if (!activeVersionObj) return null;
    const asc = [...prompt.versions].sort((a, b) => a.version - b.version);
    const idx = asc.findIndex((v) => v.version === activeVersionObj.version);
    return idx > 0 ? asc[idx - 1] : null;
  }, [prompt.versions, activeVersionObj]);

  const diffLines = useMemo(() => {
    if (!activeVersionObj || !previousVersionObj) return [];
    return computeLineDiff(previousVersionObj.content, activeVersionObj.content);
  }, [activeVersionObj, previousVersionObj]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(d.getDate()).padStart(2, '0')} ${String(
        d.getHours()
      ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  };

  const presets = prompt.variablePresets || [];

  return (
    <section
      aria-label="提示词详情与多轮调试工作台"
      className="w-full lg:w-[420px] xl:w-[460px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full"
    >
      {/* Top Header */}
      <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Unboxed clean metadata line (Zero-Pill Discipline) */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mb-1.5">
            {prompt.isPinned && (
              <>
                <span className="font-semibold text-blue-600">已置顶</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="font-medium text-slate-700">
              {categoryName}
              {subCategoryName ? ` / ${subCategoryName}` : ''}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              v{prompt.currentVersion}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              已使用 {prompt.usageCount} 次
            </span>
            {prompt.tags.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-500">
                  {prompt.tags.map((t) => `#${t}`).join(' ')}
                </span>
              </>
            )}
          </div>
          <h2 className="text-lg font-bold text-slate-900 leading-snug">
            {prompt.title}
          </h2>
          {prompt.description && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {prompt.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onTogglePin(prompt.id)}
            aria-label={prompt.isPinned ? '取消置顶' : '置顶该提示词'}
            title={prompt.isPinned ? '取消置顶' : '置顶到列表顶部'}
            className={`p-2 rounded-lg transition-colors ${
              prompt.isPinned
                ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Pin className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onToggleFavorite(prompt.id)}
            aria-label={prompt.isFavorite ? '取消收藏' : '加入常用收藏'}
            title={prompt.isFavorite ? '取消收藏' : '加入常用收藏'}
            className={`p-2 rounded-lg transition-colors ${
              prompt.isFavorite
                ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Star
              className="w-4 h-4"
              fill={prompt.isFavorite ? 'currentColor' : 'none'}
            />
          </button>
          <button
            type="button"
            onClick={() => onDuplicatePrompt(prompt)}
            aria-label="克隆衍生新提示词"
            title="克隆为新提示词副本"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <CopyPlus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onEditPrompt(prompt)}
            aria-label="完整编辑提示词"
            title="完整编辑"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭详情面板"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mode Switch Tabs */}
      <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'use'}
            onClick={() => setActiveTab('use')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'use'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>使用与调优</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>多轮修改记录</span>
            <span className="font-mono tabular-nums text-[11px] opacity-75">
              ({prompt.versions.length})
            </span>
          </button>
        </div>

        {activeTab === 'use' && !isQuickEditing && (
          <button
            type="button"
            onClick={() => {
              setDraftContent(prompt.content);
              setIsQuickEditing(true);
            }}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>直接修改迭代</span>
          </button>
        )}
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {activeTab === 'use' ? (
          <>
            {/* Quick Inline Multi-Round Iteration Editor with Snippets & Enum Variable Helpers */}
            {isQuickEditing ? (
              <form onSubmit={handleQuickSave} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="quick-edit-textarea"
                    className="text-xs font-semibold text-slate-700"
                  >
                    修改正文（保存后生成 v{prompt.currentVersion + 1}）
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleInsertQuickText('{{变量名:选项A|选项B}}')
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                    >
                      <Braces className="w-3 h-3" />
                      <span>+ 枚举变量</span>
                    </button>
                    <SnippetPickerPopover
                      snippets={snippets}
                      onInsertSnippet={handleInsertQuickText}
                      onAddSnippet={onAddSnippet}
                      onDeleteSnippet={onDeleteSnippet}
                    />
                  </div>
                </div>
                <textarea
                  id="quick-edit-textarea"
                  ref={quickTextareaRef}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  rows={11}
                  className="w-full p-3.5 text-sm leading-relaxed bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600 font-sans text-slate-900"
                />
                <div>
                  <label
                    htmlFor="quick-edit-note"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    本轮修改说明（便于日后对比回溯）
                  </label>
                  <input
                    id="quick-edit-note"
                    type="text"
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    placeholder={`例如：第 ${
                      prompt.currentVersion + 1
                    } 轮：补充输出格式约束与反例说明`}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsQuickEditing(false)}
                    className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    保存为新版本 (v{prompt.currentVersion + 1})
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* 1. Primary Full-Text Prompt Reader & Live Interpolated Preview (Placed at the very top for immediate reading) */}
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 overflow-hidden shadow-2xs">
                  <div className="px-3.5 py-2.5 bg-slate-100/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        提示词全文与实时合成预览
                      </span>
                      {variables.length > 0 && (
                        <span className="text-[11px] font-mono tabular-nums text-blue-700 bg-blue-50 border border-blue-200/70 px-1.5 py-0.5 rounded">
                          已填 {variables.length - unfilledCount}/{variables.length} 变量
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {assembledPrompt.split('\n').length} 行 · {assembledPrompt.length} 字
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(assembledPrompt, 'assembled')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap ${
                          copiedState === 'assembled'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {copiedState === 'assembled' ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>已复制全文</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>复制全文</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div
                    data-testid="workbench-full-prompt-reader"
                    className="p-4 text-[14px] leading-[1.72] text-slate-800 whitespace-pre-wrap break-words font-sans select-all bg-white/90"
                  >
                    {previewSegments.map((seg, idx) =>
                      seg.type === 'text' ? (
                        <React.Fragment key={idx}>{seg.value}</React.Fragment>
                      ) : seg.filled ? (
                        <span
                          key={idx}
                          className="text-blue-700 font-semibold bg-blue-50/90 px-1 py-0.5 rounded underline decoration-blue-300 decoration-dashed underline-offset-4"
                        >
                          {seg.value}
                        </span>
                      ) : (
                        <span
                          key={idx}
                          className="font-mono text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded text-xs"
                        >
                          {seg.value}
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* 2. Dynamic Variables Fill-in Section with Multi-Presets & Enum Option Selectors */}
                {variableDescriptors.length > 0 && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        变量快速填充 ({variables.length - unfilledCount}/
                        {variables.length} 已填)
                      </span>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setIsAddingPreset((v) => !v)}
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 whitespace-nowrap font-medium"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>存为预设方案</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onSaveVariableDefaults(prompt.id, variableValues)
                          }
                          className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 whitespace-nowrap font-medium"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          <span>存为默认</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const cleared: Record<string, string> = {};
                            variables.forEach((v) => (cleared[v] = ''));
                            onUpdateRememberedVars(prompt.id, cleared);
                          }}
                          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 whitespace-nowrap"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>清空</span>
                        </button>
                      </div>
                    </div>

                    {/* Multi-Preset Switcher Bar */}
                    {(presets.length > 0 || isAddingPreset) && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mr-1">
                            <Layers className="w-3 h-3" />
                            <span>参数预设:</span>
                          </span>
                          {presets.map((preset) => {
                            const isPresetActive = Object.entries(
                              preset.values
                            ).every(([k, val]) => variableValues[k] === val);
                            return (
                              <div
                                key={preset.id}
                                className={`inline-flex items-center rounded-md text-xs font-medium transition-colors ${
                                  isPresetActive
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplyPreset(preset.values)
                                  }
                                  className="px-2.5 py-1 whitespace-nowrap"
                                >
                                  {preset.name}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onDeleteVariablePreset(prompt.id, preset.id)
                                  }
                                  aria-label={`删除预设 ${preset.name}`}
                                  className={`pr-1.5 pl-0.5 py-1 opacity-70 hover:opacity-100 ${
                                    isPresetActive
                                      ? 'text-blue-100 hover:text-white'
                                      : 'text-slate-400 hover:text-red-600'
                                  }`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {isAddingPreset && (
                          <form
                            onSubmit={handleCreatePreset}
                            className="flex items-center gap-1.5"
                          >
                            <input
                              type="text"
                              value={newPresetName}
                              onChange={(e) => setNewPresetName(e.target.value)}
                              placeholder="输入当前参数组合的预设名称（如：Node 生产环境）..."
                              aria-label="新参数预设名称"
                              className="flex-1 px-2.5 py-1 text-xs bg-white border border-blue-500 rounded-md focus:outline-none text-slate-900"
                              autoFocus
                            />
                            <button
                              type="submit"
                              className="px-3 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md shrink-0"
                            >
                              保存预设
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingPreset(false);
                                setNewPresetName('');
                              }}
                              className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 rounded-md shrink-0"
                            >
                              取消
                            </button>
                          </form>
                        )}
                      </div>
                    )}

                    {/* Variable Fields (with Enum Quick-Select Options) */}
                    <div className="space-y-3">
                      {variableDescriptors.map((desc) => {
                        const varName = desc.name;
                        const hasEnumOptions =
                          desc.options && desc.options.length > 0;
                        const isLongField =
                          !hasEnumOptions &&
                          /代码|原文|记录|流水|日志|内容|段落|DDL|描述|文本/i.test(
                            varName
                          );
                        const currentVal = variableValues[varName] || '';

                        return (
                          <div key={varName} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor={`var-input-${varName}`}
                                className="block text-xs font-medium text-slate-700 font-mono"
                              >
                                &#123;&#123;{varName}&#125;&#125;
                              </label>
                              {hasEnumOptions && (
                                <span className="text-[11px] text-blue-600 font-medium">
                                  可点选枚举项或自定义输入
                                </span>
                              )}
                            </div>

                            {/* Enum Option Buttons */}
                            {hasEnumOptions && (
                              <div
                                className="flex flex-wrap gap-1.5"
                                role="group"
                                aria-label={`${varName} 枚举可选项`}
                              >
                                {desc.options!.map((opt) => {
                                  const isSelectedOpt = currentVal === opt;
                                  return (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() =>
                                        handleVarChange(varName, opt)
                                      }
                                      className={`px-2.5 py-1 text-xs rounded-md transition-colors text-left ${
                                        isSelectedOpt
                                          ? 'bg-blue-600 text-white font-medium shadow-2xs'
                                          : 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-100'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {isLongField ? (
                              <textarea
                                id={`var-input-${varName}`}
                                rows={3}
                                value={currentVal}
                                onChange={(e) =>
                                  handleVarChange(varName, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (
                                    (e.metaKey || e.ctrlKey) &&
                                    e.key === 'Enter'
                                  ) {
                                    e.preventDefault();
                                    handleCopy(assembledPrompt, 'assembled');
                                  }
                                }}
                                placeholder={`在此填入 ${varName}（按 ⌘+Enter 可直接复制合成结果）...`}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900 leading-relaxed"
                              />
                            ) : (
                              <input
                                id={`var-input-${varName}`}
                                type="text"
                                value={currentVal}
                                onChange={(e) =>
                                  handleVarChange(varName, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (
                                    (e.metaKey || e.ctrlKey) &&
                                    e.key === 'Enter'
                                  ) {
                                    e.preventDefault();
                                    handleCopy(assembledPrompt, 'assembled');
                                  }
                                }}
                                placeholder={
                                  hasEnumOptions
                                    ? `可点选上方选项，或直接输入自定义 ${varName}...`
                                    : `在此填入 ${varName}...`
                                }
                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          /* Version History & Multi-Round Refinement Tab */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                共经历 {prompt.versions.length} 轮修改演进
              </span>
              {previousVersionObj && (
                <button
                  type="button"
                  onClick={() => setShowDiff((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    showDiff
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>{showDiff ? '显示变更对比 (Diff)' : '仅看完整正文'}</span>
                </button>
              )}
            </div>

            {/* Version Timeline Selector */}
            <div className="space-y-1.5" role="list" aria-label="历史版本列表">
              {sortedVersions.map((ver) => {
                const isSelected = ver.version === activeVersionObj?.version;
                const isCurrent = ver.version === prompt.currentVersion;
                return (
                  <div
                    key={ver.version}
                    role="listitem"
                    className={`p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-blue-50/50 border-blue-200'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryVersion(ver.version)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            v{ver.version}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="font-medium text-slate-800 truncate">
                            {ver.note}
                          </span>
                          {isCurrent && (
                            <>
                              <span
                                aria-hidden="true"
                                className="text-slate-300"
                              >
                                ·
                              </span>
                              <span className="text-blue-600 font-medium">
                                当前使用中
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                          {formatDate(ver.createdAt)} · {ver.content.length} 字符
                        </div>
                      </button>

                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() =>
                            onRestoreVersion(prompt.id, ver.version)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>回滚至此版</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Version Content or Diff View */}
            {activeVersionObj && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    正在查看{' '}
                    <strong className="font-mono">
                      v{activeVersionObj.version}
                    </strong>
                    {previousVersionObj && showDiff
                      ? `（对比上一版 v${previousVersionObj.version} 的修改差异）`
                      : ' 完整内容'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeVersionObj.content, 'raw')}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    复制 v{activeVersionObj.version} 内容
                  </button>
                </div>

                {previousVersionObj && showDiff ? (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs leading-relaxed space-y-0.5 overflow-x-auto">
                    {diffLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`px-2 py-0.5 rounded-xs whitespace-pre-wrap break-words ${
                          line.type === 'added'
                            ? 'bg-emerald-50 text-emerald-900'
                            : line.type === 'removed'
                            ? 'bg-red-50 text-red-800 line-through opacity-75'
                            : 'text-slate-700'
                        }`}
                      >
                        <span className="inline-block w-4 select-none opacity-60">
                          {line.type === 'added'
                            ? '+'
                            : line.type === 'removed'
                            ? '-'
                            : ' '}
                        </span>
                        {line.text || ' '}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
                    {activeVersionObj.content}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleCopy(assembledPrompt, 'assembled')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            {copiedState === 'assembled' ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>已复制提示词</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>
                  {variables.length > 0 ? '复制合成后提示词' : '一键复制提示词'}
                </span>
              </>
            )}
          </button>

          {variables.length > 0 && (
            <button
              type="button"
              onClick={() => handleCopy(prompt.content, 'raw')}
              className="px-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              {copiedState === 'raw' ? '已复制模板' : '复制原始模板'}
            </button>
          )}
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDeletePrompt(prompt.id)}
              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md whitespace-nowrap"
            >
              确认删除
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-md whitespace-nowrap"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`删除提示词 ${prompt.title}`}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </section>
  );
};
