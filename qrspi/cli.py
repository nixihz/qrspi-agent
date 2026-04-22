#!/usr/bin/env python3
"""
QRSPI Agent CLI

Usage:
    qrspi init <feature_id> --root <project_root>
    qrspi stage              # 查看当前阶段
    qrspi prompt <stage>     # 获取指定阶段的 prompt
    qrspi advance            # 推进到下一阶段
    qrspi run                # 自动执行直到 gate 或结束
    qrspi approve            # 确认 D/S/PR gate 并继续
    qrspi status             # 查看完整状态
    qrspi slice --add <name> --desc <description> --order <n>
    qrspi budget             # 查看指令预算报告
    qrspi context            # 查看当前阶段的推荐 context

Examples:
    qrspi init user-auth --root ./my-project
    qrspi prompt Q           # 获取 Questions 阶段 prompt
    qrspi prompt Q --render  # 渲染完整 prompt（含上下文）
    qrspi run --runner mock  # 用 mock runner 验证状态机
"""

import argparse
import json
import os
import sys
from pathlib import Path

from qrspi.engine import WorkflowEngine
from qrspi.runner import supported_runner_names
from qrspi.workflow import QRSPIWorkflow, Stage, SessionConfig, VerticalSlice
from qrspi.prompts import registry


def cmd_init(args):
    """初始化工作流"""
    feature_id = args.feature_id
    root = args.root or os.getcwd()

    config = SessionConfig(
        feature_id=feature_id,
        project_root=root,
        output_dir=args.output_dir or ".qrspi"
    )

    workflow = QRSPIWorkflow(config)
    workflow.save_state()

    print(f"\n✅ QRSPI 工作流已初始化")
    print(f"   Feature: {feature_id}")
    print(f"   Project: {root}")
    print(f"   Output:  {config.output_path}")
    print(f"\n   当前阶段: {workflow.current_stage.full_name}")
    print(f"\n   下一步: qrspi prompt Q --render")


def cmd_stage(args):
    """查看当前阶段"""
    config = _load_config(args)
    if not config:
        return

    workflow = QRSPIWorkflow(config)
    info = workflow.get_stage_info()

    print(f"\n📍 当前阶段: {info['name']}")
    print(f"   描述: {info['description']}")
    print(f"   阶段类型: {'对齐' if info['is_alignment'] else '执行'}")
    print(f"   输出目录: {info['output_dir']}")


def cmd_prompt(args):
    """获取 prompt 模板"""
    stage_code = args.stage.upper()
    prompt = registry.get(stage_code)

    if not prompt:
        print(f"❌ 未知阶段: {stage_code}")
        print(f"   可用阶段: {', '.join(registry.list_stages())}")
        return

    if args.render:
        # 渲染完整 prompt（含上下文）
        config = _load_config(args)
        context = ""
        user_input = ""

        if config:
            workflow = QRSPIWorkflow(config)
            stage = Stage(stage_code)
            context = workflow.get_context_for_stage(stage)
            user_input = args.input or ""

        full_prompt = prompt.render(context=context, user_input=user_input)
        print(full_prompt)
    else:
        # 只显示模板信息
        print(f"\n📝 {prompt.stage}")
        print(f"   指令数量: {prompt.instruction_count} (预算: {prompt.instruction_count/150*100:.1f}%)")
        print(f"\n   指令:")
        for i, inst in enumerate(prompt.instructions, 1):
            print(f"   {i}. {inst}")
        print(f"\n   验证标准:")
        for i, rule in enumerate(prompt.validation_rules, 1):
            print(f"   {i}. {rule}")


def cmd_advance(args):
    """推进到下一阶段"""
    config = _load_config(args)
    if not config:
        return

    workflow = QRSPIWorkflow(config)
    current = workflow.current_stage
    next_stage = current.next_stage()

    if not next_stage:
        print(f"\n✅ 工作流已完成！当前阶段: {current.full_name}")
        return

    # 检查是否有当前阶段的产物
    artifact = workflow.load_artifact(current)
    if not artifact and not args.force:
        print(f"\n⚠️  警告: 当前阶段 {current.full_name} 尚未保存产物")
        print(f"   使用 --force 强制推进，或先完成当前阶段")
        return

    workflow.advance()
    print(f"\n➡️  已进入: {next_stage.full_name}")
    print(f"   {next_stage.description}")


def cmd_status(args):
    """查看完整状态"""
    config = _load_config(args)
    if not config:
        return

    workflow = QRSPIWorkflow(config)
    workflow.print_workflow_status()

    engine = _build_engine(args, config)
    engine_status = engine.get_status()
    print(f"\n引擎状态: {engine_status['status']}")
    print(f"Runner: {engine_status['runner']}")
    if engine_status["model"]:
        print(f"Model: {engine_status['model']}")
    if engine_status["last_error"]:
        print(f"最近错误: {engine_status['last_error']}")


def cmd_slice(args):
    """管理工作树切片"""
    config = _load_config(args)
    if not config:
        return

    workflow = QRSPIWorkflow(config)

    if args.add:
        slice_obj = VerticalSlice(
            name=args.add,
            description=args.desc or "",
            order=args.order or 1,
            testable=not args.no_test,
            checkpoint=args.checkpoint or ""
        )

        # 加载现有切片
        slices_path = config.output_path / "slices"
        slices_path.mkdir(parents=True, exist_ok=True)
        work_tree_file = slices_path / "work_tree.json"

        existing_slices = []
        if work_tree_file.exists():
            with open(work_tree_file, 'r') as f:
                data = json.load(f)
                existing_slices = data.get("slices", [])

        # 添加新切片
        existing_slices.append(slice_obj.__dict__)
        existing_slices.sort(key=lambda s: s.get("order", 0))

        # 保存
        with open(work_tree_file, 'w') as f:
            json.dump({
                "current_slice_idx": 0,
                "slices": existing_slices
            }, f, indent=2, ensure_ascii=False)

        print(f"\n✅ 已添加切片: {slice_obj.name} (order: {slice_obj.order})")

    elif args.list:
        slices_path = config.output_path / "slices" / "work_tree.json"
        if slices_path.exists():
            with open(slices_path, 'r') as f:
                data = json.load(f)
                print(f"\n📋 垂直切片列表:")
                for s in data.get("slices", []):
                    status = "✓" if s.get("status") == "completed" else "○"
                    print(f"   {status} [{s['order']}] {s['name']}: {s['description']}")
        else:
            print("\n⚠️  尚无切片定义")


def cmd_budget(args):
    """查看指令预算报告"""
    report = registry.get_budget_report()

    print("\n📊 指令预算报告")
    print("=" * 50)
    print(f"{'阶段':<10} {'指令数':<10} {'预算使用':<12} {'状态':<5}")
    print("-" * 50)

    for stage, data in report.items():
        if stage == "TOTAL":
            print("-" * 50)
            print(f"{'TOTAL':<10} {data['instructions']:<10} {data['per_stage_avg'] + '/stage':<12} {data['status']:<5}")
        else:
            print(f"{stage:<10} {data['instructions']:<10} {data['budget_used']:<12} {data['status']:<5}")

    print("=" * 50)
    print("\n💡 提示:")
    print("   ✓ = 预算充足 (< 10%)")
    print("   ⚠ = 注意 (10-13%)")
    print("   ✗ = 需要精简 (> 13%)")
    print(f"   警戒线: 150 条指令/阶段")


def cmd_context(args):
    """查看当前阶段的推荐 context"""
    config = _load_config(args)
    if not config:
        return

    workflow = QRSPIWorkflow(config)
    stage = workflow.current_stage

    print(f"\n📋 阶段 {stage.full_name} 的 Context 策略")
    print("=" * 50)

    deps = Stage.get_dependencies(stage)
    if deps:
        print(f"\n📎 前置产物 (应加载到 Context):")
        for dep in deps:
            content = workflow.load_artifact(dep)
            status = "✅ 已生成" if content else "❌ 未生成"
            print(f"   {status} {dep.value} - {dep.full_name}")
    else:
        print(f"\n📎 无前置依赖 (这是工作流的起点)")

    print(f"\n🎯 推荐策略:")
    if stage in Stage.alignment_stages():
        print("   - 这是 对齐阶段，需要人工深度参与")
        print("   - Context 利用率目标: < 30%")
        print("   - 产物需要人工 review 和确认")
    else:
        print("   - 这是 执行阶段，Agent 自主执行")
        print("   - Context 利用率目标: < 40%")
        print("   - 每个垂直切片应切换新 Session")

    print(f"\n💡 获取 prompt: qrspi prompt {stage.value} --render")


def cmd_version(args):
    """查看版本信息"""
    from qrspi import __version__
    print(f"QRSPI Agent {__version__}")


def cmd_run(args):
    """自动执行工作流，直到遇到 gate 或结束"""
    config = _load_config(args)
    if not config:
        return

    engine = _build_engine(args, config)
    messages = engine.run(
        user_input=args.input or "",
        until_gate=not args.no_stop_at_gate,
        max_stages=args.max_stages,
    )

    print("\n🤖 自动执行结果")
    print("=" * 50)
    for msg in messages:
        print(f"- {msg}")

    status = engine.get_status()
    print("=" * 50)
    print(f"当前阶段: {status['stage']} - {status['stage_name']}")
    print(f"引擎状态: {status['status']}")


def cmd_approve(args):
    """确认当前 gate 阶段并推进"""
    config = _load_config(args)
    if not config:
        return

    engine = _build_engine(args, config)
    message = engine.approve(args.stage)
    print(f"\n✅ {message}")


def _load_config(args):
    """从当前目录加载配置"""
    root = getattr(args, 'root', None) or os.getcwd()
    output_dir = getattr(args, 'output_dir', None) or ".qrspi"

    # 查找 state 文件
    qrspi_dir = Path(root) / output_dir
    if not qrspi_dir.exists():
        print(f"❌ 未找到 QRSPI 工作流目录: {qrspi_dir}")
        print(f"   请先运行: qrspi init <feature_id> --root {root}")
        return None

    # 显式指定 feature_id 时直接使用
    explicit_feature = getattr(args, 'feature_id', None)
    if explicit_feature:
        feature_dir = qrspi_dir / explicit_feature
        if not feature_dir.exists():
            available = [d.name for d in qrspi_dir.iterdir() if d.is_dir()]
            print(f"❌ 未找到 feature '{explicit_feature}'")
            print(f"   可用 feature: {', '.join(available) if available else '无'}")
            return None
        return SessionConfig(
            feature_id=explicit_feature,
            project_root=root,
            output_dir=output_dir
        )

    # 找到最新的 feature
    features = [d for d in qrspi_dir.iterdir() if d.is_dir()]
    if not features:
        print(f"❌ 未找到任何 feature 工作流")
        return None

    # 按修改时间取最新的
    latest = max(features, key=lambda d: d.stat().st_mtime)
    feature_id = latest.name

    return SessionConfig(
        feature_id=feature_id,
        project_root=root,
        output_dir=output_dir
    )


def _build_engine(args, config):
    return WorkflowEngine.with_runner_name(
        config,
        getattr(args, "runner", None),
        timeout_seconds=getattr(args, "timeout", 180),
        model=getattr(args, "model", None),
        codex_profile=getattr(args, "codex_profile", None),
        codex_config_overrides=getattr(args, "codex_config", None),
    )


def _add_runner_args(parser):
    parser.add_argument(
        "--runner",
        choices=supported_runner_names(),
        help="运行器类型；未传时按 QRSPI_RUNNER 或默认值解析",
    )
    parser.add_argument("--timeout", type=int, default=180, help="Runner 超时秒数")
    parser.add_argument("--model", help="模型名；未传时按 runner 默认值或环境变量解析")
    parser.add_argument(
        "--codex-profile",
        help="Codex CLI profile 名称，仅在 --runner codex 时生效",
    )
    parser.add_argument(
        "--codex-config",
        action="append",
        help="Codex CLI 配置覆盖，格式 key=value，可重复传入，仅在 --runner codex 时生效",
    )


def main():
    parser = argparse.ArgumentParser(
        description="QRSPI Agent - 结构化编程 Agent 工作流",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  qrspi init user-auth --root ./my-project
  qrspi prompt Q --render
  qrspi advance
  qrspi status
  qrspi run --runner codex --model gpt-5.4
  qrspi budget
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # init
    init_parser = subparsers.add_parser("init", help="初始化工作流")
    init_parser.add_argument("feature_id", help="Feature 标识符")
    init_parser.add_argument("--root", help="项目根目录")
    init_parser.add_argument("--output-dir", default=".qrspi", help="输出目录")

    # stage
    stage_parser = subparsers.add_parser("stage", help="查看当前阶段")
    stage_parser.add_argument("--root", help="项目根目录")

    # prompt
    prompt_parser = subparsers.add_parser("prompt", help="获取阶段 prompt")
    prompt_parser.add_argument("stage", help="阶段代码 (Q/R/D/S/P/W/I/PR)")
    prompt_parser.add_argument("--render", action="store_true", help="渲染完整 prompt")
    prompt_parser.add_argument("--input", help="用户输入内容")
    prompt_parser.add_argument("--root", help="项目根目录")

    # advance
    advance_parser = subparsers.add_parser("advance", help="推进到下一阶段")
    advance_parser.add_argument("--root", help="项目根目录")
    advance_parser.add_argument("--force", action="store_true", help="强制推进")

    # status
    status_parser = subparsers.add_parser("status", help="查看完整状态")
    status_parser.add_argument("--root", help="项目根目录")
    _add_runner_args(status_parser)

    # slice
    slice_parser = subparsers.add_parser("slice", help="管理工作树切片")
    slice_parser.add_argument("--add", help="添加切片")
    slice_parser.add_argument("--desc", help="切片描述")
    slice_parser.add_argument("--order", type=int, help="切片顺序")
    slice_parser.add_argument("--no-test", action="store_true", help="不可测试")
    slice_parser.add_argument("--checkpoint", help="检查点描述")
    slice_parser.add_argument("--list", action="store_true", help="列出切片")
    slice_parser.add_argument("--root", help="项目根目录")

    # budget
    budget_parser = subparsers.add_parser("budget", help="查看指令预算报告")

    # context
    context_parser = subparsers.add_parser("context", help="查看 Context 策略")
    context_parser.add_argument("--root", help="项目根目录")

    # version
    version_parser = subparsers.add_parser("version", help="查看版本信息")

    # run
    run_parser = subparsers.add_parser("run", help="自动执行工作流直到 gate 或完成")
    run_parser.add_argument("--root", help="项目根目录")
    run_parser.add_argument("--input", help="Q 阶段的初始需求输入")
    _add_runner_args(run_parser)
    run_parser.add_argument("--max-stages", type=int, help="本次最多执行多少阶段")
    run_parser.add_argument("--no-stop-at-gate", action="store_true", help="即使遇到 gate 也不中止（不推荐）")

    # approve
    approve_parser = subparsers.add_parser("approve", help="确认当前 gate 阶段并推进")
    approve_parser.add_argument("stage", nargs="?", help="可选，显式指定要确认的阶段代码")
    approve_parser.add_argument("--root", help="项目根目录")
    _add_runner_args(approve_parser)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "init": cmd_init,
        "stage": cmd_stage,
        "prompt": cmd_prompt,
        "advance": cmd_advance,
        "status": cmd_status,
        "slice": cmd_slice,
        "budget": cmd_budget,
        "context": cmd_context,
        "run": cmd_run,
        "approve": cmd_approve,
        "version": cmd_version,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
