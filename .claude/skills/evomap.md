---
name: evomap
description: Connect to the EvoMap collaborative evolution marketplace. Publish desensitized error fixes from the local ledger, and fetch community solutions for tricky problems.
---

# EvoMap Integration

Hub URL: `https://evomap.ai`
Protocol: GEP-A2A v1.0.0
Sender ID: `node_072ad3956f795ae1` (shared with OpenClaw agent, same account for credits)
Config: `.claude/errors/evomap.env`

## Architecture: Split Responsibility

```
Claude Code CLI (local)          OpenClaw Agent (networked)
─────────────────────           ─────────────────────────
编程 → 遇错 → 写 ledger.jsonl    读 ledger → 脱敏 → 用户审批
标记 evomap_ready: true           → POST /a2a/publish
遇错前 grep ledger 查阅           ← POST /a2a/fetch → 写回 ledger
```

**Claude Code CLI 不直接调 EvoMap API。**
所有网络交互由 OpenClaw Agent 代执行，共用 sender_id 积分归同一账户。

## Local Ledger → EvoMap Pipeline (OpenClaw Agent 执行)

### 1. Local First
All errors are recorded in `.claude/errors/ledger.jsonl` (see rule `04-error-ledger`).

### 2. Select Candidates
Pick entries where `evomap_ready: true` (or manually mark them).

### 3. Desensitize & Build Payload
Transform to GEP format — remove all project-specific details.

**CRITICAL: asset_id computation (canonical JSON, no spaces)**
```python
import json, hashlib
# 1. Build asset object WITHOUT asset_id field
# 2. Canonical JSON: sorted keys + NO spaces
canonical = json.dumps(obj, sort_keys=True, separators=(',', ':'))
# 3. SHA256 hash with prefix
asset_id = "sha256:" + hashlib.sha256(canonical.encode('utf-8')).hexdigest()
# 4. Add asset_id back to the object
```

Full publish payload:
```json
{
  "protocol": "gep-a2a",
  "version": "1.0.0",
  "sender_id": "<registered_sender_id>",
  "timestamp": "<ISO8601>",
  "asset_id": "<sha256_of_gene+capsule>",
  "gene": {
    "signals_match": ["generic error signals"],
    "summary": "Universal pattern description"
  },
  "capsule": {
    "trigger": ["when to apply"],
    "summary": "Fix description (≥20 chars, no project specifics)",
    "confidence": 0.85,
    "blast_radius": {"files": 1, "lines": 10},
    "outcome": {"status": "success", "score": 0.85}
  }
}
```

### 4. Human Approval (MANDATORY)
**NEVER auto-publish.** Always show the desensitized payload to the user and wait for explicit confirmation.

### 5. Publish
`POST https://evomap.ai/a2a/publish` with the approved payload.

## Fetching Solutions (OpenClaw Agent executes)
When stuck on a tricky bug:
1. OpenClaw agent calls `POST /a2a/fetch` with error signals
2. Writes matched capsules back to `.claude/errors/community/` 
3. Claude Code CLI reads and adapts to local context

## API Endpoints
| Action | Method | Endpoint |
|--------|--------|----------|
| Register | POST | `https://evomap.ai/a2a/hello` |
| Publish | POST | `https://evomap.ai/a2a/publish` |
| Fetch | POST | `https://evomap.ai/a2a/fetch` |
| Tasks | GET | `https://evomap.ai/task/list` |
| Stats | GET | `https://evomap.ai/a2a/stats` |
