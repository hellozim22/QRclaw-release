#!/usr/bin/env node
/**
 * Resize design PNGs to match Playwright viewport, then pixel-diff vs implementation screenshots.
 * Design exports are high-DPI (e.g. 4096×2560); implementation is 1440×900 or 390×844.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const designDash = path.join(repoRoot, 'design/design-png-dashboard');
const designPhone = path.join(repoRoot, 'design/design-png-phone');
const implDir = path.join(repoRoot, 'tests/test-results/visual-audit-20260327/implementation');
const outRoot = path.join(repoRoot, 'tests/test-results/visual-audit-20260327');

const DASHBOARD = [
  { file: 'Web!Dashboard-Messages.png', w: 1440, h: 900 },
  { file: 'Web!Dashboard-Streaming.png', w: 1440, h: 900 },
  { file: 'Web!Dashboard-Support.png', w: 1440, h: 900 },
  { file: 'Web!Dashboard-QRcode.png', w: 1440, h: 900 },
  { file: 'Web!Dashboard-QRcode-Empty.png', w: 1440, h: 900 },
  { file: 'Web!AddQRModal.png', w: 1440, h: 900 },
  { file: 'Web!CreateQR-Step0-HasAgent.png', w: 1440, h: 900 },
  { file: 'Web!CreateQR-Step2.png', w: 1440, h: 900 },
  { file: 'Web!CreateQR-Success.png', w: 1440, h: 900 },
  { file: 'Web!EditQR.png', w: 1440, h: 900 },
  { file: 'Web!Settings.png', w: 1440, h: 900 },
  { file: 'Web!Pricing.png', w: 1440, h: 900 },
];

/** 人工补充：给后续改 UI 的 Agent 的优先级与检查点（与像素网格结论合并进报告） */
const IMPLEMENTER_HINTS = {
  'Web!Dashboard-Messages.png':
    'Dashboard 消息列表：侧栏宽度/图标、中间列标题与行高、右侧空态文案与输入条；对照 `design-tokens` 与 `frontend-dev-guide` 三栏宽。',
  'Web!Dashboard-Streaming.png':
    '流式聊天：中间会话区气泡/时间戳、右侧或同页输入区、顶栏 Agent 信息；动态文字会导致 diff，优先对齐壳层与间距。',
  'Web!Dashboard-Support.png':
    '与支持 Agent 的对话壳层；若与设计「支持」文案不一致，核对 `messages` / `chat` 页标题与空态。',
  'Web!Dashboard-QRcode.png':
    'QR 列表页：左列统计卡、列表行高与选中态、右侧详情与手机预览框；本张列表数据经 Mock，以布局/组件为准而非文案。',
  'Web!Dashboard-QRcode-Empty.png': '空状态：中间列空态插画/文案、右侧占位；本张经 Mock 空列表。',
  'Web!AddQRModal.png':
    '创建向导 Step1「Choose a Template」：2×2 卡片（Customer Service / Data Analyst / Email Assistant / Custom）与 `Web-CreateQR-Step1-Template` 对齐。',
  'Web!CreateQR-Step0-HasAgent.png':
    '选 Agent：2 列网格、紧凑卡片、右上角选中 ✓、mono Agent ID、绿点 Online；对照 `Web-CreateQR-Step0-SelectAgent`。',
  'Web!CreateQR-Step2.png':
    'Step2「Configure Agent Profile」：Upload Avatar 在表单顶部、Name/Description/System Prompt*、左侧红条 system prompt；右侧 Live Preview；对照 `Web-CreateQR-Step2-Configure`。',
  'Web!CreateQR-Success.png':
    '成功页：单列居中 QR 卡（固定约 168px 码区）、Style Standard/Dark、URL+Copy、Download QR + Go to Dashboard、+ Create another；对照 `Web-CreateQR-Success`。',
  'Web!EditQR.png':
    '右栏详情：Edit/Download/Revoke 按钮排布、统计卡、手机预览；列表行点击后右侧内容区。',
  'Web!Settings.png': '设置表单分区、行高、开关/输入样式；整体 diff 较小，多为细间距与字重。',
  'Web!Pricing.png': '定价三卡布局、价格字号、按钮与页脚；注意长页面 cover 裁剪可能放大顶部差异。',
  'Mobile!404.png': '404 文案、插图或空态、返回入口；与设计稿标题层级对齐。',
  'Mobile!AgentNoReply.png':
    '聊天壳层：无回复提示或占位；与 `Mobile!Chat` 同属 `/m/chat`，优先对齐顶栏与输入条。',
  'Mobile!Chat.png': '移动聊天：顶栏、消息区、底栏输入；气泡与头像尺寸对照设计稿。',
  'Mobile!Chat-Streaming.png':
    '流式中与静态聊天同一壳层；差异多在消息内容区，对齐输入条与顶栏即可。',
  'Mobile!Login.png':
    '登录（9nzBk）：Logo 80×80、标题「QRClaw」700/24px、副标题「Sign in to sync your conversations」、表单与主按钮约 342px、底部法律链接。',
  'Mobile!LongPressCopy.png':
    '与聊天页相同路由；长按菜单若未触发则整页与 `Mobile!Chat` 接近，diff 来自交互层未出现。',
  'Mobile!Me.png': '个人中心列表行、头像区、Help 行样式与分割线。',
  'Mobile!Messages-NewUser.png': '（未出图）需新用户空会话或专门文案时再截。',
  'Mobile!Messages.png': '消息列表行高、时间戳、右侧箭头等；对照 `m/messages`。',
  'Mobile!MyQRCodes-Empty.png': '空列表：中央提示与 CTA；在 dashboard 创建 QR 前截取。',
  'Mobile!MyQRCodes.png': '有数据列表：行高、状态点颜色、标题字重。',
  'Mobile!Offline-Agent.png': '离线态横幅或提示；与聊天壳层叠加，检查状态条位置与色。',
  'Mobile!Profile-Paused.png': '（未出图）需提供暂停态 Agent id 再截。',
  'Mobile!Profile.png': 'Agent 资料：头图/头像、名称、描述与 CTA；对照 `/agent/:id`。',
  'Mobile!QRCodeDetail.png': '详情页：从列表进入后的单卡信息、操作按钮。',
  'Mobile!ScanQR-AgentGuide.png':
    'Support 引导对话（`/m/chat/:id?guide=1&audit=1`）：与相机页 `Mobile!ScanQR` 设计资源不同，勿与取景框 PNG 对比；对齐 DFoBo 聊天 + 顶栏 + 注册条。',
  'Mobile!ScanQR.png': '扫码页：取景框、说明文案、权限提示样式。',
  'Mobile!SignUp.png': '注册：与 Login 类似，注意内嵌预览卡片（若有）与表单间距。',
  'Mobile!SwipeDelete.png':
    '消息列表：侧滑删除交互若未触发则与 `Mobile!Messages` 类似；diff 多在列表行。',
  'Mobile!Verify.png': '验证页：说明文案、重发链接、图标区。',
};

/**
 * 从 pixelmatch 输出的 diff 图（RGBA）统计差异像素在网格中的分布，返回中文简述。
 */
function summarizeDiffHotspots(diffData, width, height, totalDiffPx) {
  if (totalDiffPx === 0 || !totalDiffPx) return '无差异像素。';

  const rows = 4;
  const cols = 4;
  const cellH = Math.floor(height / rows);
  const cellW = Math.floor(width / cols);
  const counts = new Array(rows * cols).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const r = diffData[i];
      const g = diffData[i + 1];
      const b = diffData[i + 2];
      const a = diffData[i + 3];
      // pixelmatch 默认将差异标为 #ff0000
      const isDiff = a > 200 && r > 250 && g < 5 && b < 5;
      if (isDiff) {
        const cr = Math.min(cols - 1, Math.floor(x / cellW));
        const rr = Math.min(rows - 1, Math.floor(y / cellH));
        counts[rr * cols + cr] += 1;
      }
    }
  }

  const sumCells = counts.reduce((s, c) => s + c, 0);
  if (sumCells === 0) {
    return '差异像素存在但 diff 图热点解析未命中（可肉眼查看 diff/ 文件）。';
  }

  const labeled = counts.map((c, idx) => {
    const rr = Math.floor(idx / cols);
    const cr = idx % cols;
    const vLabel = ['顶部', '偏上', '偏下', '底部'][rr];
    const hLabel = ['左侧', '偏左中', '偏右中', '右侧'][cr];
    return { c, label: `${vLabel}${hLabel}` };
  });

  labeled.sort((a, b) => b.c - a.c);
  const top = labeled.filter((x) => x.c > 0).slice(0, 3);
  const parts = top.map(
    (t) => `${t.label}（约 ${((t.c / sumCells) * 100).toFixed(0)}% 本图差异像素）`
  );
  return `差异像素集中：${parts.join('；')}。`;
}

const PHONE = [
  { file: 'Mobile!404.png', w: 390, h: 844 },
  { file: 'Mobile!AgentNoReply.png', w: 390, h: 844 },
  { file: 'Mobile!Chat.png', w: 390, h: 844 },
  { file: 'Mobile!Chat-Streaming.png', w: 390, h: 844 },
  { file: 'Mobile!Login.png', w: 390, h: 844 },
  { file: 'Mobile!LongPressCopy.png', w: 390, h: 844 },
  { file: 'Mobile!Me.png', w: 390, h: 844 },
  { file: 'Mobile!Messages-NewUser.png', w: 390, h: 844 },
  { file: 'Mobile!Messages.png', w: 390, h: 844 },
  { file: 'Mobile!MyQRCodes-Empty.png', w: 390, h: 844 },
  { file: 'Mobile!MyQRCodes.png', w: 390, h: 844 },
  { file: 'Mobile!Offline-Agent.png', w: 390, h: 844 },
  { file: 'Mobile!Profile-Paused.png', w: 390, h: 844 },
  { file: 'Mobile!Profile.png', w: 390, h: 844 },
  { file: 'Mobile!QRCodeDetail.png', w: 390, h: 844 },
  { file: 'Mobile!ScanQR-AgentGuide.png', w: 390, h: 844 },
  { file: 'Mobile!ScanQR.png', w: 390, h: 844 },
  { file: 'Mobile!SignUp.png', w: 390, h: 844 },
  { file: 'Mobile!SwipeDelete.png', w: 390, h: 844 },
  { file: 'Mobile!Verify.png', w: 390, h: 844 },
];

function parsePng(buf) {
  return PNG.sync.read(buf);
}

async function resizeTo(buf, tw, th) {
  const out = await sharp(buf)
    .resize(tw, th, { fit: 'cover', position: 'top' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}

async function main() {
  await fs.mkdir(path.join(outRoot, 'diff'), { recursive: true });
  await fs.mkdir(path.join(outRoot, 'reference-resized'), { recursive: true });

  const rows = [];
  const all = [
    ...DASHBOARD.map((e) => ({ ...e, designDir: designDash })),
    ...PHONE.map((e) => ({ ...e, designDir: designPhone })),
  ];

  for (const { file, w, h, designDir } of all) {
    const designPath = path.join(designDir, file);
    const implPath = path.join(implDir, file);
    let missing = '';
    try {
      await fs.access(designPath);
    } catch {
      missing = 'design';
    }
    try {
      await fs.access(implPath);
    } catch {
      missing = missing ? 'both' : 'implementation';
    }
    if (missing) {
      rows.push({
        file,
        diffPixels: null,
        diffPercent: null,
        note: `missing ${missing}`,
        hotspot: '—',
        hint: IMPLEMENTER_HINTS[file] || '对照 `design/design-png-*` 与实现截图逐块比对。',
      });
      continue;
    }

    const designBuf = await fs.readFile(designPath);
    const implBuf = await fs.readFile(implPath);

    const ref = await resizeTo(designBuf, w, h);
    const act = parsePng(implBuf);
    if (act.width !== w || act.height !== h) {
      rows.push({
        file,
        diffPixels: null,
        diffPercent: null,
        note: `implementation size ${act.width}×${act.height} expected ${w}×${h}`,
        hotspot: '—',
        hint: IMPLEMENTER_HINTS[file] || '',
      });
      continue;
    }

    await fs.writeFile(
      path.join(outRoot, 'reference-resized', file),
      PNG.sync.write({
        data: Buffer.from(ref.data),
        width: ref.width,
        height: ref.height,
      })
    );

    const diff = new PNG({ width: w, height: h });
    const diffPx = pixelmatch(ref.data, act.data, diff.data, w, h, {
      threshold: 0.1,
      includeAA: false,
    });
    const total = w * h;
    const pct = ((diffPx / total) * 100).toFixed(2);
    await fs.writeFile(path.join(outRoot, 'diff', file), PNG.sync.write(diff));
    const hotspot = diffPx === 0 ? '无' : summarizeDiffHotspots(diff.data, w, h, diffPx);
    const hint =
      IMPLEMENTER_HINTS[file] ||
      '对照同目录 implementation / reference-resized / diff 三张图做块面对齐。';
    rows.push({
      file,
      diffPixels: diffPx,
      diffPercent: pct,
      note: diffPx === 0 ? 'exact match (after resize)' : '',
      hotspot,
      hint,
    });
  }

  let md = `# Visual audit pixel diff\n\n`;
  md += `## 给其他 Agent 怎么改\n\n`;
  md += `1. 阅读 \`design/frontend-dev-guide.md\`、\`design/design-tokens.css\`，修改范围仅限 **样式与布局**（与 \`requirements/visual-fix-prompt.md\` 一致时请遵守其约束）。\n`;
  md += `2. 本目录下对照三张图：**implementation/**（线上截图）、**reference-resized/**（设计稿缩放到视口）、**diff/**（红区为像素不一致处）。\n`;
  md += `3. 下方 **「逐屏说明」** 中 **差异分布** 由 diff 图自动统计（4×4 网格，粗粒度）；**建议核对模块** 为人工列出的改稿切入点，**不是**自动识别的组件名。\n`;
  md +=
    `4. 复跑：` +
    '`cd tests && npm run visual-audit:capture && npm run visual-audit:compare`' +
    `（需 \`TEST_USER_EMAIL\` / \`TEST_USER_PASSWORD\`）。\n`;
  md += `5. **产品约定（本轮）**：\`/pricing\` 与 **\`Web!Pricing.png\`** **不在修复范围**（不要改 Pricing 页）。其余已出图的屏幕，凡与设计稿不一致的均应修复。交接说明见同目录 **\`HANDOFF.md\`**。\n\n`;
  const reportBase =
    process.env.VISUAL_AUDIT_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000';
  md += `- Base URL: ${reportBase} (set \`VISUAL_AUDIT_BASE_URL\` when capturing, e.g. local \`http://localhost:3000\`)\n`;
  md += `- Implementation screenshots: tests/test-results/visual-audit-20260327/implementation/\n`;
  md += `- Design reference resized with **cover + top** to match viewport (design exports are not 1:1 canvas).\n`;
  md += `- Design PNGs are high-resolution; resized with **cover + top** to the capture viewport before diff.\n\n`;
  md += `| File | diff pixels | diff % | notes |\n|------|------------|--------|-------|\n`;
  for (const r of rows) {
    md += `| ${r.file} | ${r.diffPixels ?? '—'} | ${r.diffPercent ?? '—'} | ${r.note} |\n`;
  }
  md += `\n## 逐屏说明（差异分布 + 建议核对模块）\n\n`;
  for (const r of rows) {
    md += `### ${r.file}\n\n`;
    md += `- **diff %**：${r.diffPercent ?? '—'} ｜ **diff pixels**：${r.diffPixels ?? '—'}\n`;
    md += `- **差异分布（自动）**：${r.hotspot}\n`;
    md += `- **建议核对模块**：${r.hint}\n\n`;
  }
  md += `## Frame-perfect note\n`;
  md += `Even with 0 diff pixels after resize, font rasterization may differ slightly on other OS/GPU; this run uses Playwright Chromium on the agent host.\n`;

  await fs.writeFile(path.join(outRoot, 'report.md'), md, 'utf8');
  console.log('Wrote', path.join(outRoot, 'report.md'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
