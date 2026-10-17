import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Copy,
  Check,
  Star,
  Pin,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Upload,
  FolderOpen,
  History,
  Menu,
  X,
  RotateCcw,
  ChevronDown,
  CheckSquare,
  Square,
  FolderInput,
  Tag,
  Download,
  Trash2,
} from 'lucide-react';
import type {
  Category,
  ImportedPromptDraft,
  LayoutMode,
  LibraryView,
  PromptChain,
  PromptItem,
  PromptSnippet,
  SortField,
} from './types/prompt';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_PROMPT_CHAINS,
  DEFAULT_SNIPPETS,
  SEED_PROMPTS,
} from './data/seedPrompts';
import {
  extractVariables,
  filterAndSortPrompts,
  applyPromptRevision,
  restorePromptVersion,
  duplicatePromptItem,
  tokenizeTemplateSegments,
  normalizeTags,
  formatCompactPromptPreview,
} from './utils/promptLogic';
import { Sidebar } from './components/Sidebar';
import { PromptDetailWorkbench } from './components/PromptDetailWorkbench';
import { PromptEditorModal } from './components/PromptEditorModal';
import { ImportExportModal } from './components/ImportExportModal';
import { PromptChainCanvasWorkspace } from './components/PromptChainCanvasWorkspace';

const STORAGE_KEYS = {
  PROMPTS: 'promptvault_prompts_v3',
  CATEGORIES: 'promptvault_categories_v3',
  SNIPPETS: 'promptvault_snippets_v3',
  CHAINS: 'promptvault_chains_v3',
  LAYOUT: 'promptvault_layout_v3',
  VAR_INPUTS: 'promptvault_var_inputs_v3',
};

const PAGE_BATCH_SIZE = 48;

export default function App() {
  // Persistent state initialization
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((c: Category) => ({
            ...c,
            subCategories: Array.isArray(c.subCategories)
              ? c.subCategories
              : [],
          }));
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_CATEGORIES;
  });

  const [prompts, setPrompts] = useState<PromptItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PROMPTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return SEED_PROMPTS;
  });

  const [snippets, setSnippets] = useState<PromptSnippet[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SNIPPETS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_SNIPPETS;
  });

  const [chains, setChains] = useState<PromptChain[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHAINS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_PROMPT_CHAINS;
  });

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LAYOUT);
      if (saved === 'grid' || saved === 'table') return saved;
    } catch {
      // ignore
    }
    return 'grid';
  });

  const [rememberedVarsByPrompt, setRememberedVarsByPrompt] = useState<
    Record<string, Record<string, string>>
  >(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.VAR_INPUTS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {};
  });

  // Filter & Two-Level Category Navigation State
  const [activeView, setActiveView] = useState<LibraryView>('all');
  const [activeCategoryId, setActiveCategoryId] = useState<string | 'all'>('all');
  const [activeSubCategoryId, setActiveSubCategoryId] = useState<string | 'all'>(
    'all'
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');

  // Windowed pagination state for 10,000+ prompt scalability
  const [visibleCount, setVisibleCount] = useState(PAGE_BATCH_SIZE);

  // Batch Management Mode state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [batchTargetCategoryKey, setBatchTargetCategoryKey] =
    useState<string>('');
  const [batchTagInput, setBatchTagInput] = useState('');

  // Selection & Modals
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(
    () => SEED_PROMPTS[0]?.id || null
  );
  const [editorState, setEditorState] = useState<{
    open: boolean;
    prompt?: PromptItem | null;
  }>({ open: false, prompt: null });
  const [importModalState, setImportModalState] = useState<{
    open: boolean;
    tab: 'import' | 'export';
  }>({ open: false, tab: 'import' });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Quick copy feedback & Undo Delete state (supports single or batch undo)
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deletedPromptsBackup, setDeletedPromptsBackup] = useState<
    PromptItem[] | null
  >(null);

  // Card content full-text expansion states (per-card and global toggle)
  const [expandAllCards, setExpandAllCards] = useState(false);
  const [expandedCardIds, setExpandedCardIds] = useState<
    Record<string, boolean>
  >({});

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Sync with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
    } catch {
      // ignore
    }
  }, [prompts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    } catch {
      // ignore
    }
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SNIPPETS, JSON.stringify(snippets));
    } catch {
      // ignore
    }
  }, [snippets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHAINS, JSON.stringify(chains));
    } catch {
      // ignore
    }
  }, [chains]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LAYOUT, layoutMode);
    } catch {
      // ignore
    }
  }, [layoutMode]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.VAR_INPUTS,
        JSON.stringify(rememberedVarsByPrompt)
      );
    } catch {
      // ignore
    }
  }, [rememberedVarsByPrompt]);

  // Reset windowed pagination batch whenever filters change
  useEffect(() => {
    setVisibleCount(PAGE_BATCH_SIZE);
  }, [
    activeView,
    activeCategoryId,
    activeSubCategoryId,
    selectedTags,
    searchQuery,
    sortBy,
  ]);

  const showToast = (msg: string, keepUndo = false) => {
    if (!keepUndo) setDeletedPromptsBackup(null);
    setToastMessage(msg);
    setTimeout(
      () => {
        setToastMessage((prev) => (prev === msg ? null : prev));
      },
      keepUndo ? 5500 : 2600
    );
  };

  const categoriesMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const subCategoriesMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      for (const sub of c.subCategories || []) {
        map[sub.id] = sub.name;
      }
    }
    return map;
  }, [categories]);

  const activeCategoryObj = useMemo(
    () =>
      activeCategoryId !== 'all'
        ? categories.find((c) => c.id === activeCategoryId) || null
        : null,
    [categories, activeCategoryId]
  );

  // Compute all unique tags with counts
  const allTags = useMemo(() => {
    const counts = new Map<string, { display: string; count: number }>();
    for (const p of prompts) {
      for (const t of p.tags) {
        const key = t.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { display: t, count: 1 });
        }
      }
    }
    return Array.from(counts.values())
      .map((v) => ({ tag: v.display, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [prompts]);

  // Filtered and sorted prompts
  const filteredPrompts = useMemo(
    () =>
      filterAndSortPrompts(prompts, {
        view: activeView,
        categoryId: activeCategoryId,
        subCategoryId: activeSubCategoryId,
        selectedTags,
        searchQuery,
        sortBy,
        categoriesMap,
        subCategoriesMap,
      }),
    [
      prompts,
      activeView,
      activeCategoryId,
      activeSubCategoryId,
      selectedTags,
      searchQuery,
      sortBy,
      categoriesMap,
      subCategoriesMap,
    ]
  );

  const visiblePrompts = useMemo(
    () => filteredPrompts.slice(0, visibleCount),
    [filteredPrompts, visibleCount]
  );

  const selectedPrompt = useMemo(
    () => prompts.find((p) => p.id === selectedPromptId) || null,
    [prompts, selectedPromptId]
  );

  // Global keyboard shortcuts: `/` or `⌘K` to search, `↑`/`↓` to navigate prompts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isTyping =
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (
        !isTyping &&
        !editorState.open &&
        !importModalState.open &&
        visiblePrompts.length > 0
      ) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const currentIdx = visiblePrompts.findIndex(
            (p) => p.id === selectedPromptId
          );
          if (e.key === 'ArrowDown') {
            const nextIdx =
              currentIdx < visiblePrompts.length - 1 ? currentIdx + 1 : 0;
            setSelectedPromptId(visiblePrompts[nextIdx].id);
          } else {
            const prevIdx =
              currentIdx > 0 ? currentIdx - 1 : visiblePrompts.length - 1;
            setSelectedPromptId(visiblePrompts[prevIdx].id);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    visiblePrompts,
    selectedPromptId,
    editorState.open,
    importModalState.open,
  ]);

  // Category & Sub-Category Governance Handlers (Add, Rename, Reorder, Delete)
  const handleSelectCategory = (
    catId: string | 'all',
    subId: string | 'all' = 'all'
  ) => {
    if (activeView === 'chains') {
      setActiveView('all');
    }
    setActiveCategoryId(catId);
    setActiveSubCategoryId(subId);
  };

  const handleSaveChain = (updatedChain: PromptChain) => {
    setChains((prev) =>
      prev.map((c) => (c.id === updatedChain.id ? updatedChain : c))
    );
  };

  const handleCreateChain = (newChain: PromptChain) => {
    setChains((prev) => [...prev, newChain]);
  };

  const handleDeleteChain = (chainId: string) => {
    setChains((prev) => prev.filter((c) => c.id !== chainId));
    showToast('已删除任务流');
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === tag.toLowerCase());
      if (exists) {
        return prev.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      }
      return [...prev, tag];
    });
  };

  const handleAddCategory = (name: string): string => {
    const existing = categories.find(
      (c) => c.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (existing) return existing.id;

    const newId = `cat-custom-${Date.now()}`;
    const newCat: Category = {
      id: newId,
      name: name.trim(),
      subCategories: [],
    };
    setCategories((prev) => [...prev, newCat]);
    showToast(`已新建一级分类「${newCat.name}」`);
    return newId;
  };

  const handleAddSubCategory = (
    parentCategoryId: string,
    subName: string
  ): string => {
    const trimmed = subName.trim();
    const newSubId = `sub-custom-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;

    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id !== parentCategoryId) return cat;
        const exists = (cat.subCategories || []).find(
          (s) => s.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (exists) return cat;
        return {
          ...cat,
          subCategories: [
            ...(cat.subCategories || []),
            { id: newSubId, name: trimmed },
          ],
        };
      })
    );
    showToast(`已添加二级分类「${trimmed}」`);
    return newSubId;
  };

  const handleRenameCategory = (catId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCategories((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, name: trimmed } : c))
    );
    showToast(`已将分类重命名为「${trimmed}」`);
  };

  const handleMoveCategory = (catId: string, direction: 'up' | 'down') => {
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === catId);
      if (idx < 0) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  };

  const handleRenameSubCategory = (
    parentCategoryId: string,
    subId: string,
    newName: string
  ) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === parentCategoryId
          ? {
              ...cat,
              subCategories: (cat.subCategories || []).map((s) =>
                s.id === subId ? { ...s, name: trimmed } : s
              ),
            }
          : cat
      )
    );
    showToast(`已将子分类重命名为「${trimmed}」`);
  };

  const handleMoveSubCategory = (
    parentCategoryId: string,
    subId: string,
    direction: 'up' | 'down'
  ) => {
    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id !== parentCategoryId) return cat;
        const subs = [...(cat.subCategories || [])];
        const idx = subs.findIndex((s) => s.id === subId);
        if (idx < 0) return cat;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= subs.length) return cat;
        const [moved] = subs.splice(idx, 1);
        subs.splice(targetIdx, 0, moved);
        return { ...cat, subCategories: subs };
      })
    );
  };

  const handleDeleteCategory = (catId: string) => {
    const fallbackId = categories[0]?.id || 'cat-coding';
    setPrompts((prev) =>
      prev.map((p) =>
        p.categoryId === catId
          ? { ...p, categoryId: fallbackId, subCategoryId: undefined }
          : p
      )
    );
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    if (activeCategoryId === catId) {
      setActiveCategoryId('all');
      setActiveSubCategoryId('all');
    }
    showToast('已删除分类，原分类下提示词已移至默认分类');
  };

  const handleDeleteSubCategory = (parentCategoryId: string, subId: string) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.subCategoryId === subId ? { ...p, subCategoryId: undefined } : p
      )
    );
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === parentCategoryId
          ? {
              ...cat,
              subCategories: (cat.subCategories || []).filter(
                (s) => s.id !== subId
              ),
            }
          : cat
      )
    );
    if (activeSubCategoryId === subId) {
      setActiveSubCategoryId('all');
    }
    showToast('已删除二级子分类');
  };

  // Snippet Management Handlers
  const handleAddSnippet = (data: {
    title: string;
    category: PromptSnippet['category'];
    content: string;
  }) => {
    const newSnippet: PromptSnippet = {
      id: `custom-snip-${Date.now()}`,
      title: data.title,
      category: data.category,
      content: data.content,
    };
    setSnippets((prev) => [newSnippet, ...prev]);
    showToast(`已保存公共片段「${newSnippet.title}」`);
  };

  const handleDeleteSnippet = (snippetId: string) => {
    setSnippets((prev) => prev.filter((s) => s.id !== snippetId));
    showToast('已删除自定义公共片段');
  };

  // Variable Presets & Defaults Handlers
  const handleSaveVariablePreset = (
    promptId: string,
    presetName: string,
    values: Record<string, string>
  ) => {
    const newPreset = {
      id: `preset-${Date.now()}`,
      name: presetName,
      values: { ...values },
    };
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === promptId
          ? {
              ...p,
              variablePresets: [...(p.variablePresets || []), newPreset],
            }
          : p
      )
    );
    showToast(`已保存参数预设方案「${presetName}」`);
  };

  const handleDeleteVariablePreset = (promptId: string, presetId: string) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === promptId
          ? {
              ...p,
              variablePresets: (p.variablePresets || []).filter(
                (pr) => pr.id !== presetId
              ),
            }
          : p
      )
    );
    showToast('已删除参数预设方案');
  };

  const handleToggleFavorite = (promptId: string) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === promptId ? { ...p, isFavorite: !p.isFavorite } : p
      )
    );
  };

  const handleTogglePin = (promptId: string) => {
    const target = prompts.find((p) => p.id === promptId);
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === promptId ? { ...p, isPinned: !p.isPinned } : p
      )
    );
    if (target) {
      showToast(
        target.isPinned
          ? `已取消置顶「${target.title}」`
          : `已置顶「${target.title}」`
      );
    }
  };

  const handleDuplicatePrompt = (source: PromptItem) => {
    const forked = duplicatePromptItem(source);
    setPrompts((prev) => [forked, ...prev]);
    setSelectedPromptId(forked.id);
    showToast(`已克隆生成「${forked.title}」`);
  };

  const handleUpdateRememberedVars = (
    promptId: string,
    values: Record<string, string>
  ) => {
    setRememberedVarsByPrompt((prev) => ({
      ...prev,
      [promptId]: values,
    }));
  };

  const handleSaveVariableDefaults = (
    promptId: string,
    defaults: Record<string, string>
  ) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === promptId ? { ...p, variableDefaults: { ...defaults } } : p
      )
    );
    showToast('已将当前变量填入值保存为默认参数');
  };

  const handleRecordUsage = (promptId: string) => {
    const now = new Date().toISOString();
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === promptId
          ? { ...p, usageCount: p.usageCount + 1, lastUsedAt: now }
          : p
      )
    );
  };

  const handleQuickCopyFromCard = async (
    e: React.MouseEvent,
    prompt: PromptItem
  ) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(prompt.content);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = prompt.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    handleRecordUsage(prompt.id);
    setCopiedCardId(prompt.id);
    showToast(`已复制「${prompt.title}」`);
    setTimeout(() => {
      setCopiedCardId((prev) => (prev === prompt.id ? null : prev));
    }, 1800);
  };

  const handleSavePrompt = (data: {
    id?: string;
    title: string;
    description: string;
    content: string;
    categoryId: string;
    subCategoryId?: string;
    tags: string[];
    note?: string;
    variableDefaults?: Record<string, string>;
  }) => {
    const now = new Date().toISOString();
    if (data.id) {
      setPrompts((prev) =>
        prev.map((p) => {
          if (p.id !== data.id) return p;
          return applyPromptRevision(
            p,
            {
              title: data.title,
              description: data.description,
              content: data.content,
              categoryId: data.categoryId,
              subCategoryId: data.subCategoryId,
              tags: data.tags,
              note: data.note,
              variableDefaults: data.variableDefaults,
            },
            now
          );
        })
      );
      showToast(`已保存修改「${data.title}」`);
    } else {
      const newId = `prompt-${Date.now()}`;
      const newPrompt: PromptItem = {
        id: newId,
        title: data.title,
        description: data.description,
        content: data.content,
        categoryId: data.categoryId,
        subCategoryId: data.subCategoryId,
        tags: data.tags,
        isFavorite: false,
        isPinned: false,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
        currentVersion: 1,
        versions: [
          {
            version: 1,
            content: data.content,
            note: data.note || '初始版本',
            createdAt: now,
          },
        ],
        variableDefaults: data.variableDefaults,
      };
      setPrompts((prev) => [newPrompt, ...prev]);
      setSelectedPromptId(newId);
      showToast(`已创建提示词「${data.title}」`);
    }
  };

  const handleSaveQuickIteration = (
    promptId: string,
    newContent: string,
    note: string
  ) => {
    const now = new Date().toISOString();
    setPrompts((prev) =>
      prev.map((p) => {
        if (p.id !== promptId) return p;
        return applyPromptRevision(
          p,
          {
            title: p.title,
            description: p.description,
            content: newContent,
            categoryId: p.categoryId,
            subCategoryId: p.subCategoryId,
            tags: p.tags,
            note,
            forceNewVersion: true,
          },
          now
        );
      })
    );
    showToast('已保存为新版本并记录至多轮修改历史');
  };

  const handleRestoreVersion = (promptId: string, versionNumber: number) => {
    const now = new Date().toISOString();
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === promptId ? restorePromptVersion(p, versionNumber, now) : p
      )
    );
    showToast(`已回滚至 v${versionNumber} 内容并生成新版本记录`);
  };

  const handleDeletePrompt = (promptId: string) => {
    const target = prompts.find((p) => p.id === promptId);
    setPrompts((prev) => {
      const remaining = prev.filter((p) => p.id !== promptId);
      if (selectedPromptId === promptId) {
        setSelectedPromptId(remaining[0]?.id || null);
      }
      return remaining;
    });
    if (target) {
      setDeletedPromptsBackup([target]);
      showToast(`已删除「${target.title}」`, true);
    }
  };

  const handleUndoDelete = () => {
    if (!deletedPromptsBackup || deletedPromptsBackup.length === 0) return;
    setPrompts((prev) => [...deletedPromptsBackup, ...prev]);
    setSelectedPromptId(deletedPromptsBackup[0].id);
    const count = deletedPromptsBackup.length;
    const firstTitle = deletedPromptsBackup[0].title;
    setDeletedPromptsBackup(null);
    showToast(
      count === 1 ? `已恢复「${firstTitle}」` : `已恢复 ${count} 条提示词`
    );
  };

  // Batch Mode Handlers
  const toggleBatchSelect = (promptId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(promptId)
        ? prev.filter((id) => id !== promptId)
        : [...prev, promptId]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredPrompts.map((p) => p.id);
    const allSelected = allFilteredIds.every((id) =>
      selectedBatchIds.includes(id)
    );
    if (allSelected) {
      setSelectedBatchIds([]);
    } else {
      setSelectedBatchIds(allFilteredIds);
    }
  };

  const handleBatchMoveCategory = () => {
    if (!batchTargetCategoryKey || selectedBatchIds.length === 0) return;
    const [targetCatId, targetSubId] = batchTargetCategoryKey.split('::');
    const selectedSet = new Set(selectedBatchIds);
    setPrompts((prev) =>
      prev.map((p) =>
        selectedSet.has(p.id)
          ? {
              ...p,
              categoryId: targetCatId,
              subCategoryId: targetSubId || undefined,
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
    const catName = categoriesMap[targetCatId] || '';
    const subName = targetSubId ? subCategoriesMap[targetSubId] : '';
    showToast(
      `已将 ${selectedBatchIds.length} 条提示词移至「${catName}${
        subName ? ` / ${subName}` : ''
      }」`
    );
    setSelectedBatchIds([]);
  };

  const handleBatchAddTags = (e: React.FormEvent) => {
    e.preventDefault();
    const newTags = normalizeTags(batchTagInput.split(/[,，;；\s#]+/));
    if (newTags.length === 0 || selectedBatchIds.length === 0) return;
    const selectedSet = new Set(selectedBatchIds);
    setPrompts((prev) =>
      prev.map((p) =>
        selectedSet.has(p.id)
          ? {
              ...p,
              tags: normalizeTags([...p.tags, ...newTags]),
            }
          : p
      )
    );
    showToast(
      `已为 ${selectedBatchIds.length} 条提示词批量添加标签 ${newTags
        .map((t) => `#${t}`)
        .join(' ')}`
    );
    setBatchTagInput('');
  };

  const handleBatchExportJson = () => {
    if (selectedBatchIds.length === 0) return;
    const selectedSet = new Set(selectedBatchIds);
    const chosen = prompts.filter((p) => selectedSet.has(p.id));
    const payload = JSON.stringify(chosen, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promptvault-selected-${chosen.length}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`已导出选中的 ${chosen.length} 条提示词`);
  };

  const handleBatchDelete = () => {
    if (selectedBatchIds.length === 0) return;
    const selectedSet = new Set(selectedBatchIds);
    const removed = prompts.filter((p) => selectedSet.has(p.id));
    setPrompts((prev) => {
      const remaining = prev.filter((p) => !selectedSet.has(p.id));
      if (selectedPromptId && selectedSet.has(selectedPromptId)) {
        setSelectedPromptId(remaining[0]?.id || null);
      }
      return remaining;
    });
    setDeletedPromptsBackup(removed);
    setSelectedBatchIds([]);
    showToast(`已批量删除 ${removed.length} 条提示词`, true);
  };

  const handleImportExternalPrompts = (
    drafts: ImportedPromptDraft[],
    fallbackCategoryId: string
  ) => {
    const now = new Date().toISOString();
    const updatedCategories = categories.map((c) => ({
      ...c,
      subCategories: [...(c.subCategories || [])],
    }));

    const resolveTwoLevelCategory = (
      categoryName?: string,
      subCategoryName?: string
    ): { catId: string; subId?: string } => {
      let targetCat = updatedCategories.find((c) => c.id === fallbackCategoryId);
      if (categoryName) {
        const found = updatedCategories.find(
          (c) => c.name.toLowerCase() === categoryName.trim().toLowerCase()
        );
        if (found) {
          targetCat = found;
        } else {
          const createdId = `cat-import-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
          targetCat = {
            id: createdId,
            name: categoryName.trim(),
            subCategories: [],
          };
          updatedCategories.push(targetCat);
        }
      }

      if (!targetCat) {
        targetCat = updatedCategories[0];
      }

      let resolvedSubId: string | undefined;
      if (subCategoryName && targetCat) {
        const foundSub = targetCat.subCategories.find(
          (s) => s.name.toLowerCase() === subCategoryName.trim().toLowerCase()
        );
        if (foundSub) {
          resolvedSubId = foundSub.id;
        } else {
          const newSubId = `sub-imp-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
          targetCat.subCategories.push({
            id: newSubId,
            name: subCategoryName.trim(),
          });
          resolvedSubId = newSubId;
        }
      }

      return { catId: targetCat.id, subId: resolvedSubId };
    };

    let addedCount = 0;
    let updatedVersionCount = 0;
    const nextPrompts = [...prompts];
    const newlyCreated: PromptItem[] = [];

    drafts.forEach((d, idx) => {
      const { catId, subId } = resolveTwoLevelCategory(
        d.categoryName,
        d.subCategoryName
      );
      const existingIdx = nextPrompts.findIndex(
        (p) => p.title.trim().toLowerCase() === d.title.trim().toLowerCase()
      );

      if (existingIdx >= 0) {
        const existing = nextPrompts[existingIdx];
        if (existing.content.trim() !== d.content.trim()) {
          nextPrompts[existingIdx] = applyPromptRevision(
            existing,
            {
              title: existing.title,
              description: d.description || existing.description,
              content: d.content,
              categoryId: d.categoryName ? catId : existing.categoryId,
              subCategoryId: subId || existing.subCategoryId,
              tags: Array.from(new Set([...existing.tags, ...d.tags])),
              note: '外部重新导入迭代版本',
            },
            now
          );
          updatedVersionCount++;
        }
        return;
      }

      const versions =
        d.versions && d.versions.length > 0
          ? d.versions
          : [
              {
                version: 1,
                content: d.content,
                note: '外部导入初始版本',
                createdAt: now,
              },
            ];
      const maxVer = versions.reduce(
        (m, v) => (v.version > m ? v.version : m),
        1
      );

      addedCount++;
      newlyCreated.push({
        id: `prompt-imp-${Date.now()}-${idx}`,
        title: d.title,
        description: d.description,
        content: d.content,
        categoryId: catId,
        subCategoryId: subId,
        tags: d.tags,
        isFavorite: false,
        isPinned: false,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
        currentVersion: maxVer,
        versions,
      });
    });

    setCategories(updatedCategories);
    setPrompts([...newlyCreated, ...nextPrompts]);
    if (newlyCreated[0]) {
      setSelectedPromptId(newlyCreated[0].id);
    }
    if (updatedVersionCount > 0) {
      showToast(
        `成功新增 ${addedCount} 条提示词，另有 ${updatedVersionCount} 条同名提示词已合并为新版本`
      );
    } else {
      showToast(`成功导入 ${addedCount} 条外部提示词`);
    }
  };

  const hasActiveFilters =
    activeView !== 'all' ||
    activeCategoryId !== 'all' ||
    activeSubCategoryId !== 'all' ||
    selectedTags.length > 0 ||
    searchQuery.trim() !== '';

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Top Bar Contract: 3 zones (Brand Wordmark — 4 Concise Nav Links — 1 Primary Action) */}
      <header className="h-14 shrink-0 bg-white border-b border-slate-200/80 px-4 lg:px-6 flex items-center justify-between gap-3 lg:gap-8 z-20">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen((v) => !v)}
            aria-label="打开分类侧边栏"
            className="lg:hidden p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('all');
              handleSelectCategory('all', 'all');
              setSelectedTags([]);
              setSearchQuery('');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            PromptVault 本地提示词工坊
          </a>
        </div>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav
          aria-label="主导航"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="#all"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('all');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'all'
                ? 'text-slate-900 font-semibold underline underline-offset-4'
                : ''
            }`}
          >
            全部提示词
          </a>
          <a
            href="#favorites"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('favorites');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'favorites'
                ? 'text-slate-900 font-semibold underline underline-offset-4'
                : ''
            }`}
          >
            常用收藏
          </a>
          <a
            href="#recent"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('recent');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'recent'
                ? 'text-slate-900 font-semibold underline underline-offset-4'
                : ''
            }`}
          >
            最近使用
          </a>
          <a
            href="#chains"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('chains');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'chains'
                ? 'text-blue-600 font-semibold underline underline-offset-4'
                : ''
            }`}
          >
            场景任务流
          </a>
          <a
            href="#import"
            onClick={(e) => {
              e.preventDefault();
              setImportModalState({ open: true, tab: 'import' });
            }}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            导入与备份
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setEditorState({ open: true, prompt: null })}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建提示词</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Desktop Sidebar: Vivid Two-Level Category Tree + Rename/Reorder + Tag Filter (Hidden in Canvas Studio so Canvas has its own dedicated Node Palette & full width) */}
        {activeView !== 'chains' && (
          <div className="hidden lg:block h-full">
            <Sidebar
              prompts={prompts}
              categories={categories}
              activeView={activeView}
              chainsCount={chains.length}
              activeCategoryId={activeCategoryId}
              activeSubCategoryId={activeSubCategoryId}
              selectedTags={selectedTags}
              allTags={allTags}
              onSelectCategory={handleSelectCategory}
              onSelectChainsView={() => setActiveView('chains')}
              onToggleTag={handleToggleTag}
              onClearTags={() => setSelectedTags([])}
              onAddCategory={handleAddCategory}
              onAddSubCategory={handleAddSubCategory}
              onRenameCategory={handleRenameCategory}
              onMoveCategory={handleMoveCategory}
              onRenameSubCategory={handleRenameSubCategory}
              onMoveSubCategory={handleMoveSubCategory}
              onDeleteCategory={handleDeleteCategory}
              onDeleteSubCategory={handleDeleteSubCategory}
            />
          </div>
        )}

        {/* Mobile Sidebar Drawer */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/40"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="relative z-10 h-full animate-card-enter">
              <Sidebar
                prompts={prompts}
                categories={categories}
                activeView={activeView}
                chainsCount={chains.length}
                activeCategoryId={activeCategoryId}
                activeSubCategoryId={activeSubCategoryId}
                selectedTags={selectedTags}
                allTags={allTags}
                onSelectCategory={(cat, sub) => {
                  handleSelectCategory(cat, sub);
                  setMobileSidebarOpen(false);
                }}
                onSelectChainsView={() => {
                  setActiveView('chains');
                  setMobileSidebarOpen(false);
                }}
                onToggleTag={handleToggleTag}
                onClearTags={() => setSelectedTags([])}
                onAddCategory={handleAddCategory}
                onAddSubCategory={handleAddSubCategory}
                onRenameCategory={handleRenameCategory}
                onMoveCategory={handleMoveCategory}
                onRenameSubCategory={handleRenameSubCategory}
                onMoveSubCategory={handleMoveSubCategory}
                onDeleteCategory={handleDeleteCategory}
                onDeleteSubCategory={handleDeleteSubCategory}
              />
            </div>
          </div>
        )}

        {activeView === 'chains' ? (
          <PromptChainCanvasWorkspace
            chains={chains}
            prompts={prompts}
            categories={categories}
            snippets={snippets}
            onSaveChain={handleSaveChain}
            onCreateChain={handleCreateChain}
            onDeleteChain={handleDeleteChain}
            onAddSnippet={handleAddSnippet}
            onDeleteSnippet={handleDeleteSnippet}
            onShowToast={(msg) => showToast(msg)}
            onBackToLibrary={() => setActiveView('all')}
          />
        ) : (
          <>
            {/* Center Content Column: Search + Vivid Sub-Category Bar + Prompts Grid/List */}
            <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Streamlined Search & Sub-Category Bar */}
          <div className="px-4 py-3.5 lg:px-6 bg-white border-b border-slate-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Instant Search Input */}
              <div className="relative flex-1 max-w-xl">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索提示词或 #标签..."
                  aria-label="搜索提示词"
                  className="w-full pl-10 pr-14 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 text-slate-900 transition-colors"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="清空搜索词"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden xl:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5 pointer-events-none">
                    ⌘K
                  </kbd>
                )}
              </div>

              {/* Right Controls: Full-Text Toggle + Batch Mode + Sort + Layout Mode */}
              <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setExpandAllCards((v) => {
                      const next = !v;
                      if (!next) setExpandedCardIds({});
                      return next;
                    });
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    expandAllCards
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{expandAllCards ? '收起全部正文' : '展开全部正文'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsBatchMode((v) => !v);
                    setSelectedBatchIds([]);
                    if (!batchTargetCategoryKey && categories[0]) {
                      setBatchTargetCategoryKey(`${categories[0].id}::`);
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    isBatchMode
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>{isBatchMode ? '退出批量' : '批量整理'}</span>
                </button>

                <div className="flex items-center gap-1">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortField)}
                    aria-label="排序方式"
                    className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-600"
                  >
                    <option value="updatedAt">最近修改</option>
                    <option value="usageCount">高频使用</option>
                    <option value="createdAt">最新创建</option>
                    <option value="title">标题名称</option>
                  </select>
                </div>

                {/* Segmented View Toggle (Grid vs Compact Table) */}
                <div
                  className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
                  role="group"
                  aria-label="显示布局切换"
                >
                  <button
                    type="button"
                    onClick={() => setLayoutMode('grid')}
                    aria-label="舒适卡片视图"
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      layoutMode === 'grid'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">卡片</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('table')}
                    aria-label="紧凑列表视图"
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      layoutMode === 'table'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">列表</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Vivid Two-Level Category Bar + Batch Selection Controls */}
            <div className="flex items-center justify-between gap-3 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                {activeCategoryObj ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSelectCategory('all', 'all')}
                      className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      全部分类
                    </button>
                    <span className="text-slate-300 text-xs">/</span>
                    <button
                      type="button"
                      onClick={() => setActiveSubCategoryId('all')}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        activeSubCategoryId === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {activeCategoryObj.name} · 全部
                    </button>
                    {(activeCategoryObj.subCategories || []).map((sub) => {
                      const subCount = prompts.filter(
                        (p) =>
                          p.categoryId === activeCategoryObj.id &&
                          p.subCategoryId === sub.id
                      ).length;
                      const isSubActive = activeSubCategoryId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() =>
                            setActiveSubCategoryId(
                              isSubActive ? 'all' : sub.id
                            )
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
                            isSubActive
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                          }`}
                        >
                          <span>{sub.name}</span>
                          <span
                            className={`font-mono text-[11px] tabular-nums ${
                              isSubActive ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            {subCount}
                          </span>
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSelectCategory('all', 'all')}
                      className="px-3 py-1 text-xs font-semibold bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
                    >
                      全部场景 ({prompts.length})
                    </button>
                    {categories.map((cat) => {
                      const count = prompts.filter(
                        (p) => p.categoryId === cat.id
                      ).length;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleSelectCategory(cat.id, 'all')}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>{cat.name}</span>
                          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {isBatchMode && (
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                  >
                    {selectedBatchIds.length === filteredPrompts.length &&
                    filteredPrompts.length > 0
                      ? '取消全选'
                      : `全选当前 (${filteredPrompts.length})`}
                  </button>
                )}

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('all');
                      handleSelectCategory('all', 'all');
                      setSelectedTags([]);
                      setSearchQuery('');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap shrink-0"
                  >
                    重置筛选
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Prompts Canvas */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20">
            {filteredPrompts.length === 0 ? (
              /* Empty State */
              <div className="animate-card-enter h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8 bg-white border border-slate-200 rounded-2xl">
                <FolderOpen className="w-10 h-10 text-slate-300 mb-3" />
                <h3 className="text-base font-bold text-slate-900">
                  未找到匹配的提示词
                </h3>
                <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                  当前分类或搜索词下没有对应的提示词。您可以清除筛选条件，或者直接新建、导入外部提示词。
                </p>
                <div className="flex items-center gap-3 mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('all');
                      handleSelectCategory('all', 'all');
                      setSelectedTags([]);
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                  >
                    清除筛选条件
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorState({ open: true, prompt: null })}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    新建提示词
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setImportModalState({ open: true, tab: 'import' })
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>导入外部提示词</span>
                  </button>
                </div>
              </div>
            ) : layoutMode === 'grid' ? (
              /* Refined Editorial Grid View */
              <div className="space-y-6">
                <div
                  className={`grid gap-4 ${
                    selectedPrompt
                      ? 'grid-cols-1 xl:grid-cols-2'
                      : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                  }`}
                >
                  {visiblePrompts.map((item) => {
                    const isSelected = item.id === selectedPromptId;
                    const isBatchChecked = selectedBatchIds.includes(item.id);
                    const vars = extractVariables(item.content);
                    const catName = categoriesMap[item.categoryId] || '未分类';
                    const subCatName = item.subCategoryId
                      ? subCategoriesMap[item.subCategoryId]
                      : undefined;
                    const isCardExpanded =
                      expandAllCards || Boolean(expandedCardIds[item.id]);
                    const displayContent = isCardExpanded
                      ? item.content
                      : formatCompactPromptPreview(item.content);
                    const segments = tokenizeTemplateSegments(displayContent);
                    const presetCount = item.variablePresets?.length || 0;

                    return (
                      <article
                        key={item.id}
                        onClick={() => {
                          if (isBatchMode) {
                            toggleBatchSelect(item.id);
                          } else {
                            setSelectedPromptId(item.id);
                          }
                        }}
                        className={`animate-card-enter group bg-white border rounded-2xl p-5 flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                          isBatchMode && isBatchChecked
                            ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/15'
                            : isSelected
                            ? 'border-blue-600 ring-2 ring-blue-600/15 shadow-sm'
                            : 'border-slate-200/90 hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5'
                        }`}
                      >
                        <div>
                          {/* Row 1: Two-Level Category Breadcrumb + Batch Checkbox or Pin/Favorite */}
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                              {isBatchMode && (
                                <span
                                  className={`shrink-0 ${
                                    isBatchChecked
                                      ? 'text-blue-600'
                                      : 'text-slate-300 group-hover:text-slate-500'
                                  }`}
                                >
                                  {isBatchChecked ? (
                                    <CheckSquare className="w-4 h-4" />
                                  ) : (
                                    <Square className="w-4 h-4" />
                                  )}
                                </span>
                              )}
                              {item.isPinned && (
                                <>
                                  <span className="font-semibold text-blue-600 shrink-0">
                                    置顶
                                  </span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              <span className="font-medium text-slate-600 truncate">
                                {catName}
                                {subCatName ? ` / ${subCatName}` : ''}
                              </span>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePin(item.id);
                                }}
                                aria-label={
                                  item.isPinned
                                    ? `取消置顶 ${item.title}`
                                    : `置顶 ${item.title}`
                                }
                                className={`p-1 rounded-md transition-colors ${
                                  item.isPinned
                                    ? 'text-blue-600 hover:bg-blue-50'
                                    : 'text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleFavorite(item.id);
                                }}
                                aria-label={
                                  item.isFavorite
                                    ? `取消收藏 ${item.title}`
                                    : `收藏 ${item.title}`
                                }
                                className={`p-1 rounded-md transition-colors ${
                                  item.isFavorite
                                    ? 'text-amber-500 hover:bg-amber-50'
                                    : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                <Star
                                  className="w-3.5 h-3.5"
                                  fill={
                                    item.isFavorite ? 'currentColor' : 'none'
                                  }
                                />
                              </button>
                            </div>
                          </div>

                          {/* Row 2: Title & Concise Scenario Subtitle */}
                          <h3 className="text-[15px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                            {item.title}
                          </h3>
                          {item.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                              {item.description}
                            </p>
                          )}

                          {/* Row 3: High-Capacity Structured Prompt Content Reader (6 lines normalized or Full Text) */}
                          <div className="mt-3 rounded-xl bg-slate-50/90 border border-slate-200/80 p-3.5 transition-colors group-hover:bg-slate-50 group-hover:border-slate-300/80">
                            <div
                              className={`text-[13px] text-slate-700 font-sans leading-[1.68] whitespace-pre-wrap break-words ${
                                isCardExpanded ? '' : 'line-clamp-6'
                              }`}
                            >
                              {segments.map((seg, idx) =>
                                seg.type === 'text' ? (
                                  <React.Fragment key={idx}>
                                    {seg.value}
                                  </React.Fragment>
                                ) : (
                                  <span
                                    key={idx}
                                    className="inline-block font-mono text-xs text-blue-700 bg-blue-100/75 border border-blue-200/80 px-1.5 py-0 rounded font-medium mx-0.5"
                                  >
                                    {seg.value}
                                    {seg.options && seg.options.length > 0
                                      ? ` (${seg.options.length}选1)`
                                      : ''}
                                  </span>
                                )
                              )}
                            </div>

                            {/* Content Box Footer: Line/Char Metric + One-Click Expand/Collapse Full Prompt */}
                            <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-mono tabular-nums text-slate-500 whitespace-nowrap">
                                共 {item.content.split('\n').length} 行 · {item.content.length} 字
                                {vars.length > 0 ? ` · 含 ${vars.length} 个变量` : ''}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (expandAllCards) {
                                    setExpandAllCards(false);
                                    const next: Record<string, boolean> = {};
                                    visiblePrompts.forEach((p) => {
                                      if (p.id !== item.id) next[p.id] = true;
                                    });
                                    setExpandedCardIds(next);
                                  } else {
                                    setExpandedCardIds((prev) => ({
                                      ...prev,
                                      [item.id]: !prev[item.id],
                                    }));
                                  }
                                }}
                                className="text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap shrink-0"
                              >
                                {isCardExpanded ? '收起全文 ▲' : '展开全文 ▼'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Row 4: Clean Footer Metadata + One-Click Copy Button */}
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0 truncate">
                            <span className="font-mono tabular-nums text-slate-500 shrink-0">
                              v{item.currentVersion}
                            </span>
                            {vars.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-blue-600 shrink-0">
                                  {vars.length}变量
                                  {presetCount > 0 ? `(${presetCount}预设)` : ''}
                                </span>
                              </>
                            )}
                            {item.tags.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate text-slate-400">
                                  {item.tags
                                    .slice(0, 3)
                                    .map((t) => `#${t}`)
                                    .join(' ')}
                                </span>
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleQuickCopyFromCard(e, item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-900 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            {copiedCardId === item.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span>已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>复制</span>
                              </>
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Windowed Load More Trigger */}
                {filteredPrompts.length > visibleCount && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCount((prev) => prev + PAGE_BATCH_SIZE)
                      }
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-2xs transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                      <span>
                        加载更多提示词（当前显示 {visibleCount} /{' '}
                        {filteredPrompts.length} 条）
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Compact High-Density List View */
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200/80">
                  <div className="px-4 py-2.5 bg-slate-50/80 text-xs font-semibold text-slate-500 flex items-center justify-between gap-4">
                    <span className="flex-1 min-w-0">
                      提示词标题 · 二级分类与场景
                    </span>
                    {!selectedPrompt && (
                      <span className="hidden xl:block w-52 shrink-0">
                        标签
                      </span>
                    )}
                    <span className="w-20 text-right font-mono shrink-0">
                      版本迭代
                    </span>
                    <span className="hidden sm:block w-16 text-right font-mono shrink-0">
                      使用次数
                    </span>
                    <span className="w-16 text-right shrink-0">操作</span>
                  </div>

                  {visiblePrompts.map((item) => {
                    const isSelected = item.id === selectedPromptId;
                    const isBatchChecked = selectedBatchIds.includes(item.id);
                    const catName = categoriesMap[item.categoryId] || '未分类';
                    const subCatName = item.subCategoryId
                      ? subCategoriesMap[item.subCategoryId]
                      : undefined;
                    const vars = extractVariables(item.content);
                    const isRowExpanded =
                      expandAllCards || Boolean(expandedCardIds[item.id]);
                    const compactContent = formatCompactPromptPreview(
                      item.content
                    );

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (isBatchMode) {
                            toggleBatchSelect(item.id);
                          } else {
                            setSelectedPromptId(item.id);
                          }
                        }}
                        className={`px-4 py-3.5 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                          isBatchMode && isBatchChecked
                            ? 'bg-blue-50/70'
                            : isSelected
                            ? 'bg-blue-50/50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {isBatchMode && (
                              <span
                                className={`shrink-0 ${
                                  isBatchChecked
                                    ? 'text-blue-600'
                                    : 'text-slate-300'
                                }`}
                              >
                                {isBatchChecked ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </span>
                            )}
                            {item.isPinned && (
                              <span className="text-[11px] font-semibold text-blue-600 shrink-0">
                                置顶
                              </span>
                            )}
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {item.title}
                            </span>
                            {vars.length > 0 && (
                              <span className="text-[11px] font-mono text-blue-600 tabular-nums shrink-0">
                                · {vars.length}变量
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (expandAllCards) {
                                  setExpandAllCards(false);
                                  setExpandedCardIds({ [item.id]: false });
                                } else {
                                  setExpandedCardIds((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }));
                                }
                              }}
                              className="text-[11px] text-blue-600 hover:underline font-medium shrink-0 ml-1"
                            >
                              {isRowExpanded ? '收起正文 ▴' : '展开正文 ▾'}
                            </button>
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            <span className="text-slate-700 font-medium">
                              {catName}
                              {subCatName ? ` / ${subCatName}` : ''}
                            </span>
                            {item.description && (
                              <>
                                <span className="mx-1.5">·</span>
                                <span>{item.description}</span>
                              </>
                            )}
                          </div>
                          <div className="mt-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                            <div
                              className={`text-xs text-slate-700 leading-relaxed whitespace-pre-wrap break-words ${
                                isRowExpanded ? '' : 'line-clamp-3'
                              }`}
                            >
                              {tokenizeTemplateSegments(
                                isRowExpanded ? item.content : compactContent
                              ).map((seg, idx) =>
                                seg.type === 'text' ? (
                                  <React.Fragment key={idx}>
                                    {seg.value}
                                  </React.Fragment>
                                ) : (
                                  <span
                                    key={idx}
                                    className="inline-block font-mono text-[11px] text-blue-700 bg-blue-100/75 border border-blue-200/80 px-1 py-0 rounded font-medium mx-0.5"
                                  >
                                    {seg.value}
                                    {seg.options && seg.options.length > 0
                                      ? ` (${seg.options.length}选1)`
                                      : ''}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>

                        {!selectedPrompt && (
                          <div className="hidden xl:block w-52 shrink-0 text-xs text-slate-400 truncate">
                            {item.tags.map((t) => `#${t}`).join(' ')}
                          </div>
                        )}

                        <div className="w-20 text-right font-mono text-xs tabular-nums text-slate-600 shrink-0 whitespace-nowrap">
                          v{item.currentVersion} ({item.versions.length}轮)
                        </div>

                        <div className="hidden sm:block w-16 text-right font-mono text-xs tabular-nums text-slate-600 shrink-0 whitespace-nowrap">
                          {item.usageCount} 次
                        </div>

                        <div className="w-16 text-right shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleQuickCopyFromCard(e, item)}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-900 hover:text-white rounded-md transition-colors whitespace-nowrap"
                          >
                            {copiedCardId === item.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span>已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>复制</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Docked Batch Operations Bar at bottom of Center Main Column (Zero Overlap with Right Workbench) */}
          {isBatchMode && selectedBatchIds.length > 0 && (
            <div
              role="region"
              aria-label="批量整理操作栏"
              className="animate-card-enter shrink-0 bg-slate-900 text-white px-4 lg:px-6 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 z-20"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-blue-300 font-mono tabular-nums whitespace-nowrap">
                  已选 {selectedBatchIds.length} 条
                </span>

                {/* Batch Move to 1st/2nd Category */}
                <div className="flex items-center gap-1.5 border-l border-slate-700 pl-3">
                  <FolderInput className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={batchTargetCategoryKey}
                    onChange={(e) => setBatchTargetCategoryKey(e.target.value)}
                    aria-label="选择批量移动目标分类"
                    className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {categories.map((cat) => (
                      <React.Fragment key={cat.id}>
                        <option value={`${cat.id}::`}>
                          {cat.name}（一级目录）
                        </option>
                        {(cat.subCategories || []).map((sub) => (
                          <option key={sub.id} value={`${cat.id}::${sub.id}`}>
                            {cat.name} / {sub.name}
                          </option>
                        ))}
                      </React.Fragment>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleBatchMoveCategory}
                    className="px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors whitespace-nowrap"
                  >
                    移动分类
                  </button>
                </div>

                {/* Batch Add Tags */}
                <form
                  onSubmit={handleBatchAddTags}
                  className="flex items-center gap-1.5 border-l border-slate-700 pl-3"
                >
                  <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={batchTagInput}
                    onChange={(e) => setBatchTagInput(e.target.value)}
                    placeholder="输入标签..."
                    aria-label="批量添加标签输入"
                    className="w-24 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors whitespace-nowrap"
                  >
                    加标签
                  </button>
                </form>
              </div>

              {/* Batch Export & Delete */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleBatchExportJson}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出选中</span>
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600/90 hover:bg-red-600 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>批量删除</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBatchIds([])}
                  aria-label="取消选中"
                  className="p-1 text-slate-400 hover:text-white rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right Detail & Multi-Round Iteration Workbench */}
        {selectedPrompt && (
          <div className="animate-panel-enter fixed inset-0 z-30 lg:static lg:z-auto flex justify-end bg-slate-900/30 lg:bg-transparent">
            <PromptDetailWorkbench
              prompt={selectedPrompt}
              categories={categories}
              snippets={snippets}
              rememberedVars={rememberedVarsByPrompt[selectedPrompt.id]}
              onUpdateRememberedVars={handleUpdateRememberedVars}
              onSaveVariableDefaults={handleSaveVariableDefaults}
              onSaveVariablePreset={handleSaveVariablePreset}
              onDeleteVariablePreset={handleDeleteVariablePreset}
              onAddSnippet={handleAddSnippet}
              onDeleteSnippet={handleDeleteSnippet}
              onClose={() => setSelectedPromptId(null)}
              onEditPrompt={(p) => setEditorState({ open: true, prompt: p })}
              onToggleFavorite={handleToggleFavorite}
              onTogglePin={handleTogglePin}
              onDuplicatePrompt={handleDuplicatePrompt}
              onDeletePrompt={handleDeletePrompt}
              onRecordUsage={handleRecordUsage}
              onRestoreVersion={handleRestoreVersion}
              onSaveQuickIteration={handleSaveQuickIteration}
            />
          </div>
        )}
          </>
        )}
      </div>

      {/* Create / Edit Prompt Modal */}
      {editorState.open && (
        <PromptEditorModal
          initialPrompt={editorState.prompt}
          categories={categories}
          existingTags={allTags.map((t) => t.tag)}
          snippets={snippets}
          defaultCategoryId={activeCategoryId}
          defaultSubCategoryId={activeSubCategoryId}
          onClose={() => setEditorState({ open: false, prompt: null })}
          onSave={handleSavePrompt}
          onAddCategory={handleAddCategory}
          onAddSubCategory={handleAddSubCategory}
          onAddSnippet={handleAddSnippet}
          onDeleteSnippet={handleDeleteSnippet}
        />
      )}

      {/* External Import / Local Backup Export Modal */}
      {importModalState.open && (
        <ImportExportModal
          initialTab={importModalState.tab}
          prompts={prompts}
          categories={categories}
          onClose={() =>
            setImportModalState((prev) => ({ ...prev, open: false }))
          }
          onImportPrompts={handleImportExternalPrompts}
        />
      )}

      {/* Lightweight Toast Notification with Undo Delete Support */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="animate-card-enter fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-xl shadow-lg flex items-center gap-3 whitespace-nowrap"
        >
          <History className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
          {deletedPromptsBackup && deletedPromptsBackup.length > 0 && (
            <button
              type="button"
              onClick={handleUndoDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>撤销删除</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
