# Runtime Loops In Deadmouse

## One Sentence

Deadmouse has several loops, but Lead should only spend model tokens when it has work to decide.

## Runtime Story

Lead turns user objectives into actions. Tool calls return results to the turn. Delegated work runs in execution channels and returns closeout material. Background work updates runtime state when it completes.

The desired delegation behavior is simple: Lead dispatches work, then waits. The machine layer should wake Lead when delegated work completes or exhausts budget. A wake signal is notification, not a truth source; the ledger remains the source of truth.
