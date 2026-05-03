export interface SessionBriefTurn {
  role: "user" | "assistant";
  text: string;
}

export interface SessionBriefSignals {
  confirmedFacts: string[];
  decisions: string[];
  openQuestions: string[];
  nextSignals: string[];
  toolActivity: string[];
}

export interface SessionConversationBrief {
  version: 1;
  userTurnCount: number;
  assistantTurnCount: number;
  omittedLongTurnCount: number;
  recentTurns: SessionBriefTurn[];
  signals: SessionBriefSignals;
  currentThread?: string;
  updatedAt: string;
}
