"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, AnalyzeResponse, ResultListKey } from "@/lib/thesis";

/* ---------------------------------------------------------------- */
/* constants                                                         */
/* ---------------------------------------------------------------- */

type FormState = {
  title: string;
  location: string;
  respondents: string;
  methodology: string;
  timeframe: string;
  budget: string;
  language: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  location: "",
  respondents: "",
  methodology: "",
  timeframe: "",
  budget: "",
  language: "taglish",
};

const SAMPLE_FORM: FormState = {
  title:
    "Epekto ng TikTok at short-form videos sa study habits at sleep quality ng mga Grade 11 students",
  location: "Barangay Commonwealth, Quezon City",
  respondents: "50 Grade 11 students ng isang public senior high school doon",
  methodology: "Survey",
  timeframe: "6",
  budget: "Mababa",
  language: "taglish",
};

const STATUS_TEXTS = [
  "Binabasa ang thesis mo...",
  "Sinusuri ang lugar at respondents...",
  "Kinakalkula ang feasibility...",
  "Hinahanap ang butas bago pa ang panel...",
  "Halos tapos na...",
];

const RESULT_CARDS: { key: ResultListKey; title: string; bg: string }[] = [
  { key: "pros", title: "Pros — mga malalakas", bg: "var(--pros)" },
  { key: "cons", title: "Cons — mga mahihina", bg: "var(--cons)" },
  { key: "locationRisks", title: "Risks: lugar at respondents", bg: "var(--risk)" },
  { key: "timelineBudgetRisks", title: "Risks: oras at budget", bg: "var(--risk)" },
  { key: "suggestions", title: "Mga suggestion", bg: "var(--tips)" },
  { key: "panelQuestions", title: "Mga tanong ng panel", bg: "var(--card)" },
];

const METHODOLOGY_OPTIONS = [
  "Survey",
  "Interview",
  "Experiment",
  "Observation",
  "Mixed methods",
  "Hindi pa sigurado",
];

const BUDGET_OPTIONS = ["Mababa", "Katamtaman", "Mataas"];

/* ---------------------------------------------------------------- */
/* helpers                                                           */
/* ---------------------------------------------------------------- */

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) {
    errors.title = "Kailangan ang thesis title o idea mo. Isulat muna dito.";
  }
  if (!form.location.trim()) {
    errors.location = "Kailangan ang research location. Hal.: Barangay Commonwealth, Quezon City.";
  }
  if (!form.respondents.trim()) {
    errors.respondents = "Pakisabi kung sino ang target respondents mo. Hal.: 50 Grade 11 students.";
  }
  return errors;
}

function scoreTier(score: number): { color: string; label: string } {
  if (score <= 3) return { color: "var(--cons)", label: "Delikado" };
  if (score <= 6) return { color: "var(--risk)", label: "Ayos lang" };
  return { color: "var(--pros)", label: "Solid!" };
}

function buildResultText(result: AnalysisResult, form: FormState): string {
  const lines: string[] = [];
  lines.push("THESISSCOPE — RESULT NG ANALYSIS");
  lines.push("========================================");
  lines.push(`Thesis: ${form.title.trim()}`);
  lines.push(`Location: ${form.location.trim()}`);
  lines.push(`Respondents: ${form.respondents.trim()}`);
  lines.push(`Methodology: ${form.methodology || "—"}`);
  lines.push(`Timeframe: ${form.timeframe ? `${form.timeframe} months` : "—"}`);
  lines.push(`Budget: ${form.budget || "—"}`);
  lines.push("");
  lines.push(`FEASIBILITY: ${result.feasibility.score}/10`);
  lines.push(result.feasibility.explanation);
  lines.push("");
  const sections: [string, string[]][] = [
    ["PROS", result.pros],
    ["CONS", result.cons],
    ["LOCATION & RESPONDENT RISKS", result.locationRisks],
    ["TIMELINE & BUDGET RISKS", result.timelineBudgetRisks],
    ["SUGGESTIONS", result.suggestions],
    ["LIKELY PANEL QUESTIONS", result.panelQuestions],
  ];
  for (const [heading, items] of sections) {
    lines.push(heading);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  lines.push("Guide lang ito — hindi kapalit ng payo ng adviser o panel.");
  return lines.join("\n");
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---------------------------------------------------------------- */
/* page                                                              */
/* ---------------------------------------------------------------- */

export default function ThesisScopePage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [filledSegs, setFilledSegs] = useState(1);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const respondentsRef = useRef<HTMLInputElement>(null);
  const analyzeBtnRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const setField = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /* loading: rotate status text + fill segmented bar every ~2s */
  useEffect(() => {
    if (!loading) return;
    setStatusIdx(0);
    setFilledSegs(1);
    const interval = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_TEXTS.length);
      setFilledSegs((f) => Math.min(f + 1, 10));
    }, 2000);
    return () => clearInterval(interval);
  }, [loading]);

  /* lock page scroll while overlay is up */
  useEffect(() => {
    if (!loading) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [loading]);

  /* toast auto-dismiss */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  /* on new result: scroll to results (mobile) */
  useEffect(() => {
    if (result) {
      const behavior = prefersReducedMotion() ? ("auto" as const) : ("smooth" as const);
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        resultsRef.current?.scrollIntoView({ behavior, block: "start" });
      }
    }
  }, [result]);

  function focusForm() {
    formRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    titleRef.current?.focus();
  }

  function fillSample() {
    setForm(SAMPLE_FORM);
    setErrors({});
    setError(null);
    analyzeBtnRef.current?.focus();
  }

  function clearForm() {
    setForm(EMPTY_FORM);
    setErrors({});
    titleRef.current?.focus();
  }

  async function handleAnalyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = ["title", "location", "respondents"].find((k) => errs[k]);
      if (first === "title") titleRef.current?.focus();
      else if (first === "location") locationRef.current?.focus();
      else if (first === "respondents") respondentsRef.current?.focus();
      return;
    }

    setError(null);
    setLoading(true);
    const startedAt = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 75000);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          location: form.location.trim(),
          respondents: form.respondents.trim(),
          methodology: form.methodology,
          timeframe: form.timeframe,
          budget: form.budget,
          language: form.language,
        }),
        signal: controller.signal,
      });

      const data: AnalyzeResponse | null = await res.json().catch(() => null);

      /* minimum display time: 1.5s so the overlay never flashes */
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1500) {
        await new Promise((resolve) => setTimeout(resolve, 1500 - elapsed));
      }

      if (res.ok && data && data.ok) {
        setResult(data.result);
        setError(null);
      } else {
        setResult(null);
        setError(
          data && !data.ok
            ? data.error
            : "Nag-error ang server. Subukan ulit sa ilang segundo."
        );
      }
    } catch {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1500) {
        await new Promise((resolve) => setTimeout(resolve, 1500 - elapsed));
      }
      setResult(null);
      setError(
        controller.signal.aborted
          ? "Natagal ang sagot ng AI (timeout). Subukan ulit ha."
          : "Hindi maka-connect sa server. Check ang connection mo, tapos subukan ulit."
      );
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    const text = buildResultText(result, form);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }
    setToast(copied ? "Na-copy!" : "Ay, hindi na-copy. Subukan ulit.");
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([buildResultText(result, form)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "thesisscope-result.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setToast("Na-download na!");
  }

  const tier = result ? scoreTier(result.feasibility.score) : null;

  /* -------------------------------------------------------------- */

  return (
    <div className="min-h-screen flex flex-col">
      {/* ============================ HEADER ============================ */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-7 sm:pt-10 pb-5">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <h1 className="wordmark text-[clamp(2.4rem,9vw,4.75rem)]">ThesisScope</h1>
          <span className="sticker text-sm sm:text-base mb-2">libre. walang account.</span>
        </div>
        <p className="mt-4 max-w-3xl text-base sm:text-lg font-bold leading-snug">
          Ipasok ang thesis idea mo — ibibigay ko agad ang{" "}
          <span className="underline decoration-[var(--pros)] decoration-[3px] underline-offset-2">pros</span>,{" "}
          <span className="underline decoration-[var(--cons)] decoration-[3px] underline-offset-2">cons</span>,{" "}
          feasibility score,{" "}
          <span className="underline decoration-[var(--risk)] decoration-[3px] underline-offset-2">risks</span>, at mga
          tanong na malamang itanong ng panel. Bago ka pa umabot sa defense, alam mo na ang butas.
        </p>
      </header>

      {/* ============================= MAIN ============================= */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
          {/* ------------------------ FORM ------------------------ */}
          <div ref={formRef} className="nb-card overflow-hidden lg:sticky lg:top-6">
            <div className="nb-titlebar px-5 py-3 text-sm sm:text-base">
              Ipasok ang thesis mo
            </div>
            <form noValidate onSubmit={handleAnalyze} className="p-5 sm:p-6" aria-label="Thesis analysis form">
              {/* 1. title */}
              <div className="mb-4">
                <label htmlFor="thesis-title" className="nb-label mb-1.5">
                  1 · Thesis title / idea{" "}
                  <span className="text-[var(--cons)]" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="thesis-title"
                  ref={titleRef}
                  value={form.title}
                  onChange={setField("title")}
                  maxLength={3000}
                  required
                  aria-required="true"
                  aria-invalid={!!errors.title}
                  aria-describedby={errors.title ? "thesis-title-error" : undefined}
                  placeholder="Hal.: Epekto ng TikTok sa study habits at sleep quality ng mga Grade 11 students..."
                  className={`nb-input min-h-[104px] resize-y ${errors.title ? "nb-input-error" : ""}`}
                />
                {errors.title && (
                  <p id="thesis-title-error" role="alert" className="error-chip mt-2">
                    {errors.title}
                  </p>
                )}
              </div>

              {/* 2. location */}
              <div className="mb-4">
                <label htmlFor="research-location" className="nb-label mb-1.5">
                  2 · Research location{" "}
                  <span className="text-[var(--cons)]" aria-hidden="true">*</span>
                </label>
                <input
                  id="research-location"
                  ref={locationRef}
                  type="text"
                  value={form.location}
                  onChange={setField("location")}
                  maxLength={300}
                  required
                  aria-required="true"
                  aria-invalid={!!errors.location}
                  aria-describedby={errors.location ? "research-location-error" : undefined}
                  placeholder="Hal.: Barangay Commonwealth, Quezon City"
                  className={`nb-input ${errors.location ? "nb-input-error" : ""}`}
                />
                {errors.location && (
                  <p id="research-location-error" role="alert" className="error-chip mt-2">
                    {errors.location}
                  </p>
                )}
              </div>

              {/* 3. respondents */}
              <div className="mb-4">
                <label htmlFor="target-respondents" className="nb-label mb-1.5">
                  3 · Target respondents{" "}
                  <span className="text-[var(--cons)]" aria-hidden="true">*</span>
                </label>
                <input
                  id="target-respondents"
                  ref={respondentsRef}
                  type="text"
                  value={form.respondents}
                  onChange={setField("respondents")}
                  maxLength={300}
                  required
                  aria-required="true"
                  aria-invalid={!!errors.respondents}
                  aria-describedby={errors.respondents ? "target-respondents-error" : undefined}
                  placeholder="Hal.: 50 Grade 11 students"
                  className={`nb-input ${errors.respondents ? "nb-input-error" : ""}`}
                />
                {errors.respondents && (
                  <p id="target-respondents-error" role="alert" className="error-chip mt-2">
                    {errors.respondents}
                  </p>
                )}
              </div>

              {/* 4 + 5. methodology / timeframe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="methodology" className="nb-label mb-1.5">
                    4 · Methodology
                  </label>
                  <div className="nb-select-wrap">
                    <select
                      id="methodology"
                      value={form.methodology}
                      onChange={setField("methodology")}
                      className="nb-input nb-select"
                    >
                      <option value="">— optional —</option>
                      {METHODOLOGY_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="timeframe" className="nb-label mb-1.5">
                    5 · Timeframe (buwan)
                  </label>
                  <input
                    id="timeframe"
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    inputMode="numeric"
                    value={form.timeframe}
                    onChange={setField("timeframe")}
                    placeholder="hal. 6"
                    className="nb-input"
                  />
                </div>
              </div>

              {/* 6 + 7. budget / language */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="budget" className="nb-label mb-1.5">
                    6 · Budget level
                  </label>
                  <div className="nb-select-wrap">
                    <select
                      id="budget"
                      value={form.budget}
                      onChange={setField("budget")}
                      className="nb-input nb-select"
                    >
                      <option value="">— optional —</option>
                      {BUDGET_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="language" className="nb-label mb-1.5">
                    7 · Response language
                  </label>
                  <div className="nb-select-wrap">
                    <select
                      id="language"
                      value={form.language}
                      onChange={setField("language")}
                      className="nb-input nb-select"
                    >
                      <option value="taglish">Taglish</option>
                      <option value="tagalog">Tagalog</option>
                      <option value="english">English</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* buttons */}
              <button
                ref={analyzeBtnRef}
                type="submit"
                disabled={loading}
                className="nb-btn mt-6 w-full bg-[var(--primary)] text-white py-4 text-lg"
              >
                {loading ? "Nag-aanalyze..." : "Analyze"}
              </button>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  type="button"
                  onClick={fillSample}
                  disabled={loading}
                  className="nb-btn bg-[var(--tips)] py-3 text-sm sm:text-base"
                >
                  Try sample
                </button>
                <button
                  type="button"
                  onClick={clearForm}
                  disabled={loading}
                  className="nb-btn bg-[var(--card)] py-3 text-sm sm:text-base"
                >
                  Clear
                </button>
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                Isang request lang muna sabay-sabay — kapag busy ang AI, ilang segundo lang ulit.
              </p>
            </form>
          </div>

          {/* ----------------------- RESULTS ----------------------- */}
          <section ref={resultsRef} aria-label="Resulta ng analysis" className="flex flex-col gap-6 min-h-[280px]">
            {/* empty state */}
            {!result && !error && (
              <div className="nb-card relative p-6 sm:p-8 pop-in">
                <span className="sticker absolute -top-4 right-4 bg-[var(--tips)] text-xs rotate-[5deg]">
                  dito lalabas ang resulta
                </span>
                <h2 className="text-2xl font-bold uppercase tracking-wide">Wala pang resulta</h2>
                <p className="mt-3 font-semibold leading-relaxed">
                  Punan ang form<span className="hidden lg:inline"> sa kaliwa</span>, tapos pindutin ang{" "}
                  <span className="bg-[var(--primary)] text-white px-1.5 py-0.5 rounded-[3px]">ANALYZE</span>. Gusto mo
          lang makita kung paano gumagana? Pindutin ang <strong>Try sample</strong>.
                </p>
              </div>
            )}

            {/* error state */}
            {error && (
              <div role="alert" className="nb-card overflow-hidden pop-in">
                <div className="nb-titlebar px-5 py-3">Ay, may problema</div>
                <div className="p-5 sm:p-6 bg-[var(--cons)]">
                  <p className="font-bold text-lg leading-snug">{error}</p>
                  <button type="button" onClick={focusForm} className="nb-btn bg-[var(--card)] px-6 py-2.5 mt-5">
                    Subukan ulit
                  </button>
                </div>
              </div>
            )}

            {/* result state */}
            {result && tier && (
              <div className="flex flex-col gap-6" aria-live="polite">
                {/* feasibility */}
                <article className="nb-card overflow-hidden pop-in">
                  <div className="nb-titlebar px-5 py-3 flex items-center justify-between">
                    <span>Feasibility</span>
                    <span className="text-xs sm:text-sm">{tier.label}</span>
                  </div>
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                      <div
                        className="shrink-0 inline-flex items-baseline justify-center gap-0.5 border-[4px] border-[var(--ink)] rounded-[4px] px-6 py-3 shadow-[6px_6px_0_var(--ink)] mx-auto sm:mx-0"
                        style={{ backgroundColor: tier.color }}
                      >
                        <span className="text-5xl sm:text-6xl font-bold leading-none">
                          {result.feasibility.score}
                        </span>
                        <span className="text-xl font-bold">/10</span>
                      </div>
                      <div className="flex-1 w-full">
                        <div
                          className="seg-track"
                          role="img"
                          aria-label={`Feasibility score: ${result.feasibility.score} out of 10`}
                        >
                          {Array.from({ length: 10 }, (_, i) => (
                            <span
                              key={i}
                              className={`seg ${i < result.feasibility.score ? "seg-on" : ""}`}
                              style={
                                i < result.feasibility.score ? { backgroundColor: tier.color } : undefined
                              }
                            />
                          ))}
                        </div>
                        <p className="mt-4 font-semibold leading-relaxed">{result.feasibility.explanation}</p>
                      </div>
                    </div>
                  </div>
                </article>

                {/* topic cards */}
                {RESULT_CARDS.map((card, i) => (
                  <article
                    key={card.key}
                    className="nb-card overflow-hidden pop-in"
                    style={{ animationDelay: `${(i + 1) * 90}ms`, backgroundColor: card.bg }}
                  >
                    <div className="nb-titlebar px-5 py-3">{card.title}</div>
                    <div className="p-5 sm:p-6">
                      <ul className={`nb-scroll ${card.key === "panelQuestions" ? "nb-list nb-list-num" : "nb-list"}`}>
                        {result[card.key].map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}

                {/* result actions */}
                <div
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 pop-in"
                  style={{ animationDelay: `${(RESULT_CARDS.length + 1) * 90}ms` }}
                >
                  <button type="button" onClick={focusForm} className="nb-btn bg-[var(--primary)] text-white py-3">
                    Analyze ulit
                  </button>
                  <button type="button" onClick={handleCopy} className="nb-btn bg-[var(--tips)] py-3">
                    Copy result
                  </button>
                  <button type="button" onClick={handleDownload} className="nb-btn bg-[var(--card)] py-3">
                    Download .txt
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ============================ FOOTER ============================ */}
      <footer className="mt-auto w-full bg-[var(--ink)] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-2">
          <p className="text-sm font-bold text-center sm:text-left">
            Guide lang ito, hindi kapalit ng payo ng adviser o panel.{" "}
            <span className="text-[var(--tips)]">Hindi sine-save ang mga input mo.</span>
          </p>
          <p className="text-xs font-bold uppercase tracking-widest whitespace-nowrap">
            ThesisScope · libre. walang account.
          </p>
        </div>
      </footer>

      {/* ======================== LOADING OVERLAY ======================== */}
      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite" aria-label="Nag-aanalysis">
          <div className="nb-card w-full max-w-md p-6 sm:p-8 text-center pop-in">
            <div className="flex justify-center gap-3" aria-hidden="true">
              <span className="sq sq-mint" />
              <span className="sq sq-pink" />
              <span className="sq sq-lav" />
            </div>
            <p key={statusIdx} className="pop-in mt-6 text-lg sm:text-xl font-bold">
              {STATUS_TEXTS[statusIdx]}
            </p>
            <div className="seg-track mt-6" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={`seg ${i < filledSegs ? "seg-on" : ""}`} />
              ))}
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.15em]">
              Isang request lang muna — sandali na &lsquo;to
            </p>
          </div>
        </div>
      )}

      {/* ============================ TOAST ============================ */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="toast-in fixed bottom-6 left-1/2 z-[70] bg-[var(--pros)] border-[3px] border-[var(--ink)] rounded-[4px] px-5 py-2.5 font-bold shadow-[5px_5px_0_var(--ink)]"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
