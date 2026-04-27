import { describe, it, expect } from "vitest";
import { validateStageArtifact, createStageValidators } from "../../src/validators/stage-validator.js";
import type { StageCode } from "../../src/workflow/types.js";

function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
}

describe("stage-validator", () => {
  it("validates Q stage - content too short", () => {
    const result = validateStageArtifact("Q", "short");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("too short"))).toBe(true);
  });

  it("validates Q stage - normal content", () => {
    const content = Array.from({ length: 15 }, (_, i) => `### Q${i + 1}: Question ${i + 1}`).join("\n");
    const result = validateStageArtifact("Q", content);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("validates Q stage - too few questions", () => {
    const content = "### Q1: Question 1\n\n### Q2: Question 2\n\n";
    const result = validateStageArtifact("Q", content);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Too few questions"))).toBe(true);
  });

  it("validates R stage", () => {
    const result = validateStageArtifact("R", makeLines(20));
    expect(result.valid).toBe(true);
  });

  it("validates D stage - missing required sections", () => {
    const result = validateStageArtifact("D", makeLines(25));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Design Discussion"))).toBe(true);
    expect(result.issues.some((i) => i.message.includes("Missing required design section"))).toBe(true);
  });

  it("validates D stage - normal content", () => {
    const content = `
# Design Discussion

## 1. Current State
status

## 2. Target State
expected

## 3. Design Decisions
### Decision 1: Use staged rollout
- **Recommended**: add the new behavior behind explicit media configuration.
- **Alternative A**: reuse existing QI_MAO behavior.
- **Needs Confirmation**: confirm the target MediaId.

## 4. Architecture Constraints
constraints

## 5. Risks and Mitigations
risks
` + makeLines(20);
    const result = validateStageArtifact("D", content);
    expect(result.valid).toBe(true);
  });

  it("validates D stage - accepts semantic headings without numbering", () => {
    const content = `
# Design Discussion

## Current State
status

## Target State
expected

## Design Decisions
### Decision 1: Keep media-specific behavior explicit
- **Recommended**: introduce the new media branch only where confirmed.
- **Alternative**: inherit all QI_MAO branches.
- **Needs Confirmation**: confirm which client capabilities should be shared.

## Architecture Constraints
constraints

## Risks and Mitigations
risks
` + makeLines(20);
    const result = validateStageArtifact("D", content);
    expect(result.valid).toBe(true);
  });

  it("validates D stage - rejects research report output", () => {
    const content = `
# Research Report

## Feature Overview
overview

## Codebase Technical Map
facts

## Dependency Graph
dependencies

## Constraints and Risks
risks
` + makeLines(20);
    const result = validateStageArtifact("D", content);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Design Discussion document"))).toBe(true);
    expect(result.issues.some((i) => i.message.includes("Missing design decision entries"))).toBe(true);
  });

  it("validates S stage - missing type definitions", () => {
    const result = validateStageArtifact("S", makeLines(25));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === "warning" && i.message.includes("type definitions"))).toBe(true);
  });

  it("validates W stage - invalid JSON", () => {
    const result = validateStageArtifact("W", "not json");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("JSON"))).toBe(true);
  });

  it("validates W stage - valid JSON", () => {
    const content = JSON.stringify({
      slices: [
        { name: "slice1", description: "desc", order: 1, tasks: [], checkpoint: "ok" },
      ],
    });
    const result = validateStageArtifact("W", content);
    expect(result.valid).toBe(true);
  });

  it("validates W stage - empty slices", () => {
    const content = JSON.stringify({ slices: [] });
    const result = validateStageArtifact("W", content);
    expect(result.valid).toBe(false);
  });

  it("validates W stage - warns on missing model_tier", () => {
    const content = JSON.stringify({
      slices: [
        {
          name: "slice1",
          description: "desc",
          order: 1,
          tasks: [{ id: "t1", description: "task", estimated_minutes: 10, context_budget: "low", dependencies: [] }],
          checkpoint: "ok",
        },
      ],
    });
    const result = validateStageArtifact("W", content);
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === "warning" && i.message.includes("model_tier"))).toBe(true);
  });

  it("validates W stage - warns on invalid model_tier", () => {
    const content = JSON.stringify({
      slices: [
        {
          name: "slice1",
          description: "desc",
          order: 1,
          tasks: [{ id: "t1", description: "task", estimated_minutes: 10, context_budget: "low", model_tier: "fast", dependencies: [] }],
          checkpoint: "ok",
        },
      ],
    });
    const result = validateStageArtifact("W", content);
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === "warning" && i.message.includes("invalid model_tier"))).toBe(true);
  });

  it("validates W stage - accepts valid model_tier values", () => {
    const content = JSON.stringify({
      slices: [
        {
          name: "slice1",
          description: "desc",
          order: 1,
          tasks: [
            { id: "t1", description: "task1", estimated_minutes: 10, context_budget: "low", model_tier: "low", dependencies: [] },
            { id: "t2", description: "task2", estimated_minutes: 20, context_budget: "medium", model_tier: "standard", dependencies: ["t1"] },
            { id: "t3", description: "task3", estimated_minutes: 30, context_budget: "high", model_tier: "powerful", dependencies: ["t2"] },
          ],
          checkpoint: "ok",
        },
      ],
    });
    const result = validateStageArtifact("W", content);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.message.includes("model_tier"))).toHaveLength(0);
  });

  it("validates I stage - basic content is invalid without explicit status", () => {
    const result = validateStageArtifact("I", makeLines(10));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("status report"))).toBe(true);
  });

  it("validates I stage - missing self-review triggers error for DONE", () => {
    const content = `
# Implementation Report

**Status:** DONE

## Slice 1: Auth
### Implementation Content
- Added login flow

### Verification Result
- Tests pass

### Remaining Issues
- None

## Files Changed
- src/auth.ts
`;
    const result = validateStageArtifact("I", content);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("self-review"))).toBe(true);
  });

  it("validates I stage - missing status report triggers error", () => {
    const content = makeLines(10);
    const result = validateStageArtifact("I", content);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("status report"))).toBe(true);
  });

  it("validates I stage - successful report requires files changed", () => {
    const content = `
# Implementation Report

**Status:** DONE_WITH_CONCERNS

## Slice 1: Auth
### Implementation Content
- Added login flow

### Verification Result
- Tests pass

### Remaining Issues
- Edge case pending

## Self-Review
- Completeness: all requested changes are present
- Quality: naming is clear
- Discipline: no extra refactor
- Testing: unit coverage added
`;
    const result = validateStageArtifact("I", content);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("files changed"))).toBe(true);
  });

  it("validates I stage - blocked report requires remaining issues", () => {
    const content = `
# 实现报告

**状态：** NEEDS_CONTEXT

## 切片 1: 媒体契约
### 实现内容
未修改代码。

### 验证结果
未运行测试。

## 自检
- 完整性：未实现，因为缺少关键信息
`;
    const result = validateStageArtifact("I", content);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("remaining issues"))).toBe(true);
  });

  it("validates I stage - blocked report can pass without files changed", () => {
    const content = `
# 实现报告

**状态：** BLOCKED

## 切片 1: 媒体契约
### 实现内容
未修改代码，先核对跨服务枚举占用。

### 验证结果
- 搜索现有定义，确认 1-9 已占用

### 遗留问题
- 需要业务确认新的 MediaId 数值

## 自检
- 完整性：已确认阻塞点
- 质量：未做猜测性修改
- 纪律：未超范围改动
- 测试：未进入代码修改阶段
`;
    const result = validateStageArtifact("I", content);
    expect(result.valid).toBe(true);
  });

  it("validates I stage - complete content passes without warnings", () => {
    const content = `
# Implementation Report

## Slice 1: Auth
### Implementation Content
Added login flow

### Verification Result
Tests pass

### Remaining Issues
None

## Self-Review
- Completeness: all done
- Quality: clean
- Discipline: scoped to request
- Testing: covers changed behavior

## Status: DONE

## Files Changed
- src/auth.ts
- tests/auth.test.ts
`;
    const result = validateStageArtifact("I", content);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("validates PR stage with warnings for underspecified content", () => {
    const result = validateStageArtifact("PR", makeLines(10));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.message.includes("Change Summary"))).toBe(true);
  });

  it("validates PR stage - complete content passes without warnings", () => {
    const content = `
# Pull Request Review

## Change Summary
- Added login endpoint

## Test Coverage
- unit: auth service
- integration: login flow

## Release Criteria
- apply auth migration

## Review Checklist
- [ ] rollback plan reviewed
- [ ] metrics updated
`;
    const result = validateStageArtifact("PR", content);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("creates validators for all stages", () => {
    const validators = createStageValidators();
    const stages: StageCode[] = ["Q", "R", "D", "S", "P", "W", "I", "PR"];
    for (const stage of stages) {
      expect(validators[stage]).toBeDefined();
      expect(validators[stage].stage).toBe(stage);
    }
  });
});
