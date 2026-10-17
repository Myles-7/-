import React, { useState, useMemo } from 'react';
import {
  Play,
  Plus,
  Copy,
  Check,
  Trash2,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  Sliders,
  Settings2,
  RotateCcw,
  FileDown,
  Link2,
  FileEdit,
  CheckCircle2,
  CircleDot,
  Circle,
  GitCommitHorizontal,
  Layers,
  Sparkles,
  CopyPlus,
  Edit3,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Zap,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  X,
  GripVertical,
} from 'lucide-react';
import type {
  Category,
  PromptChain,
  PromptChainStep,
  PromptItem,
  PromptSnippet,
} from '../types/prompt';
import {
  analyzeChainVariables,
  assembleChainStepPrompt,
  extractVariableDescriptors,
  resolveChainStepContent,
  tokenizeTemplateSegments,
  exportChainAsMarkdown,
  buildChainFromPromptItems,
  simulateChainRunState,
  formatCompactPromptPreview,
} from '../utils/promptLogic';
import { SnippetPickerPopover } from './SnippetPickerPopover';

interface PromptChainCanvasWorkspaceProps {
  chains: PromptChain[];
  prompts: PromptItem[];
  categories: Category[];
  snippets: PromptSnippet[];
  onSaveChain: (updatedChain: PromptChain) => void;
  onCreateChain: (newChain: PromptChain) => void;
  onDeleteChain: (chainId: string) => void;
  onAddSnippet: (snippet: Omit<PromptSnippet, 'id'>) => void;
  onDeleteSnippet: (id: string) => void;
  onShowToast: (msg: string) => void;
  onBackToLibrary?: () => void;
}

const SAMPLE_STEP_OUTPUTS: Record<string, string> = {
  需求验收清单: `1. 核心流程：支持按一级/二级分类筛选与多步工作流串联执行；
2. 边界容错：当上游变量未填写时保留 {{变量名}} 占位提示，不发生空指针崩溃；
3. 验收标准：单步复制响应 <= 100ms，刷新页面后画布节点与已填变量自动持久化。`,
  接口与表结构定义: `interface WorkflowStepState {
  stepId: string;
  handoffVarName: string;
  compiledContent: string;
  capturedOutput?: string;
}
// 状态流转契约：Step(i).capturedOutput 自动映射至 Step(j > i).variables[handoffVarName]`,
  核心实现与审查结论: `- 已完成纯函数 assembleChainStepPrompt 多级上游变量注入；
- 边界自检通过：支持跳跃步骤引用（如第 4 步同时引用第 1 步与第 3 步产出）；
- 单元测试覆盖率 100%。`,
  文献核心洞察: `1. 核心方法论：采用分层索引 + 局部上下文注入，降低长提示词推理噪声；
2. 关键量化指标：结构化任务流比单次长 Prompt 准确率提升 34%；
3. 适用边界：适合需求拆解、调研对比、多轮精修等高确定性场景。`,
  竞品对比矩阵结论: `| 维度 | 传统单条提示词工具 | 复杂全代码工作流 | PromptVault 场景任务流 |
| --- | --- | --- | --- |
| 上手门槛 | 极低 | 极高（需连线配端口） | 低（自动串联+变量接力） |
| 复用能力 | 单点复用 | 流程锁定难改 | 词库模板与独立节点混排 |`,
  待润色原文: `在日常工程研发中，我们常常遇到单条 Prompt 既要拆需求又要写代码导致顾此失彼的问题。通过将复杂任务拆解为 3~4 个职责单一的串联节点，每一轮只聚焦一个明确产物，能显著提升交付质量。`,
  精修定稿正文: `单条长提示词同时承担需求拆解与代码实现时，往往顾此失彼。把复杂任务拆成 3 到 4 个职责单一的串联节点，让上一步的结论自动成为下一步的输入变量，是提升复杂任务稳定性最有效的方式。`,
};

const QUICK_FUNCTIONAL_NODE_PRESETS: {
  label: string;
  title: string;
  handoffVarName: string;
  stepNote: string;
  customContent: string;
}[] = [
  {
    label: '+ 需求拆解节点',
    title: '需求边界与痛点拆解',
    handoffVarName: '需求拆解结论',
    stepNote: '理清核心诉求、隐含边界条件与验收标准，供下游节点直接引用。',
    customContent:
      '请针对【{{核心任务目标}}】进行第一性原理拆解，列出：\n1. 核心主流程与目标产物；\n2. 容易遗漏的异常边界条件；\n3. 可量化的验收清单。',
  },
  {
    label: '+ 方案审查节点',
    title: '架构与边界容错审查',
    handoffVarName: '审查优化建议',
    stepNote: '承接上游方案或代码，从健壮性、可维护性与性能视角输出改进清单。',
    customContent:
      '请以资深架构师视角，按【高优必改】【中优建议】【边界容错】三个维度审查以下上游内容，并给出可直接替换的修正方案：',
  },
  {
    label: '+ 去AI味润色节点',
    title: '去 AI 味自然精修定稿',
    handoffVarName: '精修终稿内容',
    stepNote: '消除生硬连接词与翻译腔，输出自然干练的专业终稿。',
    customContent:
      '请对以下内容进行深度去 AI 味润色，删去空洞套话与生硬过渡词，保持逻辑锋利、用词平实准确，直接输出定稿正文：',
  },
];

export const PromptChainCanvasWorkspace: React.FC<
  PromptChainCanvasWorkspaceProps
> = ({
  chains,
  prompts,
  categories,
  snippets,
  onSaveChain,
  onCreateChain,
  onDeleteChain,
  onAddSnippet,
  onDeleteSnippet,
  onShowToast,
  onBackToLibrary,
}) => {
  const [selectedChainId, setSelectedChainId] = useState<string>(
    () => chains[0]?.id || ''
  );
  const activeChain = useMemo(
    () => chains.find((c) => c.id === selectedChainId) || chains[0] || null,
    [chains, selectedChainId]
  );

  const [selectedStepId, setSelectedStepId] = useState<string>(() => {
    const firstChain = chains[0];
    return firstChain?.steps[0]?.id || '';
  });

  // Left studio drawer state: collapsible + active tab ('workflows' | 'vault')
  const [leftPaletteOpen, setLeftPaletteOpen] = useState<boolean>(true);
  const [leftPaletteTab, setLeftPaletteTab] = useState<'workflows' | 'vault'>(
    'workflows'
  );
  const [vaultSearchQuery, setVaultSearchQuery] = useState<string>('');

  // Quick-start onboarding banner state
  const [showOnboardingGuide, setShowOnboardingGuide] = useState<boolean>(true);

  // New Workflow Starter Wizard Modal state
  const [starterModalOpen, setStarterModalOpen] = useState<boolean>(false);
  const [starterMode, setStarterMode] = useState<'from-vault' | 'blueprint'>(
    'from-vault'
  );
  const [starterTitle, setStarterTitle] = useState<string>('');
  const [starterPickedPromptIds, setStarterPickedPromptIds] = useState<
    string[]
  >([]);

  // Drag-and-drop node reorder state
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [dragOverStepIndex, setDragOverStepIndex] = useState<number | null>(
    null
  );

  // Canvas layout mode: 'horizontal' (2-column connected serpentine flow graph) | 'vertical' (single-column waterfall)
  const [canvasDirection, setCanvasDirection] = useState<
    'horizontal' | 'vertical'
  >('horizontal');
  const [canvasZoom, setCanvasZoom] = useState<number>(100);

  // Right inspector mode: 'run' (Execute & Variable Handoff) | 'config' (Node Template & Handoff Config)
  const [inspectorTab, setInspectorTab] = useState<'run' | 'config'>('run');

  // Mobile pane toggle ('canvas' | 'workbench')
  const [mobilePane, setMobilePane] = useState<'canvas' | 'workbench'>(
    'canvas'
  );

  // Per-chain runtime state: variable values & captured step outputs
  const [chainVarsMap, setChainVarsMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const [chainOutputsMap, setChainOutputsMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const [completedStepsMap, setCompletedStepsMap] = useState<
    Record<string, Record<string, boolean>>
  >({});

  // Chain header inline edit modal/popover
  const [isEditingChainMeta, setIsEditingChainMeta] = useState(false);
  const [metaTitleDraft, setMetaTitleDraft] = useState('');
  const [metaDescDraft, setMetaDescDraft] = useState('');
  const [metaCatDraft, setMetaCatDraft] = useState('');

  // Copy feedback states
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [expandedStepCardIds, setExpandedStepCardIds] = useState<
    Record<string, boolean>
  >({});
  const [expandAllStepCards, setExpandAllStepCards] = useState<boolean>(false);
  const [expandWorkbenchPreview, setExpandWorkbenchPreview] =
    useState<boolean>(false);

  const promptsMap = useMemo(() => {
    const map: Record<string, PromptItem> = {};
    for (const p of prompts) {
      map[p.id] = p;
    }
    return map;
  }, [prompts]);

  const filteredVaultPrompts = useMemo(() => {
    const q = vaultSearchQuery.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [prompts, vaultSearchQuery]);

  // Ensure selectedStepId stays valid when switching chains
  const activeStepIndex = useMemo(() => {
    if (!activeChain) return 0;
    const idx = activeChain.steps.findIndex((s) => s.id === selectedStepId);
    return idx >= 0 ? idx : 0;
  }, [activeChain, selectedStepId]);

  const activeStep = activeChain?.steps[activeStepIndex] || null;

  const currentVarValues = useMemo(() => {
    if (!activeChain) return {};
    return chainVarsMap[activeChain.id] || {};
  }, [activeChain, chainVarsMap]);

  const currentStepOutputs = useMemo(() => {
    if (!activeChain) return {};
    return chainOutputsMap[activeChain.id] || {};
  }, [activeChain, chainOutputsMap]);

  const currentCompletedSteps = useMemo(() => {
    if (!activeChain) return {};
    return completedStepsMap[activeChain.id] || {};
  }, [activeChain, completedStepsMap]);

  const chainAnalysis = useMemo(() => {
    if (!activeChain) {
      return { stepDescriptors: {}, sharedVarNames: [] };
    }
    return analyzeChainVariables(activeChain, promptsMap);
  }, [activeChain, promptsMap]);

  // Upstream handoff variable names produced by steps 0 .. N-1
  const allHandoffVarNames = useMemo(() => {
    if (!activeChain) return new Set<string>();
    const set = new Set<string>();
    for (const s of activeChain.steps) {
      if (s.handoffVarName?.trim()) {
        set.add(s.handoffVarName.trim());
      }
    }
    return set;
  }, [activeChain]);

  // Shared user-input variables (excluding auto-handoff variables)
  const sharedInputDescriptors = useMemo(() => {
    if (!activeChain) return [];
    const seen = new Map<string, { name: string; options?: string[] }>();
    for (const step of activeChain.steps) {
      const descs = chainAnalysis.stepDescriptors[step.id] || [];
      for (const d of descs) {
        if (allHandoffVarNames.has(d.name)) continue;
        if (chainAnalysis.sharedVarNames.includes(d.name)) {
          const existing = seen.get(d.name);
          if (!existing || (!existing.options && d.options)) {
            seen.set(d.name, d);
          }
        }
      }
    }
    return Array.from(seen.values());
  }, [activeChain, chainAnalysis, allHandoffVarNames]);

  // Assemble the active step prompt
  const activeStepAssembled = useMemo(() => {
    if (!activeChain || !activeStep) {
      return { assembled: '', effectiveValues: {}, handoffFromPrev: undefined };
    }
    return assembleChainStepPrompt(
      activeChain,
      activeStepIndex,
      promptsMap,
      currentVarValues,
      currentStepOutputs
    );
  }, [
    activeChain,
    activeStep,
    activeStepIndex,
    promptsMap,
    currentVarValues,
    currentStepOutputs,
  ]);

  const activeStepRawContent = activeStep
    ? resolveChainStepContent(activeStep, promptsMap)
    : '';
  const activeStepDescriptors = useMemo(
    () => extractVariableDescriptors(activeStepRawContent),
    [activeStepRawContent]
  );

  // Upstream steps that produce a handoff variable consumed by the active step
  const upstreamConnectionsForActiveStep = useMemo(() => {
    if (!activeChain || !activeStep) return [];
    const neededVarNames = new Set(activeStepDescriptors.map((d) => d.name));
    const list: {
      stepIndex: number;
      step: PromptChainStep;
      varName: string;
      outputValue: string;
    }[] = [];

    for (let i = 0; i < activeStepIndex; i++) {
      const s = activeChain.steps[i];
      if (s.handoffVarName && neededVarNames.has(s.handoffVarName)) {
        list.push({
          stepIndex: i,
          step: s,
          varName: s.handoffVarName,
          outputValue: (currentStepOutputs[s.id] || '').trim(),
        });
      }
    }
    return list;
  }, [
    activeChain,
    activeStep,
    activeStepIndex,
    activeStepDescriptors,
    currentStepOutputs,
  ]);

  // Unified variable list for the right workbench (combines current step descriptors + any global shared descriptors not yet listed)
  const unifiedWorkbenchDescriptors = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        options?: string[];
        isCurrentStep: boolean;
        isShared: boolean;
        upstreamSource?: {
          stepIndex: number;
          step: PromptChainStep;
          outputValue: string;
        };
      }
    >();

    for (const d of activeStepDescriptors) {
      const upstream = upstreamConnectionsForActiveStep.find(
        (c) => c.varName === d.name
      );
      map.set(d.name, {
        name: d.name,
        options: d.options,
        isCurrentStep: true,
        isShared: chainAnalysis.sharedVarNames.includes(d.name),
        upstreamSource: upstream
          ? {
              stepIndex: upstream.stepIndex,
              step: upstream.step,
              outputValue: upstream.outputValue,
            }
          : undefined,
      });
    }

    for (const sd of sharedInputDescriptors) {
      if (!map.has(sd.name)) {
        map.set(sd.name, {
          name: sd.name,
          options: sd.options,
          isCurrentStep: false,
          isShared: true,
        });
      }
    }

    return Array.from(map.values());
  }, [
    activeStepDescriptors,
    upstreamConnectionsForActiveStep,
    chainAnalysis.sharedVarNames,
    sharedInputDescriptors,
  ]);

  // Group steps into pairs for Horizontal Connected Serpentine Canvas
  const horizontalStepRows = useMemo(() => {
    if (!activeChain) return [];
    const rows: {
      rowIndex: number;
      items: { step: PromptChainStep; index: number }[];
    }[] = [];
    for (let i = 0; i < activeChain.steps.length; i += 2) {
      const pair: { step: PromptChainStep; index: number }[] = [
        { step: activeChain.steps[i], index: i },
      ];
      if (i + 1 < activeChain.steps.length) {
        pair.push({ step: activeChain.steps[i + 1], index: i + 1 });
      }
      rows.push({ rowIndex: rows.length, items: pair });
    }
    return rows;
  }, [activeChain]);

  const handleSetVarValue = (varName: string, value: string) => {
    if (!activeChain) return;
    setChainVarsMap((prev) => ({
      ...prev,
      [activeChain.id]: {
        ...(prev[activeChain.id] || {}),
        [varName]: value,
      },
    }));
  };

  const handleSetStepOutput = (stepId: string, outputText: string) => {
    if (!activeChain) return;
    setChainOutputsMap((prev) => ({
      ...prev,
      [activeChain.id]: {
        ...(prev[activeChain.id] || {}),
        [stepId]: outputText,
      },
    }));
    if (outputText.trim()) {
      setCompletedStepsMap((prev) => ({
        ...prev,
        [activeChain.id]: {
          ...(prev[activeChain.id] || {}),
          [stepId]: true,
        },
      }));
    }
  };

  const handleToggleStepComplete = (stepId: string) => {
    if (!activeChain) return;
    setCompletedStepsMap((prev) => {
      const current = prev[activeChain.id]?.[stepId] || false;
      return {
        ...prev,
        [activeChain.id]: {
          ...(prev[activeChain.id] || {}),
          [stepId]: !current,
        },
      };
    });
  };

  // One-Click Full Workflow Simulation (Populates realistic variables & outputs across all steps!)
  const handleSimulateFullChain = () => {
    if (!activeChain) return;
    const sim = simulateChainRunState(
      activeChain,
      promptsMap,
      SAMPLE_STEP_OUTPUTS
    );
    setChainVarsMap((prev) => ({
      ...prev,
      [activeChain.id]: {
        ...(prev[activeChain.id] || {}),
        ...sim.varValues,
      },
    }));
    setChainOutputsMap((prev) => ({
      ...prev,
      [activeChain.id]: sim.stepOutputs,
    }));
    setCompletedStepsMap((prev) => ({
      ...prev,
      [activeChain.id]: sim.completedSteps,
    }));
    // Select the last or second step so the user immediately sees upstream auto-injection in action
    const targetIdx =
      activeChain.steps.length > 1 ? activeChain.steps.length - 1 : 0;
    if (activeChain.steps[targetIdx]) {
      setSelectedStepId(activeChain.steps[targetIdx].id);
    }
    setInspectorTab('run');
    onShowToast(
      `⚡ 已模拟运行全部 ${activeChain.steps.length} 个节点，上游产出已自动注入下游 {{变量}}`
    );
  };

  const handleResetChainRun = () => {
    if (!activeChain) return;
    setChainVarsMap((prev) => ({ ...prev, [activeChain.id]: {} }));
    setChainOutputsMap((prev) => ({ ...prev, [activeChain.id]: {} }));
    setCompletedStepsMap((prev) => ({ ...prev, [activeChain.id]: {} }));
    if (activeChain.steps[0]) {
      setSelectedStepId(activeChain.steps[0].id);
    }
    onShowToast('已重置当前任务流的变量与执行状态');
  };

  const handleCopyStepPrompt = async (
    stepIndex: number,
    advanceToNext = false
  ) => {
    if (!activeChain) return;
    const step = activeChain.steps[stepIndex];
    if (!step) return;

    const { assembled } = assembleChainStepPrompt(
      activeChain,
      stepIndex,
      promptsMap,
      currentVarValues,
      currentStepOutputs
    );

    try {
      await navigator.clipboard.writeText(assembled);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = assembled;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopiedStepId(step.id);
    setTimeout(() => {
      setCopiedStepId((prev) => (prev === step.id ? null : prev));
    }, 1800);

    setCompletedStepsMap((prev) => ({
      ...prev,
      [activeChain.id]: {
        ...(prev[activeChain.id] || {}),
        [step.id]: true,
      },
    }));

    if (advanceToNext && stepIndex + 1 < activeChain.steps.length) {
      const nextStep = activeChain.steps[stepIndex + 1];
      setSelectedStepId(nextStep.id);
      onShowToast(
        `已复制 Step 0${stepIndex + 1} 提示词，并推进至「${nextStep.title}」`
      );
    } else {
      onShowToast(`已复制「${step.title}」合成后的提示词`);
    }
  };

  const handleFillSampleOutputForStep = (
    stepIndex: number,
    advanceToNext = true
  ) => {
    if (!activeChain) return;
    const step = activeChain.steps[stepIndex];
    if (!step) return;
    const handoffKey = step.handoffVarName || '';
    const sample =
      SAMPLE_STEP_OUTPUTS[handoffKey] ||
      `【${step.title} · 阶段性产出结论】\n1. 核心约束与边界已确认；\n2. 关键结构定义完备，可直接作为下一阶段输入。`;
    handleSetStepOutput(step.id, sample);

    if (advanceToNext && stepIndex + 1 < activeChain.steps.length) {
      const nextStep = activeChain.steps[stepIndex + 1];
      setSelectedStepId(nextStep.id);
      onShowToast(
        `已填入示例产出并自动注入下一步变量 {{${
          handoffKey || '上一步产出'
        }}}`
      );
    } else {
      onShowToast(`已填入「${step.title}」示例产出`);
    }
  };

  // Node CRUD operations on Canvas
  const handleAddStepAt = (insertIndex: number) => {
    if (!activeChain) return;
    const newStepId = `step-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;

    // Ensure the upstream step has a handoffVarName so the relay works out of the box
    const nextSteps = [...activeChain.steps];
    let upstreamVarName = `阶段产出_${insertIndex}`;
    if (insertIndex > 0) {
      const prevStep = { ...nextSteps[insertIndex - 1] };
      if (!prevStep.handoffVarName) {
        prevStep.handoffVarName = `阶段0${insertIndex}_产出结论`;
        nextSteps[insertIndex - 1] = prevStep;
      }
      upstreamVarName = prevStep.handoffVarName;
    }

    const inheritedHandoff =
      insertIndex > 0
        ? `\n\n【上游传入的${upstreamVarName}】：\n{{${upstreamVarName}}}`
        : '';

    const newStep: PromptChainStep = {
      id: newStepId,
      title: `新增步骤节点 #${insertIndex + 1}`,
      handoffVarName: `阶段0${insertIndex + 1}_产出结论`,
      stepNote: '在此配置本步骤的执行目标或关联词库模板。',
      customContent: `请针对【{{核心任务目标}}】执行分析与处理。${inheritedHandoff}\n\n请按结构化要点输出本阶段结论：`,
    };

    nextSteps.splice(insertIndex, 0, newStep);

    onSaveChain({
      ...activeChain,
      steps: nextSteps,
      updatedAt: new Date().toISOString(),
    });
    setSelectedStepId(newStepId);
    setInspectorTab('config');
    setMobilePane('workbench');
    onShowToast(`已在第 ${insertIndex + 1} 步位置新增串联节点`);
  };

  // One-click append a saved PromptItem from PromptVault onto the active canvas!
  const handleAppendPromptFromVault = (prompt: PromptItem) => {
    if (!activeChain) return;
    const insertIndex = activeChain.steps.length;
    const newStepId = `step-vault-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;

    const nextSteps = [...activeChain.steps];
    let upstreamRelaySuffix = '';

    if (insertIndex > 0) {
      const prevStep = { ...nextSteps[insertIndex - 1] };
      if (!prevStep.handoffVarName) {
        prevStep.handoffVarName = `阶段0${insertIndex}_${prevStep.title
          .slice(0, 5)
          .replace(/\s+/g, '')}产出`;
        nextSteps[insertIndex - 1] = prevStep;
      }
      upstreamRelaySuffix = `\n\n【承接上一步 · ${prevStep.handoffVarName}】：\n{{${prevStep.handoffVarName}}}`;
    }

    const newStep: PromptChainStep = {
      id: newStepId,
      title: prompt.title,
      promptId: insertIndex === 0 ? prompt.id : undefined,
      customContent:
        insertIndex > 0 ? `${prompt.content}${upstreamRelaySuffix}` : undefined,
      handoffVarName: `阶段0${insertIndex + 1}_${prompt.title
        .slice(0, 5)
        .replace(/\s+/g, '')}产出`,
      stepNote:
        prompt.description ||
        `来自词库《${prompt.title}》，已自动接入工作流上文变量。`,
    };

    nextSteps.push(newStep);

    onSaveChain({
      ...activeChain,
      steps: nextSteps,
      updatedAt: new Date().toISOString(),
    });
    setSelectedStepId(newStepId);
    setInspectorTab('run');
    onShowToast(
      `已将词库「${prompt.title}」加入画布第 ${insertIndex + 1} 步并自动接力上游产出`
    );
  };

  // One-click append a functional preset node
  const handleAppendPresetNode = (
    preset: (typeof QUICK_FUNCTIONAL_NODE_PRESETS)[number]
  ) => {
    if (!activeChain) return;
    const insertIndex = activeChain.steps.length;
    const newStepId = `step-preset-${Date.now()}`;
    const nextSteps = [...activeChain.steps];
    let upstreamSuffix = '';

    if (insertIndex > 0) {
      const prevStep = { ...nextSteps[insertIndex - 1] };
      if (!prevStep.handoffVarName) {
        prevStep.handoffVarName = `阶段0${insertIndex}_产出结论`;
        nextSteps[insertIndex - 1] = prevStep;
      }
      upstreamSuffix = `\n\n【上游传入 · ${prevStep.handoffVarName}】：\n{{${prevStep.handoffVarName}}}`;
    }

    const newStep: PromptChainStep = {
      id: newStepId,
      title: preset.title,
      handoffVarName: preset.handoffVarName,
      stepNote: preset.stepNote,
      customContent: `${preset.customContent}${upstreamSuffix}`,
    };

    nextSteps.push(newStep);
    onSaveChain({
      ...activeChain,
      steps: nextSteps,
      updatedAt: new Date().toISOString(),
    });
    setSelectedStepId(newStepId);
    setInspectorTab('run');
    onShowToast(`已添加「${preset.title}」节点并自动串联上游变量`);
  };

  const handleMoveStep = (stepIndex: number, direction: 'prev' | 'next') => {
    if (!activeChain) return;
    const targetIndex = direction === 'prev' ? stepIndex - 1 : stepIndex + 1;
    if (targetIndex < 0 || targetIndex >= activeChain.steps.length) return;

    const nextSteps = [...activeChain.steps];
    const [moved] = nextSteps.splice(stepIndex, 1);
    nextSteps.splice(targetIndex, 0, moved);

    onSaveChain({
      ...activeChain,
      steps: nextSteps,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleReorderStepDragDrop = (fromIndex: number, toIndex: number) => {
    if (!activeChain || fromIndex === toIndex) return;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= activeChain.steps.length ||
      toIndex >= activeChain.steps.length
    ) {
      return;
    }
    const nextSteps = [...activeChain.steps];
    const [moved] = nextSteps.splice(fromIndex, 1);
    nextSteps.splice(toIndex, 0, moved);

    onSaveChain({
      ...activeChain,
      steps: nextSteps,
      updatedAt: new Date().toISOString(),
    });
    onShowToast(
      `已将「${moved.title}」调整至第 ${toIndex + 1} 步`
    );
  };

  const handleDeleteStep = (stepId: string) => {
    if (!activeChain) return;
    if (activeChain.steps.length <= 1) {
      onShowToast('工作流至少需要保留 1 个步骤节点');
      return;
    }
    const nextSteps = activeChain.steps.filter((s) => s.id !== stepId);
    onSaveChain({
      ...activeChain,
      steps: nextSteps,
      updatedAt: new Date().toISOString(),
    });
    if (selectedStepId === stepId && nextSteps[0]) {
      setSelectedStepId(nextSteps[0].id);
    }
    onShowToast('已移除步骤节点');
  };

  const handleUpdateActiveStep = (patch: Partial<PromptChainStep>) => {
    if (!activeChain || !activeStep) return;
    const nextSteps = activeChain.steps.map((s) =>
      s.id === activeStep.id ? { ...s, ...patch } : s
    );
    onSaveChain({
      ...activeChain,
      steps: nextSteps,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleOpenStarterWizard = () => {
    setStarterTitle(`自定义串联任务流 #${chains.length + 1}`);
    setStarterPickedPromptIds(prompts.slice(0, 2).map((p) => p.id));
    setStarterMode('from-vault');
    setStarterModalOpen(true);
  };

  const handleCreateFromVaultWizard = () => {
    const picked = starterPickedPromptIds
      .map((id) => promptsMap[id])
      .filter(Boolean);
    if (picked.length === 0) {
      onShowToast('请至少勾选 1 个词库模板进行串联');
      return;
    }
    const newChain = buildChainFromPromptItems(picked, {
      title: starterTitle.trim() || `词库串联流 #${chains.length + 1}`,
      category: categories[0]?.name || '编程与架构',
    });
    onCreateChain(newChain);
    setSelectedChainId(newChain.id);
    if (newChain.steps[0]) setSelectedStepId(newChain.steps[0].id);
    setStarterModalOpen(false);
    setInspectorTab('run');
    onShowToast(
      `已将 ${picked.length} 个词库模板自动串联为「${newChain.title}」`
    );
  };

  const handleCreateBlueprintChain = (
    blueprintType: 'dev-3step' | 'research-3step' | 'blank-2step'
  ) => {
    const now = new Date().toISOString();
    let newChain: PromptChain;

    if (blueprintType === 'dev-3step') {
      newChain = {
        id: `chain-${Date.now()}`,
        title: starterTitle.trim() || '需求拆解 → 接口设计 → 代码实现三步流',
        description:
          '从模糊业务需求出发，逐层推导接口契约与核心实现代码，全程变量自动接力。',
        category: '编程与架构',
        createdAt: now,
        updatedAt: now,
        steps: [
          {
            id: `step-${Date.now()}-1`,
            title: '需求边界与验收清单拆解',
            handoffVarName: '需求验收清单',
            stepNote: '先明确主流程与异常边界，输出结构化验收点。',
            customContent:
              '请针对【{{所属系统模块}}】的以下需求进行拆解，列出主流程、边界条件与验收标准：\n\n{{需求描述}}',
          },
          {
            id: `step-${Date.now()}-2`,
            title: '接口契约与数据结构建模',
            handoffVarName: '接口与表结构定义',
            stepNote: '自动承接第一步的《需求验收清单》设计数据契约。',
            customContent:
              '请基于【{{所属系统模块}}】的拆解结论，使用 {{技术栈与架构:React 19 + TypeScript|Node.js + PostgreSQL|Go 微服务}} 设计核心数据结构与接口契约：\n\n【上一步拆解结论】：\n{{需求验收清单}}',
          },
          {
            id: `step-${Date.now()}-3`,
            title: '核心实现与边界容错自检',
            stepNote: '结合前两步的产出，编写高健壮性实现代码。',
            customContent:
              '请依据以下《需求验收清单》与《接口与表结构定义》，编写【{{所属系统模块}}】的核心实现代码并完成边界自检：\n\n1. 需求清单：\n{{需求验收清单}}\n\n2. 接口定义：\n{{接口与表结构定义}}',
          },
        ],
      };
    } else if (blueprintType === 'research-3step') {
      newChain = {
        id: `chain-${Date.now()}`,
        title: starterTitle.trim() || '痛点提炼 → 竞品矩阵 → 决策简报三步流',
        description: '快速将零散调研资料转化为可供管理层决策的结构化简报。',
        category: '调研与分析',
        createdAt: now,
        updatedAt: now,
        steps: [
          {
            id: `step-${Date.now()}-1`,
            title: '核心痛点与关键事实提炼',
            handoffVarName: '核心痛点结论',
            stepNote: '从原始资料中去伪存真，提炼核心数据与痛点。',
            customContent:
              '请围绕【{{研究赛道与主题}}】提炼以下原始资料中的核心用户痛点与关键事实：\n\n{{核心素材内容}}',
          },
          {
            id: `step-${Date.now()}-2`,
            title: '方案优劣势对比矩阵',
            handoffVarName: '竞品对比矩阵结论',
            stepNote: '承接第一步痛点结论，横向对比各方案优劣。',
            customContent:
              '请针对【{{研究赛道与主题}}】的痛点结论，构建 Markdown 对比矩阵，评估各主流方案的优劣势与适用边界：\n\n【核心痛点结论】：\n{{核心痛点结论}}',
          },
          {
            id: `step-${Date.now()}-3`,
            title: '输出一页纸决策汇报简报',
            stepNote: '汇总前两步结论，输出结论先行的一页纸简报。',
            customContent:
              '请汇总【{{研究赛道与主题}}】的痛点与对比矩阵，撰写一份面向【{{汇报受众:产品与研发负责人|业务管理层}}】的一页纸决策建议：\n\n{{竞品对比矩阵结论}}',
          },
        ],
      };
    } else {
      newChain = {
        id: `chain-${Date.now()}`,
        title: starterTitle.trim() || `自定义双步接力流 #${chains.length + 1}`,
        description: '轻量双步提示词串联：第一步拆解分析，第二步生成落地方案。',
        category: categories[0]?.name || '编程与架构',
        createdAt: now,
        updatedAt: now,
        steps: [
          {
            id: `step-${Date.now()}-1`,
            title: '问题拆解与输入提炼',
            handoffVarName: '第一阶段拆解结论',
            stepNote: '先对原始问题进行结构化拆解，输出关键结论供下一步使用。',
            customContent:
              '请针对【{{目标主题}}】进行第一性原理拆解，列出核心边界条件、关键痛点与结构化要点：\n\n{{原始背景描述}}',
          },
          {
            id: `step-${Date.now()}-2`,
            title: '方案生成与落地检查',
            stepNote: '自动承接第一步的《第一阶段拆解结论》并输出可执行方案。',
            customContent:
              '请基于上一阶段确认的拆解结论，围绕【{{目标主题}}】输出可直接落地的执行方案与检查清单：\n\n【上一阶段拆解结论】：\n{{第一阶段拆解结论}}',
          },
        ],
      };
    }

    onCreateChain(newChain);
    setSelectedChainId(newChain.id);
    if (newChain.steps[0]) setSelectedStepId(newChain.steps[0].id);
    setStarterModalOpen(false);
    setInspectorTab('run');
    onShowToast(`已创建场景任务流「${newChain.title}」`);
  };

  const handleDuplicateActiveChain = () => {
    if (!activeChain) return;
    const now = new Date().toISOString();
    const clonedSteps = activeChain.steps.map((s, idx) => ({
      ...s,
      id: `step-clone-${Date.now()}-${idx}`,
    }));
    const cloned: PromptChain = {
      ...activeChain,
      id: `chain-clone-${Date.now()}`,
      title: `${activeChain.title} (副本)`,
      createdAt: now,
      updatedAt: now,
      steps: clonedSteps,
    };
    onCreateChain(cloned);
    setSelectedChainId(cloned.id);
    if (clonedSteps[0]) setSelectedStepId(clonedSteps[0].id);
    onShowToast(`已复制任务流「${cloned.title}」`);
  };

  const handleExportPlaybook = async () => {
    if (!activeChain) return;
    const md = exportChainAsMarkdown(
      activeChain,
      promptsMap,
      currentVarValues,
      currentStepOutputs
    );
    try {
      await navigator.clipboard.writeText(md);
      onShowToast('已将整条工作流 SOP 剧本（含变量与产出）复制为 Markdown');
    } catch {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeChain.title}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast('已导出整条工作流 Markdown 剧本');
    }
  };

  if (!activeChain) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <p className="text-sm text-slate-600 mb-3">暂无场景任务流</p>
        <button
          type="button"
          onClick={handleOpenStarterWizard}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
        >
          新建第一个场景任务流
        </button>
      </div>
    );
  }

  const completedCount = activeChain.steps.filter(
    (s) =>
      currentCompletedSteps[s.id] || Boolean(currentStepOutputs[s.id]?.trim())
  ).length;

  // Helper to render a single Canvas Step Node Card (shared between Horizontal Connected Serpentine and Vertical Waterfall)
  const renderStepNodeCard = (step: PromptChainStep, index: number) => {
    const isSelected = step.id === activeStep?.id;
    const stepOutputText = (currentStepOutputs[step.id] || '').trim();
    const hasOutput = Boolean(stepOutputText);
    const isCompleted = Boolean(currentCompletedSteps[step.id]) || hasOutput;
    const linkedPrompt = step.promptId ? promptsMap[step.promptId] : undefined;
    const stepContent = resolveChainStepContent(step, promptsMap);
    const stepVars = chainAnalysis.stepDescriptors[step.id] || [];
    const isCopied = copiedStepId === step.id;
    const isDragTarget =
      dragOverStepIndex === index &&
      draggedStepIndex !== null &&
      draggedStepIndex !== index;

    // Identify which variables of this step come from upstream steps vs user input
    const upstreamVarSet = new Set<string>();
    for (let i = 0; i < index; i++) {
      const up = activeChain.steps[i];
      if (up.handoffVarName) upstreamVarSet.add(up.handoffVarName);
    }

    return (
      <div
        key={step.id}
        role="region"
        aria-label={`步骤 ${index + 1}: ${step.title}`}
        draggable
        onDragStart={() => setDraggedStepIndex(index)}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragOverStepIndex !== index) {
            setDragOverStepIndex(index);
          }
        }}
        onDragLeave={() => {
          if (dragOverStepIndex === index) {
            setDragOverStepIndex(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedStepIndex !== null && draggedStepIndex !== index) {
            handleReorderStepDragDrop(draggedStepIndex, index);
          }
          setDraggedStepIndex(null);
          setDragOverStepIndex(null);
        }}
        onDragEnd={() => {
          setDraggedStepIndex(null);
          setDragOverStepIndex(null);
        }}
        onClick={() => {
          setSelectedStepId(step.id);
        }}
        className={`cursor-pointer rounded-xl bg-white transition-all duration-150 flex flex-col justify-between w-full relative ${
          isDragTarget
            ? 'border-2 border-dashed border-blue-500 ring-4 ring-blue-500/15'
            : isSelected
            ? 'border-2 border-blue-600 shadow-md ring-4 ring-blue-500/10'
            : isCompleted
            ? 'border border-emerald-300/95 shadow-xs hover:border-emerald-400'
            : 'border border-slate-200/95 shadow-xs hover:border-slate-300'
        }`}
      >
        {/* Node Top Header & Port Strip */}
        <div className="p-3.5 pb-2.5 border-b border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                title="可拖拽调整节点顺序"
                className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold tabular-nums whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isCompleted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-white'
                }`}
              >
                STEP {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-xs text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1 whitespace-nowrap shrink-0">
                {linkedPrompt ? (
                  <>
                    <Link2 className="w-3 h-3 text-blue-600" />
                    <span>词库模板</span>
                  </>
                ) : (
                  <>
                    <FileEdit className="w-3 h-3 text-slate-400" />
                    <span>独立节点</span>
                  </>
                )}
              </span>
            </div>

            {/* Step Completion Status Toggle Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStepComplete(step.id);
              }}
              className={`text-xs font-medium flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                isCompleted
                  ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                  : isSelected
                  ? 'text-blue-700 bg-blue-50'
                  : 'text-slate-500 bg-slate-100 hover:text-slate-800'
              }`}
              title="点击切换本步骤完成状态"
            >
              {isCompleted ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>已就绪</span>
                </>
              ) : isSelected ? (
                <>
                  <CircleDot className="w-3.5 h-3.5 text-blue-600" />
                  <span>当前调试</span>
                </>
              ) : (
                <>
                  <Circle className="w-3.5 h-3.5" />
                  <span>待执行</span>
                </>
              )}
            </button>
          </div>

          {/* Node Title & Note */}
          <h3 className="text-sm font-bold text-slate-900 leading-snug">
            {step.title}
          </h3>
          {step.stepNote && (
            <p className="mt-0.5 text-xs text-slate-500 line-clamp-1 leading-relaxed">
              {step.stepNote}
            </p>
          )}
        </div>

        {/* Node Body: IN Port Badges + Live Template Excerpt + OUT Port Badge */}
        <div className="px-3.5 py-2.5 bg-slate-50/60 flex-1 flex flex-col justify-between gap-2">
          {/* IN Ports: Clearly show Upstream Auto-Wired vs Manual Variables */}
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            <span className="text-slate-400 font-medium mr-0.5">输入端口:</span>
            {stepVars.length === 0 ? (
              <span className="text-slate-400">无动态变量</span>
            ) : (
              stepVars.map((v) => {
                const isFromUpstream = upstreamVarSet.has(v.name);
                const hasVal = Boolean(
                  activeStepAssembled.effectiveValues[v.name]?.trim() ||
                    currentVarValues[v.name]?.trim() ||
                    activeChain.steps.some(
                      (s, sIdx) =>
                        sIdx < index &&
                        s.handoffVarName === v.name &&
                        Boolean(currentStepOutputs[s.id]?.trim())
                    )
                );
                return (
                  <span
                    key={v.name}
                    className={`font-mono px-1.5 py-0.5 rounded border whitespace-nowrap ${
                      isFromUpstream
                        ? hasVal
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                          : 'bg-blue-50 border-blue-200 text-blue-700'
                        : hasVal
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    {isFromUpstream ? '⚡ ' : ''}
                    {`{{${v.name}}}`}
                  </span>
                );
              })
            )}
          </div>

          {/* Template Content Excerpt (5-line normalized preview + 1-click inline full-text toggle) */}
          {(() => {
            const isNodeExpanded =
              expandAllStepCards || Boolean(expandedStepCardIds[step.id]);
            const displayStepContent = isNodeExpanded
              ? stepContent
              : formatCompactPromptPreview(stepContent);
            const lineCount = stepContent.split('\n').length;

            return (
              <div className="rounded-lg border border-slate-200/80 bg-white overflow-hidden">
                <div className="p-2.5">
                  <div
                    className={`text-xs text-slate-700 leading-[1.65] font-normal break-words whitespace-pre-wrap ${
                      isNodeExpanded ? '' : 'line-clamp-5'
                    }`}
                  >
                    {tokenizeTemplateSegments(displayStepContent).map(
                      (seg, i) =>
                        seg.type === 'variable' ? (
                          <span
                            key={i}
                            className="inline-block font-mono text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200/70 rounded px-1 py-0 mx-0.5"
                          >
                            {seg.value}
                          </span>
                        ) : (
                          <span key={i}>{seg.value}</span>
                        )
                    )}
                  </div>
                </div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="px-2.5 py-1 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between text-[11px]"
                >
                  <span className="font-mono text-slate-400 tabular-nums">
                    {lineCount} 行 · {stepContent.length} 字
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (expandAllStepCards) {
                        setExpandAllStepCards(false);
                        const next: Record<string, boolean> = {};
                        activeChain.steps.forEach((s) => {
                          if (s.id !== step.id) next[s.id] = true;
                        });
                        setExpandedStepCardIds(next);
                      } else {
                        setExpandedStepCardIds((prev) => ({
                          ...prev,
                          [step.id]: !prev[step.id],
                        }));
                      }
                    }}
                    className="font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {isNodeExpanded ? '收起节点全文 ▲' : '展开节点全文 ▼'}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* OUT Port: Shows downstream handoff variable and captured output preview */}
          <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400 font-medium shrink-0">
              输出传递:
            </span>
            {step.handoffVarName ? (
              <span
                className={`font-mono font-medium flex items-center gap-1 truncate ${
                  hasOutput ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {`{{${step.handoffVarName}}}`}
                  {hasOutput ? ` · 已捕获 (${stepOutputText.length}字)` : ' · 待产出'}
                </span>
              </span>
            ) : (
              <span className="text-slate-500 font-medium">
                🏁 终点汇总输出节点
              </span>
            )}
          </div>
        </div>

        {/* Node Footer Direct Action Toolbar */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-3 py-2 bg-white border-t border-slate-100 rounded-b-xl flex items-center justify-between gap-1.5"
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleCopyStepPrompt(index, false)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap ${
                isCopied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>复制本步</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedStepId(step.id);
                handleFillSampleOutputForStep(index, true);
              }}
              title="一键填入本步示例产出并自动传递给下一步"
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                hasOutput
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>{hasOutput ? '已注入下游' : '模拟接力 →'}</span>
            </button>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => handleMoveStep(index, 'prev')}
              title="前移此步骤"
              aria-label={`前移步骤 ${step.title}`}
              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded hover:bg-slate-100"
            >
              {canvasDirection === 'horizontal' ? (
                <ArrowLeft className="w-3.5 h-3.5" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              disabled={index === activeChain.steps.length - 1}
              onClick={() => handleMoveStep(index, 'next')}
              title="后移此步骤"
              aria-label={`后移步骤 ${step.title}`}
              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded hover:bg-slate-100"
            >
              {canvasDirection === 'horizontal' ? (
                <ArrowRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedStepId(step.id);
                setInspectorTab('config');
                setMobilePane('workbench');
              }}
              title="配置此节点模板与传递变量"
              aria-label={`配置步骤 ${step.title}`}
              className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            {activeChain.steps.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteStep(step.id)}
                title="删除此步骤节点"
                aria-label={`删除步骤 ${step.title}`}
                className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex min-w-0 h-full bg-slate-50 overflow-hidden relative">
      {/* 1. Left Canvas Studio Drawer: Workflow Switcher & Prompt Vault Node Palette */}
      {leftPaletteOpen && (
        <aside
          aria-label="场景任务流与词库组件库"
          className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200/90 flex-col h-full overflow-hidden"
        >
          {/* Top Bar: Back to Library + Collapse Palette */}
          <div className="p-3 border-b border-slate-200/80 flex items-center justify-between gap-2 bg-slate-50/50">
            {onBackToLibrary ? (
              <button
                type="button"
                onClick={onBackToLibrary}
                className="text-xs font-semibold text-slate-700 hover:text-blue-600 flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>返回提示词库</span>
              </button>
            ) : (
              <span className="text-xs font-bold text-slate-800">
                画布工作台
              </span>
            )}
            <button
              type="button"
              onClick={() => setLeftPaletteOpen(false)}
              title="收起左侧栏以最大化画布视野"
              aria-label="收起左侧组件栏"
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200/60 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Segmented Switcher: Workflows vs Prompt Vault Node Picker */}
          <div className="p-2.5 border-b border-slate-100">
            <div className="grid grid-cols-2 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
              <button
                type="button"
                onClick={() => setLeftPaletteTab('workflows')}
                className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  leftPaletteTab === 'workflows'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                任务流 ({chains.length})
              </button>
              <button
                type="button"
                onClick={() => setLeftPaletteTab('vault')}
                className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  leftPaletteTab === 'vault'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                词库上画布 ({prompts.length})
              </button>
            </div>
          </div>

          {/* Left Drawer Scrollable Content */}
          {leftPaletteTab === 'workflows' ? (
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              <button
                type="button"
                onClick={handleOpenStarterWizard}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建场景任务流 (向导)</span>
              </button>

              <div className="pt-1 space-y-1.5">
                {chains.map((chain) => {
                  const isSelected = chain.id === activeChain.id;
                  const chainDoneCount = chain.steps.filter(
                    (s) =>
                      completedStepsMap[chain.id]?.[s.id] ||
                      Boolean(chainOutputsMap[chain.id]?.[s.id]?.trim())
                  ).length;

                  return (
                    <button
                      key={chain.id}
                      type="button"
                      onClick={() => {
                        setSelectedChainId(chain.id);
                        if (chain.steps[0]) {
                          setSelectedStepId(chain.steps[0].id);
                        }
                        setIsEditingChainMeta(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold truncate">
                          {chain.title}
                        </span>
                        <span
                          className={`text-[11px] font-mono tabular-nums shrink-0 ${
                            isSelected ? 'text-blue-300' : 'text-slate-400'
                          }`}
                        >
                          {chainDoneCount}/{chain.steps.length}步
                        </span>
                      </div>
                      <p
                        className={`text-[11px] line-clamp-1 ${
                          isSelected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {chain.category} · {chain.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Quick Functional Node Presets */}
              <div className="pt-3 border-t border-slate-200/80 space-y-1.5">
                <div className="px-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500">
                    快捷插入功能节点
                  </span>
                  <span className="text-[10px] text-slate-400">自动接力</span>
                </div>
                {QUICK_FUNCTIONAL_NODE_PRESETS.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => handleAppendPresetNode(preset)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/70 hover:border-blue-200 transition-colors flex items-center justify-between"
                  >
                    <span>{preset.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {`{{${preset.handoffVarName}}}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Tab 2: Prompt Vault Node Picker — 1-click add any library prompt onto canvas! */
            <div className="flex-1 flex flex-col min-h-0 p-2.5 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={vaultSearchQuery}
                  onChange={(e) => setVaultSearchQuery(e.target.value)}
                  placeholder="搜索词库模板加入画布..."
                  aria-label="搜索词库模板加入画布"
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <p className="text-[11px] text-slate-500 px-0.5 leading-snug">
                点击任一词库模板的「+ 上画布」，即刻追加到当前工作流末尾并自动绑定上一步产出变量。
              </p>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                {filteredVaultPrompts.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:border-blue-300 transition-colors space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <h4 className="text-xs font-semibold text-slate-800 leading-snug line-clamp-1">
                        {p.title}
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleAppendPromptFromVault(p)}
                        className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors"
                      >
                        + 上画布
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {p.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      {/* 2. Main Right Column: Top Bar + Center Visual Canvas + Right Step Workbench */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Workflow Control Bar */}
        <div className="bg-white border-b border-slate-200/80 px-4 lg:px-5 py-2.5 shrink-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Left: Expand Palette Button + Active Chain Title & Meta Actions */}
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {!leftPaletteOpen && (
                <button
                  type="button"
                  onClick={() => setLeftPaletteOpen(true)}
                  title="展开工作流与词库组件栏"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>工作流与词库 ({chains.length})</span>
                </button>
              )}

              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold whitespace-nowrap shrink-0">
                  {activeChain.category}
                </span>
                <h1 className="text-sm font-bold text-slate-900 truncate">
                  {activeChain.title}
                </h1>
                <span className="text-xs font-mono tabular-nums text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">
                  进度 {completedCount}/{activeChain.steps.length} 步
                </span>
              </div>

              <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500 pl-1">
                <button
                  type="button"
                  onClick={() => {
                    setMetaTitleDraft(activeChain.title);
                    setMetaDescDraft(activeChain.description);
                    setMetaCatDraft(activeChain.category);
                    setIsEditingChainMeta(true);
                  }}
                  className="hover:text-slate-900 flex items-center gap-1 whitespace-nowrap"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>改名</span>
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={handleDuplicateActiveChain}
                  className="hover:text-slate-900 flex items-center gap-1 whitespace-nowrap"
                >
                  <CopyPlus className="w-3 h-3" />
                  <span>克隆流</span>
                </button>
                {chains.length > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextChain = chains.find(
                          (c) => c.id !== activeChain.id
                        );
                        onDeleteChain(activeChain.id);
                        if (nextChain) {
                          setSelectedChainId(nextChain.id);
                        }
                      }}
                      className="text-slate-400 hover:text-red-600 flex items-center gap-0.5 whitespace-nowrap"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>删除</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Right: One-Click Demo Playthrough + Canvas Orientation + Zoom + Export */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={handleSimulateFullChain}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>一键演示全流程接力</span>
              </button>

              <button
                type="button"
                onClick={handleOpenStarterWizard}
                className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100/80 border border-blue-200/70 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建任务流</span>
              </button>

              <div
                role="group"
                aria-label="画布排列方向"
                className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60"
              >
                <button
                  type="button"
                  onClick={() => setCanvasDirection('horizontal')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    canvasDirection === 'horizontal'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  横向连线画布
                </button>
                <button
                  type="button"
                  onClick={() => setCanvasDirection('vertical')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    canvasDirection === 'vertical'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  纵向瀑布画布
                </button>
              </div>

              <div
                role="group"
                aria-label="画布缩放比例"
                className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-xs font-mono tabular-nums"
              >
                {[90, 100, 110].map((zoom) => (
                  <button
                    key={zoom}
                    type="button"
                    onClick={() => setCanvasZoom(zoom)}
                    className={`px-2 py-1 rounded-md transition-colors ${
                      canvasZoom === zoom
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {zoom}%
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleResetChainRun}
                title="清空当前已填变量与各步骤执行状态"
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重置</span>
              </button>

              <button
                type="button"
                onClick={handleExportPlaybook}
                title="将整条工作流及各步提示词导出为 Markdown SOP 文档"
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>导出 SOP</span>
              </button>
            </div>
          </div>

          {/* Inline Chain Metadata Edit Form */}
          {isEditingChainMeta && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!metaTitleDraft.trim()) return;
                onSaveChain({
                  ...activeChain,
                  title: metaTitleDraft.trim(),
                  description: metaDescDraft.trim(),
                  category: metaCatDraft.trim() || activeChain.category,
                  updatedAt: new Date().toISOString(),
                });
                setIsEditingChainMeta(false);
                onShowToast('已更新任务流信息');
              }}
              className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200"
            >
              <input
                type="text"
                value={metaTitleDraft}
                onChange={(e) => setMetaTitleDraft(e.target.value)}
                placeholder="任务流名称"
                aria-label="任务流名称"
                className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
              />
              <input
                type="text"
                value={metaDescDraft}
                onChange={(e) => setMetaDescDraft(e.target.value)}
                placeholder="场景说明"
                aria-label="任务流场景说明"
                className="flex-1 min-w-[200px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setIsEditingChainMeta(false)}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
              >
                取消
              </button>
            </form>
          )}

          {/* Mobile View Switcher (Canvas vs Step Workbench) */}
          <div className="flex lg:hidden items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/70">
            <button
              type="button"
              onClick={() => setMobilePane('canvas')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                mobilePane === 'canvas'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              流程图画布 ({activeChain.steps.length} 步)
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('workbench')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                mobilePane === 'workbench'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              当前步骤执行台 (STEP{' '}
              {String(activeStepIndex + 1).padStart(2, '0')})
            </button>
          </div>
        </div>

        {/* Center + Right Split Workspace */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Center: Interactive Connected Node-Flow Canvas */}
          <div
            data-testid="prompt-chain-canvas"
            className={`${
              mobilePane === 'workbench' ? 'hidden lg:block' : 'block'
            } flex-1 relative overflow-y-auto overflow-x-hidden bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px] bg-slate-100/70 p-4 lg:p-5`}
          >
            {/* 3-Step Visual Onboarding Guide & Topology Header */}
            <div className="mb-4 bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-2.5">
              {showOnboardingGuide && (
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-slate-700">
                    <span className="font-semibold text-blue-700 flex items-center gap-1 whitespace-nowrap">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>三步极简用法:</span>
                    </span>
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md font-medium text-slate-800 whitespace-nowrap">
                      ① 选节点填参数并复制本步 Prompt
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md font-medium text-slate-800 whitespace-nowrap">
                      ② 粘贴 AI 回复（自动变为下游变量）
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md font-medium text-slate-800 whitespace-nowrap">
                      ③ 直接复制下一步已合成 Prompt
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setLeftPaletteOpen(true);
                        setLeftPaletteTab('vault');
                      }}
                      className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                    >
                      + 从词库挑模板上画布
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowOnboardingGuide(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs whitespace-nowrap"
                    >
                      收起指引
                    </button>
                  </div>
                </div>
              )}

              {/* End-to-End Connected Stepper Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0 mr-0.5" />
                  {activeChain.steps.map((s, idx) => {
                    const isCurr = s.id === activeStep?.id;
                    const isDone =
                      Boolean(currentCompletedSteps[s.id]) ||
                      Boolean(currentStepOutputs[s.id]?.trim());
                    return (
                      <React.Fragment key={s.id}>
                        {idx > 0 && (
                          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                            {activeChain.steps[idx - 1]?.handoffVarName && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] border ${
                                  Boolean(
                                    currentStepOutputs[
                                      activeChain.steps[idx - 1].id
                                    ]?.trim()
                                  )
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold'
                                    : 'bg-slate-50 border-slate-200 text-slate-500'
                                }`}
                              >
                                {`{{${activeChain.steps[idx - 1].handoffVarName}}}`}
                              </span>
                            )}
                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStepId(s.id);
                            setMobilePane('workbench');
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                            isCurr
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : isDone
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100/70'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                          }`}
                        >
                          <span className="font-mono font-bold tabular-nums text-[11px]">
                            0{idx + 1}
                          </span>
                          <span className="truncate max-w-[125px]">
                            {s.title}
                          </span>
                          {isDone && (
                            <CheckCircle2
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isCurr ? 'text-white' : 'text-emerald-600'
                              }`}
                            />
                          )}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>

                {!showOnboardingGuide && (
                  <button
                    type="button"
                    onClick={() => setShowOnboardingGuide(true)}
                    className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 whitespace-nowrap"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>用法指引</span>
                  </button>
                )}
              </div>
            </div>

            {/* Scaled Connected Canvas Stage */}
            <div
              style={{
                transform: `scale(${canvasZoom / 100})`,
                transformOrigin: 'top left',
              }}
              className="transition-transform duration-150 pb-8"
            >
              {canvasDirection === 'horizontal' ? (
                /* HORIZONTAL CONNECTED SERPENTINE PIPELINE CANVAS (Explicit SVG Connectors between every node!) */
                <div className="flex flex-col gap-0">
                  {horizontalStepRows.map((row, rIdx) => {
                    const firstItem = row.items[0];
                    const secondItem = row.items[1];
                    const firstHasOutput =
                      Boolean(currentStepOutputs[firstItem.step.id]?.trim()) ||
                      Boolean(currentCompletedSteps[firstItem.step.id]);

                    const lastItemOfRow = secondItem || firstItem;
                    const lastOfRowHasOutput =
                      Boolean(
                        currentStepOutputs[lastItemOfRow.step.id]?.trim()
                      ) ||
                      Boolean(currentCompletedSteps[lastItemOfRow.step.id]);
                    const hasNextRow = rIdx + 1 < horizontalStepRows.length;

                    return (
                      <React.Fragment key={row.rowIndex}>
                        {/* 2-Node Connected Row: [Node A] ──(SVG Data Bus)──▶ [Node B or Add Card] */}
                        <div className="flex flex-col xl:flex-row items-stretch gap-3 xl:gap-0">
                          {/* Left Column Node */}
                          <div className="flex-1 min-w-0 flex">
                            {renderStepNodeCard(
                              firstItem.step,
                              firstItem.index
                            )}
                          </div>

                          {/* Horizontal SVG Connector Bridge between Left Node and Right Node */}
                          {secondItem ? (
                            <div className="hidden xl:flex flex-col items-center justify-center w-36 shrink-0 px-1 relative group">
                              {/* Handoff Variable Pill Above Wire */}
                              <div
                                className={`mb-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono border shadow-2xs truncate max-w-[132px] ${
                                  firstHasOutput
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                                    : 'bg-white border-slate-200 text-slate-600'
                                }`}
                                title={
                                  firstItem.step.handoffVarName
                                    ? `传递变量 {{${firstItem.step.handoffVarName}}}`
                                    : '顺序流转至下一步'
                                }
                              >
                                {firstItem.step.handoffVarName
                                  ? `{{${firstItem.step.handoffVarName}}}`
                                  : '下一步'}
                              </div>

                              {/* SVG Horizontal Arrow Line */}
                              <svg
                                className="w-full h-6 overflow-visible"
                                viewBox="0 0 136 24"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M 4 12 L 122 12"
                                  stroke={
                                    firstHasOutput ? '#059669' : '#64748b'
                                  }
                                  strokeWidth={firstHasOutput ? '2.5' : '2'}
                                  strokeDasharray={
                                    firstHasOutput ? 'none' : '5 4'
                                  }
                                />
                                <polygon
                                  points="132,12 120,6 120,18"
                                  fill={firstHasOutput ? '#059669' : '#64748b'}
                                />
                              </svg>

                              {/* Status & Quick Insert Node Button Below Wire */}
                              <div className="mt-1 flex items-center gap-1">
                                <span
                                  className={`text-[10px] font-medium ${
                                    firstHasOutput
                                      ? 'text-emerald-700'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {firstHasOutput ? '✓ 已自动注入' : '待传递'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAddStepAt(secondItem.index)
                                  }
                                  title={`在 Step 0${firstItem.index + 1} 与 Step 0${secondItem.index + 1} 之间插入新节点`}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors shadow-2xs"
                                >
                                  + 插入
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Horizontal Connector to the "Add New Step" Card when odd number of steps */
                            <div className="hidden xl:flex flex-col items-center justify-center w-28 shrink-0 px-1">
                              <svg
                                className="w-full h-6 overflow-visible"
                                viewBox="0 0 100 24"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M 4 12 L 88 12"
                                  stroke="#94a3b8"
                                  strokeWidth="1.75"
                                  strokeDasharray="4 4"
                                />
                                <polygon
                                  points="96,12 86,7 86,17"
                                  fill="#94a3b8"
                                />
                              </svg>
                              <span className="text-[10px] font-mono text-slate-400">
                                延展下游
                              </span>
                            </div>
                          )}

                          {/* Right Column Node (or Add Step Card if odd last row) */}
                          <div className="flex-1 min-w-0 flex">
                            {secondItem ? (
                              renderStepNodeCard(
                                secondItem.step,
                                secondItem.index
                              )
                            ) : (
                              <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white/75 rounded-xl p-5 flex flex-col items-center justify-center gap-2.5 w-full min-h-[210px] transition-colors">
                                <div className="text-xs font-semibold text-slate-700">
                                  继续向下游串联新步骤节点
                                </div>
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAddStepAt(activeChain.steps.length)
                                    }
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>新增空白节点</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLeftPaletteOpen(true);
                                      setLeftPaletteTab('vault');
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 flex items-center gap-1"
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                    <span>从词库选模板接入</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Serpentine Row-Turn SVG Connector Bridge (From Row r Right Node -> Row r+1 Left Node) */}
                        {hasNextRow && (
                          <div className="py-2 relative flex items-center justify-center">
                            <svg
                              className="w-full h-16 overflow-visible"
                              viewBox="0 0 800 64"
                              preserveAspectRatio="none"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M 620 2 L 620 28 Q 620 34 610 34 L 190 34 Q 180 34 180 42 L 180 56"
                                stroke={
                                  lastOfRowHasOutput ? '#059669' : '#64748b'
                                }
                                strokeWidth={lastOfRowHasOutput ? '2.5' : '2'}
                                strokeDasharray={
                                  lastOfRowHasOutput ? 'none' : '6 4'
                                }
                              />
                              <polygon
                                points="180,62 173,50 187,50"
                                fill={
                                  lastOfRowHasOutput ? '#059669' : '#64748b'
                                }
                              />
                            </svg>

                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div
                                className={`pointer-events-auto px-3 py-1 rounded-lg text-xs font-mono border shadow-2xs flex items-center gap-2 ${
                                  lastOfRowHasOutput
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                                    : 'bg-white border-slate-200 text-slate-600'
                                }`}
                              >
                                <span>
                                  ⤵ 传递{' '}
                                  {lastItemOfRow.step.handoffVarName
                                    ? `{{${lastItemOfRow.step.handoffVarName}}}`
                                    : '阶段产出'}{' '}
                                  至 Step 0{lastItemOfRow.index + 2}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAddStepAt(lastItemOfRow.index + 1)
                                  }
                                  className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 transition-colors"
                                >
                                  + 插入节点
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Bottom Add Step Bar when total steps is even */}
                  {activeChain.steps.length % 2 === 0 && (
                    <div className="mt-4 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white/75 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 transition-colors">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <GitCommitHorizontal className="w-4 h-4 text-blue-600" />
                        <span className="font-semibold text-slate-800">
                          继续扩展此工作流下游节点
                        </span>
                        <span className="text-slate-400">
                          · 新增节点将自动继承最后一步的产出变量
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleAddStepAt(activeChain.steps.length)
                          }
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>新增串联节点</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLeftPaletteOpen(true);
                            setLeftPaletteTab('vault');
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 flex items-center gap-1"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>从词库选模板接入</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* VERTICAL WATERFALL PIPELINE CANVAS */
                <div className="flex flex-col items-center gap-0 max-w-2xl mx-auto">
                  {activeChain.steps.map((step, index) => {
                    const prevStep =
                      index > 0 ? activeChain.steps[index - 1] : undefined;
                    const prevHasOutput = prevStep
                      ? Boolean(currentStepOutputs[prevStep.id]?.trim()) ||
                        Boolean(currentCompletedSteps[prevStep.id])
                      : false;

                    return (
                      <React.Fragment key={step.id}>
                        {index > 0 && prevStep && (
                          <div className="flex flex-col items-center justify-center py-1 shrink-0 h-20 relative group">
                            <svg
                              className="w-12 h-full overflow-visible"
                              viewBox="0 0 48 76"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M 24 2 C 24 26, 24 50, 24 68"
                                stroke={prevHasOutput ? '#059669' : '#64748b'}
                                strokeWidth={prevHasOutput ? '2.5' : '2'}
                                strokeDasharray={
                                  prevHasOutput ? 'none' : '5 4'
                                }
                              />
                              <polygon
                                points="24,73 19,63 29,63"
                                fill={prevHasOutput ? '#059669' : '#64748b'}
                              />
                            </svg>

                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div
                                className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono border shadow-2xs whitespace-nowrap pointer-events-auto flex items-center gap-1.5 ${
                                  prevHasOutput
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                                    : 'bg-white border-slate-200 text-slate-600'
                                }`}
                              >
                                <ArrowDown className="w-3 h-3 shrink-0" />
                                <span>
                                  {prevStep.handoffVarName
                                    ? `{{${prevStep.handoffVarName}}}`
                                    : '下一步'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddStepAt(index)}
                                  className="ml-1 px-1.5 py-0.5 text-[10px] font-sans font-semibold bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded transition-colors"
                                >
                                  + 插入
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        {renderStepNodeCard(step, index)}
                      </React.Fragment>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => handleAddStepAt(activeChain.steps.length)}
                    className="mt-4 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white/75 hover:bg-blue-50/40 text-slate-600 hover:text-blue-700 rounded-xl transition-all flex items-center justify-center gap-2 py-4 px-6 w-full text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>在末尾新增串联步骤节点</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 3. Right: Active Step Runner & Node Configuration Workbench (with Pinned Bottom CTA Bar) */}
          {activeStep && (
            <aside
              aria-label="工作流节点执行与配置面板"
              className={`${
                mobilePane === 'canvas' ? 'hidden lg:flex' : 'flex'
              } w-full lg:w-[420px] xl:w-[440px] shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-slate-200/90 flex-col h-full overflow-hidden`}
            >
              {/* Workbench Header with Quick Step Switcher */}
              <div className="p-3.5 border-b border-slate-200/80 flex items-center justify-between gap-2 shrink-0 bg-slate-50/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-mono font-bold text-blue-600 tabular-nums whitespace-nowrap shrink-0">
                      STEP {String(activeStepIndex + 1).padStart(2, '0')} /{' '}
                      {String(activeChain.steps.length).padStart(2, '0')}
                    </span>
                    <div className="flex items-center gap-0.5 ml-1">
                      <button
                        type="button"
                        disabled={activeStepIndex === 0}
                        onClick={() => {
                          const prev = activeChain.steps[activeStepIndex - 1];
                          if (prev) setSelectedStepId(prev.id);
                        }}
                        title="切换到上一步节点"
                        aria-label="切换到上一步节点"
                        className="p-0.5 rounded hover:bg-slate-200/70 disabled:opacity-30 text-slate-600"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={
                          activeStepIndex >= activeChain.steps.length - 1
                        }
                        onClick={() => {
                          const next = activeChain.steps[activeStepIndex + 1];
                          if (next) setSelectedStepId(next.id);
                        }}
                        title="切换到下一步节点"
                        aria-label="切换到下一步节点"
                        className="p-0.5 rounded hover:bg-slate-200/70 disabled:opacity-30 text-slate-600"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 truncate mt-0.5">
                    {activeStep.title}
                  </h2>
                </div>

                {/* Dual-Mode Segmented Control */}
                <div
                  role="tablist"
                  aria-label="节点面板模式"
                  className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 shrink-0"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === 'run'}
                    onClick={() => setInspectorTab('run')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${
                      inspectorTab === 'run'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Play className="w-3 h-3 text-blue-600" />
                    <span>串联执行</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === 'config'}
                    onClick={() => setInspectorTab('config')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${
                      inspectorTab === 'config'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>节点配置</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Workbench Body */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
                {inspectorTab === 'run' ? (
                  <>
                    {/* 1. Unified Variable & Upstream Relay Panel */}
                    {unifiedWorkbenchDescriptors.length > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">
                            ① 本步输入参数与上游变量接力
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {unifiedWorkbenchDescriptors.length} 个变量
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {unifiedWorkbenchDescriptors.map((item) => {
                            const effectiveVal =
                              activeStepAssembled.effectiveValues[item.name] ||
                              currentVarValues[item.name] ||
                              '';
                            const isUpstreamAutoFilled =
                              Boolean(item.upstreamSource?.outputValue) &&
                              !currentVarValues[item.name];

                            return (
                              <div
                                key={item.name}
                                className="p-2.5 rounded-lg bg-white border border-slate-200/80 space-y-1.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <label className="text-xs font-semibold text-slate-800 font-mono">
                                    {`{{${item.name}}}`}
                                  </label>

                                  {item.upstreamSource ? (
                                    item.upstreamSource.outputValue ? (
                                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        ✓ 已由 Step 0
                                        {item.upstreamSource.stepIndex + 1}{' '}
                                        产出自动注入
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleFillSampleOutputForStep(
                                            item.upstreamSource!.stepIndex,
                                            false
                                          )
                                        }
                                        className="text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 transition-colors"
                                      >
                                        ⚡ 点此自动填入 Step 0
                                        {item.upstreamSource.stepIndex + 1}{' '}
                                        示例产出
                                      </button>
                                    )
                                  ) : item.isShared ? (
                                    <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                      全流共享变量 (填一次多步生效)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">
                                      本步参数
                                    </span>
                                  )}
                                </div>

                                {item.options && item.options.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {item.options.map((opt) => (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() =>
                                          handleSetVarValue(item.name, opt)
                                        }
                                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                          effectiveVal === opt
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                <textarea
                                  rows={isUpstreamAutoFilled ? 2 : 1}
                                  value={effectiveVal}
                                  onChange={(e) =>
                                    handleSetVarValue(item.name, e.target.value)
                                  }
                                  placeholder={`输入 ${item.name} 的内容...`}
                                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:border-blue-600 resize-y"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. Live Assembled Prompt for Current Step */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          ② 本步实时合成提示词预览
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                            {activeStepAssembled.assembled.length} 字符
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandWorkbenchPreview((prev) => !prev)
                            }
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                          >
                            {expandWorkbenchPreview ? '收起高度 ▲' : '展开完整高度 ▼'}
                          </button>
                        </div>
                      </div>
                      <div
                        className={`p-3.5 rounded-xl bg-slate-900 text-slate-100 text-xs leading-[1.7] font-mono whitespace-pre-wrap overflow-y-auto ${
                          expandWorkbenchPreview ? 'max-h-[520px]' : 'max-h-64'
                        }`}
                      >
                        {activeStepAssembled.assembled}
                      </div>
                    </div>

                    {/* 3. Capture Step Output to Handoff to Downstream Steps */}
                    <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">
                            ③ 记录本步 AI 产出 (自动注入下游)
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {activeStep.handoffVarName
                              ? `粘贴 AI 回复后，自动作为 {{${activeStep.handoffVarName}}} 传入下游步骤`
                              : '记录最后一步产出结论，支持一键导出完整 SOP 报告'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleFillSampleOutputForStep(activeStepIndex, true)
                          }
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 shadow-2xs transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>填入示例产出并推进</span>
                        </button>
                      </div>

                      <textarea
                        rows={3}
                        value={currentStepOutputs[activeStep.id] || ''}
                        onChange={(e) =>
                          handleSetStepOutput(activeStep.id, e.target.value)
                        }
                        placeholder={
                          activeStep.handoffVarName
                            ? `在此粘贴本步得到的《${activeStep.handoffVarName}》，下一步将自动引用...`
                            : '在此记录本步骤产出结果...'
                        }
                        aria-label="本步执行产出内容"
                        className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 resize-y"
                      />
                    </div>
                  </>
                ) : (
                  /* Tab 2: Node Template & Handoff Configuration */
                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        步骤节点名称
                      </label>
                      <input
                        type="text"
                        value={activeStep.title}
                        onChange={(e) =>
                          handleUpdateActiveStep({ title: e.target.value })
                        }
                        aria-label="步骤节点名称"
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        本步执行说明 (Step Note)
                      </label>
                      <input
                        type="text"
                        value={activeStep.stepNote || ''}
                        onChange={(e) =>
                          handleUpdateActiveStep({ stepNote: e.target.value })
                        }
                        placeholder="简述本步骤的目标或注意事项..."
                        aria-label="本步执行说明"
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        本步产出传递变量名 (供后续步骤通过 {`{{变量名}}`} 引用)
                      </label>
                      <input
                        type="text"
                        value={activeStep.handoffVarName || ''}
                        onChange={(e) =>
                          handleUpdateActiveStep({
                            handoffVarName: e.target.value.replace(/[{}]/g, ''),
                          })
                        }
                        placeholder="例如：需求验收清单、接口契约方案"
                        aria-label="本步产出传递变量名"
                        className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    {/* Source Mode: Link Existing Library Prompt vs Custom Step Content */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-700">
                          节点提示词来源
                        </label>
                        {activeStep.promptId && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateActiveStep({
                                promptId: undefined,
                                customContent: activeStepRawContent,
                              })
                            }
                            className="text-[11px] font-medium text-blue-600 hover:underline"
                          >
                            解绑词库并转为独立模板
                          </button>
                        )}
                      </div>

                      <select
                        aria-label="关联词库中的提示词"
                        value={activeStep.promptId || '__custom__'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__custom__') {
                            handleUpdateActiveStep({
                              promptId: undefined,
                              customContent:
                                activeStep.customContent ||
                                activeStepRawContent,
                            });
                          } else {
                            const targetPrompt = promptsMap[val];
                            handleUpdateActiveStep({
                              promptId: val,
                              title: targetPrompt
                                ? targetPrompt.title
                                : activeStep.title,
                            });
                          }
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
                      >
                        <option value="__custom__">
                          [独立模板] 编写本节点专属提示词
                        </option>
                        {prompts.map((p) => (
                          <option key={p.id} value={p.id}>
                            [关联词库] {p.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Template Editor */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-slate-700">
                          步骤提示词模板正文
                        </label>
                        <div className="flex items-center gap-1.5">
                          {activeStepIndex > 0 &&
                            activeChain.steps[activeStepIndex - 1]
                              ?.handoffVarName && (
                              <button
                                type="button"
                                onClick={() => {
                                  const prevVar =
                                    activeChain.steps[activeStepIndex - 1]
                                      .handoffVarName!;
                                  handleUpdateActiveStep({
                                    promptId: undefined,
                                    customContent: `${activeStepRawContent}\n\n【${prevVar}】：\n{{${prevVar}}}`,
                                  });
                                }}
                                className="px-2 py-1 rounded text-[11px] font-mono bg-blue-50 text-blue-700 hover:bg-blue-100"
                              >
                                + 插入{' '}
                                {`{{${
                                  activeChain.steps[activeStepIndex - 1]
                                    .handoffVarName
                                }}}`}
                              </button>
                            )}
                          <SnippetPickerPopover
                            snippets={snippets}
                            onInsertSnippet={(snippetText) =>
                              handleUpdateActiveStep({
                                promptId: undefined,
                                customContent: `${activeStepRawContent}${snippetText}`,
                              })
                            }
                            onAddSnippet={onAddSnippet}
                            onDeleteSnippet={onDeleteSnippet}
                          />
                        </div>
                      </div>

                      <textarea
                        rows={7}
                        value={activeStepRawContent}
                        onChange={(e) =>
                          handleUpdateActiveStep({
                            promptId: undefined,
                            customContent: e.target.value,
                          })
                        }
                        aria-label="步骤提示词模板正文"
                        className="w-full p-3 text-xs font-mono leading-relaxed bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Pinned Bottom Execution Bar (Always Visible Without Scrolling!) */}
              <div className="p-3 bg-white border-t border-slate-200/90 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyStepPrompt(activeStepIndex, false)}
                  className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制本步提示词</span>
                </button>
                {activeStepIndex + 1 < activeChain.steps.length ? (
                  <button
                    type="button"
                    onClick={() => handleCopyStepPrompt(activeStepIndex, true)}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shadow-2xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制并推进下一步 →</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleExportPlaybook}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shadow-2xs"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>导出完整 SOP 剧本</span>
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* 4. New Workflow Starter Wizard Modal (Pick from PromptVault to Auto-Chain OR Choose Scenario Blueprint) */}
      {starterModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="新建场景任务流向导"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[86vh] animate-card-enter">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  新建场景任务流向导
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  直接勾选词库中的多个提示词自动串联接力，或选择场景蓝图一键生成画布
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStarterModalOpen(false)}
                aria-label="关闭新建任务流向导"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Workflow Name Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  新任务流名称
                </label>
                <input
                  type="text"
                  value={starterTitle}
                  onChange={(e) => setStarterTitle(e.target.value)}
                  placeholder="例如：核心业务从需求拆解到代码审查三步流"
                  aria-label="新任务流名称"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              {/* Mode Switch Tabs */}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStarterMode('from-vault')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    starterMode === 'from-vault'
                      ? 'bg-white text-blue-600 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  方式一：从我的词库勾选自动串联 (最推荐)
                </button>
                <button
                  type="button"
                  onClick={() => setStarterMode('blueprint')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    starterMode === 'blueprint'
                      ? 'bg-white text-blue-600 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  方式二：使用精选场景蓝图创建
                </button>
              </div>

              {starterMode === 'from-vault' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      按执行先后顺序点击勾选词库模板（系统将自动为相邻步骤生成{' '}
                      <code className="font-mono text-blue-600">{`{{阶段产出}}`}</code>{' '}
                      接力变量）：
                    </span>
                    <span className="font-mono font-semibold text-blue-600">
                      已选 {starterPickedPromptIds.length} 步
                    </span>
                  </div>

                  {/* Live Order Strip */}
                  {starterPickedPromptIds.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex flex-wrap items-center gap-1.5">
                      {starterPickedPromptIds.map((id, idx) => {
                        const p = promptsMap[id];
                        if (!p) return null;
                        return (
                          <React.Fragment key={id}>
                            {idx > 0 && (
                              <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-xs font-medium text-slate-800 flex items-center gap-1">
                              <span className="font-mono font-bold text-blue-600 text-[11px]">
                                0{idx + 1}
                              </span>
                              <span className="truncate max-w-[140px]">
                                {p.title}
                              </span>
                            </span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}

                  {/* Checkable Prompt List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                    {prompts.map((p) => {
                      const orderIdx = starterPickedPromptIds.indexOf(p.id);
                      const isPicked = orderIdx >= 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setStarterPickedPromptIds((prev) =>
                              prev.includes(p.id)
                                ? prev.filter((item) => item !== p.id)
                                : [...prev, p.id]
                            );
                          }}
                          className={`text-left p-2.5 rounded-xl border transition-all flex items-start justify-between gap-2 ${
                            isPicked
                              ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/15'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {p.title}
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {p.description}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold shrink-0 ${
                              isPicked
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {isPicked ? `第 ${orderIdx + 1} 步` : '+ 勾选'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Blueprint Selection Cards */
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleCreateBlueprintChain('dev-3step')}
                    className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 transition-all flex flex-col justify-between gap-2"
                  >
                    <div>
                      <span className="text-[11px] font-mono font-semibold text-blue-600">
                        3 步研发蓝图
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 mt-1">
                        需求拆解 → 接口建模 → 核心实现
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        适合新功能开发：先拆验收边界，再生成数据结构，最后输出带自检的代码。
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600">
                      使用此蓝图创建 →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCreateBlueprintChain('research-3step')}
                    className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 transition-all flex flex-col justify-between gap-2"
                  >
                    <div>
                      <span className="text-[11px] font-mono font-semibold text-emerald-600">
                        3 步调研蓝图
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 mt-1">
                        痛点提炼 → 对比矩阵 → 决策简报
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        适合竞品与技术选型：将零散资料转化为结构化对比表格与一页纸汇报。
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600">
                      使用此蓝图创建 →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCreateBlueprintChain('blank-2step')}
                    className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 transition-all flex flex-col justify-between gap-2"
                  >
                    <div>
                      <span className="text-[11px] font-mono font-semibold text-slate-500">
                        2 步轻量蓝图
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 mt-1">
                        空白双步接力工作流
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        从精简的两步串联开始，随时从左侧词库追加更多节点。
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600">
                      使用此蓝图创建 →
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStarterModalOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                取消
              </button>
              {starterMode === 'from-vault' && (
                <button
                  type="button"
                  onClick={handleCreateFromVaultWizard}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs"
                >
                  一键串联已选的 {starterPickedPromptIds.length} 个词库模板 →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
