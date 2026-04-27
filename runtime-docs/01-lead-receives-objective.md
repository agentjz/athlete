# How Lead Receives An Objective

## One Sentence

Lead does not immediately answer. It receives the user objective and turns it into a task that can keep moving.

## Runtime Story

The user asks for a project design review. Lead first identifies the objective, checks available context, and chooses the next useful action. It may inspect specs, tests, previous results, or runtime state.

After each result, Lead reassesses what the result proves, what is still missing, and what the next action should be.

A final answer is based on evidence, not on having visited a fixed set of files.

## When The Topic Changes

If the previous turn was about tests and the next turn asks for a design review, Lead must not blindly continue the old route. It treats the new user message as the current objective and preserves only relevant context.
