/* ================================================================
   TRANSLATION SERVICE — Papaloca Restaurant
   Uses the Google Translate unofficial browser endpoint.
   No API key required. Handles mixed-language DB content via sl=auto.
   Caches results in localStorage so subsequent visits are instant.

   Why not MyMemory?
   → Free tier: ~5 000 chars/day.  A single full menu translation
     easily exceeds that, which is why Chinese (and often English)
     never finished.  Google's gtx endpoint has no such hard cap
     for browser-scale usage.
   ================================================================ */

import { Injectable } from '@angular/core';

export type LangCode = 'en' | 'pt' | 'zh' | 'fr';

export interface Language {
  code: LangCode;
  label: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: 'pt', label: 'Português', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'en', label: 'English',   nativeName: 'English',   flag: '🇬🇧' },
  { code: 'fr', label: 'Français',  nativeName: 'Français',  flag: '🇫🇷' },
  { code: 'zh', label: 'Chinese',   nativeName: '中文',       flag: '🇨🇳' },
];

/**
 * Google Translate language codes.
 * 'zh' alone is rejected — Google requires 'zh-CN' for Simplified Chinese.
 * This was the primary reason Chinese translations silently failed before.
 */
const GT_CODE: Record<LangCode, string> = {
  pt: 'pt',
  en: 'en',
  fr: 'fr',
  zh: 'zh-CN',   // ← critical fix: MyMemory used 'zh', Google needs 'zh-CN'
};

const LS_KEY         = 'papaloca_translations_v3';  // bumped; old MyMemory cache ignored
const API_BASE       = 'https://translate.googleapis.com/translate_a/single';
const BATCH_SIZE     = 6;    // parallel requests per wave
const BATCH_DELAY_MS = 120;  // ms pause between waves (polite pacing)
const MAX_RETRIES    = 3;

@Injectable({ providedIn: 'root' })
export class TranslationService {

  /** Kept for API compatibility; no longer drives internal calls (we use sl=auto). */
  sourceLang: LangCode = 'pt';

  private mem = new Map<string, string>();

  constructor() { this.hydrateCache(); }

  // ── Public API ─────────────────────────────────────────────────

  setSourceLanguage(lang: LangCode): void { this.sourceLang = lang; }

  hasCached(key: string): boolean { return this.mem.has(key); }

  /**
   * Translate a single text into `to`.
   *
   * Uses sl=auto so Google detects the source language on its own.
   * This cleanly handles a Supabase table that mixes English and
   * Portuguese rows — no per-item language detection needed on
   * the caller side.
   */
  async translate(text: string, to: LangCode): Promise<string> {
    if (!text?.trim()) return text;

    const k = this.cacheKey(text, to);
    if (this.mem.has(k)) return this.mem.get(k)!;

    const result = await this.fetchWithRetry(text, to);
    if (result && result !== text) this.persist(k, result);
    return result || text;
  }

  /**
   * Translate an array of strings into `to`, processing in sequential
   * batches of BATCH_SIZE with BATCH_DELAY_MS between each batch.
   *
   * onProgress(index, translatedText) fires after EACH individual item
   * resolves, enabling the UI to update product-by-product instead of
   * waiting for the entire list to finish.
   */
  async translateBatch(
    texts: string[],
    to: LangCode,
    onProgress?: (index: number, translated: string) => void
  ): Promise<string[]> {
    const results: string[] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(text =>
          !text?.trim() ? Promise.resolve(text) : this.translate(text, to)
        )
      );

      batchResults.forEach((res, j) => {
        const idx = i + j;
        results[idx] = res;
        onProgress?.(idx, res);
      });

      if (i + BATCH_SIZE < texts.length) {
        await this.delay(BATCH_DELAY_MS);
      }
    }

    return results;
  }

  /** Convenience alias kept for backward compatibility. */
  async translateAll(texts: string[], to: LangCode): Promise<string[]> {
    return this.translateBatch(texts, to);
  }

  cacheKey(text: string, to: LangCode): string {
    const excerpt = text.slice(0, 80).replace(/\s+/g, '_');
    return `auto>${to}>${excerpt}`;
  }

  // ── Private ────────────────────────────────────────────────────

  /**
   * Call the Google Translate unofficial endpoint.
   *
   * Response shape for dt=t:
   *   data[0] = [[translatedChunk, originalChunk, ...], ...]
   * Join all data[0][i][0] values to get the full translated string.
   *
   * Retries with exponential back-off on network errors.
   */
  private async fetchWithRetry(text: string, to: LangCode): Promise<string> {
    const tl = GT_CODE[to];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url =
          `${API_BASE}?client=gtx&sl=auto&tl=${tl}&dt=t` +
          `&q=${encodeURIComponent(text)}`;

        const res = await fetch(url);

        if (!res.ok) {
          await this.delay(400 * Math.pow(2, attempt));
          continue;
        }

        const data = await res.json();

        if (!Array.isArray(data) || !Array.isArray(data[0])) {
          throw new Error('Unexpected response shape');
        }

        const translated = (data[0] as unknown[][])
          .filter(Array.isArray)
          .map(part => (part[0] as string) ?? '')
          .join('');

        if (translated) return translated;

      } catch {
        if (attempt < MAX_RETRIES - 1) await this.delay(400 * Math.pow(2, attempt));
      }
    }

    return text; // all retries exhausted — fall back to original
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private persist(key: string, value: string): void {
    this.mem.set(key, value);
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, string>;
      stored[key]  = value;
      const json   = JSON.stringify(stored);
      if (json.length < 1_800_000) localStorage.setItem(LS_KEY, json);
    } catch { /* storage full / unavailable */ }
  }

  private hydrateCache(): void {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, string>;
      Object.entries(stored).forEach(([k, v]) => this.mem.set(k, v));
    } catch { /* ignore */ }
  }
}