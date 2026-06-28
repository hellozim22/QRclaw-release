#!/bin/bash
# 启动三大模型辩论（后台运行）
#
# 用法：bash scripts/tri-model-debate/start.sh <文档路径> [选项]
# 示例：bash scripts/tri-model-debate/start.sh requirements/需求.md --type product

cd "$(dirname "$0")/../.." || exit 1

DOC_PATH="$1"
if [ -z "$DOC_PATH" ]; then
  echo "❌ 请提供文档路径"
  echo "用法: bash scripts/tri-model-debate/start.sh <文档路径> [选项]"
  exit 1
fi

shift
EXTRA_ARGS="$*"

LOG_DIR="logs/venus-debate"
mkdir -p "$LOG_DIR"

DOC_NAME=$(basename "$DOC_PATH" | sed 's/\.[^.]*$//')
DATE_STR=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/debate-${DOC_NAME}-${DATE_STR}.log"

# 清理旧进程
pkill -f "tri-model-debate/debate.mjs" 2>/dev/null

echo "════════════════════════════════════════════════════════════════════"
echo "    三大模型辩论启动器"
echo "    模型: Claude Opus 4.6 / GPT 5.2 / Gemini 3.1 Pro"
echo "    文档: $DOC_PATH"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# 启动后台进程
nohup node scripts/tri-model-debate/debate.mjs "$DOC_PATH" $EXTRA_ARGS >> "$LOG_FILE" 2>&1 &
PID=$!

echo "✅ 辩论已启动 (PID: $PID)"
echo ""
echo "📄 日志文件: $LOG_FILE"
echo ""
echo "监控方式:"
echo "  bash scripts/tri-model-debate/watch.sh"
echo "  tail -f $LOG_FILE"
echo ""
echo "停止辩论:"
echo "  pkill -f 'tri-model-debate/debate.mjs'"
echo ""

sleep 3

if ps -p $PID > /dev/null 2>&1; then
  echo "✅ 进程运行正常"
  echo ""
  echo "最新日志:"
  echo "────────────────────────────────────────────────────────────────────"
  tail -20 "$LOG_FILE"
else
  echo "❌ 进程启动失败，查看错误日志:"
  cat "$LOG_FILE"
  exit 1
fi
