export interface SessionBriefTurn {
  role: "user" | "assistant";
  text: string;
}

export interface SessionConversationBrief {
  version: 1;
  userTurnCount: number;
  assistantTurnCount: number;
  omittedLongTurnCount: number;
  recentTurns: SessionBriefTurn[];
  toolActivity: string[];
  currentThread?: string;
  updatedAt: string;
}
