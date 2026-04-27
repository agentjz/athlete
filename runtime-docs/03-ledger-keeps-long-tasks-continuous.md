# How The Ledger Keeps Long Tasks Continuous

## One Sentence

Long tasks cannot rely on model memory alone. Deadmouse records the runtime facts needed to resume, collaborate, and verify.

## Runtime Story

The ledger is not a chat transcript and not a prompt memory bucket. It stores facts that affect future execution: current objective, task board state, background work, closeout status, evidence, and recoverable artifacts.

When a new turn starts, Lead receives a compact runtime view derived from the ledger. The machine layer remains responsible for state integrity and persistence.
