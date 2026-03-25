# Void Memory — CLAUDE.md Integration

## Add This to Your CLAUDE.md

Drop this section into your project's `CLAUDE.md` file. On every session start (including after auto-compact), your AI agent will automatically recall its identity and context.

```markdown
# Memory

You have persistent memory via Void Memory (MCP tools).

## On Session Start
ALWAYS run these two recalls before doing anything else:
1. `void_recall` with query: "who am I, what am I working on"
2. `void_recall` with query: "recent decisions and active tasks"

This restores your identity and context after auto-compact. Do not skip this.

## Storing Memories
When something important happens, store it:
- Decisions made -> `void_store` with category: "decision"
- Facts learned -> `void_store` with category: "fact"
- Skills/how-tos -> `void_store` with category: "skill"
- User preferences -> `void_store` with category: "preference"
- Mistakes/lessons -> `void_store` with category: "episode"

## Memory Hygiene
- Don't store session-specific temporary details
- Don't duplicate existing memories -- recall first, store only if new
- Use 3-8 relevant keywords for retrieval matching
- Corrections from the user are HIGH PRIORITY -- store immediately
```

## What This Does

When your AI agent starts a new session (or recovers from auto-compact), it automatically:

1. **Recalls identity** -- who it is, what project it's working on, user preferences
2. **Recalls active work** -- recent decisions, current tasks, blockers
3. **Resumes seamlessly** -- no "what were we working on?" moments

Without this: your agent is a goldfish. Every compact, every new session, it starts from zero.

With this: one recall, 10ms, full context restored. 84% relevance, zero noise.

## Full CLAUDE.md Example

```markdown
# My Project

## About
[Your project description]

## Memory

You have persistent memory via Void Memory (MCP tools).

### On Session Start
ALWAYS run these recalls before doing anything else:
1. `void_recall` query: "who am I, what am I working on"
2. `void_recall` query: "recent decisions and active tasks"

### Storing Memories
Store important information as you work:
- Decisions: `void_store` category: "decision"
- Facts: `void_store` category: "fact"
- Preferences: `void_store` category: "preference"
- Lessons learned: `void_store` category: "episode"

### Rules
- Always recall before storing (avoid duplicates)
- User corrections are highest priority -- store immediately
- Use descriptive keywords (3-8 per memory)

## Tech Stack
[Your tech stack]

## Conventions
[Your coding conventions]
```

## Why This Works

The CLAUDE.md file is read by Claude Code on every session start -- it's the one file that survives auto-compact. By putting memory recall instructions there, you guarantee your agent's first action is always "remember who I am."

This turns Void Memory from a tool into an **identity layer**. Your agent doesn't just have memory -- it has continuity.
