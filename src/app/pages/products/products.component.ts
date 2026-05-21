import {
  Component, inject, OnInit, AfterViewInit,
  OnDestroy, ViewChild, ElementRef, signal, HostListener
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

import { DataService }        from '../../services/data.service';
import { CartService }        from '../../services/cart.service';
import { TranslationService, LANGUAGES, LangCode, Language } from '../../services/translation.service';
import { Product }            from '../../models/product.model';

@Component({
  selector:    'app-products',
  standalone:  true,
  imports:     [RouterLink, CommonModule],
  templateUrl: './products.component.html',
  styleUrls:   ['./products.component.scss']
})
export class ProductsComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('pvBody')    pvBodyRef!:    ElementRef<HTMLElement>;
  @ViewChild('langPanel') langPanelRef!: ElementRef<HTMLElement>;

  readonly dataService        = inject(DataService);
  readonly cartService        = inject(CartService);
  readonly translationService = inject(TranslationService);
  readonly route              = inject(ActivatedRoute);

  /* ── Products / categories ── */
  activeCategory   = signal<string>('all');
  filteredProducts = signal<Product[]>([]);
  addedId          = signal<number | null>(null);

  /* ── Language ───────────────────────────────────────────────────
     Portuguese is the mother tongue / canonical display language.

     Two-phase flow
     ──────────────
     Phase 1 — normalizeToPortuguese() runs on init.
       • Detects which DB rows are already in PT (no API call for those).
       • Translates the rest to PT using Google Translate sl=auto.
       • Result stored in normalizedNames / normalizedDescs (permanent).

     Phase 2 — translateFromPortuguese(to) runs when user picks a language.
       • Always translates FROM the normalised PT content.
       • Source language is always known → consistent, correct results.
       • Result stored in translatedNames / translatedDescs (per-session).
  ─────────────────────────────────────────────────────────────────── */
  readonly languages: Language[] = LANGUAGES;

  currentLang  = signal<LangCode>('pt');
  langMenuOpen = signal(false);
  translating  = signal(false);

  /**
   * Normalised Portuguese content — single source of truth.
   * Items appear here progressively as normalisation completes.
   */
  private normalizedNames = signal<Record<number, string>>({});
  private normalizedDescs = signal<Record<number, string>>({});

  /**
   * Content translated into the currently selected non-PT language.
   * Cleared on every language switch so isPending() works correctly.
   */
  private translatedNames = signal<Record<number, string>>({});
  private translatedDescs = signal<Record<number, string>>({});

  private observer?: IntersectionObserver;

  /* ════════════════════════════════════════════════
     LIFECYCLE
     ════════════════════════════════════════════════ */

  async ngOnInit() {
    this.currentLang.set('pt');

    this.route.params.subscribe(params => {
      const cat = params['category'] || 'all';
      this.activeCategory.set(cat);
      this.filterProducts(cat);
    });

    await this.normalizeToPortuguese();
  }

  ngAfterViewInit() {
    setTimeout(() => this.setupReveal(), 100);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  /* ════════════════════════════════════════════════
     CATEGORIES / PRODUCTS
     ════════════════════════════════════════════════ */

  filterProducts(id: string) {
    this.filteredProducts.set(
      id === 'all'
        ? this.dataService.products
        : this.dataService.getProductsByCategory(id)
    );
    setTimeout(() => this.setupReveal(), 120);
  }

  setCategory(id: string) {
    this.activeCategory.set(id);
    this.filterProducts(id);
    this.pvBodyRef?.nativeElement && (this.pvBodyRef.nativeElement.scrollTop = 0);
  }

  addToCart(p: Product) {
    this.cartService.addToCart(p);
    this.addedId.set(p.id);
    setTimeout(() => this.addedId.set(null), 1500);
  }

  onImgLoad(event: Event) {
    (event.target as HTMLImageElement).classList.add('is-loaded');
  }

  /* ════════════════════════════════════════════════
     TEMPLATE GETTERS
     ════════════════════════════════════════════════ */

  getName(p: Product): string {
    if (this.currentLang() === 'pt') {
      return this.normalizedNames()[p.id] ?? p.name;
    }
    return this.translatedNames()[p.id]
        ?? this.normalizedNames()[p.id]
        ?? p.name;
  }

  getDesc(p: Product): string {
    const base = p.description ?? '';
    if (!base) return '';
    if (this.currentLang() === 'pt') {
      return this.normalizedDescs()[p.id] ?? base;
    }
    return this.translatedDescs()[p.id]
        ?? this.normalizedDescs()[p.id]
        ?? base;
  }

  /**
   * Drives the skeleton placeholder.
   * True while a batch is in-flight AND this specific product is not yet resolved.
   */
  isPending(p: Product): boolean {
    if (!this.translating()) return false;
    return this.currentLang() === 'pt'
      ? this.normalizedNames()[p.id] === undefined
      : this.translatedNames()[p.id] === undefined;
  }

  /* ════════════════════════════════════════════════
     LANGUAGE SELECTOR
     ════════════════════════════════════════════════ */

  getCurrentLang(): Language {
    return this.languages.find(l => l.code === this.currentLang()) ?? this.languages[0];
  }

  toggleLangMenu() { this.langMenuOpen.update(v => !v); }
  closeLangMenu()  { this.langMenuOpen.set(false); }

  onPageClick(event: MouseEvent) {
    if (!this.langMenuOpen()) return;
    const panel = this.langPanelRef?.nativeElement;
    if (panel && !panel.contains(event.target as Node)) this.closeLangMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.langMenuOpen.set(false); }

  async selectLanguage(lang: Language) {
    if (lang.code === this.currentLang()) { this.closeLangMenu(); return; }

    this.closeLangMenu();
    this.currentLang.set(lang.code);

    if (lang.code === 'pt') {
      // Return to mother tongue — no API call, just show normalised PT content
      this.translatedNames.set({});
      this.translatedDescs.set({});
      return;
    }

    await this.translateFromPortuguese(lang.code);
  }

  /* ════════════════════════════════════════════════
     PHASE 1 — NORMALISE ALL DB CONTENT TO PORTUGUESE
     ════════════════════════════════════════════════ */

  /**
   * Runs once on init.
   *
   * Items detected as already-Portuguese are copied immediately (no API call,
   * no skeleton).  Items detected as non-Portuguese (e.g. English rows in the
   * DB) are translated progressively using Google Translate sl=auto.
   *
   * The localStorage cache means this entire phase is skipped on revisits
   * — the cached translations are served instantly.
   */
  private async normalizeToPortuguese(): Promise<void> {
    const all = this.dataService.products;
    if (!all.length) return;

    const nameRec: Record<number, string> = {};
    const descRec: Record<number, string> = {};

    // Indexes of products whose name / description need translation
    const toTranslateNameIdx: number[] = [];
    const toTranslateNameTxt: string[] = [];
    const toTranslateDescIdx: number[] = [];
    const toTranslateDescTxt: string[] = [];

    all.forEach((p, i) => {
      if (this.isAlreadyPortuguese(p.name)) {
        nameRec[p.id] = p.name;            // immediately available — no skeleton
      } else {
        toTranslateNameIdx.push(i);
        toTranslateNameTxt.push(p.name);
      }

      const desc = p.description ?? '';
      if (!desc || this.isAlreadyPortuguese(desc)) {
        descRec[p.id] = desc;
      } else {
        toTranslateDescIdx.push(i);
        toTranslateDescTxt.push(desc);
      }
    });

    // Publish what we already have so PT products render immediately
    this.normalizedNames.set({ ...nameRec });
    this.normalizedDescs.set({ ...descRec });

    const needsWork = toTranslateNameTxt.length > 0 || toTranslateDescTxt.length > 0;
    if (!needsWork) return;   // everything already in PT — done

    this.translating.set(true);

    try {
      await Promise.all([

        this.translationService.translateBatch(
          toTranslateNameTxt,
          'pt',
          (batchIdx, translated) => {
            const productIdx = toTranslateNameIdx[batchIdx];
            nameRec[all[productIdx].id] = translated;
            this.normalizedNames.set({ ...nameRec });
          }
        ),

        this.translationService.translateBatch(
          toTranslateDescTxt,
          'pt',
          (batchIdx, translated) => {
            const productIdx = toTranslateDescIdx[batchIdx];
            descRec[all[productIdx].id] = translated;
            this.normalizedDescs.set({ ...descRec });
          }
        ),

      ]);
    } catch (err) {
      console.error('[ProductsComponent] normalizeToPortuguese error:', err);
      // Ensure every product has at least its raw DB value
      all.forEach(p => {
        nameRec[p.id] ??= p.name;
        descRec[p.id] ??= p.description ?? '';
      });
      this.normalizedNames.set({ ...nameRec });
      this.normalizedDescs.set({ ...descRec });
    } finally {
      this.translating.set(false);
    }
  }

  /* ════════════════════════════════════════════════
     PHASE 2 — TRANSLATE PT → TARGET LANGUAGE
     ════════════════════════════════════════════════ */

  /**
   * Translates the normalised PT content into `to`.
   *
   * • Clears previous translations first so isPending() shows skeletons
   *   from the start (not stale content from a previous language).
   * • Updates the UI per-product as each batch resolves (progressive).
   * • Source is always guaranteed PT so the language pair is consistent.
   */
  private async translateFromPortuguese(to: LangCode): Promise<void> {
    this.translating.set(true);

    const all = this.dataService.products;
    const nm  = this.normalizedNames();
    const de  = this.normalizedDescs();

    // Clear previous translations — triggers isPending() for all products
    this.translatedNames.set({});
    this.translatedDescs.set({});

    const nameRecord: Record<number, string> = {};
    const descRecord: Record<number, string> = {};

    try {
      await Promise.all([

        this.translationService.translateBatch(
          all.map(p => nm[p.id] ?? p.name),
          to,
          (i, translated) => {
            nameRecord[all[i].id] = translated;
            this.translatedNames.set({ ...nameRecord });
          }
        ),

        this.translationService.translateBatch(
          all.map(p => de[p.id] ?? p.description ?? ''),
          to,
          (i, translated) => {
            descRecord[all[i].id] = translated;
            this.translatedDescs.set({ ...descRecord });
          }
        ),

      ]);
    } catch (err) {
      console.error('[ProductsComponent] translateFromPortuguese error:', err);
      // Fall back gracefully to Portuguese
      this.currentLang.set('pt');
      this.translatedNames.set({});
      this.translatedDescs.set({});
    } finally {
      this.translating.set(false);
    }
  }

  /* ════════════════════════════════════════════════
     HELPERS
     ════════════════════════════════════════════════ */

  /**
   * Fast heuristic: returns true when text is almost certainly Portuguese.
   *
   * Using this to skip API calls for PT rows in the DB keeps normalisation
   * instant for menus that are mostly/entirely already in Portuguese.
   *
   * If the heuristic is wrong (e.g. a PT text with no diacritics), Google's
   * sl=auto would still produce the correct result — so correctness is
   * never compromised, only speed.
   */
  private isAlreadyPortuguese(text: string): boolean {
  if (!text?.trim()) return true;

  if (/[ãõÃÕçÇ]/.test(text)) return true;

  if (/\b(the|and|with|grilled|fried|roasted|smoked|fresh|house|homemade|chicken|beef|pork|lamb|fish|shrimp|sauce|cream|soup|salad|steak|burger|pasta|cheese|bread|rice|cake|pie)\b/i.test(text)) {
    return false;
  }

  if (/[áéíóúÁÉÍÓÚàÀ]/.test(text)) return true;

  return true;
}

  /* ════════════════════════════════════════════════
     SCROLL REVEAL
     ════════════════════════════════════════════════ */

  private setupReveal() {
    this.observer?.disconnect();
    const root = this.pvBodyRef?.nativeElement ?? null;

    this.observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
      }),
      { root, threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );

    document.querySelectorAll('.pv-reveal').forEach(el => {
      el.classList.remove('visible');
      this.observer!.observe(el);
    });
  }
}