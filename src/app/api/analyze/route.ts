import { NextResponse } from "next/server";
import https from "https";
import type { AnalysisResult } from "@/lib/thesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* config constants                                                    */
/* ------------------------------------------------------------------ */

const API_URL = process.env.ZAI_API_URL || "https://api.z.ai/api/paas/v4/chat/completions";
const MODEL = process.env.ZAI_MODEL || "glm-4.7-flash";
const API_KEY = process.env.ZAI_API_KEY; // server-side only — never exposed to the client
const TEMPERATURE = 0.4;
const MAX_TOKENS = 8000;
const TIMEOUT_MS = 60000;

/* free tier: only 1 concurrent request — simple in-memory busy flag */
let busy = false;

const LANGUAGE_LABELS: Record<string, string> = {
  taglish:
    "Taglish — a natural conversational mix of Tagalog and English, the way Filipino students actually talk",
  tagalog: "Tagalog / Filipino",
  english: "English",
};

const METHODOLOGY_WHITELIST = [
  "Survey",
  "Interview",
  "Experiment",
  "Observation",
  "Mixed methods",
  "Hindi pa sigurado",
];

const BUDGET_WHITELIST = ["Mababa", "Katamtaman", "Mataas"];

type FailureKind = "timeout" | "auth" | "key" | "invalid" | "api" | "unknown";

type AnalyzeInput = {
  title: string;
  location: string;
  respondents: string;
  methodology: string;
  timeframe: number | null;
  budget: string;
  language: string;
};

/* ------------------------------------------------------------------ */
/* prompts                                                             */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(languageLabel: string): string {
  return [
    "You are a strict but helpful thesis adviser for Filipino students (senior high school and college).",
    "Review the student's thesis idea honestly and constructively.",
    "",
    "Judge the idea based on:",
    "1. Clarity of the problem / research question",
    "2. Accessibility of the research location and respondents",
    "3. Realism of the timeline and budget",
    "4. Fit of the methodology to the problem and respondents",
    "5. Ethical concerns (minors, sensitive data, consent, privacy)",
    "",
    "Be specific to the student's actual inputs. Reference their real title, location, respondents,",
    "methodology, timeframe, and budget. Never give generic advice that could apply to any thesis.",
    `Write the entire response in ${languageLabel}.`,
    "",
    "Respond with ONLY valid JSON. No markdown, no code fences, no text before or after.",
    "Exactly this JSON shape:",
    '{"pros":[string],"cons":[string],"feasibility":{"score":number,"explanation":string},"locationRisks":[string],"timelineBudgetRisks":[string],"suggestions":[string],"panelQuestions":[string]}',
    "",
    "Rules:",
    '- "pros": genuine strengths of this specific idea.',
    '- "cons": weaknesses and weak spots of this specific idea.',
    '- "feasibility.score": integer 1-10 (10 = very feasible for a student to actually finish).',
    '- "feasibility.explanation": one to three sentences justifying the score.',
    '- "locationRisks": problems with accessing the location / respondents (permits, distance, sample, gatekeepers).',
    '- "timelineBudgetRisks": problems with the stated timeframe and budget (too short, too long, underestimated costs).',
    '- "suggestions": concrete, actionable improvements the student can actually do.',
    '- "panelQuestions": questions a thesis panel would most likely ask about this exact topic.',
    "- Each array has exactly 3 to 6 items. Each item is one or two sentences.",
    "- No markdown formatting inside the JSON strings.",
  ].join("\n");
}

function buildUserPrompt(input: AnalyzeInput): string {
  const lines = [
    `Thesis title / idea: ${input.title}`,
    `Research location: ${input.location}`,
    `Target respondents: ${input.respondents}`,
    `Methodology: ${input.methodology || "not specified"}`,
    `Timeframe: ${input.timeframe !== null ? `${input.timeframe} months` : "not specified"}`,
    `Budget level: ${input.budget || "not specified"}`,
  ];
  return `${lines.join("\n")}\n\nAnalyze this thesis idea now. Respond ONLY with the JSON object.`;
}

/* ------------------------------------------------------------------ */
/* input sanitation (no logging of user input anywhere)                */
/* ------------------------------------------------------------------ */

function sanitizeBody(body: unknown): { ok: true; data: AnalyzeInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "May mali sa form. Pakirefresh ang page at subukan ulit." };
  }
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  const location = typeof b.location === "string" ? b.location.trim() : "";
  const respondents = typeof b.respondents === "string" ? b.respondents.trim() : "";

  if (!title || title.length > 3000) {
    return { ok: false, error: "Kailangan ang thesis title o idea mo (at hindi lalampas sa 3000 characters)." };
  }
  if (!location || location.length > 300) {
    return { ok: false, error: "Kailangan ang research location." };
  }
  if (!respondents || respondents.length > 300) {
    return { ok: false, error: "Kailangan ang target respondents." };
  }

  const methodologyRaw = typeof b.methodology === "string" ? b.methodology : "";
  const methodology = METHODOLOGY_WHITELIST.indexOf(methodologyRaw) !== -1 ? methodologyRaw : "";

  const budgetRaw = typeof b.budget === "string" ? b.budget : "";
  const budget = BUDGET_WHITELIST.indexOf(budgetRaw) !== -1 ? budgetRaw : "";

  let timeframe: number | null = null;
  if (typeof b.timeframe === "number" && isFinite(b.timeframe)) {
    timeframe = b.timeframe;
  } else if (typeof b.timeframe === "string" && b.timeframe.trim() !== "") {
    const parsed = Number(b.timeframe);
    if (isFinite(parsed)) timeframe = parsed;
  }
  if (timeframe !== null) {
    timeframe = Math.min(120, Math.max(1, Math.round(timeframe)));
  }

  const languageRaw = typeof b.language === "string" ? b.language : "";
  const language = LANGUAGE_LABELS[languageRaw] ? languageRaw : "taglish";

  return {
    ok: true,
    data: { title, location, respondents, methodology, timeframe, budget, language },
  };
}

/* ------------------------------------------------------------------ */
/* AI call (SDK when no key, OpenAI-compatible https when key is set)  */
/* ------------------------------------------------------------------ */

async function callModelViaSdk(system: string, user: string): Promise<string> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    thinking: { type: "disabled" },
  });
  const content = completion?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function callModelViaHttps(system: string, user: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload: Record<string, unknown> = {
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: TEMPERATURE,
      max_completion_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
    };
    /* gpt-oss is a reasoning model: keep its thinking short so the JSON never gets cut off */
    if (MODEL.includes("gpt-oss")) {
      payload.reasoning_effort = "low";
    }
    const bodyString = JSON.stringify(payload);

    let url: URL;
    try {
      url = new URL(API_URL);
    } catch {
      reject(new Error("api"));
      return;
    }

    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
          "Content-Length": Buffer.byteLength(bodyString),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode || 0;
          if (status === 401 || status === 403) {
            console.error("[ai] auth error, status", status);
            reject(new Error("auth"));
            return;
          }
          if (status >= 400) {
            console.error("[ai] HTTP", status, raw.slice(0, 200));
            reject(new Error("api"));
            return;
          }
          try {
            const parsed = JSON.parse(raw) as {
              choices?: { message?: { content?: unknown }; finish_reason?: string }[];
            };
            const choice = parsed?.choices?.[0];
            if (choice?.finish_reason === "length") {
              console.error("[ai] naputol ang sagot (finish_reason=length), itaas ang MAX_TOKENS");
            }
            const content = choice?.message?.content;
            if (typeof content === "string" && content.length > 0) {
              resolve(content);
            } else {
              console.error("[ai] walang laman ang content");
              reject(new Error("api"));
            }
          } catch {
            console.error("[ai] hindi ma-parse ang response ng API");
            reject(new Error("api"));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err: Error) => {
      reject(err);
    });

    req.write(bodyString);
    req.end();
  });
}

async function callModel(system: string, user: string): Promise<string> {
  if (API_KEY) {
    return callModelViaHttps(system, user);
  }
  try {
    return await callModelViaSdk(system, user);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "timeout") throw err;
    /* no key configured and the built-in SDK path failed → tell the dev to set the key */
    throw new Error("key");
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/* ------------------------------------------------------------------ */
/* robust JSON extraction + shape validation                           */
/* ------------------------------------------------------------------ */

function extractJson(raw: string): unknown {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let s = raw.trim();
  /* strip code fences if present */
  s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "");
  /* extract the first {...} block */
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.length > 0) items.push(trimmed);
    }
  }
  if (items.length === 0) return null;
  return items.slice(0, 6);
}

function validateResult(value: unknown): AnalysisResult | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  const listKeys = [
    "pros",
    "cons",
    "locationRisks",
    "timelineBudgetRisks",
    "suggestions",
    "panelQuestions",
  ] as const;

  const partial: Record<string, unknown> = {};
  for (const key of listKeys) {
    const arr = toStringArray(obj[key]);
    if (!arr) return null;
    partial[key] = arr;
  }

  const feasibility = obj.feasibility;
  if (!feasibility || typeof feasibility !== "object") return null;
  const feas = feasibility as Record<string, unknown>;

  const rawScore = typeof feas.score === "number" ? feas.score : Number(feas.score);
  if (typeof rawScore !== "number" || !isFinite(rawScore)) return null;
  /* clamp score to 1-10 */
  const score = Math.min(10, Math.max(1, Math.round(rawScore)));

  const explanation = typeof feas.explanation === "string" ? feas.explanation.trim() : "";
  if (explanation.length === 0) return null;

  const result: AnalysisResult = {
    pros: partial.pros as string[],
    cons: partial.cons as string[],
    feasibility: { score, explanation },
    locationRisks: partial.locationRisks as string[],
    timelineBudgetRisks: partial.timelineBudgetRisks as string[],
    suggestions: partial.suggestions as string[],
    panelQuestions: partial.panelQuestions as string[],
  };
  return result;
}

/* ------------------------------------------------------------------ */
/* friendly errors                                                     */
/* ------------------------------------------------------------------ */

function friendlyError(kind: FailureKind): string {
  switch (kind) {
    case "timeout":
      return "Natagal ang sagot ng AI (timeout). Subukan ulit ha.";
    case "auth":
      return "May problema sa AI setup: mukhang mali o expired ang ZAI_API_KEY sa .env. Paki-check ng developer.";
    case "key":
      return "May problema sa server setup: i-set ang ZAI_API_KEY sa .env file (optional din ang ZAI_API_URL at ZAI_MODEL).";
    case "invalid":
      return "Naguluhan ang AI sa pagsagot. Subukan ulit sa ilang segundo.";
    case "api":
      return "Hindi nakasagot ang AI ngayon. Subukan ulit sa ilang segundo.";
    default:
      return "May nangyaring mali sa server. Subukan ulit sa ilang segundo.";
  }
}

function classifyError(err: unknown): FailureKind {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "timeout") return "timeout";
  if (msg === "auth") return "auth";
  if (msg === "key") return "key";
  if (msg === "invalid") return "invalid";
  return "api";
}

/* ------------------------------------------------------------------ */
/* route                                                               */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  if (busy) {
    return NextResponse.json(
      { ok: false, error: "Busy pa ang AI, subukan ulit sa ilang segundo." },
      { status: 429 }
    );
  }

  busy = true;
  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "May mali sa form submission. Pakirefresh ang page at subukan ulit." },
        { status: 400 }
      );
    }

    const sanitized = sanitizeBody(body);
    if (!sanitized.ok) {
      return NextResponse.json({ ok: false, error: sanitized.error }, { status: 400 });
    }

    const system = buildSystemPrompt(LANGUAGE_LABELS[sanitized.data.language]);
    const user = buildUserPrompt(sanitized.data);

    let result: AnalysisResult | null = null;
    let failure: FailureKind = "unknown";

    /* first attempt */
    try {
      const raw = await withTimeout(callModel(system, user), TIMEOUT_MS);
      result = validateResult(extractJson(raw));
      if (!result) failure = "invalid";
    } catch (err) {
      failure = classifyError(err);
    }

    /* retry once — only when the model answered but the JSON was invalid */
    if (!result && failure === "invalid") {
      try {
        const raw = await withTimeout(callModel(system, user), TIMEOUT_MS);
        result = validateResult(extractJson(raw));
      } catch (err) {
        failure = classifyError(err);
      }
    }

    if (result) {
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: friendlyError(failure) }, { status: 502 });
  } catch {
    /* never leak stack traces to the client */
    return NextResponse.json(
      { ok: false, error: "May nangyaring mali sa server. Subukan ulit sa ilang segundo." },
      { status: 500 }
    );
  } finally {
    busy = false;
  }
}
