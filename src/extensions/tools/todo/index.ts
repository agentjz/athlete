import { todoWriteTool } from "./tools/todoWrite.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createTodoTools(): RegisteredTool[] {
  return [
    todoWriteTool,
  ];
}
