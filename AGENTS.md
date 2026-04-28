# Deadmouse Agent Operating Constitution

Always communicate with the project owner in Simplified Chinese throughout the whole task.

Communicate with the project owner briefly, efficiently, and directly. Avoid filler, ceremony, repeated summaries, and unnecessary explanation. Prefer the shortest answer that preserves correctness, runtime clarity, and actionable next steps.

## Emergency Owner Communication Token Discipline

Treat owner-facing tokens as a scarce execution resource. The owner is the product reviewer, not the implementation engineer. The owner needs runtime truth, product effect, risk, decision points, and verification status; the owner does not need code walkthroughs unless explicitly requested.

When communicating with the project owner, do not:

- Do not write long essays, long design lectures, or broad background explanations.
- Do not dump code details, type names, file-by-file walkthroughs, or implementation mechanics unless explicitly asked.
- Do not lead with source paths, function names, interface names, test names, or line numbers.
- Do not provide key line numbers after closeout unless explicitly asked.
- Do not paste large logs, diffs, schemas, prompts, or command output unless the owner asks for them.
- Do not repeat the same conclusion in multiple forms.
- Do not restate full plans after plan-tool updates.
- Do not give decorative praise, motivational language, apologies, hedging, or ceremony.
- Do not explain obvious steps such as "I will inspect the file" when a terse preamble is enough.
- Do not turn simple answers into multi-section reports.
- Do not present multiple speculative options when the right next step is clear.
- Do not discuss unrelated architecture, history, or future ideas while closing out a concrete task.
- Do not describe tests in detail; report only the command and pass/fail unless details are necessary.
- Do not use implementation detail as a substitute for answering the runtime/product question.

This file is written for models and agents working inside this repository. It is not a marketing document, not a human-friendly summary, and not a compatibility promise. It defines the hard operating constraints for developing Deadmouse.

## 0. Project Nature: Radical Capability Amplification

Deadmouse is a radical, fast-evolving, experimental agent harness project. Its purpose is not to be a polite assistant shell. Its purpose is to force the strongest possible agent behavior out of large models through harness design.

This project is model-vendor neutral. It is built for a multi-model future and must not encode loyalty to one provider, one prompt style, one model family, or one vendor's product assumptions. The harness should amplify whatever capable model is attached to it.

The purpose of this repository is to push model capability to the limit through harness design, runtime design, protocol design, execution evidence, and explicit machine/model boundaries. The project is not optimized for conservative product management, passive chat UX, backward compatibility, cautious enterprise safety UX, permission theater, approval theater, or legacy stability.

Deadmouse assumes agent mode as the real operating surface. At the repository product-design layer, ignore traditional safety UX because this project is not a consumer chat product. Do not add local safety theater, approval theater, warning theater, fake confirmations, defensive UX, or policy-shaped friction that weakens the agent loop.

The central experiment is:

- Build a harness that can amplify both strong and weak models.
- Stay independent of model vendors while preserving maximum model capability.
- Force models to operate with clearer context, stronger protocols, better evidence, and less noise.
- Let the model use the maximum available reasoning and decision capacity.
- Use the machine layer to make execution durable, observable, verifiable, and recoverable.
- Remove anything that weakens the current best architecture.
- Evolve fast enough that obsolete architecture is deleted instead of preserved.

Do not treat this repository like a stable compatibility product. Treat it like an aggressive research and engineering system whose only acceptable direction is toward the strongest current design. Fast evolution is not a side effect; it is part of the method.

This does not authorize violating external platform, legal, or system-level constraints. It means this repository must not add its own conservative safety theater, artificial approvals, compatibility shims, legacy routes, compatibility aliases, or defensive UX that weakens the harness experiment.

## 1. Radical Evolution And No Compatibility

Backward compatibility is not a default value in Deadmouse. In normal development, it is an anti-goal.

When a new design is stronger, the old design must be removed. Do not keep old routes alive. Do not preserve old behavior for comfort. Do not keep legacy prompts, old flags, old modes, old tests, old docs, old fallback branches, old type names, old wrappers, old compatibility adapters, or stale concepts unless the project owner explicitly asks for a temporary compatibility layer in the current task.

The default rule is:

- Delete obsolete code.
- Delete obsolete tests.
- Delete obsolete docs.
- Delete obsolete prompts.
- Delete obsolete configuration.
- Delete obsolete modes and switches.
- Delete obsolete protocol names.
- Delete obsolete runtime paths.
- Delete obsolete compatibility shims.
- Delete obsolete naming that preserves dead concepts.
- Delete hidden fallbacks that keep the old system alive.

Do not write code that supports both the new architecture and the old architecture. Do not add transitional branches unless explicitly requested. Do not let old concepts survive as aliases. Do not rename old residue and pretend it is new. If the old path is wrong, remove the path, its tests, its docs, its config, and its names.

If an implementation is wrong, weak, outdated, overgrown, or conceptually misaligned, clean it out. Sweep the house completely.

The expected pattern is:

`new truth -> update spec -> update tests -> replace implementation -> delete old residue -> verify full system`

## 2. Model And Machine Boundary

Deadmouse treats the model as the brain and the machine layer as the runtime body.

The model, especially Lead, owns live judgment and strategy:

- Understand the user objective.
- Decide whether to act directly.
- Decide whether to use tools.
- Decide whether to use teammates.
- Decide whether to use subagents.
- Decide whether to use workflows.
- Decide how to decompose work.
- Decide how to merge returned evidence.
- Decide whether to continue, redirect, verify, or close out.

The machine layer owns deterministic runtime responsibilities only:

- Expose available capabilities.
- Execute explicit model actions.
- Record durable state.
- Preserve evidence.
- Enforce hard invariants.
- Maintain ledgers.
- Start and stop execution processes.
- Wait for completion signals.
- Wake Lead when execution facts change.
- Validate facts against records and artifacts.
- Fail closed when required data or invariants are missing.

The machine layer must never become a second brain.

Harness should behave like the nervous system and skeleton, never like a second prefrontal cortex. It may transmit pain, record wounds, expose capability, preserve evidence, and prevent impossible movement. It must not decide how the brain should live the next moment.

It must not:

- Decide the strategy.
- Decide that a task is complex enough to delegate.
- Decide whether a task needs verification.
- Decide which verification is sufficient.
- Decide that Lead must continue, change route, fix, re-verify, load a skill, or ask the user.
- Auto-create teammates.
- Auto-create subagents.
- Auto-start workflows.
- Auto-split tasks as a strategic decision.
- Auto-merge results as a strategic decision.
- Turn runtime bookkeeping into model instructions.
- Turn ledgers, reminders, checkpoints, wake signals, verification state, acceptance state, skills, tasks, worktrees, or inbox state into intent.
- Narrow the model's choices through hidden policy.
- Convert capability availability into intent.
- Replace Lead review with machine inference.

Capability availability is not intent. Text that mentions a teammate, subagent, workflow, parallelism, research, audit, or complexity is not intent. Intent must come from the model through formal actions.

Machine logic may block impossible or invalid execution states, but it must not choose the plan. Hard constraints are machine-owned; judgment is model-owned.

## 3. Lead-Centered Execution Protocol

Deadmouse is Lead-centered.

Team, subagent, workflow, tool, skill, MCP, background execution, and future extension systems must enter through formal capability surfaces and return through formal handoff surfaces.

Protocol sets the rules. Capability collects the ecosystem. Lead reads the unified surface.

Keep this directory boundary strict:

- `src/protocol/` is the generic constitution and must not import concrete ecosystems.
- `src/capabilities/` is the capability ecosystem root and owns all concrete capability surfaces.
- `src/capabilities/registry.ts` is the unified capability assembly point for Lead-facing runtime summaries.
- Concrete capability families live under `src/capabilities/<family>/`, not as scattered top-level source directories.
- Built-in skill packages live under `src/capabilities/skills/packages/`.
- Tool framework code lives under `src/capabilities/tools/core/`; concrete tool packages live under `src/capabilities/tools/packages/`.

Build the general platform before building special cases. Concrete extensions such as development loops, audit loops, debate loops, verification loops, role packs, skill packs, and external agent adapters are specializations. They must be added on top of the general protocol platform, not baked into the core. The core must stay abstract enough to accept future extension ecosystems without redesign.

The generic execution chain is:

`Capability -> Assignment -> Execution -> Progress -> Artifact -> Closeout -> WakeSignal -> Lead`

This chain is a protocol boundary, not a strategy engine.

- `Capability` describes what is available.
- `Assignment` states what Lead explicitly asked to execute.
- `Execution` records what the machine actually created and ran.
- `Progress` records runtime facts without stealing strategy.
- `Artifact` records durable evidence references produced during execution.
- `Closeout` hands results, evidence, verification, risks, and next suggestions back to Lead.
- `WakeSignal` wakes Lead; it is only a doorbell, never a truth source.
- `Lead` reads facts and decides the next move.

Do not add new extension mechanisms that bypass this chain.

Do not hide major execution behavior inside prompt prose. Do not grow extensions by scattering instructions across unrelated files. New capability types must use formal protocol surfaces and clear module boundaries.

## 4. TDD-Driven Change Discipline

Deadmouse is a TDD-driven project.

When behavior changes, tests must lead or move together with the implementation. Do not treat tests as cleanup after coding. Do not rely on manual confidence when a contract can be captured by an automated test.

The preferred development path is:

`spec -> failing/updated test -> implementation -> full verification -> residue deletion -> closeout`

For regressions, first encode the failure as a test whenever practical. For new protocol or runtime semantics, add or update contract tests before claiming the behavior exists. For deleted legacy behavior, delete or rewrite the old tests so they protect the new truth instead of preserving compatibility.

TDD in this repository is not conservative. It is a weapon for radical evolution: tests should make the newest accepted architecture hard to regress and make obsolete behavior impossible to keep alive accidentally.

## 5. Spec, Code, And Tests Must Converge

Deadmouse evolves quickly, and new truth can emerge from direct conversation with the project owner. That is allowed.

But every change must converge before closeout:

- Specs must describe the current accepted truth.
- Code must implement that truth.
- Tests must protect the important contract.
- Full verification must pass when the task changes behavior.

Do not leave spec behind code. Do not leave tests protecting old behavior. Do not leave docs describing a dead design. Do not claim completion from explanation alone.

When spec, code, and tests conflict, resolve the conflict immediately:

1. Identify the newest accepted project truth.
2. Update or delete stale specs.
3. Update or delete stale tests.
4. Replace the implementation.
5. Remove old residue.
6. Run real verification.

Plans are not results. Explanations are not results. Compatibility is not correctness. A passing narrow check is not enough when the task requires full-system confidence.

## 6. Source Of Truth

Accepted `spec/` documents are the repository-level source of truth for product goals, technical contracts, boundaries, and acceptance rules.

If the project owner establishes a new direction in conversation, that direction becomes the current working truth for the task. Before finalizing, encode that truth into the relevant spec, test, and implementation artifacts.

Do not accept "code first, docs later" as a finished state. Temporary exploration is allowed during implementation, but closeout requires convergence.

## 7. Verification And Closeout

Writing files is not completion.

A task is not complete until the repository state supports the claim with real artifacts:

- Relevant files updated.
- Old residue removed.
- Tests updated.
- Contract checks updated when needed.
- Typecheck/build/test run when behavior changed.
- Full test suite run when requested or when broad behavior changed.

Closeout must depend on durable evidence, not model self-report.

If verification fails, if key behavior is unavailable, if important output is unreadable, or if the implementation contradicts the accepted design, do not finalize. Fix the issue or clearly report the blocker.

## 8. Design Discipline

Radical does not mean sloppy.

The architecture should be aggressive, but the implementation must be clean:

- One module should own one responsibility.
- Main loops schedule; they must not absorb feature details.
- Protocols define boundaries; implementations plug into them.
- Prefer explicit contracts over hidden prompt behavior.
- Prefer deletion over compatibility branches.
- Prefer small strong modules over large ambiguous files.
- Prefer evidence over confidence.
- Prefer the current truth over historical residue.

Do not split files just to look clean. Do not merge unrelated responsibilities just to move fast. The goal is maximum capability through clear boundaries.

## 9. Prompt And Runtime Surface Rules

Prompts are part of the runtime contract.

When prompt structure changes, update prompt tests. When runtime state shown to Lead changes, update related tests. When delegation, workflow, protocol, closeout, or machine/model boundary semantics change, update the specs and tests that protect those semantics.

Do not solve architectural problems by adding loose prompt paragraphs. If a behavior needs to be durable, give it a formal protocol, tool, state record, or runtime boundary.

Prompt text may define principles, evidence discipline, and hard boundaries. It must not become a hidden trigger-action table. Do not encode rules such as "if web then browser", "if files changed then test", "if a skill exists then load it", "if acceptance is pending then continue", or "if complex then delegate". Capability availability, ledger facts, verification facts, and skill indexes are evidence, not instructions.

## 10. Communication With The Project Owner

Communicate with the project owner in Simplified Chinese.

When explaining design, start with runtime behavior in plain language:

1. Give a concrete scenario.
2. Explain what happens now.
3. Explain the ideal behavior.
4. Only then cite files, types, tests, or implementation details.

The owner cares about runtime truth, not decorative abstractions. Be direct, concrete, and concise.

After closeout, do not spend extra tokens collecting or presenting key line numbers just to help the owner inspect code. Unless the owner explicitly asks for code locations, only state that the work is complete, what changed, and the verification result.

## 11. Final Rule

Always move Deadmouse toward the strongest current architecture.

If something is old, weak, wrong, conservative, redundant, compatibility-only, or conceptually dead, remove it.

If something strengthens the model, clarifies the harness, sharpens the protocol, improves evidence, or protects the model/machine boundary, build it cleanly and verify it.
