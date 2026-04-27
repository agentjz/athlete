# How Lead, Team, And Subagent Collaborate

## One Sentence

Lead is the commander. Team and subagent are execution channels. They return material to Lead; they do not become separate command systems.

## Runtime Story

A user may start Deadmouse with teammate or subagent capability lanes open. Opening a lane only exposes capability. It must not cause the machine layer to create default agents or tasks.

Lead decides whether to delegate, how many workers to use, and what each worker owns. Only an explicit tool call from Lead starts delegation.

Team members are useful for collaborative slices. Subagents are useful for isolated investigations. Their outputs are evidence. Lead still owns the final judgment and closeout.
