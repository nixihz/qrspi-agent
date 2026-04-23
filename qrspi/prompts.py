"""
QRSPI Prompt 模板系统

核心设计原则（基于文章教训）:
1. 指令预算: 每个 prompt 不超过 15 条指令（系统级），避免 85+ 条指令的 mega prompt
2. 无魔法词: 默认行为就是正确行为，不需要特定触发短语
3. 验证机制: 每个阶段有明确的验证标准，不是"读起来合理"

Prompt 结构:
    - 角色定义 (1条)
    - 阶段目标 (1条)
    - 输入/输出格式 (2-3条)
    - 约束条件 (2-3条)
    - 验证标准 (2-3条)

总计: 8-13 条指令，远低于 150-200 条的预算上限
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
from enum import Enum


class PromptTemplate:
    """Prompt 模板基类"""

    def __init__(self, stage: str, instructions: List[str], output_format: str, validation_rules: List[str]):
        self.stage = stage
        self.instructions = instructions
        self.output_format = output_format
        self.validation_rules = validation_rules

    @property
    def instruction_count(self) -> int:
        """指令数量 - 用于监控预算"""
        return len(self.instructions)

    def render(self, context: str = "", user_input: str = "") -> str:
        """渲染完整 prompt"""
        parts = [
            f"# 阶段: {self.stage}",
            "",
            "## 角色",
            "你是一个结构化编程 Agent，严格按照工作流阶段执行任务。",
            "",
            "## 指令",
        ]

        for i, inst in enumerate(self.instructions, 1):
            parts.append(f"{i}. {inst}")

        parts.extend([
            "",
            "## 输出格式",
            self.output_format,
            "",
            "## 验证标准",
            "在提交输出前，检查以下内容:",
        ])

        for i, rule in enumerate(self.validation_rules, 1):
            parts.append(f"{i}. {rule}")

        if context:
            parts.extend([
                "",
                "## 前置上下文 (摘要)",
                context,
            ])

        if user_input:
            parts.extend([
                "",
                "## 用户输入",
                user_input,
            ])

        parts.extend([
            "",
            "---",
            "开始执行。严格按输出格式产出，不要添加格式外的内容。",
        ])

        return "\n".join(parts)


class QPrompt(PromptTemplate):
    """
    Q - Questions (提问)
    目标: 将模糊的 feature ticket 变成具体的技术问题列表
    关键: 防御指令预算问题的第一道防线
    """

    def __init__(self):
        super().__init__(
            stage="Q - Questions (提问)",
            instructions=[
                "分析给定的 feature ticket 或需求描述",
                "识别实现该 feature 需要了解的所有技术信息",
                "产出 5-15 个具体的、可研究的技术问题",
                "每个问题必须指向代码库的某个具体方面（API、数据库、组件等）",
                "问题必须足够具体，能让 Agent 通过代码搜索找到答案",
                "不要包含任何实现建议或方案",
                "按依赖关系排序：基础架构问题在前，依赖问题在后",
            ],
            output_format="""```markdown
# 技术问题清单

## Feature 概述
[一句话描述这个 feature 的目标]

## 问题列表

### Q1: [问题标题]
- **目标**: [这个问题要解决什么]
- **搜索方向**: [应该在代码库的哪些地方找答案]
- **阻塞性**: [blocking/nice-to-have]

### Q2: ...

## 假设清单
[列出我们对当前系统的所有假设，后续需要验证]

## 风险标记
[标记最高风险的不确定性]
```""",
            validation_rules=[
                "问题数量在 5-15 之间，少于 5 说明思考不够深入",
                "每个问题都有明确的搜索方向，不能是模糊提问",
                "没有任何实现建议混入",
                "blocking 问题不超过 3 个",
            ]
        )


class RPrompt(PromptTemplate):
    """
    R - Research (研究)
    目标: 收集代码库的客观事实，产出技术地图
    关键: 隐藏原始 feature ticket，只收集事实，不形成意见
    """

    def __init__(self):
        super().__init__(
            stage="R - Research (研究)",
            instructions=[
                "基于技术问题清单，逐一研究代码库",
                "对每个问题，追踪逻辑流并识别相关的端点、函数和数据结构",
                "产出客观的技术地图：记录代码实际做什么，不是你认为应该怎么做",
                "引用具体的文件路径、函数名和代码片段",
                "标记任何与假设清单冲突的发现",
                "不要形成'如何修改'的意见或建议",
                "如果某个问题无法从代码中找到答案，明确标记为 '未找到'",
            ],
            output_format="""```markdown
# 技术地图

## Q1: [对应问题]
### 发现
- **相关文件**: `path/to/file.ts`
- **关键代码**: [引用关键代码片段]
- **数据流**: [描述数据如何流经这些代码]

### 验证
- **假设验证**: [确认/推翻/修改了哪个假设]
- **依赖项**: [发现的新依赖]

## Q2: ...

## 未解决问题
[标记研究中未能解答的问题]

## 意外发现
[代码中发现的任何意外模式或技术债务]
```""",
            validation_rules=[
                "每个问题都有对应的发现，未找到的明确标记",
                "引用了具体的文件路径和函数名，不是泛泛描述",
                "没有混入任何实现建议或方案",
                "假设清单中的每项都有验证结果",
            ]
        )


class DPrompt(PromptTemplate):
    """
    D - Design Discussion (设计讨论)
    目标: 脑dump理解，产出 200 行 markdown 设计文档
    关键: 杠杆最高的阶段，在此修正架构方向
    """

    def __init__(self):
        super().__init__(
            stage="D - Design Discussion (设计讨论)",
            instructions=[
                "综合技术地图中的所有发现，形成对当前系统的完整理解",
                "产出一份约 200 行的 markdown 设计讨论文档",
                "覆盖三个维度：当前状态、期望最终状态、设计决策",
                "对每个设计决策，列出至少 2 个备选方案及其权衡",
                "标注团队已经放弃的遗留模式，避免重新引入",
                "明确标记需要人工确认的设计点",
                "文档必须可以被人类工程师 review 和修改",
            ],
            output_format="""```markdown
# 设计讨论文档

## 1. 当前状态
[描述系统当前如何工作，基于技术地图的事实]

## 2. 期望最终状态
[描述实现 feature 后系统应该如何工作]

## 3. 设计决策

### 决策 1: [决策标题]
- **问题**: [要解决什么问题]
- **推荐方案**: [推荐什么]
- **备选方案 A**: [方案] - 优点: ... 缺点: ...
- **备选方案 B**: [方案] - 优点: ... 缺点: ...
- **需要确认**: [需要人工确认的点]

## 4. 架构约束
[列出所有必须遵守的架构约束]

## 5. 风险与缓解
[识别设计风险并提出缓解措施]
```""",
            validation_rules=[
                "文档长度约 200 行，不超过 250 行",
                "每个设计决策有至少 2 个备选方案",
                "明确标记了需要人工确认的点",
                "没有引入团队已放弃的遗留模式",
                "所有设计决策都基于技术地图的事实",
            ]
        )


class SPrompt(PromptTemplate):
    """
    S - Structure Outline (结构大纲)
    目标: 定义函数签名、新类型和高级阶段，强制垂直分片
    关键: 类比 C 语言 header 文件
    """

    def __init__(self):
        super().__init__(
            stage="S - Structure Outline (结构大纲)",
            instructions=[
                "基于已确认的设计决策，定义所有新函数的签名",
                "定义所有新类型、接口和数据结构",
                "明确函数之间的调用关系和依赖",
                "将工作强制垂直分片：Mock API → 前端 → 数据库",
                "每个垂直切片必须有独立的测试点",
                "不要包含函数实现，只有签名和接口",
                "标注每个切片的入口点和出口点",
            ],
            output_format="""```markdown
# 结构大纲

## 类型定义
```typescript
interface NewType {
  // 字段和类型
}
```

## 函数签名
```typescript
// [函数用途]
function functionName(param: Type): ReturnType;
```

## 垂直切片

### 切片 1: [名称] (Mock API)
- **目标**: [这个切片要验证什么]
- **入口**: [从哪开始]
- **出口**: [到哪结束，可测试]
- **函数**: [涉及的函数列表]
- **测试**: [如何验证]

### 切片 2: [名称] (前端)
...

### 切片 3: [名称] (数据库)
...

## 依赖图
[切片之间的依赖关系]
```""",
            validation_rules=[
                "所有函数只有签名没有实现",
                "至少有 2 个垂直切片，每个都有明确测试点",
                "切片按 Mock API → 前端 → 数据库 或等价顺序排列",
                "类型定义完整，没有遗漏",
                "依赖关系清晰无循环",
            ]
        )


class PPrompt(PromptTemplate):
    """
    P - Plan (计划)
    目标: 战术实施文档
    关键: 被 Design 和 Structure 约束，避免计划阅读幻觉
    """

    def __init__(self):
        super().__init__(
            stage="P - Plan (计划)",
            instructions=[
                "基于已确认的设计决策和结构大纲，制定战术实施计划",
                "按垂直切片组织实施顺序",
                "每个切片列出具体的文件修改清单",
                "对每个修改，标注风险等级 (low/medium/high)",
                "包含具体的测试策略，不是'写测试'",
                "标注可能需要回滚的检查点",
                "计划必须是可验证的，不是叙述性描述",
            ],
            output_format="""```markdown
# 实施计划

## 切片 1: [名称]
### 修改清单
| 文件 | 操作 | 内容 | 风险 |
|------|------|------|------|
| `path/file.ts` | modify | [具体修改] | low |

### 测试策略
- [具体的测试步骤]

### 检查点
- [ ] [可验证的检查点]

## 回滚策略
[如果出现问题如何回滚]

## 时间表估算
[每个切片的预估时间]
```""",
            validation_rules=[
                "每个修改都具体到文件和操作",
                "测试策略可执行，不是泛泛描述",
                "每个切片有明确的检查点",
                "高风险修改有对应的回滚方案",
                "计划被设计决策和结构大纲约束",
            ]
        )


class WorkTreePrompt(PromptTemplate):
    """
    W - Work Tree (工作树)
    目标: 按垂直切片组织成可管理的层次结构
    """

    def __init__(self):
        super().__init__(
            stage="W - Work Tree (工作树)",
            instructions=[
                "根据结构大纲中的垂直切片，构建任务树",
                "每个切片分解为可独立执行的子任务",
                "标注每个任务的依赖关系",
                "为每个任务分配预估的 context 预算",
                "任务粒度：每个任务应该在 15-20 分钟内完成",
                "确保任务树可以被序列化为 JSON",
            ],
            output_format="""```json
{
  "slices": [
    {
      "name": "切片名称",
      "description": "切片描述",
      "order": 1,
      "tasks": [
        {
          "id": "task-1",
          "description": "任务描述",
          "estimated_minutes": 15,
          "context_budget": "low",
          "dependencies": []
        }
      ],
      "checkpoint": "验证条件"
    }
  ]
}
```""",
            validation_rules=[
                "每个任务预估时间 15-20 分钟",
                "任务依赖无循环",
                "每个切片有明确的 checkpoint",
                "context_budget 标注合理",
            ]
        )


class IPrompt(PromptTemplate):
    """
    I - Implement (实现)
    目标: 编写代码
    关键: 每个垂直切片独立 Session
    """

    def __init__(self):
        super().__init__(
            stage="I - Implement (实现)",
            instructions=[
                "按工作树中的顺序实现当前切片",
                "严格遵循结构大纲中的函数签名和类型定义",
                "每个函数实现后，立即添加对应的测试",
                "实现一个检查点后就运行测试验证",
                "如果测试失败，先修复再前进",
                "不要修改当前切片外的代码",
                "每完成一个切片，更新工作树状态",
            ],
            output_format="""```markdown
# 实现报告: [切片名称]

## 完成的修改
- `file.ts`: [修改内容摘要]

## 测试结果
- [测试名称]: pass/fail
- 覆盖率: [百分比]

## 偏差记录
[与计划有偏差的地方及原因]

## 下一切片准备
[发现的需要注意的点]
```""",
            validation_rules=[
                "所有函数签名与结构大纲一致",
                "测试覆盖率 > 80%",
                "没有修改切片外的代码",
                "每个检查点都已验证",
            ]
        )


class PRPrompt(PromptTemplate):
    """
    PR - Pull Request (拉取请求)
    目标: 人工 Review
    关键: 工程师必须阅读并拥有代码
    """

    def __init__(self):
        super().__init__(
            stage="PR - Pull Request (拉取请求)",
            instructions=[
                "生成结构化的 PR 描述，便于人工 review",
                "列出所有修改的文件和变更摘要",
                "标注每个变更对应的设计决策",
                "包含测试执行结果和覆盖率报告",
                "列出需要人工重点关注的代码段",
                "不包含需要人工确认的设计问题（应在 D 阶段解决）",
            ],
            output_format="""```markdown
# PR: [Feature 名称]

## 变更摘要
[一段话描述这个 PR 做什么]

## 修改清单
| 文件 | 变更 | 对应设计决策 |
|------|------|-------------|
| `file.ts` | [add/modify/delete] | [决策引用] |

## 测试
- [测试命令]
- 结果: [pass/fail]
- 覆盖率: [%]

## Review 检查清单
- [ ] 函数签名与结构大纲一致
- [ ] 没有引入遗留模式
- [ ] 错误处理完整
- [ ] 性能影响评估通过

## 需要关注的代码
[标注需要人工重点 review 的代码段]
```""",
            validation_rules=[
                "所有变更都关联到设计决策",
                "测试命令可直接执行",
                "Review 检查清单完整",
                "没有未解决的设计问题",
            ]
        )


class PromptRegistry:
    """Prompt 注册表 - 管理所有阶段模板"""

    def __init__(self):
        self._prompts = {
            "Q": QPrompt(),
            "R": RPrompt(),
            "D": DPrompt(),
            "S": SPrompt(),
            "P": PPrompt(),
            "W": WorkTreePrompt(),
            "I": IPrompt(),
            "PR": PRPrompt(),
        }

    def get(self, stage: str) -> PromptTemplate:
        return self._prompts.get(stage)

    def list_stages(self) -> List[str]:
        return list(self._prompts.keys())

    def _get_status(self, count: int) -> str:
        """根据指令数量获取状态"""
        if count < 15:
            return "✓"
        if count < 20:
            return "⚠"
        return "✗"

    def get_budget_report(self) -> Dict:
        """生成指令预算报告"""
        report = {}
        total = 0
        for stage, prompt in self._prompts.items():
            count = prompt.instruction_count
            report[stage] = {
                "instructions": count,
                "budget_used": f"{count/150*100:.1f}%",  # 150条为警戒线
                "status": self._get_status(count)
            }
            total += count

        report["TOTAL"] = {
            "instructions": total,
            "per_stage_avg": f"{total/8:.1f}",
            "status": "✓" if total < 120 else "⚠"
        }
        return report


# 全局注册表实例
registry = PromptRegistry()
