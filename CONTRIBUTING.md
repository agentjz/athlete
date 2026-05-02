# Contributing

Kitty is an experimental agent harness. Contributions should move the project toward stronger runtime behavior, clearer boundaries, and better evidence.

## Rules

- Ground changes in code facts, tests, and observable behavior.
- Prefer the current architecture over compatibility with old residue.
- Keep changes scoped. Do not add broad abstractions without a real need.
- When behavior changes, update tests and relevant `spec/` documents.
- Run the full test suite before submitting changes:

```sh
npm test
```

## Pull Requests

Open a pull request with:

- what changed
- why it changed
- how it was verified

Do not include secrets, local credentials, generated runtime state, or unrelated formatting churn.
