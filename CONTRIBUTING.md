# Contributing

Kitty is a radical, fast-evolving agent harness. Contributions must move the project toward stronger model capability, clearer runtime boundaries, better evidence, and less obsolete residue.

Backward compatibility is not the default. If a new design is stronger, remove the old route, old tests, old docs, old names, old prompts, old config, and old compatibility shims. Do not keep dead concepts alive as aliases.

## Required Discipline

- Ground every change in code facts, tests, and observable runtime behavior.
- Keep the model/machine boundary strict: Lead decides strategy; the machine layer records facts and executes explicit actions.
- Add new extension behavior through formal capability surfaces, not scattered prompt prose or ad hoc string stitching.
- Prefer small single-responsibility modules over large mixed files.
- Update specs and tests when runtime behavior changes.
- Delete stale tests and docs that protect dead behavior.
- Do not commit secrets, local credentials, generated runtime state, trace payloads, `.kitty/.env`, SQLite files, or unrelated formatting churn.

## Verification

Before submitting repository changes, run:

```sh
npm test
```

For naming, protocol, package, runtime-ui, and residue changes, also run:

```sh
npm run verify:repo-contracts
```

A contribution is not complete because code was written. It is complete only when code, tests, specs, and runtime evidence converge.

## Pull Requests

A pull request should state what changed, why the old path was removed or replaced, and which verification commands passed.

Do not ask reviewers to infer correctness from intention. Bring evidence.
