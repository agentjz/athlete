import type { WebSocketServer } from "ws";

import type { WorkbenchEvent } from "./events.js";

export class WorkbenchBroadcaster {
  constructor(private readonly server: WebSocketServer) {}

  send(event: WorkbenchEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.server.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }
}
