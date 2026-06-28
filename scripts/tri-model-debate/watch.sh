#!/bin/bash
# 实时监控三大模型辩论进度

cd "$(dirname "$0")/../.." || exit 1

LOG_DIR="logs/venus-debate"

echo "════════════════════════════════════════════════════════════════════"
echo "    三大模型辩论进度监控"
echo "    按 Ctrl+C 退出监控（不会停止辩论进程）"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# 找到最新的辩论日志
LATEST_LOG=$(ls -t "$LOG_DIR"/debate-*.log 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
  echo "⚠️ 未找到辩论日志文件"
  echo "   日志目录: $LOG_DIR/"
  exit 0
fi

echo "📄 日志文件: $LATEST_LOG"
echo ""

# 检查进程是否运行
if pgrep -f "tri-model-debate/debate.mjs" > /dev/null 2>&1; then
  echo "✅ 辩论进程运行中 (PID: $(pgrep -f 'tri-model-debate/debate.mjs'))"
else
  echo "⚠️ 辩论进程未运行（显示历史日志）"
fi

echo ""
echo "────────────────────────────────────────────────────────────────────"

tail -f "$LATEST_LOG" 2>/dev/null
