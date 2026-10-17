import React, { useState } from 'react';
import { Puzzle, Plus, Trash2, Check, X } from 'lucide-react';
import type { PromptSnippet } from '../types/prompt';

interface SnippetPickerPopoverProps {
  snippets: PromptSnippet[];
  onInsertSnippet: (content: string) => void;
  onAddSnippet: (data: {
    title: string;
    category: PromptSnippet['category'];
    content: string;
  }) => void;
  onDeleteSnippet: (snippetId: string) => void;
}

const SNIPPET_CATEGORIES: Array<'全部' | PromptSnippet['category']> = [
  '全部',
  '思维链与约束',
  '输出格式',
  '角色设定',
  '自定义',
];

export const SnippetPickerPopover: React.FC<SnippetPickerPopoverProps> = ({
  snippets,
  onInsertSnippet,
  onAddSnippet,
  onDeleteSnippet,
}) => {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<
    '全部' | PromptSnippet['category']
  >('全部');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] =
    useState<PromptSnippet['category']>('自定义');
  const [newContent, setNewContent] = useState('');

  const filteredSnippets =
    activeCategory === '全部'
      ? snippets
      : snippets.filter((s) => s.category === activeCategory);

  const handleSaveNewSnippet = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    onAddSnippet({
      title: newTitle.trim(),
      category: newCategory,
      content: newContent,
    });
    setNewTitle('');
    setNewContent('');
    setIsCreating(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
          open
            ? 'bg-slate-900 text-white'
            : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
        }`}
      >
        <Puzzle className="w-3.5 h-3.5" />
        <span>插入公共片段</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="公共提示词片段与约束块"
          className="animate-modal-enter absolute right-0 mt-1.5 w-80 sm:w-96 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-900">
              可复用公共片段 / 约束块 ({snippets.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsCreating((v) => !v)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建片段</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭公共片段面板"
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            {SNIPPET_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Inline Create Snippet Form */}
          {isCreating && (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="片段名称（如：禁止输出套话）"
                  aria-label="新公共片段名称"
                  className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                />
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(
                      e.target.value as PromptSnippet['category']
                    )
                  }
                  aria-label="新公共片段分类"
                  className="px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                >
                  <option value="思维链与约束">思维链与约束</option>
                  <option value="输出格式">输出格式</option>
                  <option value="角色设定">角色设定</option>
                  <option value="自定义">自定义</option>
                </select>
              </div>
              <textarea
                rows={3}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="输入可复用的提示词段落或输出格式约束..."
                aria-label="新公共片段内容"
                className="w-full p-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewSnippet}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
                >
                  <Check className="w-3 h-3" />
                  <span>保存片段</span>
                </button>
              </div>
            </div>
          )}

          {/* Snippet List */}
          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
            {filteredSnippets.map((snip) => {
              const isCustom = !snip.id.startsWith('snip-');
              return (
                <div
                  key={snip.id}
                  className="group p-2.5 bg-slate-50/80 hover:bg-blue-50/60 border border-slate-200/80 hover:border-blue-200 rounded-lg transition-colors flex items-start justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onInsertSnippet(snip.content);
                      setOpen(false);
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold text-slate-900 group-hover:text-blue-700 truncate">
                        {snip.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        · {snip.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                      {snip.content.trim()}
                    </p>
                  </button>

                  {isCustom && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSnippet(snip.id);
                      }}
                      aria-label={`删除片段 ${snip.title}`}
                      className="p-1 text-slate-400 hover:text-red-600 rounded shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
