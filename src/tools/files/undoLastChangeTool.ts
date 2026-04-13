import { truncateText } from "../../utils/fs.js";
import { okResult, parseArgs } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const undoLastChangeTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "undo_last_change",
      description: "Undo the latest recorded file change, or a specific change id if provided.",
      parameters: {
        type: "object",
        properties: {
          change_id: {
            type: "string",
            description: "Optional change id from the recorded change history.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const changeId = typeof args.change_id === "string" && args.change_id.trim().length > 0
      ? args.change_id.trim()
      : undefined;
    const targetRecord = changeId
      ? await context.changeStore.load(changeId)
      : await context.changeStore.loadLatestUndoable();

    if (!targetRecord) {
      throw new Error("No recorded change is available to undo.");
    }

    const preview = truncateText(targetRecord.preview ?? targetRecord.summary, 6_000);
    const result = await context.changeStore.undo(targetRecord.id);

    return okResult(
      JSON.stringify(
        {
          undoneChangeId: result.record.id,
          restoredPaths: result.restoredPaths,
          summary: result.record.summary,
          preview,
          warning: "Undo restores the previously recorded snapshot and may overwrite later edits on the same files.",
        },
        null,
        2,
      ),
      {
        changedPaths: result.restoredPaths,
      },
    );
  },
};
