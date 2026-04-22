"""Tests for qrspi.validators module."""

import pytest

from qrspi.validators import ValidationResult, validate_stage_output
from qrspi.workflow import Stage


class TestValidateStageOutput:
    def test_unknown_stage_returns_failed(self):
        """对未知的 Stage 值应返回 failed 而非抛异常。"""
        result = validate_stage_output(Stage.QUESTIONS, "")
        assert isinstance(result, ValidationResult)

    def test_empty_content_fails_for_all_stages(self):
        """所有阶段空内容都应失败。"""
        for stage in Stage:
            result = validate_stage_output(stage, "")
            assert result.passed is False
            assert "产物内容为空" in result.errors

    def test_validate_q_pass(self):
        content = """
# 技术问题清单

## Feature 概述
测试

## 问题列表

### Q1: 问题1
- **目标**: 测试
- **搜索方向**: src/
- **阻塞性**: blocking

### Q2: 问题2
- **目标**: 测试
- **搜索方向**: src/
- **阻塞性**: blocking

### Q3: 问题3
- **目标**: 测试
- **搜索方向**: src/
- **阻塞性**: blocking

### Q4: 问题4
- **目标**: 测试
- **搜索方向**: src/
- **阻塞性**: nice-to-have

### Q5: 问题5
- **目标**: 测试
- **搜索方向**: src/
- **阻塞性**: nice-to-have

## 假设清单
- 假设1

## 风险标记
- 风险1
"""
        result = validate_stage_output(Stage.QUESTIONS, content)
        assert result.passed is True

    def test_validate_q_too_few_questions(self):
        content = """
# 技术问题清单
## 问题列表
### Q1: 问题1
- **目标**: 测试
- **搜索方向**: src/
- **阻塞性**: blocking

## 假设清单
- 假设1

## 风险标记
- 风险1
"""
        result = validate_stage_output(Stage.QUESTIONS, content)
        assert result.passed is False
        assert "5-15" in result.errors[0]

    def test_validate_q_missing_sections(self):
        content = """
# 技术问题清单
## 问题列表
### Q1: 问题1
### Q2: 问题2
### Q3: 问题3
### Q4: 问题4
### Q5: 问题5
"""
        result = validate_stage_output(Stage.QUESTIONS, content)
        assert result.passed is False
        assert "假设清单" in result.errors[0]

    def test_validate_r_pass(self):
        content = """
# 技术地图

## Q1: 问题1
### 发现
- **相关文件**: `app/main.py`
- **关键代码**: `main()`

### 验证
- **假设验证**: 确认

## 未解决问题
- 暂无
"""
        result = validate_stage_output(Stage.RESEARCH, content)
        assert result.passed is True

    def test_validate_r_missing_findings(self):
        content = """
# 技术地图
## 未解决问题
- 暂无
"""
        result = validate_stage_output(Stage.RESEARCH, content)
        assert result.passed is False

    def test_validate_d_pass(self):
        content = """
# 设计讨论文档

## 1. 当前状态
当前状态

## 2. 期望最终状态
期望状态

## 3. 设计决策

### 决策 1: 状态持久化
- **问题**: 如何恢复
- **推荐方案**: 方案A
- **备选方案 A**: 方案A - 优点: ... 缺点: ...
- **备选方案 B**: 方案B - 优点: ... 缺点: ...
- **需要确认**: 是否接受

## 4. 架构约束
- 约束1

## 5. 风险与缓解
- 风险1
"""
        result = validate_stage_output(Stage.DESIGN, content)
        assert result.passed is True

    def test_validate_d_missing_alternatives(self):
        content = """
# 设计讨论文档
## 1. 当前状态
当前状态
## 2. 期望最终状态
期望状态
## 3. 设计决策
### 决策 1
- **问题**: 如何恢复
## 4. 架构约束
## 5. 风险与缓解
"""
        result = validate_stage_output(Stage.DESIGN, content)
        assert result.passed is False
        assert "备选方案" in result.errors[0]

    def test_validate_s_pass(self):
        content = """
# 结构大纲

## 类型定义
```typescript
interface NewType {}
```

## 函数签名
```typescript
function fn(): void;
```

## 垂直切片

### 切片 1: API (Mock API)
- **目标**: 测试
- **入口**: a
- **出口**: b
- **函数**: fn
- **测试**: 测试

### 切片 2: UI (前端)
- **目标**: 测试
- **入口**: a
- **出口**: b
- **函数**: fn
- **测试**: 测试

## 依赖图
无
"""
        result = validate_stage_output(Stage.STRUCTURE, content)
        assert result.passed is True

    def test_validate_s_not_enough_slices(self):
        content = """
# 结构大纲
## 类型定义
## 函数签名
## 垂直切片
### 切片 1: API
"""
        result = validate_stage_output(Stage.STRUCTURE, content)
        assert result.passed is False
        assert "至少需要 2 个垂直切片" in result.errors[0]

    def test_validate_w_valid_json(self):
        import json
        content = json.dumps({
            "slices": [
                {"name": "s1", "description": "", "order": 1, "tasks": [], "checkpoint": ""}
            ]
        })
        result = validate_stage_output(Stage.WORK_TREE, content)
        assert result.passed is True

    def test_validate_w_invalid_json(self):
        result = validate_stage_output(Stage.WORK_TREE, "not json")
        assert result.passed is False
        assert "合法 JSON" in result.errors[0]

    def test_validate_w_no_slices(self):
        import json
        content = json.dumps({"slices": []})
        result = validate_stage_output(Stage.WORK_TREE, content)
        assert result.passed is False
        assert "至少需要一个切片" in result.errors[0]

    def test_validate_i_pass(self):
        content = """
# 实现报告

## 完成的修改
- `file.ts`: 修改

## 测试结果
- test: pass

## 下一切片准备
- 注意点
"""
        result = validate_stage_output(Stage.IMPLEMENT, content)
        assert result.passed is True

    def test_validate_pr_pass(self):
        content = """
# PR

## 变更摘要
摘要

## 修改清单
| 文件 | 变更 | 对应设计决策 |

## 测试
- test: pass

## Review 检查清单
- [ ] 检查1
"""
        result = validate_stage_output(Stage.PULL_REQUEST, content)
        assert result.passed is True
