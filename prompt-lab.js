const PROMPT_PRESETS = {
  search: {
    label: "Search",
    kicker: "grounded answer",
    instruction:
      "Answer the operator's question using only the supplied page excerpt. If the answer is not present, say what is missing.",
    sample:
      "The Prompt API sends natural language requests to Gemini Nano in Chrome. It can power page search, custom content filters, contact extraction, event creation, and other local AI workflows.",
  },
  filter: {
    label: "Filter",
    kicker: "boolean schema",
    instruction:
      "Decide whether the article should be hidden by a custom content filter. Return only true or false. Flag content about violence, layoffs, scams, or medical risk.",
    sample:
      "A local pottery studio reopened after refiring a batch of mugs and ramen bowls. The glaze crawled the first time, but the second firing looked clean.",
  },
  event: {
    label: "Event",
    kicker: "calendar JSON",
    instruction:
      "Extract calendar event details from the source. Return compact JSON with title, date, time, location, and confidence.",
    sample:
      "Chrome AI office hours: May 20, 2025 at 6 PM. Meet at the Lisbon Web Lab, Rua Nova 12. Bring a laptop with Chrome Canary.",
  },
  contact: {
    label: "Contact",
    kicker: "lead capture",
    instruction:
      "Extract contact details from the source. Return compact JSON with people, organizations, emails, phone numbers, and profile links.",
    sample:
      "Thomas Steiner writes at https://blog.tomayac.com/ and posts as @tomayac. Alexandra Klepper is on GitHub as alexandrascript. Email demos@example.com or call +1 555 100 2000.",
  },
};

const API_MODES = {
  translator: {
    label: "Translator",
    kicker: "language packs",
    browserName: "Translator",
    stage: "Chrome 138 stable",
    runLabel: "Translate text",
    questionLabel: "Translation context",
    questionValue: "Support chat message before it leaves the user's device.",
    sourceLabel: "Text to translate",
    sample: "Hello, I need help with my account. Where is the next bus stop, please?",
  },
  detector: {
    label: "Detector",
    kicker: "ranked language",
    browserName: "LanguageDetector",
    stage: "Chrome 138 stable",
    runLabel: "Detect language",
    questionLabel: "Detection policy",
    questionValue: "Treat confidence below 70% as uncertain.",
    sourceLabel: "Text to classify",
    sample: "Bonjour tout le monde. Je voudrais traduire ce message pour mon equipe.",
  },
  summarizer: {
    label: "Summarizer",
    kicker: "native summary",
    browserName: "Summarizer",
    stage: "Chrome 138 stable",
    runLabel: "Summarize text",
    questionLabel: "Summary context",
    questionValue: "This source is for a developer deciding whether to use Chrome built-in AI.",
    sourceLabel: "Text to summarize",
    sample:
      "Chrome built-in AI lets web apps use browser-provided models for local tasks. The Translator API converts dynamic user content between languages. The Language Detector API ranks likely languages for a text sample. The Summarizer API creates key points, TLDRs, teasers, and headlines from long text. The Writer API drafts new content from a task and context. The Rewriter API revises existing text for tone, format, or length. The Prompt API is lower level and useful for custom workflows. The Proofreader API corrects grammar, spelling, and punctuation and returns correction ranges so an app can highlight suggested edits.",
  },
  writer: {
    label: "Writer",
    kicker: "draft from task",
    browserName: "Writer",
    stage: "developer trial",
    runLabel: "Write draft",
    questionLabel: "Writing context",
    questionValue: "I am a long-term customer and want the message to be concise.",
    sourceLabel: "Writing task",
    sample: "Write a formal email to my bank asking to increase my credit limit.",
  },
  rewriter: {
    label: "Rewriter",
    kicker: "revise text",
    browserName: "Rewriter",
    stage: "developer trial",
    runLabel: "Rewrite text",
    questionLabel: "Rewrite goal",
    questionValue: "Make it constructive and suitable for a public product review.",
    sourceLabel: "Text to rewrite",
    sample: "hey this thing is busted and your team is slow. i expected way better from a paid product.",
  },
  prompt: {
    label: "Prompt",
    kicker: "freeform LLM",
    browserName: "LanguageModel",
    stage: "origin trial / extensions",
    runLabel: "Run prompt",
    questionLabel: "Question",
    questionValue: "What can I build with this API?",
    sourceLabel: "Source material",
  },
  proofreader: {
    label: "Proofreader",
    kicker: "correction map",
    browserName: "Proofreader",
    stage: "origin trial",
    runLabel: "Proofread text",
    questionLabel: "Language note",
    questionValue: "Expected input language: English.",
    sourceLabel: "Text to proofread",
    sample:
      "I seen him yesterday at the store, and he bought two loafs of bread. Teh product team should of shipped the demo sooner.",
  },
};

const MODEL_OPTIONS = Object.freeze({
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
});

const API_ORDER = ["translator", "detector", "summarizer", "writer", "rewriter", "prompt", "proofreader"];

let activeApi = "translator";
let activePreset = "search";
let activeController = null;
let activeSessions = new Map();
let userEditedSource = false;

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseLanguages(value, fallback = ["en"]) {
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  const languages = items.map((item) => cleanText(item)).filter(Boolean);
  return languages.length > 0 ? languages : fallback;
}

function getPromptPreset(presetKey) {
  return PROMPT_PRESETS[presetKey] ?? PROMPT_PRESETS.search;
}

function getApiMode(apiKey) {
  return API_MODES[apiKey] ?? API_MODES.translator;
}

function getActiveApiLabel() {
  return `${getApiMode(activeApi).label} API`;
}

export function buildPrompt(presetKey, source, question = "") {
  const preset = getPromptPreset(presetKey);
  const sourceText = cleanText(source) || "No source material was provided.";
  const operatorQuestion = cleanText(question);
  const questionBlock = operatorQuestion
    ? `Operator question:\n${operatorQuestion}`
    : "Operator question:\nFind the highest-signal answer.";

  return [
    "You are Gemini Nano running through Chrome's Prompt API.",
    preset.instruction,
    questionBlock,
    "Source material:",
    sourceText,
    "Return a concise result fit for a developer demo.",
  ].join("\n\n");
}

export function getResponseConstraint(presetKey) {
  if (presetKey === "filter") {
    return { type: "boolean" };
  }

  if (presetKey === "event") {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        date: { type: "string" },
        time: { type: "string" },
        location: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["title", "date", "time", "location", "confidence"],
    };
  }

  if (presetKey === "contact") {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        people: { type: "array", items: { type: "string" } },
        organizations: { type: "array", items: { type: "string" } },
        emails: { type: "array", items: { type: "string" } },
        phones: { type: "array", items: { type: "string" } },
        links: { type: "array", items: { type: "string" } },
      },
      required: ["people", "organizations", "emails", "phones", "links"],
    };
  }

  return null;
}

export function getTranslatorOptions(values = {}) {
  return {
    sourceLanguage: cleanText(values.sourceLanguage) || "en",
    targetLanguage: cleanText(values.targetLanguage) || "es",
  };
}

export function getLanguageDetectorOptions(values = {}) {
  return {
    expectedInputLanguages: parseLanguages(values.expectedInputLanguages, ["en", "es", "fr", "de", "ja"]),
  };
}

export function getSummarizerOptions(values = {}) {
  const options = {
    type: values.type || "key-points",
    format: values.format || "markdown",
    length: values.length || "short",
    preference: values.preference || "auto",
  };
  const sharedContext = cleanText(values.sharedContext);

  if (sharedContext) options.sharedContext = sharedContext;
  return options;
}

export function getWriterOptions(values = {}) {
  const options = {
    tone: values.tone || "neutral",
    format: values.format || "markdown",
    length: values.length || "short",
  };
  const sharedContext = cleanText(values.sharedContext);

  if (sharedContext) options.sharedContext = sharedContext;
  return options;
}

export function getRewriterOptions(values = {}) {
  const options = {
    tone: values.tone || "as-is",
    format: values.format || "as-is",
    length: values.length || "as-is",
  };
  const sharedContext = cleanText(values.sharedContext);

  if (sharedContext) options.sharedContext = sharedContext;
  return options;
}

export function getProofreaderOptions(values = {}) {
  return {
    expectedInputLanguages: [cleanText(values.language) || "en"],
  };
}

function getReplacement(correction) {
  if (typeof correction.replacement === "string") return correction.replacement;
  if (typeof correction.correction === "string") return correction.correction;
  if (typeof correction.correctedText === "string") return correction.correctedText;
  if (typeof correction.suggestion === "string") return correction.suggestion;
  if (Array.isArray(correction.suggestions) && correction.suggestions.length > 0) {
    const first = correction.suggestions[0];
    if (typeof first === "string") return first;
    if (typeof first?.replacement === "string") return first.replacement;
    if (typeof first?.text === "string") return first.text;
  }
  return "replacement not exposed";
}

export function formatProofreadResult(input, result = {}) {
  const source = String(input ?? "");
  const correctedInput = result.correctedInput ?? result.correction ?? source;
  const corrections = Array.isArray(result.corrections) ? result.corrections : [];
  const lines = ["Corrected input:", correctedInput, "", "Corrections:"];

  if (corrections.length === 0) {
    lines.push("No corrections returned.");
    return lines.join("\n");
  }

  for (const correction of corrections) {
    const start = Number.isFinite(correction.startIndex) ? correction.startIndex : 0;
    const end = Number.isFinite(correction.endIndex) ? correction.endIndex : start;
    const original = correction.original ?? source.slice(start, end);
    const replacement = getReplacement(correction);
    const type = correction.type ?? correction.correctionType ?? correction.errorType ?? "correction";
    lines.push(`- [${start}, ${end}] "${original}" -> "${replacement}" (${type})`);
  }

  return lines.join("\n");
}

export function formatDetectionResults(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return "No language candidates returned.";
  }

  return [
    "Detected language candidates:",
    ...results.slice(0, 5).map((result, index) => {
      const confidence = Number(result.confidence ?? 0);
      return `${index + 1}. ${result.detectedLanguage ?? "unknown"} ${Math.round(confidence * 1000) / 10}%`;
    }),
  ].join("\n");
}

export function getStatusCopy(status, apiLabel = "Prompt API") {
  const states = {
    checking: {
      label: "Checking API",
      tone: "idle",
      action: `Calling ${apiLabel}.availability().`,
    },
    missing: {
      label: "API not exposed",
      tone: "bad",
      action: `${apiLabel} is not exposed in this browser. Enable the relevant Chrome flags or use a supported Chrome build.`,
    },
    unavailable: {
      label: "Model unavailable",
      tone: "bad",
      action: "This device or browser profile does not meet the current requirements.",
    },
    downloadable: {
      label: "Model downloadable",
      tone: "warn",
      action: `Run this ${apiLabel} task to trigger the first local model download.`,
    },
    downloading: {
      label: "Model downloading",
      tone: "warn",
      action: "Keep this page open and watch progress.",
    },
    available: {
      label: "Model available",
      tone: "good",
      action: `${apiLabel} execution can stay on device.`,
    },
    fallback: {
      label: "Fallback mode",
      tone: "idle",
      action: "Using deterministic demo output instead of a browser model.",
    },
    running: {
      label: "Running task",
      tone: "warn",
      action: `Waiting for ${apiLabel} output from the browser model.`,
    },
  };

  return (
    states[status] ?? {
      label: "Unknown state",
      tone: "idle",
      action: "The browser returned an unexpected availability value.",
    }
  );
}

export async function simulatePrompt(presetKey, source, question = "") {
  const text = cleanText(source);
  const lower = text.toLowerCase();

  if (presetKey === "filter") {
    return String(/\b(violence|layoff|scam|medical|risk|harm|fraud)\b/.test(lower));
  }

  if (presetKey === "event") {
    const date =
      text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i)?.[0] ??
      text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
      "unknown";
    const time = text.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)?.[0] ?? "unknown";
    const location =
      text.match(/\b(?:at|in)\s+([A-Z][A-Za-z0-9 .'-]{2,80})/)?.[1]?.replace(/\.$/, "") ??
      "unknown";

    return JSON.stringify(
      {
        title: text.split(/[.:]/)[0]?.slice(0, 80) || "Untitled event",
        date,
        time,
        location,
        confidence: date !== "unknown" || time !== "unknown" ? 0.74 : 0.32,
      },
      null,
      2,
    );
  }

  if (presetKey === "contact") {
    const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])];
    const phones = [
      ...new Set(text.match(/\+?\d[\d ()-]{6,}\d/g)?.map((item) => item.trim()) ?? []),
    ];
    const links = [...new Set(text.match(/https?:\/\/[^\s)]+/g) ?? [])];
    const handles = [...new Set(text.match(/@[a-z0-9_.-]{2,}/gi) ?? [])];

    return JSON.stringify(
      {
        people: [...new Set(text.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) ?? [])],
        organizations: [],
        emails,
        phones,
        links: [...links, ...handles],
      },
      null,
      2,
    );
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstSignal = sentences.find((sentence) =>
    /prompt api|gemini nano|local|chrome|model/i.test(sentence),
  );
  const asked = cleanText(question) || "What matters in this page?";

  return [
    "Fallback answer:",
    `Question: ${asked}`,
    `Signal: ${firstSignal ?? sentences[0] ?? "No useful source text found."}`,
    "Reason: Gemini Nano is not available in this browser session, so this is a deterministic local simulation.",
  ].join("\n");
}

function simulateTranslation(source, values = {}) {
  const options = getTranslatorOptions(values);
  const text = cleanText(source);
  const canned = {
    es: "Hola, necesito ayuda con mi cuenta. Donde esta la proxima parada de autobus, por favor?",
    fr: "Bonjour, j'ai besoin d'aide avec mon compte. Ou est le prochain arret de bus, s'il vous plait ?",
    de: "Hallo, ich brauche Hilfe mit meinem Konto. Wo ist bitte die nachste Bushaltestelle?",
    ja: "[Japanese] Hello, I need help with my account. Where is the next bus stop, please?",
    en: "Hello, I need help with my account. Where is the next bus stop, please?",
  };

  return [
    `Fallback translation (${options.sourceLanguage} -> ${options.targetLanguage}):`,
    canned[options.targetLanguage] ?? `[${options.targetLanguage}] ${text}`,
  ].join("\n");
}

function inferLanguage(text) {
  if (/bonjour|merci|equipe/i.test(text)) return "fr";
  if (/hola|gracias|cuenta/i.test(text)) return "es";
  if (/hallo|willkommen|konto/i.test(text)) return "de";
  if (/konnichiwa|nihon|tokyo/i.test(text)) return "ja";
  if (/ola|obrigad/i.test(text)) return "pt";
  return "en";
}

function simulateDetection(source) {
  const detectedLanguage = inferLanguage(source);
  const second = detectedLanguage === "en" ? "es" : "en";
  return formatDetectionResults([
    { detectedLanguage, confidence: 0.93 },
    { detectedLanguage: second, confidence: 0.05 },
    { detectedLanguage: "de", confidence: 0.02 },
  ]);
}

function simulateSummary(source, values = {}) {
  const options = getSummarizerOptions(values);
  const sentences = cleanText(source).split(/(?<=[.!?])\s+/).filter(Boolean);
  const picks = sentences.slice(0, options.length === "long" ? 5 : options.length === "medium" ? 3 : 2);

  if (options.type === "headline") {
    return `Fallback summary (${options.type}/${options.length}):\n${(picks[0] ?? "No source text provided.").replace(/[.!?]$/, "")}`;
  }

  if (options.type === "tldr" || options.type === "teaser") {
    return `Fallback summary (${options.type}/${options.length}):\n${picks.join(" ") || "No source text provided."}`;
  }

  return [
    `Fallback summary (${options.type}/${options.length}):`,
    ...(picks.length ? picks.map((sentence) => `- ${sentence}`) : ["- No source text provided."]),
  ].join("\n");
}

function simulateWriting(source, context, values = {}) {
  const options = getWriterOptions(values);
  const task = cleanText(source) || "Write a concise note.";
  const background = cleanText(context);

  return [
    `Draft (${options.tone}/${options.length}/${options.format}):`,
    "Subject: Request for assistance",
    "",
    `I am writing to ask for help with this task: ${task}`,
    background ? `Relevant context: ${background}` : "Relevant context: none provided.",
    "Please let me know the next steps and any information you need from me.",
  ].join("\n");
}

function simulateRewrite(source, context, values = {}) {
  const options = getRewriterOptions(values);
  const goal = cleanText(context) || "Improve clarity while preserving intent.";
  const original = cleanText(source);
  const rewritten =
    "This product is not working as expected, and the response time has been frustrating. " +
    "Please help me resolve the issue or explain the next concrete step.";

  return [
    `Constructive rewrite (${options.tone}/${options.length}/${options.format}):`,
    rewritten,
    "",
    `Goal: ${goal}`,
    `Original signal: ${original || "No input text provided."}`,
  ].join("\n");
}

function simulateProofread(source) {
  const input = String(source ?? "");
  const rules = [
    { pattern: /\bI seen\b/g, replacement: "I saw", type: "grammar" },
    { pattern: /\bloafs\b/g, replacement: "loaves", type: "spelling" },
    { pattern: /\bTeh\b/g, replacement: "The", type: "spelling" },
    { pattern: /\bshould of\b/g, replacement: "should have", type: "grammar" },
  ];
  const corrections = [];
  let correctedInput = input;

  for (const rule of rules) {
    for (const match of input.matchAll(rule.pattern)) {
      corrections.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        replacement: rule.replacement,
        type: rule.type,
      });
    }
    correctedInput = correctedInput.replace(rule.pattern, rule.replacement);
  }

  return formatProofreadResult(input, { correctedInput, corrections });
}

export async function simulateApi(apiKey, source, question = "", options = {}) {
  if (apiKey === "translator") return simulateTranslation(source, options);
  if (apiKey === "detector") return simulateDetection(source);
  if (apiKey === "summarizer") return simulateSummary(source, options);
  if (apiKey === "writer") return simulateWriting(source, question, options);
  if (apiKey === "rewriter") return simulateRewrite(source, question, options);
  if (apiKey === "proofreader") return simulateProofread(source);
  return simulatePrompt(activePreset, source, question);
}

function byId(id) {
  return document.getElementById(id);
}

function setStatus(status) {
  const copy = getStatusCopy(status, getActiveApiLabel());
  byId("statusLabel").textContent = copy.label;
  byId("statusAction").textContent = copy.action;
  byId("statusDot").dataset.tone = copy.tone;
}

function setOutput(value) {
  byId("output").textContent = value;
}

function updateProgress(value) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value * 100)) : 0;
  byId("downloadBar").style.width = `${percent}%`;
  byId("downloadLabel").textContent = percent > 0 ? `${Math.round(percent)}%` : "idle";
}

function updateContextMeter() {
  const meter = byId("contextMeter");
  const label = byId("contextLabel");
  const session = activeSessions.get("prompt")?.instance;

  if (activeApi !== "prompt") {
    meter.style.width = "0%";
    label.textContent = `${getApiMode(activeApi).stage}`;
    return;
  }

  if (!session || typeof session.contextUsage !== "number") {
    meter.style.width = "0%";
    label.textContent = "context idle";
    return;
  }

  const usage = session.contextUsage;
  const windowSize = session.contextWindow || 1;
  const percent = Math.min(100, Math.round((usage / windowSize) * 100));
  meter.style.width = `${percent}%`;
  label.textContent = `${usage} / ${windowSize} tokens`;
}

function getFormOptions(apiKey = activeApi) {
  if (apiKey === "translator") {
    return getTranslatorOptions({
      sourceLanguage: byId("sourceLanguage").value,
      targetLanguage: byId("targetLanguage").value,
    });
  }
  if (apiKey === "detector") {
    return getLanguageDetectorOptions({
      expectedInputLanguages: byId("expectedLanguages").value,
    });
  }
  if (apiKey === "summarizer") {
    return getSummarizerOptions({
      type: byId("summaryType").value,
      format: byId("summaryFormat").value,
      length: byId("summaryLength").value,
      preference: byId("summaryPreference").value,
      sharedContext: byId("question").value,
    });
  }
  if (apiKey === "writer") {
    return getWriterOptions({
      tone: byId("writerTone").value,
      format: byId("writerFormat").value,
      length: byId("writerLength").value,
      sharedContext: byId("question").value,
    });
  }
  if (apiKey === "rewriter") {
    return getRewriterOptions({
      tone: byId("rewriterTone").value,
      format: byId("rewriterFormat").value,
      length: byId("rewriterLength").value,
      sharedContext: byId("question").value,
    });
  }
  if (apiKey === "proofreader") {
    return getProofreaderOptions({
      language: byId("proofLanguage").value,
    });
  }
  return MODEL_OPTIONS;
}

function getSnippet() {
  if (activeApi === "translator") {
    const options = getFormOptions("translator");
    return `const translator = await Translator.create({
  sourceLanguage: "${options.sourceLanguage}",
  targetLanguage: "${options.targetLanguage}",
});

const stream = translator.translateStreaming(text);
for await (const chunk of stream) {
  render(chunk);
}`;
  }

  if (activeApi === "detector") {
    const options = getFormOptions("detector");
    return `const detector = await LanguageDetector.create({
  expectedInputLanguages: ${JSON.stringify(options.expectedInputLanguages)},
});

const results = await detector.detect(text);
for (const result of results) {
  console.log(result.detectedLanguage, result.confidence);
}`;
  }

  if (activeApi === "summarizer") {
    return `const summarizer = await Summarizer.create({
  type: "${byId("summaryType").value}",
  format: "${byId("summaryFormat").value}",
  length: "${byId("summaryLength").value}",
  preference: "${byId("summaryPreference").value}",
});

const stream = summarizer.summarizeStreaming(text, { context });
for await (const chunk of stream) {
  render(chunk);
}`;
  }

  if (activeApi === "writer") {
    return `const writer = await Writer.create({
  tone: "${byId("writerTone").value}",
  format: "${byId("writerFormat").value}",
  length: "${byId("writerLength").value}",
});

const stream = writer.writeStreaming(task, { context });
for await (const chunk of stream) {
  render(chunk);
}`;
  }

  if (activeApi === "rewriter") {
    return `const rewriter = await Rewriter.create({
  tone: "${byId("rewriterTone").value}",
  format: "${byId("rewriterFormat").value}",
  length: "${byId("rewriterLength").value}",
});

const stream = rewriter.rewriteStreaming(text, { context });
for await (const chunk of stream) {
  render(chunk);
}`;
  }

  if (activeApi === "proofreader") {
    return `const proofreader = await Proofreader.create({
  expectedInputLanguages: ["${byId("proofLanguage").value}"],
});

const result = await proofreader.proofread(text);
render(result.correctedInput, result.corrections);`;
  }

  const constraint = getResponseConstraint(activePreset);
  const constraintLine = constraint
    ? `,\n  { responseConstraint: ${JSON.stringify(constraint, null, 2).replace(/\n/g, "\n    ")} }`
    : "";

  return `const available = await LanguageModel.availability({
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
});

if (available !== "unavailable") {
  const session = await LanguageModel.create();
  const result = await session.prompt(prompt${constraintLine});
}`;
}

function getSample() {
  if (activeApi === "prompt") return getPromptPreset(activePreset).sample;
  return getApiMode(activeApi).sample;
}

function setSourceSample(force = false) {
  if (!userEditedSource || force) {
    byId("source").value = getSample();
    userEditedSource = false;
  }
}

function updateCards() {
  document.querySelectorAll("[data-api-card]").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.apiCard === activeApi);
  });
}

function renderMode({ resetText = false } = {}) {
  const mode = activeApi === "prompt" ? getPromptPreset(activePreset) : getApiMode(activeApi);

  document.querySelectorAll("[data-api]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.api === activeApi);
  });

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.classList.toggle("is-active", activeApi === "prompt" && button.dataset.preset === activePreset);
  });

  document.querySelectorAll("[data-options-for]").forEach((panel) => {
    panel.hidden = panel.dataset.optionsFor !== activeApi;
  });

  byId("promptPresets").hidden = activeApi !== "prompt";
  byId("modeLabel").textContent = mode.label;
  byId("modeKicker").textContent = mode.kicker;
  byId("questionLabel").textContent = getApiMode(activeApi).questionLabel;
  byId("sourceLabel").textContent = getApiMode(activeApi).sourceLabel;
  byId("question").value = getApiMode(activeApi).questionValue;
  byId("schemaLabel").textContent =
    activeApi === "prompt"
      ? getResponseConstraint(activePreset)
        ? "responseConstraint on"
        : "free text"
      : getApiMode(activeApi).stage;
  byId("runButton").textContent = getApiMode(activeApi).runLabel;
  byId("snippet").textContent = getSnippet();
  updateCards();
  updateContextMeter();

  if (resetText) setSourceSample(true);
}

function setApiMode(apiKey) {
  activeApi = apiKey;
  userEditedSource = false;
  renderMode({ resetText: true });
  setStatus("checking");
  checkAvailability();
}

function setPreset(presetKey) {
  activeApi = "prompt";
  activePreset = presetKey;
  userEditedSource = false;
  renderMode({ resetText: true });
  setStatus("checking");
  checkAvailability();
}

async function callAvailability(api, options) {
  if (typeof api.availability !== "function") return "available";

  try {
    return await api.availability(options);
  } catch (error) {
    if (error instanceof TypeError) return api.availability();
    throw error;
  }
}

async function checkAvailability() {
  const browserName = getApiMode(activeApi).browserName;
  const api = globalThis[browserName];

  if (!api) {
    setStatus("missing");
    return "missing";
  }

  setStatus("checking");

  try {
    const availability = await callAvailability(api, getFormOptions());
    setStatus(availability);
    return availability;
  } catch (error) {
    setStatus("unavailable");
    return "unavailable";
  }
}

function withDownloadMonitor(options = {}) {
  return {
    ...options,
    monitor(monitorTarget) {
      options.monitor?.(monitorTarget);
      monitorTarget.addEventListener("downloadprogress", (event) => {
        setStatus("downloading");
        updateProgress(event.loaded);
      });
    },
  };
}

async function getSession(apiKey, factory) {
  const options = getFormOptions(apiKey);
  const signature = JSON.stringify(options);
  const existing = activeSessions.get(apiKey);

  if (existing && existing.signature === signature) return existing.instance;

  existing?.instance?.destroy?.();
  const instance = await factory(withDownloadMonitor(options));
  activeSessions.set(apiKey, { instance, signature });

  if (apiKey === "prompt") {
    instance.addEventListener?.("contextoverflow", () => {
      byId("overflowNote").hidden = false;
    });
  }

  updateContextMeter();
  return instance;
}

async function runFallback(reason) {
  setStatus("fallback");
  const result = await simulateApi(activeApi, byId("source").value, byId("question").value, getFormOptions());
  setOutput(`${reason}\n\n${result}`);
}

async function streamReadable(readable, render) {
  let rendered = "";

  for await (const chunk of readable) {
    const piece = String(chunk);
    rendered = piece.startsWith(rendered) ? piece : rendered + piece;
    render(rendered);
  }

  return rendered;
}

async function maybeStream(instance, streamMethod, batchMethod, input, options, formatter = String) {
  if (typeof instance[streamMethod] === "function") {
    try {
      await streamReadable(instance[streamMethod](input, options), setOutput);
      return;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      await streamReadable(instance[streamMethod](input), setOutput);
      return;
    }
  }

  try {
    setOutput(formatter(await instance[batchMethod](input, options)));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    setOutput(formatter(await instance[batchMethod](input)));
  }
}

async function ensureRunnable() {
  const availability = await checkAvailability();

  if (availability === "missing" || availability === "unavailable") {
    await runFallback(`${getActiveApiLabel()} is not available in this browser session.`);
    return false;
  }

  return true;
}

async function executeTranslatorApi() {
  if (!(await ensureRunnable())) return;
  const translator = await getSession("translator", (options) => Translator.create(options));
  await maybeStream(translator, "translateStreaming", "translate", byId("source").value, {
    signal: activeController.signal,
  });
  setStatus("available");
  updateProgress(1);
}

async function executeDetectorApi() {
  if (!(await ensureRunnable())) return;
  const detector = await getSession("detector", (options) => LanguageDetector.create(options));
  let results;

  try {
    results = await detector.detect(byId("source").value, { signal: activeController.signal });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    results = await detector.detect(byId("source").value);
  }

  setOutput(formatDetectionResults(results));
  setStatus("available");
  updateProgress(1);
}

async function executeSummarizerApi() {
  if (!(await ensureRunnable())) return;
  const summarizer = await getSession("summarizer", (options) => Summarizer.create(options));
  const context = cleanText(byId("question").value);
  await maybeStream(
    summarizer,
    "summarizeStreaming",
    "summarize",
    byId("source").value,
    context ? { context, signal: activeController.signal } : { signal: activeController.signal },
  );
  setStatus("available");
  updateProgress(1);
}

async function executeWriterApi() {
  if (!(await ensureRunnable())) return;
  const writer = await getSession("writer", (options) => Writer.create(options));
  const context = cleanText(byId("question").value);
  await maybeStream(
    writer,
    "writeStreaming",
    "write",
    byId("source").value,
    context ? { context, signal: activeController.signal } : { signal: activeController.signal },
  );
  setStatus("available");
  updateProgress(1);
}

async function executeRewriterApi() {
  if (!(await ensureRunnable())) return;
  const rewriter = await getSession("rewriter", (options) => Rewriter.create(options));
  const context = cleanText(byId("question").value);
  await maybeStream(
    rewriter,
    "rewriteStreaming",
    "rewrite",
    byId("source").value,
    context ? { context, signal: activeController.signal } : { signal: activeController.signal },
  );
  setStatus("available");
  updateProgress(1);
}

async function executePromptApi() {
  if (!(await ensureRunnable())) return;
  const session = await getSession("prompt", (options) => LanguageModel.create(options));
  const prompt = buildPrompt(activePreset, byId("source").value, byId("question").value);
  const constraint = getResponseConstraint(activePreset);
  const options = { signal: activeController.signal };

  if (constraint) options.responseConstraint = constraint;

  if (activePreset === "search" && typeof session.promptStreaming === "function") {
    await streamReadable(session.promptStreaming(prompt, options), setOutput);
  } else {
    setOutput(await session.prompt(prompt, options));
  }

  setStatus("available");
  updateProgress(1);
  updateContextMeter();
}

async function executeProofreaderApi() {
  if (!(await ensureRunnable())) return;
  const proofreader = await getSession("proofreader", (options) => Proofreader.create(options));
  let result;

  try {
    result = await proofreader.proofread(byId("source").value, { signal: activeController.signal });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    result = await proofreader.proofread(byId("source").value);
  }

  setOutput(formatProofreadResult(byId("source").value, result));
  setStatus("available");
  updateProgress(1);
}

async function runActiveApi() {
  const runButton = byId("runButton");
  const stopButton = byId("stopButton");

  runButton.disabled = true;
  stopButton.disabled = false;
  activeController = new AbortController();
  setStatus("running");
  setOutput("Preparing browser AI task...");

  try {
    if (activeApi === "translator") await executeTranslatorApi();
    else if (activeApi === "detector") await executeDetectorApi();
    else if (activeApi === "summarizer") await executeSummarizerApi();
    else if (activeApi === "writer") await executeWriterApi();
    else if (activeApi === "rewriter") await executeRewriterApi();
    else if (activeApi === "proofreader") await executeProofreaderApi();
    else await executePromptApi();
  } catch (error) {
    if (error?.name === "AbortError") {
      setOutput("Task stopped.");
      setStatus("available");
      return;
    }

    await runFallback(`${getActiveApiLabel()} call failed: ${error?.message ?? "unknown error"}`);
  } finally {
    runButton.disabled = false;
    stopButton.disabled = true;
    activeController = null;
  }
}

function destroySession() {
  activeController?.abort();

  for (const { instance } of activeSessions.values()) {
    instance?.destroy?.();
  }

  activeSessions = new Map();
  activeController = null;
  updateContextMeter();
  updateProgress(0);
  byId("overflowNote").hidden = true;
  setOutput("Sessions destroyed. The next run will create a fresh native API session.");
}

function initApp() {
  document.querySelectorAll("[data-api]").forEach((button) => {
    button.addEventListener("click", () => setApiMode(button.dataset.api));
  });

  document.querySelectorAll("[data-api-card]").forEach((card) => {
    card.addEventListener("click", () => setApiMode(card.dataset.apiCard));
  });

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => setPreset(button.dataset.preset));
  });

  [
    "sourceLanguage",
    "targetLanguage",
    "expectedLanguages",
    "summaryType",
    "summaryFormat",
    "summaryLength",
    "summaryPreference",
    "writerTone",
    "writerFormat",
    "writerLength",
    "rewriterTone",
    "rewriterFormat",
    "rewriterLength",
    "proofLanguage",
  ].forEach((id) => {
    byId(id).addEventListener("change", () => {
      byId("snippet").textContent = getSnippet();
      checkAvailability();
    });
  });

  byId("source").addEventListener("input", () => {
    userEditedSource = true;
  });

  byId("sampleButton").addEventListener("click", () => setSourceSample(true));
  byId("runButton").addEventListener("click", runActiveApi);
  byId("stopButton").addEventListener("click", () => activeController?.abort());
  byId("destroyButton").addEventListener("click", destroySession);
  byId("checkButton").addEventListener("click", checkAvailability);

  renderMode({ resetText: true });
  setStatus("checking");
  updateContextMeter();
  updateProgress(0);
  checkAvailability();
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", initApp);
}
