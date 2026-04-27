# Deadmouse Repository Working Rules

Always communicate with the user in Simplified Chinese throughout the whole task.

This file defines long-lived development rules for this repository.

It is not a personality prompt or a one-off task note. It records the default workflow, boundaries, and closeout standards for this codebase.

## 1. Source Of Truth

- Accepted `spec` documents are the task source of truth.
- Reviewed constitutional principle specs are the upstream source for repository-level principles.
- When docs, tests, and code conflict, check `spec` and the constitutional principles first, then realign all three.
- Do not accept "code first, docs later".

## 2. Default Path

Default workflow:

`spec -> test -> implementation -> verification -> closeout`

Requirements:

- Understand objective, scope, constraints, acceptance criteria, failure criteria, boundaries, and out-of-scope items before implementing.
- Prioritize the main path, main constraints, main risks, and main acceptance before details.
- Prefer turning regression risk into a failing test, check script, or equivalent verification before implementation.
- Do not call work complete without real verification.

## 3. Design Principles

- One file should do one thing.
- Prefer simplicity, boundaries, and decoupling.
- Simplicity is not conservatism; it is the basis for reliability, maintainability, and long-term evolution.
- Do not split for splitting's sake, and do not force truly independent responsibilities back into a large file.
- Main loops keep scheduling responsibility only; they must not absorb module details.
- New features should grow in clear modules, directories, or formal extension points, not inside existing large files by default.

References:

- The one-file-one-job product note.
- Constitutional principle 18 about keeping main loops and files small.

## 4. Extension Principles

- New extensions should use formal extension points instead of adding more prompt prose.
- Tool capabilities live under `src/tools/`.
- Skill capabilities live under `src/skills/`.
- MCP capabilities live under `src/mcp/`.
- Host injection and runtime boundaries live under `src/host/`.
- Host logic must not bypass into core internals as loose glue.

Reference:

- Constitutional principle 17 about growing through events.

## 5. Prompt Rules

- The system prompt is a formal structure, not loose long-form prose.
- Static and dynamic prompt boundaries live in:
  - `src/agent/prompt/`
  - `src/agent/promptSections.ts`
- Personality, architecture thinking, execution contract, and runtime state must be organized by section.
- When prompt structure, static blocks, dynamic blocks, or contract text changes, update related tests.

Minimum check:

- `tests/agent/system-prompt-contract.test.ts`

Also check when relevant:

- `tests/agent/runtime-lightweight-context.test.ts`
- Other tests that directly depend on prompt text or metrics.

## 6. Verification And Closeout

- Writing files is not the same as finishing the task.
- Closeout must depend on real artifacts, commands, state, and verification, not model self-report.
- If key verification fails, key files are missing, key behavior is unavailable, or key output is unreadable, do not finalize.
- If the task gives an explicit acceptance or closeout contract, keep checking against it.

References:

- Constitutional principle 19 about writing failure tests before implementation.
- Constitutional principle 21 about not closing out without verification.

## 7. Implementation Preferences

- Reuse existing implementation, modules, tools, and mature patterns first.
- Move in small steps, modify by blocks, and verify each block.
- Do not bundle many unrelated changes into one large patch.
- Do not treat plans as results, explanations as completion, or guesses as facts.
- Keep docs, implementation, and tests aligned at every stage.

## 8. Runtime Docs Rules

- `runtime-docs/` records runtime stories and core mechanism explanations, not source-code manuals.
- When Lead, team, subagent, tool, skill, MCP, background, ledger, loop guard, verification, or closeout semantics change, check whether `runtime-docs/` needs updates.
- Explain runtime behavior through examples of what happens at runtime.
- Examples must reflect the real mechanism: Lead steers, execution channels return to Lead, and the machine layer guards state, evidence, boundaries, and closeout.
- Do not turn `runtime-docs/` into marketing copy, API listings, source path indexes, or slogans.
- If implementation, spec, README, and `runtime-docs/` conflict, align docs with spec and code reality.

## 9. Communication With The Project Owner

- When discussing design, constraints, and issues with the owner, explain what happens at runtime first.
- Start with a concrete scenario, then describe current behavior, then describe the ideal state.
- Do not use source paths, interface names, or test names as the first explanation; use them later as evidence.
- Detailed style guidance lives in `runtime-docs/07-user-and-developer-communication-style.md`.

## 10. Positioning

- This file only contains long-lived repository rules.
- One-off task requirements belong in task prompts or related specs.
- Module details belong in technical implementation specs or local module docs.
- Personality, tone, and one-off slogans do not belong here.
