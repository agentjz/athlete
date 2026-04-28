import { ChangeStore } from "../../../../changes/store.js";
import { okResult, parseArgs } from "../../core/shared.js";
import {
  clampLimit,
  readOptionalString,
} from "./historyShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const changeRecordReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "change_record_read",
      description: "List or read recorded file-change evidence. This is read-only and does not undo or alter files.",
      parameters: {
        type: "object",
        properties: {
          change_id: {
            type: "string",
            description: "Specific change id to read. If omitted, recent change records are listed.",
          },
          limit: {
            type: "number",
            description: "Maximum number of recent records to list when change_id is omitted.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new ChangeStore(context.config.paths.changesDir);
    const changeId = readOptionalString(args.change_id);

    if (changeId) {
      const record = await store.load(changeId);
      return okResult(JSON.stringify({ ok: true, record }, null, 2));
    }

    const records = await store.list(clampLimit(args.limit, 20));
    return okResult(JSON.stringify({ ok: true, records }, null, 2));
  },
};
