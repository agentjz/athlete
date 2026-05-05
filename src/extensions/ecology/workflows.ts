import type { ExtensionProvider } from "../protocol/extension.js";
import { socraticWorkflowProvider } from "../workflows/socratic/index.js";

const WORKFLOW_EXTENSIONS: ExtensionProvider[] = [
  socraticWorkflowProvider,
];

export function listWorkflowExtensionProviders(): ExtensionProvider[] {
  return [...WORKFLOW_EXTENSIONS];
}
