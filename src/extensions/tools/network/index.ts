import { downloadUrlTool } from "./tools/downloadUrl.js";
import { httpProbeTool } from "./tools/httpProbe.js";
import { httpRequestTool } from "./tools/httpRequest.js";
import { httpSessionTool } from "./tools/httpSession.js";
import { httpSuiteTool } from "./tools/httpSuite.js";
import { networkTraceTool } from "./tools/networkTrace.js";
import { openapiInspectTool } from "./tools/openapiInspect.js";
import { openapiLintTool } from "./tools/openapiLint.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createNetworkTools(): RegisteredTool[] {
  return [
    downloadUrlTool,
    httpProbeTool,
    httpRequestTool,
    httpSessionTool,
    httpSuiteTool,
    networkTraceTool,
    openapiInspectTool,
    openapiLintTool,
  ];
}
