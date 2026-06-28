# Dev Log

Daily development journal for QRClaw. Each file records what was accomplished, what changed, and what decisions were made on a given day (Beijing time, UTC+8).

## Convention

### File naming

```
dev-log/YYYY-MM-DD.md
```

One file per calendar day (Beijing time). If multiple sessions occur on the same day, append to the same file.

### File structure

Each daily log follows this template:

```markdown
# YYYY-MM-DD Dev Log

## Summary
One-line summary of the day's work.

## Changes
- [type] Description of change (files affected)

## Commits
| Hash | Message |
|------|---------|
| abc1234 | feat: description |

## Test Results
| Metric | Value |
|--------|-------|
| Passed | N |
| Skipped | N |
| Failed | N |

## Decisions
- Decision made and rationale

## Blockers
- Any blockers encountered

## Next
- What to do next
```

### Change types

Use the same types as conventional commits:

| Type | Meaning |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring |
| `test` | Test additions/changes |
| `docs` | Documentation |
| `chore` | Maintenance |
| `perf` | Performance improvement |

## Relationship to other tracking

| Artifact | Purpose | Location |
|----------|---------|----------|
| **Dev Log** (this) | Daily development journal | `dev-log/YYYY-MM-DD.md` |
| **CHANGELOG.md** | Version-to-version release notes | `CHANGELOG.md` |
| **Acceptance Reports** | Test suite results per version | `requirements/acceptance-report-v*.md` |
| **Progress Notes** | Per-teammate phase tracking | `.claude/progress/*.md` |
| **Session Files** | Per-session state snapshots | `~/.claude/sessions/` |
| **Checkpoints** | Git checkpoint log | `.claude/checkpoints.log` |

## Maintenance

- Update the dev log **at the end of each working session** or **before running `/compact`**
- When releasing a new version, update both the dev log and `CHANGELOG.md`
- The dev log is append-only within a day; never edit past days unless correcting errors
