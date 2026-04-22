#!/usr/bin/env python3
"""
QRSPI Agent 演示脚本

演示完整的 8 阶段工作流，无需外部依赖。
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from qrspi.workflow import QRSPIWorkflow, Stage, SessionConfig, VerticalSlice
from qrspi.prompts import registry


def demo_workflow():
    """演示工作流状态机"""
    print("=" * 60)
    print("QRSPI Agent 演示")
    print("=" * 60)

    # 初始化
    config = SessionConfig(
        feature_id="demo-auth",
        project_root="/tmp/demo-project",
        output_dir=".qrspi"
    )

    workflow = QRSPIWorkflow(config)
    print(f"\n1. 工作流初始化完成")
    print(f"   Feature: {config.feature_id}")
    print(f"   当前阶段: {workflow.current_stage.full_name}")

    # 展示所有阶段
    print(f"\n2. 工作流阶段:")
    for stage in Stage:
        phase = "对齐" if stage in Stage.alignment_stages() else "执行"
        print(f"   {stage.value}: {stage.full_name} [{phase}]")

    # 指令预算报告
    print(f"\n3. 指令预算报告:")
    report = registry.get_budget_report()
    for stage, data in report.items():
        if stage == "TOTAL":
            print(f"   {'TOTAL':<10} {data['instructions']:<10} {data['status']:<5}")
        else:
            print(f"   {stage:<10} {data['instructions']:<10} {data['status']:<5}")

    # 模拟 Q 阶段产物
    print(f"\n4. 模拟 Q 阶段执行...")
    q_content = """# 技术问题清单

## Feature 概述
添加用户认证系统

## 问题列表
### Q1: 当前使用什么 Web 框架？
- **搜索方向**: src/app.ts
- **阻塞性**: blocking

### Q2: 现有用户数据模型？
- **搜索方向**: prisma/schema.prisma
- **阻塞性**: blocking

## 假设清单
- 使用 Node.js + Express
- 使用 PostgreSQL

## 风险标记
- 现有 User 模型可能需要迁移
"""
    workflow.save_artifact(Stage.QUESTIONS, q_content, {"questions_count": 2})

    # 推进到 R
    workflow.advance()

    # 模拟 R 阶段产物
    r_content = """# 技术地图

## Q1: Web 框架
- **相关文件**: src/app.ts
- **关键代码**: Express.js 4.18.x, Router 模块化

## Q2: 用户数据模型
- **相关文件**: prisma/schema.prisma
- **关键代码**: User 模型有 id, email, name，无 password

## 意外发现
- 没有现有认证中间件
"""
    workflow.save_artifact(Stage.RESEARCH, r_content)

    # 推进到 D
    workflow.advance()

    # 模拟 D 阶段产物
    d_content = """# 设计讨论文档

## 1. 当前状态
Express + Prisma + PostgreSQL，User 模型缺少认证字段

## 2. 期望最终状态
完整的 JWT 认证系统，支持邮箱+密码和 OAuth

## 3. 设计决策
### 决策 1: 密码哈希
- **推荐**: bcrypt (cost 10)
- **备选**: Argon2
- **需要确认**: 是否接受 bcryptjs 依赖

## 4. 架构约束
- 兼容现有 User 模型
- 密码字段可空（OAuth 用户）
"""
    workflow.save_artifact(Stage.DESIGN, d_content)

    # 显示状态
    print(f"\n5. 当前工作流状态:")
    workflow.print_workflow_status()

    # 创建垂直切片
    print(f"\n6. 创建垂直切片...")
    slices = [
        VerticalSlice(name="database", description="添加密码字段和 token 表",
                      order=1, checkpoint="迁移成功"),
        VerticalSlice(name="mock-api", description="实现注册登录 API",
                      order=2, checkpoint="curl 测试通过"),
        VerticalSlice(name="oauth", description="GitHub OAuth 集成",
                      order=3, checkpoint="OAuth 测试通过"),
        VerticalSlice(name="frontend", description="登录 UI",
                      order=4, checkpoint="端到端测试通过"),
    ]
    workflow.create_work_tree(slices)

    # 显示 Q 阶段 prompt
    print(f"\n7. Q 阶段 Prompt 预览:")
    q_prompt = registry.get("Q")
    print(f"   阶段: {q_prompt.stage}")
    print(f"   指令数: {q_prompt.instruction_count}")
    print(f"   前 3 条指令:")
    for i, inst in enumerate(q_prompt.instructions[:3], 1):
        print(f"     {i}. {inst}")

    print(f"\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)
    print(f"\n项目文件位置: {config.output_path}")
    print(f"\n下一步: 查看产物文件和继续推进工作流")


if __name__ == "__main__":
    demo_workflow()
