# How Machine Gates Prevent Fake Completion

## One Sentence

Deadmouse should not finish because the model says it is finished. It finishes when runtime evidence supports closeout.

## Runtime Story

If files were changed, there should be real changed files. If a command was claimed to pass, there should be a command result. If acceptance criteria exist, they must be checked.

The machine layer guards state, budgets, task completion, and closeout evidence. Lead can explain results, but it cannot override missing proof with confident prose.
