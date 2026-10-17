import React, { useState, useMemo, useRef } from 'react';
import { X, Plus, Braces, ListFilter } from 'lucide-react';
import type { Category, PromptItem, PromptSnippet } from '../types/prompt';
import { extractVariableDescriptors, normalizeTags } from '../utils/promptLogic';
import { SnippetPickerPopover } from './SnippetPickerPopover';

interface PromptEditorModalProps {
  initialPrompt?: PromptItem | null;
  categories: Category[];
  existingTags: string[];
  snippets: PromptSnippet[];
  defaultCategoryId?: string;
  defaultSubCategoryId?: string;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    title: string;
    description: string;
    content: string;
    categoryId: string;
    subCategoryId?: string;
    tags: string[];
    note?: string;
    variableDefaults?: Record<string, string>;
  }) => void;
  onAddCategory: (name: string) => string;
  onAddSubCategory: (parentCategoryId: string, subName: string) => string;
  onAddSnippet: (data: {
    title: string;
    category: PromptSnippet['category'];
    content: string;
  }) => void;
  onDeleteSnippet: (snippetId: string) => void;
}

export const PromptEditorModal: React.FC<PromptEditorModalProps> = ({
  initialPrompt,
  categories,
  existingTags,
  snippets,
  defaultCategoryId,
  defaultSubCategoryId,
  onClose,
  onSave,
  onAddCategory,
  onAddSubCategory,
  onAddSnippet,
  onDeleteSnippet,
}) => {
  const isEditing = Boolean(initialPrompt);

  const initialCatId =
    initialPrompt?.categoryId ||
    (defaultCategoryId && defaultCategoryId !== 'all'
      ? defaultCategoryId
      : categories[0]?.id || 'cat-coding');

  const [title, setTitle] = useState(initialPrompt?.title || '');
  const [description, setDescription] = useState(
    initialPrompt?.description || ''
  );
  const [categoryId, setCategoryId] = useState(initialCatId);

  const activeCategoryObj = useMemo(
    () => categories.find((c) => c.id === categoryId) || categories[0],
    [categories, categoryId]
  );

  const [subCategoryId, setSubCategoryId] = useState<string>(() => {
    if (initialPrompt?.subCategoryId) return initialPrompt.subCategoryId;
    if (defaultSubCategoryId && defaultSubCategoryId !== 'all') {
      return defaultSubCategoryId;
    }
    const cat = categories.find((c) => c.id === initialCatId);
    return cat?.subCategories?.[0]?.id || '';
  });

  const [tagsInput, setTagsInput] = useState(
    initialPrompt?.tags.join(', ') || ''
  );
  const [content, setContent] = useState(initialPrompt?.content || '');
  const [note, setNote] = useState('');
  const [variableDefaults, setVariableDefaults] = useState<
    Record<string, string>
  >(initialPrompt?.variableDefaults || {});
  const [error, setError] = useState('');

  // Inline new category / sub-category creation inside modal
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewSubInput, setShowNewSubInput] = useState(false);
  const [newSubName, setNewSubName] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const detectedVariableDescriptors = useMemo(
    () => extractVariableDescriptors(content),
    [content]
  );

  const parsedTags = useMemo(
    () => normalizeTags(tagsInput.split(/[,，;；\s#]+/)),
    [tagsInput]
  );

  const handleCategoryChange = (nextCatId: string) => {
    setCategoryId(nextCatId);
    const nextCat = categories.find((c) => c.id === nextCatId);
    setSubCategoryId(nextCat?.subCategories?.[0]?.id || '');
  };

  const insertAtCursor = (placeholder: string, selectStartOffset = 0, selectEndOffset = 0) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) => `${prev}${placeholder}`);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const next = content.slice(0, start) + placeholder + content.slice(end);
    setContent(next);
    setTimeout(() => {
      el.focus();
      if (selectEndOffset > selectStartOffset) {
        el.setSelectionRange(start + selectStartOffset, start + selectEndOffset);
      } else {
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }
    }, 0);
  };

  const handleInsertVariable = () => {
    insertAtCursor('{{变量名称}}', 2, 6);
  };

  const handleInsertEnumVariable = () => {
    insertAtCursor('{{变量名称:选项A|选项B|选项C}}', 2, 6);
  };

  const handleAddTagQuickly = (tag: string) => {
    if (parsedTags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    setTagsInput((prev) => (prev.trim() ? `${prev.trim()}, ${tag}` : tag));
  };

  const handleCreateCategoryInline = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const newId = onAddCategory(trimmed);
    setCategoryId(newId);
    setSubCategoryId('');
    setNewCategoryName('');
    setShowNewCategoryInput(false);
  };

  const handleCreateSubCategoryInline = () => {
    const trimmed = newSubName.trim();
    if (!trimmed) return;
    const newSubId = onAddSubCategory(categoryId, trimmed);
    setSubCategoryId(newSubId);
    setNewSubName('');
    setShowNewSubInput(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('请填写提示词标题');
      return;
    }
    if (!content.trim()) {
      setError('请填写提示词正文内容');
      return;
    }

    onSave({
      id: initialPrompt?.id,
      title: title.trim(),
      description: description.trim(),
      content: content.trim(),
      categoryId,
      subCategoryId: subCategoryId || undefined,
      tags: parsedTags,
      note:
        note.trim() ||
        (isEditing
          ? `第 ${(initialPrompt?.currentVersion || 1) + 1} 轮编辑更新`
          : '初始版本'),
      variableDefaults,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-modal-title"
    >
      <div className="animate-modal-enter bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2
              id="editor-modal-title"
              className="text-base font-bold text-slate-900"
            >
              {isEditing
                ? `编辑提示词（当前 v${initialPrompt?.currentVersion}）`
                : '新建场景提示词'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEditing
                ? '修改正文后将自动保存为新版本，旧版本随时可在历史记录中对比或回滚'
                : '支持两级分类归档，可用 {{变量}} 或 {{变量:选项A|选项B}} 定义参数与枚举'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭编辑弹窗"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          {error && (
            <div
              role="alert"
              className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="prompt-title-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              提示词标题 *
            </label>
            <input
              id="prompt-title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              placeholder="例如：TypeScript 代码边界审查与重构"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
            />
          </div>

          {/* Two-Level Category Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Primary Category */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="prompt-category-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  一级分类
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCategoryInput((v) => !v)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  + 新建一级分类
                </button>
              </div>
              {showNewCategoryInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="输入一级分类名称"
                    aria-label="新一级分类名称"
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategoryInline}
                    className="px-2.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg shrink-0"
                  >
                    确定
                  </button>
                </div>
              ) : (
                <select
                  id="prompt-category-select"
                  value={categoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Sub-Category (二级子分类) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="prompt-subcategory-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  二级子分类
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewSubInput((v) => !v)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  + 新建子分类
                </button>
              </div>
              {showNewSubInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    placeholder={`在「${activeCategoryObj?.name}」下新建...`}
                    aria-label="新二级子分类名称"
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleCreateSubCategoryInline}
                    className="px-2.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg shrink-0"
                  >
                    确定
                  </button>
                </div>
              ) : (
                <select
                  id="prompt-subcategory-select"
                  value={subCategoryId}
                  onChange={(e) => setSubCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
                >
                  <option value="">不指定二级分类</option>
                  {(activeCategoryObj?.subCategories || []).map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="prompt-desc-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              适用场景备注（可选）
            </label>
            <input
              id="prompt-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话描述适用场景，方便日后快速检索..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
            />
          </div>

          {/* Prompt Body Textarea with Variable & Snippet Helpers */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="prompt-content-textarea"
                className="block text-xs font-semibold text-slate-700"
              >
                提示词正文模板 *
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleInsertVariable}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                >
                  <Braces className="w-3.5 h-3.5" />
                  <span>插入 &#123;&#123;变量&#125;&#125;</span>
                </button>
                <button
                  type="button"
                  onClick={handleInsertEnumVariable}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>插入枚举下拉变量</span>
                </button>
                <SnippetPickerPopover
                  snippets={snippets}
                  onInsertSnippet={(text) => insertAtCursor(text)}
                  onAddSnippet={onAddSnippet}
                  onDeleteSnippet={onDeleteSnippet}
                />
              </div>
            </div>
            <textarea
              id="prompt-content-textarea"
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError('');
              }}
              rows={8}
              placeholder="在此输入提示词内容。支持 {{变量名}} 或枚举语法 {{语气风格:专业严谨|通俗幽默|精简干练}}..."
              className="w-full p-3.5 text-sm leading-relaxed bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 text-slate-900"
            />
          </div>

          {/* Detected Variables Default Values & Enum Options Preview */}
          {detectedVariableDescriptors.length > 0 && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <div className="text-xs font-semibold text-slate-700">
                已识别到 {detectedVariableDescriptors.length} 个动态变量（可设置常用默认值）
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {detectedVariableDescriptors.map((desc) => (
                  <div key={desc.name} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-600 shrink-0">
                        &#123;&#123;{desc.name}&#125;&#125;
                      </span>
                      <input
                        type="text"
                        value={variableDefaults[desc.name] || ''}
                        onChange={(e) =>
                          setVariableDefaults((prev) => ({
                            ...prev,
                            [desc.name]: e.target.value,
                          }))
                        }
                        placeholder={
                          desc.options?.[0]
                            ? `默认: ${desc.options[0]}`
                            : '默认值（可选）'
                        }
                        aria-label={`变量 ${desc.name} 的默认值`}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    {desc.options && desc.options.length > 0 && (
                      <div className="text-[11px] text-blue-600 pl-1 truncate">
                        枚举项: {desc.options.join(' / ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags Input */}
          <div>
            <label
              htmlFor="prompt-tags-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              标签（多个标签用逗号或空格分隔）
            </label>
            <input
              id="prompt-tags-input"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="例如：代码审查, 重构, 结构化"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
            />
            {existingTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[11px] text-slate-400">点选已有标签：</span>
                {existingTags.slice(0, 10).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleAddTagQuickly(tag)}
                    className="px-2 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Version Revision Note when editing */}
          {isEditing && (
            <div>
              <label
                htmlFor="prompt-revision-note"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                本轮修改说明（将记录在版本历史中）
              </label>
              <input
                id="prompt-revision-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`例如：第 ${
                  (initialPrompt?.currentVersion || 1) + 1
                } 轮优化：增加输出格式限制与反面示例`}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
              />
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
            >
              取消
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEditing ? '保存修改' : '创建提示词'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
