import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildPrompt,
  formatProofreadResult,
  formatDetectionResults,
  getLanguageDetectorOptions,
  getResponseConstraint,
  getRewriterOptions,
  getStatusCopy,
  getSummarizerOptions,
  getTranslatorOptions,
  getWriterOptions,
  simulateApi,
  simulatePrompt,
} from "./prompt-lab.js";

test("buildPrompt turns a preset and source text into a concrete Prompt API instruction", () => {
  const prompt = buildPrompt("event", "Launch party on May 20 at 6 PM in Lisbon.");

  assert.match(prompt, /Extract calendar event details/);
  assert.match(prompt, /Launch party on May 20 at 6 PM in Lisbon\./);
  assert.match(prompt, /Return compact JSON/);
});

test("getResponseConstraint returns a boolean JSON schema for the filter preset", () => {
  assert.deepEqual(getResponseConstraint("filter"), { type: "boolean" });
  assert.equal(getResponseConstraint("search"), null);
});

test("getStatusCopy exposes the correct action for downloading availability", () => {
  assert.deepEqual(getStatusCopy("downloading"), {
    label: "Model downloading",
    tone: "warn",
    action: "Keep this page open and watch progress.",
  });
});

test("simulatePrompt provides deterministic fallback output for contact extraction", async () => {
  const result = await simulatePrompt("contact", "Email founder@example.com or call +1 555 100 2000.");

  assert.match(result, /founder@example\.com/);
  assert.match(result, /\+1 555 100 2000/);
});

test("getSummarizerOptions maps controls to native Summarizer.create options", () => {
  assert.deepEqual(
    getSummarizerOptions({
      type: "headline",
      format: "plain-text",
      length: "medium",
      preference: "speed",
      sharedContext: "  developer docs  ",
    }),
    {
      type: "headline",
      format: "plain-text",
      length: "medium",
      preference: "speed",
      sharedContext: "developer docs",
    },
  );
});

test("formatProofreadResult exposes corrected text and correction ranges", () => {
  const formatted = formatProofreadResult("I seen two loafs.", {
    correctedInput: "I saw two loaves.",
    corrections: [
      { startIndex: 2, endIndex: 6, replacement: "saw", type: "grammar" },
      { startIndex: 11, endIndex: 16, replacement: "loaves", type: "spelling" },
    ],
  });

  assert.match(formatted, /Corrected input:\nI saw two loaves\./);
  assert.match(formatted, /\[2, 6\] "seen" -> "saw" \(grammar\)/);
  assert.match(formatted, /\[11, 16\] "loafs" -> "loaves" \(spelling\)/);
});

test("simulateApi produces Summarizer and Proofreader fallback output", async () => {
  const summary = await simulateApi("summarizer", "Chrome can summarize long pages. It runs Gemini Nano locally.");
  const proofread = await simulateApi("proofreader", "I seen him buy two loafs.");

  assert.match(summary, /Fallback summary/);
  assert.match(proofread, /Corrected input:\nI saw him buy two loaves\./);
});

test("getTranslatorOptions returns required source and target language pair", () => {
  assert.deepEqual(getTranslatorOptions({ sourceLanguage: "es", targetLanguage: "en" }), {
    sourceLanguage: "es",
    targetLanguage: "en",
  });
});

test("getLanguageDetectorOptions parses expected language lists", () => {
  assert.deepEqual(getLanguageDetectorOptions({ expectedInputLanguages: " en, es, ja " }), {
    expectedInputLanguages: ["en", "es", "ja"],
  });
});

test("writer and rewriter options keep their different enum values", () => {
  assert.deepEqual(getWriterOptions({ tone: "formal", format: "plain-text", length: "long" }), {
    tone: "formal",
    format: "plain-text",
    length: "long",
  });

  assert.deepEqual(getRewriterOptions({ tone: "more-casual", format: "as-is", length: "shorter" }), {
    tone: "more-casual",
    format: "as-is",
    length: "shorter",
  });
});

test("formatDetectionResults renders ranked language candidates", () => {
  const result = formatDetectionResults([
    { detectedLanguage: "de", confidence: 0.928 },
    { detectedLanguage: "en", confidence: 0.041 },
  ]);

  assert.match(result, /de\s+92\.8%/);
  assert.match(result, /en\s+4\.1%/);
});

test("simulateApi covers translator, language detector, writer, and rewriter fallbacks", async () => {
  const translated = await simulateApi("translator", "Hello, I need help with my account.", "", {
    sourceLanguage: "en",
    targetLanguage: "es",
  });
  const detected = await simulateApi("detector", "Bonjour tout le monde.");
  const written = await simulateApi("writer", "Ask my bank to increase my credit limit.", "Long-term customer");
  const rewritten = await simulateApi("rewriter", "hey this thing is busted and your team is slow", "Make it constructive");

  assert.match(translated, /Hola/);
  assert.match(detected, /fr/);
  assert.match(written, /Draft/);
  assert.match(rewritten, /constructive/i);
});

test("page header links to official docs without article or author framing", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const header = html.match(/<section class="masthead"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(header, /https:\/\/developer\.chrome\.com\/docs\/ai\/built-in-apis/);
  assert.doesNotMatch(header, /Published|Updated|Thomas Steiner|Alexandra Klepper|author-stack/);
});
