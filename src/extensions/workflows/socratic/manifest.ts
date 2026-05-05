import { createExtensionManifest } from "../../protocol/index.js";

export const SOCRATIC_MANIFEST = createExtensionManifest({
  id: "socratic",
  name: "Socratic",
  version: "1.0.0",
  description: "围绕学习资料提问、解释、记录卡点，并沉淀个人知识库。",
  source: {
    kind: "workflow",
    id: "socratic",
  },
  entry: {
    kind: "module",
    moduleId: "src/extensions/workflows/socratic",
  },
  hooks: ["super.start", "prompt.runtime"],
  workspace: {
    root: "socratic",
  },
  modelSummary: "用于学习资料。按需读取材料；记录目标、问题、解释、理解、卡点、偏好和笔记。",
});
