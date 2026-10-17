import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVariables,
  extractVariableDescriptors,
  interpolatePrompt,
  normalizeTags,
  filterAndSortPrompts,
  applyPromptRevision,
  restorePromptVersion,
  computeLineDiff,
  parseExternalPrompts,
  tokenizeTemplateSegments,
  duplicatePromptItem,
} from './promptLogic.ts';
import type { PromptItem } from '../types/prompt.ts';

test('extractVariables and extractVariableDescriptors support standard and enum option variables', () => {
  const tpl =
    '请将以下 {{源语言}} 文本翻译为 {{目标语言}}，保持 {{语气风格:专业严谨|通俗幽默|精简干练}} 风格。原文（{{源语言}}）：\n{{原文内容}}';
  assert.deepEqual(extractVariables(tpl), ['源语言', '目标语言', '语气风格', '原文内容']);

  const descriptors = extractVariableDescriptors(tpl);
  assert.equal(descriptors.length, 4);
  assert.deepEqual(descriptors[2], {
    name: '语气风格',
    options: ['专业严谨', '通俗幽默', '精简干练'],
  });
  assert.deepEqual(extractVariables('无变量普通提示词'), []);
});

test('tokenizeTemplateSegments splits text and enum variable tokens cleanly without leaking raw options', () => {
  const segs = tokenizeTemplateSegments(
    '你好 {{角色:架构师|前端工程师}}，请审查 {{模块:用户中心|支付网关}}。',
    {
      角色: '架构师',
    }
  );
  assert.equal(segs.length, 5);
  assert.deepEqual(segs[1], {
    type: 'variable',
    value: '架构师',
    rawVariable: '角色',
    options: ['架构师', '前端工程师'],
    filled: true,
  });
  assert.deepEqual(segs[3], {
    type: 'variable',
    value: '{{模块}}',
    rawVariable: '模块',
    options: ['用户中心', '支付网关'],
    filled: false,
  });
});

test('duplicatePromptItem creates a clean v1 fork and filterAndSortPrompts prioritizes pinned prompts', () => {
  const original: PromptItem = {
    id: 'orig-1',
    title: '原提示词',
    description: '说明',
    content: '正文 {{变量}}',
    categoryId: 'cat-1',
    tags: ['测试'],
    isFavorite: true,
    isPinned: false,
    usageCount: 10,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    currentVersion: 3,
    versions: [{ version: 3, content: '正文 {{变量}}', note: 'v3', createdAt: '2026-10-10T00:00:00Z' }],
    variablePresets: [{ id: 'pre-1', name: '默认预设', values: { 变量: '123' } }],
  };

  const forked = duplicatePromptItem(original, '2026-10-17T00:00:00Z');
  assert.equal(forked.title, '原提示词 (副本)');
  assert.equal(forked.currentVersion, 1);
  assert.equal(forked.usageCount, 0);
  assert.equal(forked.variablePresets?.length, 1);
  assert.ok(forked.versions[0].note.includes('衍生自「原提示词」v3'));

  const pinnedItem: PromptItem = {
    ...original,
    id: 'pinned-2',
    title: '置顶提示词',
    isPinned: true,
    updatedAt: '2026-09-01T00:00:00Z',
  };
  const sorted = filterAndSortPrompts([original, pinnedItem], {
    view: 'all',
    categoryId: 'all',
    selectedTags: [],
    searchQuery: '',
    sortBy: 'updatedAt',
  });
  assert.equal(sorted[0].id, 'pinned-2');
});

test('interpolatePrompt fills supplied variables and strips enum syntax from unfilled placeholders', () => {
  const tpl = '帮我以 {{角色:资深架构师|安全专家}} 的视角审查关于 {{主题:本地缓存|并发锁}} 的方案。';
  const filled = interpolatePrompt(tpl, { 角色: '资深架构师' }, true);
  assert.equal(filled, '帮我以 资深架构师 的视角审查关于 {{主题}} 的方案。');

  const fullyFilled = interpolatePrompt(tpl, { 角色: '资深架构师', 主题: '本地缓存策略' }, true);
  assert.equal(fullyFilled, '帮我以 资深架构师 的视角审查关于 本地缓存策略 的方案。');
});

test('normalizeTags cleans hash prefixes, trims, and deduplicates case-insensitively', () => {
  assert.deepEqual(normalizeTags(['#代码审查', ' 代码审查 ', '#TypeScript', 'typescript', '']), [
    '代码审查',
    'TypeScript',
  ]);
});

test('applyPromptRevision and restorePromptVersion track multi-round modifications accurately', () => {
  const basePrompt: PromptItem = {
    id: 'p-1',
    title: '周报提炼助手',
    description: '将零散工作记录整理成结构化周报',
    content: '请帮我把以下内容整理成周报：\n{{工作记录}}',
    categoryId: 'cat-work',
    tags: ['周报', '总结'],
    isFavorite: true,
    usageCount: 5,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        content: '请帮我把以下内容整理成周报：\n{{工作记录}}',
        note: '初始版本',
        createdAt: '2026-10-01T10:00:00.000Z',
      },
    ],
  };

  // Round 2 modification (content changed)
  const v2 = applyPromptRevision(
    basePrompt,
    {
      title: '周报提炼助手',
      description: '将零散工作记录整理成结构化周报',
      content: '请将以下零散记录整理为【核心产出】【进展与风险】【下周计划】三部分：\n{{工作记录}}',
      categoryId: 'cat-work',
      tags: ['周报', '总结', '结构化'],
      note: '增加三段式输出结构约束',
    },
    '2026-10-05T12:00:00.000Z'
  );

  assert.equal(v2.currentVersion, 2);
  assert.equal(v2.versions.length, 2);
  assert.equal(v2.versions[1].note, '增加三段式输出结构约束');

  // Metadata-only modification does not create a redundant version
  const metaUpdated = applyPromptRevision(
    v2,
    {
      title: '结构化周报提炼助手',
      description: '将零散工作记录整理成结构化周报',
      content: v2.content,
      categoryId: 'cat-work',
      tags: ['周报', '总结', '结构化'],
    },
    '2026-10-06T12:00:00.000Z'
  );
  assert.equal(metaUpdated.currentVersion, 2);
  assert.equal(metaUpdated.versions.length, 2);
  assert.equal(metaUpdated.title, '结构化周报提炼助手');

  // Restore to v1 creates v3 with rollback note so history is never lost
  const restoredV3 = restorePromptVersion(metaUpdated, 1, '2026-10-07T12:00:00.000Z');
  assert.equal(restoredV3.currentVersion, 3);
  assert.equal(restoredV3.versions.length, 3);
  assert.equal(restoredV3.content, basePrompt.content);
  assert.ok(restoredV3.versions[2].note.includes('回滚自 v1'));
});

test('filterAndSortPrompts filters by category, tags, favorites, and multi-token search query', () => {
  const items: PromptItem[] = [
    {
      id: '1',
      title: '代码重构与边界检查',
      description: '针对 TypeScript 函数的可读性与边界条件审查',
      content: '请检查以下代码：{{代码片段}}',
      categoryId: 'coding',
      tags: ['TypeScript', '重构'],
      isFavorite: true,
      usageCount: 12,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z',
      currentVersion: 1,
      versions: [{ version: 1, content: '请检查以下代码：{{代码片段}}', note: '初版', createdAt: '2026-10-01T00:00:00Z' }],
    },
    {
      id: '2',
      title: '技术文章润色',
      description: '消除翻译腔，使中文表达自然流畅',
      content: '请润色以下段落：{{正文}}',
      categoryId: 'writing',
      tags: ['写作', '润色'],
      isFavorite: false,
      usageCount: 20,
      createdAt: '2026-10-02T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
      currentVersion: 1,
      versions: [{ version: 1, content: '请润色以下段落：{{正文}}', note: '初版', createdAt: '2026-10-02T00:00:00Z' }],
    },
  ];

  const byTag = filterAndSortPrompts(items, {
    view: 'all',
    categoryId: 'all',
    selectedTags: ['重构'],
    searchQuery: '',
    sortBy: 'updatedAt',
  });
  assert.equal(byTag.length, 1);
  assert.equal(byTag[0].id, '1');

  const bySearch = filterAndSortPrompts(items, {
    view: 'all',
    categoryId: 'all',
    selectedTags: [],
    searchQuery: '翻译腔 润色',
    sortBy: 'updatedAt',
  });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].id, '2');
});

test('parseExternalPrompts supports JSON, GitHub CSV ("act","prompt"), and Markdown sections', () => {
  // 1. GitHub awesome-chatgpt-prompts CSV format
  const csvSample = `"act","prompt"\n"Linux Terminal","I want you to act as a linux terminal. I will type commands and you will reply with what the terminal should show."\n"English Translator","I want you to act as an English translator, spelling corrector and improver."`;
  const csvParsed = parseExternalPrompts(csvSample, 'auto');
  assert.equal(csvParsed.detectedFormat, 'csv');
  assert.equal(csvParsed.items.length, 2);
  assert.equal(csvParsed.items[0].title, 'Linux Terminal');

  // 2. Markdown format with two-level category (一级分类 / 二级子分类)
  const mdSample = `## 会议纪要整理\n分类: 职场效率 / 会议纪要\n标签: #纪要 #行动项\n请根据以下会议录音转写文本，提炼关键决议和待办事项：\n{{会议记录}}\n\n## SQL 慢查询优化\n标签: #SQL #数据库\n请分析以下 SQL 查询与执行计划：{{SQL语句}}`;
  const mdParsed = parseExternalPrompts(mdSample, 'auto');
  assert.equal(mdParsed.detectedFormat, 'markdown');
  assert.equal(mdParsed.items.length, 2);
  assert.equal(mdParsed.items[0].categoryName, '职场效率');
  assert.equal(mdParsed.items[0].subCategoryName, '会议纪要');
  assert.deepEqual(mdParsed.items[0].tags, ['纪要', '行动项']);

  // 3. Diff calculation
  const diff = computeLineDiff('第一行\n旧的第二行', '第一行\n新的第二行');
  assert.equal(diff.filter((d) => d.type === 'same').length, 1);
  assert.equal(diff.filter((d) => d.type === 'removed').length, 1);
  assert.equal(diff.filter((d) => d.type === 'added').length, 1);
});
