import { specAppendNoteTool } from "./tools/specAppendNote.js";
import { specCheckpointCreateTool } from "./tools/specCheckpointCreate.js";
import { specCheckpointListTool } from "./tools/specCheckpointList.js";
import { specCheckpointRestoreTool } from "./tools/specCheckpointRestore.js";
import { specCreateTool } from "./tools/specCreate.js";
import { specListTool } from "./tools/specList.js";
import { specOpenTool } from "./tools/specOpen.js";
import { specReadDocumentTool } from "./tools/specReadDocument.js";
import { specSearchTool } from "./tools/specSearch.js";
import { specTaskUpdateTool } from "./tools/specTaskUpdate.js";
import { specUpdateStateTool } from "./tools/specUpdateState.js";
import { specWriteDocumentTool } from "./tools/specWriteDocument.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createSpecTools(): RegisteredTool[] {
  return [
    specListTool,
    specSearchTool,
    specCreateTool,
    specOpenTool,
    specUpdateStateTool,
    specAppendNoteTool,
    specWriteDocumentTool,
    specReadDocumentTool,
    specCheckpointCreateTool,
    specCheckpointListTool,
    specCheckpointRestoreTool,
    specTaskUpdateTool,
  ];
}
