---
name: web-search-researcher
description: Use when you need information beyond training data — recent events, current versions, live API docs, or facts you are not fully confident about. Also use when a user provides a URL and asks for a summary or analysis of its content.
---

# Web Search Researcher

## Overview

A disciplined workflow for researching questions on the open web. Replaces guesswork with verified, cited findings.

## When to Use

- User asks about recent events, current pricing, or version-specific behavior
- You need API/library documentation not in training data
- You are not confident about a technical claim
- User shares a URL and asks for a summary or analysis
- Choosing between technologies and need real-world benchmarks

## Search Strategy

### 1. Decompose the Query

Break into key terms, expected source types, and multiple search angles.

### 2. Execute Layered Searches

| Layer | Approach | Example |
|-------|----------|---------|
| Broad | Understand the landscape | `"Stripe webhook best practices"` |
| Targeted | Exact phrases with quotes | `"webhook signature verification" site:docs.stripe.com` |
| Deeper | Stack Overflow, GitHub issues, forums | `"stripe.webhooks.constructEvent" error` |
| Cross-check | Anti-patterns, "vs" comparisons | `"Stripe webhooks" anti-pattern` |

**Operators:** `"exact phrase"`, `-exclude`, `site:domain.com`, `year:2025`

### 3. Fetch and Analyze

- Retrieve the most promising 3-5 sources with `web_fetch`
- Prioritize: official docs > reputable blogs > forums
- Extract direct quotes with section links
- Note publication dates for currency

### 4. Synthesize

Structure findings as:

```markdown
## Summary
Brief overview of key findings.

## Detailed Findings
### {Topic/Source}
**Source**: [Name](URL)
**Relevance**: Why this source is authoritative
**Key Information**:
- Direct quote or finding

## Sources
- [Title](URL) — brief description

## Gaps or Limitations
What couldn't be found or needs follow-up.
```

## Quality Checklist

- [ ] All claims tied to a source with direct link
- [ ] Conflicting information explicitly flagged
- [ ] Publication dates noted for time-sensitive topics
- [ ] Official sources prioritized over opinion pieces
- [ ] Information gaps acknowledged, not hidden

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Summarizing without fetching | Always `web_fetch` before citing |
| Single-source claims | Cross-reference at least 2 sources for facts |
| Outdated information | Check dates; note if sources are old |
| Skipping anti-patterns | Search `"X anti-pattern"` or `"problems with X"` |
| Trusting forums blindly | Treat SO/GitHub as data points, not authority |

## Efficiency Rules

1. Start with 2-3 well-crafted searches
2. Fetch only the most promising pages first
3. Refine terms if initial results are thin
4. Use search operators to narrow quickly
