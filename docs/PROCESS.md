# How we work

Every change starts as a ticket and ends as a reviewed PR with a handoff
report. The point is that anyone can pick up a ticket cold — without a call,
without tribal knowledge — and that the reasoning behind a decision survives
the person who made it.

## The flow

| Step | Who | Command | Produces |
|---|---|---|---|
| 1 | Product Owner | `/draft-brief` | A brief: the intent and guardrails |
| 2 | Developer | `/read-brief` then `/draft-ticket` | A ticket, interviewed into shape |
| 3 | Product Owner | `/review-ticket` | Sign-off, or send back |
| 4 | Developer | `/start-ticket <#>` | Walkthrough, plan, then code |
| 5 | Developer | `/handoff <#>` | PR + handoff report |
| 6 | Manager | `/manager-review` | Merge, or changes requested |

Small, well-understood work can skip the brief and start at `/draft-ticket`.

## Where things live

- **Tickets** — GitHub issues, one per ticket. Drafts in `docs/tickets/`
- **Handoffs** — `handoffs/`, one per finished ticket
- **Spec** — `docs/PRD.md`. Its Decision Log is binding
- **Architecture rules** — `CLAUDE.md`, read automatically on every ticket

## Branching

```
ticket-<n>-<short-slug>
```

Branch off `main`, PR back into it, squash-merge. Review is against the
ticket's acceptance criteria — not against taste.

## Decisions

A decision that outlives its ticket belongs in the PRD's Decision Log with
its reasoning, not only in a commit message. If you find yourself explaining
"why is it like this?" twice, it should have been a decision entry.

Open questions live in PRD §7. **Numbers are never reused or renumbered** —
resolved items stay in place so tickets referencing them keep pointing at
the right thing.
