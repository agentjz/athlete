# Security

Kitty is a fast-evolving experimental agent harness. Security work must protect the strongest current runtime architecture, not preserve obsolete behavior.

Report security issues privately before public disclosure. Include the affected commit, reproduction steps, expected impact, and evidence with secrets removed.

Do not include API keys, tokens, private credentials, user data, `.kitty/.env`, SQLite runtime state, trace payloads, or private artifacts in public issues, pull requests, screenshots, or logs.

Priority security areas:

- credential exposure through `.kitty/.env`, environment variables, provider config, Telegram config, or MCP config
- filesystem writes outside the intended project or mirror-world boundary
- tool execution that bypasses formal tool governance
- capability packages that bypass `Capability -> Assignment -> Execution -> Progress -> Artifact -> Closeout -> WakeSignal -> Lead`
- persisted runtime state that can corrupt session truth, execution ledgers, trace records, artifacts, or recovery facts
- external integrations that smuggle hidden strategy into the machine layer

Security fixes should remove the broken path directly. Do not add compatibility branches, legacy aliases, warning theater, or fake confirmations as a substitute for fixing the boundary. If an old path is unsafe, delete it, update the spec, update the tests, and verify the full system.

Security reports are judged by code facts and reproducible runtime evidence. Speculation is not enough; durable evidence wins.
