// Thin client for the Google Gemini API (generateContent).
// Kept deliberately free of any grading logic so the grader can be tested
// against a stub and the provider can be swapped without touching rubric code.
//
// Talks to the public Generative Language API:
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// with an `x-goog-api-key` header. Structured output is requested through
// `generationConfig.responseSchema`, so the grader gets JSON it can trust.

import fs from 'fs/promises';
import path from 'path';
import config from '../config.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Only formats Gemini can ingest natively are sent as inline documents/images;
// anything else is passed as extracted text, which it reads perfectly.
// NOTE: generateContent's inline_data only supports PDF among Office-style
// documents — DOCX/PPTX are rejected with a 400 "Unsupported MIME type", which
// would fail the whole grading. They are extracted to text upstream (fileParser)
// and reach the grader through `fileText`, so they must NOT be listed here.
const DOCUMENT_MIME = {
  '.pdf': 'application/pdf',
};
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// generateContent accepts inline data up to ~20 MB of request payload; base64
// inflates bytes by ~33%, so we inline below this and fall back to extracted
// text above it, which keeps the common case simple.
const MAX_INLINE_BYTES = 15 * 1024 * 1024;

export const isConfigured = () => !!config.geminiApiKey;

/** Reads a file into the `input` part the grader passes around, or null. */
export async function filePart(filePath) {
  if (!filePath) return null;
  const ext = path.extname(filePath).toLowerCase();
  const docMime = DOCUMENT_MIME[ext];
  const imgMime = IMAGE_MIME[ext];
  if (!docMime && !imgMime) return null;

  try {
    const buf = await fs.readFile(filePath);
    if (buf.length > MAX_INLINE_BYTES) return null;
    return {
      type: docMime ? 'document' : 'image',
      mime_type: docMime || imgMime,
      data: buf.toString('base64'),
    };
  } catch {
    return null;
  }
}

class GeminiError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Gemini's `responseSchema` is a subset of JSON Schema and rejects keywords it
 * does not know (notably `additionalProperties`). Strip those recursively so a
 * schema written in full JSON-Schema still works here.
 */
const SCHEMA_KEYS = new Set([
  'type', 'format', 'description', 'nullable', 'enum', 'items', 'properties',
  'required', 'minItems', 'maxItems', 'minimum', 'maximum', 'propertyOrdering',
]);
function sanitizeSchema(schema) {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!SCHEMA_KEYS.has(k)) continue;
    if (k === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(v).map(([name, sub]) => [name, sanitizeSchema(sub)])
      );
    } else if (k === 'items') {
      out.items = sanitizeSchema(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Turns the grader's neutral `input` array into Gemini `contents` parts. */
function toParts(input) {
  return input
    .map((item) => {
      if (item == null) return null;
      if (item.type === 'text') return item.text ? { text: item.text } : null;
      if (item.type === 'document' || item.type === 'image') {
        return { inline_data: { mime_type: item.mime_type, data: item.data } };
      }
      return null;
    })
    .filter(Boolean);
}

/** Concatenates the model's answer text, skipping internal "thought" parts. */
function readOutputText(payload) {
  const candidate = payload?.candidates?.[0];
  if (!candidate) {
    const reason = payload?.promptFeedback?.blockReason;
    if (reason) throw new GeminiError(`Gemini blocked the prompt: ${reason}`, { retryable: false });
    return '';
  }
  const parts = candidate.content?.parts || [];
  return parts
    .filter((p) => p && typeof p.text === 'string' && p.thought !== true)
    .map((p) => p.text)
    .join('')
    .trim();
}

async function callOnce(model, { system, input, schema, temperature, signal }) {
  const body = {
    contents: [{ role: 'user', parts: toParts(input) }],
    generationConfig: { temperature },
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = sanitizeSchema(schema);
  }

  const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': config.geminiApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 429 = quota, 503 = model busy, 5xx = transient. A busy or rate-limited
    // model may succeed on the next one in the chain; a 400/401/404 (bad key,
    // bad request, retired model) will fail identically, so don't burn the
    // fallbacks on it — but a 404 IS worth trying the next model, since it
    // usually means this particular model id is gone, not that the key is bad.
    const retryable = res.status === 429 || res.status === 404 || res.status >= 500;
    throw new GeminiError(`Gemini ${res.status}: ${detail.slice(0, 300)}`, {
      status: res.status,
      retryable,
    });
  }

  const payload = await res.json();
  const finish = payload?.candidates?.[0]?.finishReason;
  const text = readOutputText(payload);
  if (!text) {
    // MAX_TOKENS with empty text means thinking ate the whole budget — retrying
    // on another model can help; a plain empty answer is also worth one retry.
    throw new GeminiError(`Gemini returned no text (finishReason: ${finish || 'none'})`, {
      retryable: true,
    });
  }
  return text;
}

/**
 * Sends one structured request, walking the model fallback chain on quota,
 * busy, and server errors. Returns the raw response text (JSON with `schema`).
 */
export async function generate({ system, input, schema, temperature = 0 }) {
  if (!isConfigured()) throw new GeminiError('GEMINI_API_KEY is not set');

  // De-duplicated: naming the primary model in GEMINI_FALLBACK_MODELS too (easy
  // to do, and the shipped defaults used to) meant burning a second attempt on
  // the model that had just refused the request — and, when it was the model
  // that was out of quota, spending the retry on a guaranteed 429.
  const models = [...new Set([config.geminiModel, ...config.geminiFallbackModels])];
  let lastError;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.geminiTimeoutMs);
    try {
      const text = await callOnce(model, { system, input, schema, temperature, signal: controller.signal });
      return { text, model };
    } catch (e) {
      lastError = e;
      // A non-retryable API error means the request itself is wrong — stop.
      if (e instanceof GeminiError && e.status && !e.retryable) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new GeminiError('All Gemini models failed');
}

/** Same as `generate`, but parses the JSON response. */
export async function generateJson({ system, input, schema, temperature = 0 }) {
  const { text, model } = await generate({ system, input, schema, temperature });
  try {
    return { data: JSON.parse(text), model };
  } catch {
    // Structured output should make this impossible, but a model that wraps its
    // answer in a code fence shouldn't cost us the whole grading run.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return { data: JSON.parse(text.slice(start, end + 1)), model };
    throw new GeminiError('Gemini response was not valid JSON');
  }
}

export { GeminiError };
