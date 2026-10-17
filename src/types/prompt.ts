export interface PromptVersion {
  version: number;
  content: string;
  note: string;
  createdAt: string;
}

export interface SubCategory {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  subCategories: SubCategory[];
}

export interface PromptVariableDescriptor {
  name: string;
  options?: string[];
}

export interface VariablePreset {
  id: string;
  name: string;
  values: Record<string, string>;
}

export interface PromptSnippet {
  id: string;
  title: string;
  category: '角色设定' | '输出格式' | '思维链与约束' | '自定义';
  content: string;
}

export interface PromptItem {
  id: string;
  title: string;
  description: string;
  content: string;
  categoryId: string;
  subCategoryId?: string;
  tags: string[];
  isFavorite: boolean;
  isPinned?: boolean;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: number;
  versions: PromptVersion[];
  variableDefaults?: Record<string, string>;
  variablePresets?: VariablePreset[];
}

export type LibraryView = 'all' | 'favorites' | 'recent';

export type SortField = 'updatedAt' | 'usageCount' | 'createdAt' | 'title';

export type LayoutMode = 'grid' | 'table';

export interface FilterOptions {
  view: LibraryView;
  categoryId: string | 'all';
  subCategoryId?: string | 'all';
  selectedTags: string[];
  searchQuery: string;
  sortBy: SortField;
  categoriesMap?: Record<string, string>;
  subCategoriesMap?: Record<string, string>;
}

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface ImportedPromptDraft {
  title: string;
  description: string;
  content: string;
  categoryName?: string;
  subCategoryName?: string;
  tags: string[];
  versions?: PromptVersion[];
}

export interface ParsedImportResult {
  detectedFormat: 'json' | 'csv' | 'markdown' | 'text';
  items: ImportedPromptDraft[];
  errors: string[];
}
