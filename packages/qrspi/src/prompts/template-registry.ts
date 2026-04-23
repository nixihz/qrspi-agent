import type {
  StageCode,
  PromptTemplate,
  PromptTemplateInput,
  PromptRegistry,
  Lang,
} from "../workflow/types.js";
import { formatContextForPrompt } from "../context/context-builder.js";

function makeTemplate(
  stage: StageCode,
  renderFn: (input: PromptTemplateInput) => string,
): PromptTemplate {
  return { stage, render: renderFn };
}

function baseInstructions(stage: StageCode, lang: Lang): string {
  const en: Record<StageCode, string> = {
    Q: `You are a structured programming agent. Execute tasks strictly according to the workflow stage.

## Instructions
1. Analyze the given feature ticket or requirement description
2. Identify all technical information needed to implement this feature
3. Produce 5-15 concrete, researchable technical questions
4. Each question must point to a specific aspect of the codebase (API, database, component, etc.)
5. Questions must be specific enough for an agent to find answers through code search
6. Do not include any implementation suggestions or solutions
7. Sort by dependency: infrastructure questions first, dependent questions later

## Output Format
\`\`\`markdown
# Technical Questions

## Feature Overview
[One-sentence description of the feature goal]

## Question List

### Q1: [Question Title]
- **Goal**: [What this question aims to solve]
- **Search Direction**: [Where in the codebase to look for answers]
- **Blocking**: [blocking/nice-to-have]

## Assumptions
[List all assumptions about the current system that need verification]

## Risks
[Mark the highest-risk uncertainties]
\`\`\``,

    R: `You are a structured programming agent. Execute tasks strictly according to the workflow stage.

## Instructions
1. Based on the technical questions from stage Q, collect objective facts from the codebase
2. Produce a technical map, not a plan or solution
3. Each finding must have codebase evidence (files, functions, patterns)
4. Identify key dependency relationships and existing constraints
5. Do not include any implementation suggestions

## Output Format
\`\`\`markdown
# Research Report

## Feature Overview
[One-sentence description]

## Codebase Technical Map
[Objective facts organized by functional area]

## Dependency Graph
[Key module dependency relationships]

## Constraints and Risks
[Discovered technical constraints]
\`\`\``,

    D: `You are a structured programming agent. Execute tasks strictly according to the workflow stage.

## Instructions
1. Based on stages Q and R, produce a design discussion document
2. Describe current state, target state, and design decisions
3. Each decision must include a recommended option, alternatives, and questions needing confirmation
4. Produce approximately 200 lines of markdown
5. Do not include implementation code

## Output Format
\`\`\`markdown
# Design Discussion

## 1. Current State
## 2. Target State
## 3. Design Decisions
### Decision N: ...
- **Recommended**: ...
- **Alternative A**: ...
- **Needs Confirmation**: ...
## 4. Architecture Constraints
## 5. Risks and Mitigations
\`\`\``,

    S: `You are a structured programming agent. Execute tasks strictly according to the workflow stage.

## Instructions
1. Based on the design discussion, define complete type definitions and function signatures
2. Determine vertical slice partitioning
3. Do not write implementations, only interfaces and types
4. Must cover all core entities

## Output Format
\`\`\`markdown
# Structure Outline

## Type Definitions
\`\`\`typescript
[Type definitions]
\`\`\`

## Function Signatures
\`\`\`typescript
[Function signatures]
\`\`\`

## Vertical Slices
[Slice list]
\`\`\``,

    P: `You are a structured programming agent. Execute tasks strictly according to the workflow stage.

## Instructions
1. Based on the structure outline, produce a detailed implementation plan
2. For each slice, list modification items (files, actions, risks)
3. Include test strategy and checkpoints
4. Do not write implementation code

## Output Format
\`\`\`markdown
# Implementation Plan

## Slice N: [Name]
### Modification List
| File | Action | Content | Risk |

### Test Strategy
### Checkpoint
\`\`\``,

    W: `You are a structured programming agent. Execute tasks strictly according to the workflow stage.

## Instructions
1. Produce a work tree JSON organized by vertical slices
2. Each slice must have a checkpoint
3. Tasks must have estimated_minutes and dependencies
4. Output pure JSON, do not include markdown

## Output Format
\`\`\`json
{
  "slices": [
    {
      "name": "Slice Name",
      "description": "Description",
      "order": 1,
      "tasks": [
        {"id": "s1-t1", "description": "...", "estimated_minutes": 15, "context_budget": "low", "dependencies": []}
      ],
      "checkpoint": "Verifiable completion criteria"
    }
  ]
}
\`\`\``,

    I: `You are a structured programming agent. Execute tasks strictly according to the workflow stage.

## Instructions
1. Implement code slice by slice according to the work tree
2. Verify the checkpoint after completing each slice
3. Produce an implementation report describing the completion status of each slice
4. Include problems encountered and solutions

## Output Format
\`\`\`markdown
# Implementation Report

## Slice N: [Name]
### Implementation Content
### Verification Result
### Remaining Issues
\`\`\``,

    PR: `You are a structured programming agent. Execute tasks strictly according to the workflow stage.

## Instructions
1. Produce a Pull Request description
2. Summarize changes, test coverage, and release criteria
3. List a review checklist

## Output Format
\`\`\`markdown
# Pull Request Review

## Change Summary
## Test Coverage
## Release Criteria
## Review Checklist
\`\`\``,
  };

  const zh: Record<StageCode, string> = {
    Q: `你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 分析给定的 feature ticket 或需求描述
2. 识别实现该 feature 需要了解的所有技术信息
3. 产出 5-15 个具体的、可研究的技术问题
4. 每个问题必须指向代码库的某个具体方面（API、数据库、组件等）
5. 问题必须足够具体，能让 Agent 通过代码搜索找到答案
6. 不要包含任何实现建议或方案
7. 按依赖关系排序：基础架构问题在前，依赖问题在后

## 输出格式
\`\`\`markdown
# 技术问题清单

## Feature 概述
[一句话描述这个 feature 的目标]

## 问题列表

### Q1: [问题标题]
- **目标**: [这个问题要解决什么]
- **搜索方向**: [应该在代码库的哪些地方找答案]
- **阻塞性**: [blocking/nice-to-have]

## 假设清单
[列出我们对当前系统的所有假设，后续需要验证]

## 风险标记
[标记最高风险的不确定性]
\`\`\``,

    R: `你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 基于 Q 阶段的技术问题，收集代码库客观事实
2. 产出技术地图，而不是计划或方案
3. 每个发现必须有代码库证据（文件、函数、模式）
4. 识别关键依赖关系和现有约束
5. 不要包含任何实现建议

## 输出格式
\`\`\`markdown
# 研究报告

## Feature 概述
[一句话描述]

## 代码库技术地图
[按功能区域组织的客观事实]

## 依赖关系图
[关键模块的依赖关系]

## 约束与风险
[发现的技术约束]
\`\`\``,

    D: `你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 基于 Q 和 R 阶段，产出设计讨论文档
2. 描述当前状态、期望最终状态、设计决策
3. 每个决策必须有推荐方案、备选方案和需要确认的问题
4. 产出约 200 行 markdown
5. 不要包含实现代码

## 输出格式
\`\`\`markdown
# 设计讨论文档

## 1. 当前状态
## 2. 期望最终状态
## 3. 设计决策
### 决策 N: ...
- **推荐方案**: ...
- **备选方案 A**: ...
- **需要确认**: ...
## 4. 架构约束
## 5. 风险与缓解
\`\`\``,

    S: `你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 基于设计讨论，定义完整的类型定义和函数签名
2. 确定垂直切片划分
3. 不要写实现，只写接口和类型
4. 必须覆盖所有核心实体

## 输出格式
\`\`\`markdown
# 结构大纲

## 类型定义
\`\`\`typescript
[类型定义]
\`\`\`

## 函数签名
\`\`\`typescript
[函数签名]
\`\`\`

## 垂直切片
[切片列表]
\`\`\``,

    P: `你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 基于结构大纲，产出详细实施计划
2. 每个切片列出修改清单（文件、操作、风险）
3. 包含测试策略和检查点
4. 不要写实现代码

## 输出格式
\`\`\`markdown
# 实施计划

## 切片 N: [名称]
### 修改清单
| 文件 | 操作 | 内容 | 风险 |

### 测试策略
### 检查点
\`\`\``,

    W: `你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 产出工作树 JSON，按垂直切片组织任务
2. 每个切片必须有 checkpoint
3. 任务必须有 estimated_minutes 和 dependencies
4. 输出纯 JSON，不要包含 markdown

## 输出格式
\`\`\`json
{
  "slices": [
    {
      "name": "切片名",
      "description": "描述",
      "order": 1,
      "tasks": [
        {"id": "s1-t1", "description": "...", "estimated_minutes": 15, "context_budget": "low", "dependencies": []}
      ],
      "checkpoint": "可验证的完成标准"
    }
  ]
}
\`\`\``,

    I: `你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 按工作树切片逐一实现代码
2. 每个切片完成后验证 checkpoint
3. 产出实现报告，说明每个切片的完成情况
4. 包含遇到的问题和解决方案

## 输出格式
\`\`\`markdown
# 实现报告

## 切片 N: [名称]
### 实现内容
### 验证结果
### 遗留问题
\`\`\``,

    PR: `你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 产出 Pull Request 描述
2. 总结变更内容、测试覆盖、上线条件
3. 列出审查清单

## 输出格式
\`\`\`markdown
# Pull Request Review

## 变更摘要
## 测试覆盖
## 上线条件
## 审查清单
\`\`\``,
  };

  return (lang === "zh" ? zh : en)[stage] ?? "";
}

function renderTemplate(input: PromptTemplateInput): string {
  const { stage, userInput, context, lang = "en" } = input;
  const instructions = baseInstructions(stage, lang);
  const contextSection = formatContextForPrompt(context, lang);

  const labels = {
    en: {
      stage: `Stage: ${stage}`,
      role: "Role",
      roleDesc: "You are a structured programming agent. Execute tasks strictly according to the workflow stage.",
      instructions: "Instructions",
      userInput: "User Input",
      footer: "Begin execution. Strictly follow the output format. Do not add content outside the format.",
    },
    zh: {
      stage: `阶段: ${stage}`,
      role: "角色",
      roleDesc: "你是一个结构化编程 Agent，严格按照工作流阶段执行任务。",
      instructions: "指令",
      userInput: "用户输入",
      footer: "开始执行。严格按输出格式产出，不要添加格式外的内容。",
    },
  };

  const t = labels[lang];

  const parts: string[] = [
    `# ${t.stage}`,
    "",
    `## ${t.role}`,
    t.roleDesc,
    "",
    `## ${t.instructions}`,
    instructions,
    "",
  ];

  if (contextSection) {
    parts.push(contextSection, "");
  }

  if (userInput) {
    parts.push(`## ${t.userInput}`, userInput, "");
  }

  parts.push("---", t.footer);

  return parts.join("\n");
}

export function createPromptRegistry(): PromptRegistry {
  const stages: StageCode[] = ["Q", "R", "D", "S", "P", "W", "I", "PR"];
  const templates = new Map<StageCode, PromptTemplate>();

  for (const stage of stages) {
    templates.set(stage, makeTemplate(stage, renderTemplate));
  }

  return {
    get(stage: StageCode): PromptTemplate {
      const t = templates.get(stage);
      if (!t) throw new Error(`Unregistered stage: ${stage}`);
      return t;
    },
    list(): PromptTemplate[] {
      return [...templates.values()];
    },
  };
}

export function renderStagePrompt(
  registry: PromptRegistry,
  input: PromptTemplateInput,
): string {
  const template = registry.get(input.stage);
  return template.render(input);
}
