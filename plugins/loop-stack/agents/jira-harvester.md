---
name: jira-harvester
description: Deprecated pointer — use `issue-harvester` instead. The role was never Jira-specific; the name was. Kept so existing references keep resolving.
---

# Moved → `agents/issue-harvester.md`

This agent is tracker-agnostic: it harvests full ticket context from whatever
`${issueTracker.tool}` the project configured (e.g. Jira / GitHub Issues / Linear). The Jira-shaped
filename implied an assumption the contract never made, which is exactly the hardcoding
`CONVENTIONS.md` exists to prevent.

**Read and use `agents/issue-harvester.md`.** Delete this file once nothing references it.
