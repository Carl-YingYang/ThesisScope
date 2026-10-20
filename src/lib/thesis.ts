export type AnalysisResult = {
  pros: string[];
  cons: string[];
  feasibility: { score: number; explanation: string };
  locationRisks: string[];
  timelineBudgetRisks: string[];
  suggestions: string[];
  panelQuestions: string[];
};

export type ResultListKey =
  | "pros"
  | "cons"
  | "locationRisks"
  | "timelineBudgetRisks"
  | "suggestions"
  | "panelQuestions";

export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; error: string };
