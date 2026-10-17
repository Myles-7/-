import React, { useState } from 'react';
import {
  Folder,
  Plus,
  Trash2,
  Hash,
  Check,
  X,
  ChevronRight,
  Code2,
  PenTool,
  Briefcase,
  Compass,
  Package,
  Layers,
  CornerDownRight,
  Edit2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { Category, PromptItem } from '../types/prompt';

interface SidebarProps {
  prompts: PromptItem[];
  categories: Category[];
  activeCategoryId: string | 'all';
  activeSubCategoryId: string | 'all';
  selectedTags: string[];
  allTags: { tag: string; count: number }[];
  onSelectCategory: (categoryId: string | 'all', subCategoryId?: string | 'all') => void;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onAddCategory: (name: string) => void;
  onAddSubCategory: (parentCategoryId: string, subName: string) => void;
  onRenameCategory: (catId: string, newName: string) => void;
  onMoveCategory: (catId: string, direction: 'up' | 'down') => void;
  onRenameSubCategory: (parentCategoryId: string, subId: string, newName: string) => void;
  onMoveSubCategory: (parentCategoryId: string, subId: string, direction: 'up' | 'down') => void;
  onDeleteCategory: (id: string) => void;
  onDeleteSubCategory: (parentCategoryId: string, subId: string) => void;
}

function getCategoryIcon(iconName?: string, isSelected?: boolean) {
  const cls = `w-4 h-4 shrink-0 transition-colors ${
    isSelected ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
  }`;
  switch (iconName) {
    case 'code':
      return <Code2 className={cls} />;
    case 'pen':
      return <PenTool className={cls} />;
    case 'briefcase':
      return <Briefcase className={cls} />;
    case 'compass':
      return <Compass className={cls} />;
    case 'package':
      return <Package className={cls} />;
    default:
      return <Folder className={cls} />;
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  prompts,
  categories,
  activeCategoryId,
  activeSubCategoryId,
  selectedTags,
  allTags,
  onSelectCategory,
  onToggleTag,
  onClearTags,
  onAddCategory,
  onAddSubCategory,
  onRenameCategory,
  onMoveCategory,
  onRenameSubCategory,
  onMoveSubCategory,
  onDeleteCategory,
  onDeleteSubCategory,
}) => {
  const [expandedCatIds, setExpandedCatIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, true]))
  );
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');

  // Inline sub-category creation state
  const [addingSubForCatId, setAddingSubForCatId] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');

  // Inline rename state (supports both primary categories and sub-categories via double-click or edit button)
  const [renamingTarget, setRenamingTarget] = useState<{
    type: 'cat' | 'sub';
    catId: string;
    subId?: string;
    draftName: string;
  } | null>(null);

  const getCategoryCount = (catId: string) =>
    prompts.filter((p) => p.categoryId === catId).length;

  const getSubCategoryCount = (catId: string, subId: string) =>
    prompts.filter((p) => p.categoryId === catId && p.subCategoryId === subId).length;

  const toggleExpand = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCatIds((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCategoryError('请输入一级分类名称');
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setCategoryError('该分类名称已存在');
      return;
    }
    onAddCategory(trimmed);
    setNewCategoryName('');
    setCategoryError('');
    setIsAddingCategory(false);
  };

  const handleCreateSubCategory = (e: React.FormEvent, parentId: string) => {
    e.preventDefault();
    const trimmed = newSubName.trim();
    if (!trimmed) return;
    onAddSubCategory(parentId, trimmed);
    setNewSubName('');
    setAddingSubForCatId(null);
    setExpandedCatIds((prev) => ({ ...prev, [parentId]: true }));
  };

  const commitRename = () => {
    if (!renamingTarget) return;
    const trimmed = renamingTarget.draftName.trim();
    if (trimmed) {
      if (renamingTarget.type === 'cat') {
        onRenameCategory(renamingTarget.catId, trimmed);
      } else if (renamingTarget.subId) {
        onRenameSubCategory(renamingTarget.catId, renamingTarget.subId, trimmed);
      }
    }
    setRenamingTarget(null);
  };

  return (
    <aside
      aria-label="提示词分类与标签导航"
      className="w-64 shrink-0 bg-white border-r border-slate-200/80 flex flex-col h-full select-none"
    >
      {/* Scrollable Two-Level Categories & Tags */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-6">
        {/* Two-Level Category Directory */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span
              className="text-xs font-semibold text-slate-400"
              title="双击分类名称可原地改名"
            >
              分类目录 (双击可改名)
            </span>
            <button
              type="button"
              onClick={() => {
                setIsAddingCategory((prev) => !prev);
                setCategoryError('');
              }}
              aria-label="新建分类"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>一级分类</span>
            </button>
          </div>

          {/* All Categories Root Item */}
          <button
            type="button"
            onClick={() => onSelectCategory('all', 'all')}
            className={`w-full flex items-center justify-between px-2.5 py-2 mb-1 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeCategoryId === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Layers
                className={`w-4 h-4 shrink-0 ${
                  activeCategoryId === 'all' ? 'text-blue-300' : 'text-slate-400'
                }`}
              />
              <span>全部分类总览</span>
            </span>
            <span
              className={`font-mono text-xs tabular-nums ${
                activeCategoryId === 'all' ? 'text-slate-300' : 'text-slate-400'
              }`}
            >
              {prompts.length}
            </span>
          </button>

          {isAddingCategory && (
            <form onSubmit={handleCreateCategory} className="mb-2.5 px-1">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    if (categoryError) setCategoryError('');
                  }}
                  placeholder="输入一级分类名称..."
                  aria-label="新分类名称"
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
                  autoFocus
                />
                <button
                  type="submit"
                  aria-label="确认添加分类"
                  className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCategory(false);
                    setNewCategoryName('');
                    setCategoryError('');
                  }}
                  aria-label="取消添加分类"
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {categoryError && (
                <p className="text-xs text-red-600 mt-1">{categoryError}</p>
              )}
            </form>
          )}

          {/* Level 1 + Level 2 Category Tree */}
          <div className="space-y-1" role="list" aria-label="两级分类列表">
            {categories.map((cat, catIdx) => {
              const count = getCategoryCount(cat.id);
              const isCatSelected =
                activeCategoryId === cat.id && activeSubCategoryId === 'all';
              const isBranchActive = activeCategoryId === cat.id;
              const isExpanded = expandedCatIds[cat.id] ?? true;
              const isDefault = cat.id.startsWith('cat-');
              const subList = cat.subCategories || [];
              const isRenamingCat =
                renamingTarget?.type === 'cat' && renamingTarget.catId === cat.id;

              return (
                <div key={cat.id} role="listitem" className="space-y-0.5">
                  {/* Primary Category Row */}
                  <div
                    className={`group flex items-center justify-between rounded-xl transition-colors ${
                      isCatSelected
                        ? 'bg-blue-50/90 text-blue-700 font-semibold'
                        : isBranchActive
                        ? 'bg-slate-100/70 text-slate-900 font-medium'
                        : 'text-slate-700 hover:bg-slate-100/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(cat.id, e)}
                      aria-label={isExpanded ? `折叠 ${cat.name}` : `展开 ${cat.name}`}
                      className="p-1.5 pl-2 text-slate-400 hover:text-slate-700 shrink-0"
                    >
                      <ChevronRight
                        className={`w-3.5 h-3.5 transition-transform duration-150 ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {isRenamingCat ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitRename();
                        }}
                        className="flex-1 flex items-center gap-1 py-1 pr-1.5"
                      >
                        <input
                          type="text"
                          value={renamingTarget.draftName}
                          onChange={(e) =>
                            setRenamingTarget((prev) =>
                              prev ? { ...prev, draftName: e.target.value } : null
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setRenamingTarget(null);
                          }}
                          aria-label={`重命名分类 ${cat.name}`}
                          className="w-full px-2 py-0.5 text-xs bg-white border border-blue-500 rounded focus:outline-none text-slate-900"
                          autoFocus
                        />
                        <button
                          type="submit"
                          aria-label="保存分类名称"
                          className="p-1 bg-slate-900 text-white rounded shrink-0"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCategory(cat.id, 'all');
                          setExpandedCatIds((prev) => ({ ...prev, [cat.id]: true }));
                        }}
                        onDoubleClick={() =>
                          setRenamingTarget({
                            type: 'cat',
                            catId: cat.id,
                            draftName: cat.name,
                          })
                        }
                        title="单击筛选，双击重命名"
                        className="flex-1 flex items-center justify-between py-2 pr-1 text-xs text-left min-w-0"
                      >
                        <span className="flex items-center gap-2 truncate">
                          {getCategoryIcon(cat.icon, isBranchActive)}
                          <span className="truncate">{cat.name}</span>
                        </span>
                        <span
                          className={`font-mono text-[11px] tabular-nums ml-1 ${
                            isBranchActive ? 'text-blue-600 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    )}

                    {/* Hover Actions: Add Sub, Rename, Move Up/Down, Delete Custom */}
                    {!isRenamingCat && (
                      <div className="hidden group-hover:flex focus-within:flex items-center pr-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddingSubForCatId(
                              addingSubForCatId === cat.id ? null : cat.id
                            );
                            setNewSubName('');
                          }}
                          aria-label={`在 ${cat.name} 下新建二级分类`}
                          title="新建二级子分类"
                          className="p-1 text-slate-400 hover:text-blue-600 rounded"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingTarget({
                              type: 'cat',
                              catId: cat.id,
                              draftName: cat.name,
                            });
                          }}
                          aria-label={`重命名 ${cat.name}`}
                          title="重命名分类"
                          className="p-1 text-slate-400 hover:text-blue-600 rounded"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {catIdx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveCategory(cat.id, 'up');
                            }}
                            aria-label={`上移 ${cat.name}`}
                            title="上移分类"
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {catIdx < categories.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveCategory(cat.id, 'down');
                            }}
                            aria-label={`下移 ${cat.name}`}
                            title="下移分类"
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCategory(cat.id);
                            }}
                            aria-label={`删除分类 ${cat.name}`}
                            title="删除分类"
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inline New Sub-Category Form */}
                  {addingSubForCatId === cat.id && (
                    <form
                      onSubmit={(e) => handleCreateSubCategory(e, cat.id)}
                      className="pl-7 pr-2 py-1 flex items-center gap-1"
                    >
                      <input
                        type="text"
                        value={newSubName}
                        onChange={(e) => setNewSubName(e.target.value)}
                        placeholder={`添加「${cat.name}」子分类...`}
                        aria-label={`${cat.name} 的新子分类名称`}
                        className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 text-slate-900"
                        autoFocus
                      />
                      <button
                        type="submit"
                        aria-label="确认添加子分类"
                        className="p-1 bg-slate-900 text-white rounded-md shrink-0"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingSubForCatId(null)}
                        aria-label="取消添加子分类"
                        className="p-1 text-slate-400 hover:text-slate-700 rounded-md shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </form>
                  )}

                  {/* Animated Level-2 Sub-Categories List */}
                  {isExpanded && subList.length > 0 && (
                    <div className="animate-card-enter overflow-hidden pl-6 pr-1 space-y-0.5">
                      {subList.map((sub, subIdx) => {
                        const subCount = getSubCategoryCount(cat.id, sub.id);
                        const isSubSelected =
                          activeCategoryId === cat.id &&
                          activeSubCategoryId === sub.id;
                        const isCustomSub = sub.id.startsWith('sub-custom-');
                        const isRenamingSub =
                          renamingTarget?.type === 'sub' &&
                          renamingTarget.catId === cat.id &&
                          renamingTarget.subId === sub.id;

                        return (
                          <div
                            key={sub.id}
                            className={`group/sub flex items-center justify-between rounded-lg transition-colors ${
                              isSubSelected
                                ? 'bg-blue-600 text-white font-medium shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            {isRenamingSub ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  commitRename();
                                }}
                                className="flex-1 flex items-center gap-1 px-2 py-1"
                              >
                                <input
                                  type="text"
                                  value={renamingTarget.draftName}
                                  onChange={(e) =>
                                    setRenamingTarget((prev) =>
                                      prev
                                        ? { ...prev, draftName: e.target.value }
                                        : null
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setRenamingTarget(null);
                                  }}
                                  aria-label={`重命名子分类 ${sub.name}`}
                                  className="w-full px-1.5 py-0.5 text-xs bg-white border border-blue-500 rounded text-slate-900 focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="submit"
                                  aria-label="保存子分类名称"
                                  className="p-0.5 bg-slate-900 text-white rounded shrink-0"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectCategory(
                                    cat.id,
                                    isSubSelected ? 'all' : sub.id
                                  )
                                }
                                onDoubleClick={() =>
                                  setRenamingTarget({
                                    type: 'sub',
                                    catId: cat.id,
                                    subId: sub.id,
                                    draftName: sub.name,
                                  })
                                }
                                title="单击筛选，双击重命名"
                                className="flex-1 flex items-center justify-between px-2.5 py-1.5 text-xs text-left min-w-0"
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  <CornerDownRight
                                    className={`w-3 h-3 shrink-0 ${
                                      isSubSelected
                                        ? 'text-blue-200'
                                        : 'text-slate-300'
                                    }`}
                                  />
                                  <span className="truncate">{sub.name}</span>
                                </span>
                                <span
                                  className={`font-mono text-[11px] tabular-nums ml-1.5 ${
                                    isSubSelected
                                      ? 'text-blue-100'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {subCount}
                                </span>
                              </button>
                            )}

                            {!isRenamingSub && (
                              <div className="hidden group-hover/sub:flex items-center pr-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingTarget({
                                      type: 'sub',
                                      catId: cat.id,
                                      subId: sub.id,
                                      draftName: sub.name,
                                    });
                                  }}
                                  aria-label={`重命名子分类 ${sub.name}`}
                                  title="重命名子分类"
                                  className={`p-0.5 rounded ${
                                    isSubSelected
                                      ? 'text-blue-100 hover:text-white'
                                      : 'text-slate-400 hover:text-blue-600'
                                  }`}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                {subIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onMoveSubCategory(cat.id, sub.id, 'up');
                                    }}
                                    aria-label={`上移子分类 ${sub.name}`}
                                    title="上移"
                                    className={`p-0.5 rounded ${
                                      isSubSelected
                                        ? 'text-blue-100 hover:text-white'
                                        : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                )}
                                {subIdx < subList.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onMoveSubCategory(cat.id, sub.id, 'down');
                                    }}
                                    aria-label={`下移子分类 ${sub.name}`}
                                    title="下移"
                                    className={`p-0.5 rounded ${
                                      isSubSelected
                                        ? 'text-blue-100 hover:text-white'
                                        : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                )}
                                {isCustomSub && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteSubCategory(cat.id, sub.id);
                                    }}
                                    aria-label={`删除子分类 ${sub.name}`}
                                    className={`p-0.5 rounded ${
                                      isSubSelected
                                        ? 'text-blue-100 hover:text-red-200'
                                        : 'text-slate-400 hover:text-red-500'
                                    }`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tag Filter Controls */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between px-2 mb-2.5">
            <span className="text-xs font-semibold text-slate-400">
              标签交叉过滤
            </span>
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={onClearTags}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
              >
                清除 ({selectedTags.length})
              </button>
            )}
          </div>

          {allTags.length === 0 ? (
            <p className="text-xs text-slate-400 px-2">暂无标签</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 px-1.5">
              {allTags.slice(0, 24).map(({ tag, count }) => {
                const active = selectedTags.some(
                  (t) => t.toLowerCase() === tag.toLowerCase()
                );
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggleTag(tag)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                    }`}
                  >
                    <Hash className="w-3 h-3 opacity-60" />
                    <span>{tag}</span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        active ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Minimal Storage Status Footer */}
      <div className="px-4 py-3 border-t border-slate-200/80 bg-slate-50/50 flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
        <span>本地持久化就绪</span>
        <span>
          {prompts.length} 条 ·{' '}
          {prompts.reduce((sum, p) => sum + p.versions.length, 0)} 版本
        </span>
      </div>
    </aside>
  );
};
