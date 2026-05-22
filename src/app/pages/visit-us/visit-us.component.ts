import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  HostListener,
  NgZone,
  ChangeDetectorRef,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';

const SLIDE_DURATION_MS = 4500;
const TICK_MS           = 50;

@Component({
  selector: 'app-visit-us',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visit-us.component.html',
  styleUrls: ['./visit-us.component.scss']
})
export class VisitUsComponent implements OnInit, AfterViewInit, OnDestroy {

  /* ── Data ── */
  hours = [
    { day: 'Segunda-feira', time: '07:00 – 00:00' },
    { day: 'Terça-feira',   time: '07:00 – 00:00' },
    { day: 'Quarta-feira',  time: '07:00 – 00:00' },
    { day: 'Quinta-feira',  time: '07:00 – 00:00' },
    { day: 'Sexta-feira',   time: '07:00 – 00:00' },
    { day: 'Sábado',        time: '07:00 – 00:00' },
    { day: 'Domingo',       time: '07:00 – 00:00' },
  ];

  images = [
    { src: 'assets/images/papalocav1.webp', label: ''  },
    { src: 'assets/images/papalocav2.webp', label: ''  },
    { src: 'assets/images/papalocav3.webp', label: ''  },
    { src: 'assets/images/papalocav4.webp', label: ''  },
  ];

  /* ── Carousel state ── */
  carouselIndex = 0;
  progressPct   = 0;

  private tickTimer?: ReturnType<typeof setInterval>;
  private elapsed   = 0;
  private paused    = false;

  /* ── Lightbox state ── */
  lightboxOpen  = false;
  lightboxIndex = 0;

  /* ── Scroll reveal observer ── */
  private revealObserver?: IntersectionObserver;

  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef
  ) {}

  /* ── Lifecycle ── */
  ngOnInit(): void {
    this.startCarousel();
  }

  ngAfterViewInit(): void {
    this.initRevealObserver();
  }

  ngOnDestroy(): void {
    this.stopCarousel();
    this.revealObserver?.disconnect();
    document.body.style.overflow = '';
  }

  /* ── Scroll reveal ── */
  private initRevealObserver(): void {
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.12 }
    );

    const targets = this.elRef.nativeElement.querySelectorAll('.vu-fade-up');
    targets.forEach((el: Element) => this.revealObserver!.observe(el));
  }

  /* ── Today highlight ── */
  get todayIndex(): number {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  }

  /* ── Carousel controls ── */
  goToSlide(index: number): void {
    this.carouselIndex = index;
    this.resetProgress();
  }

  pauseCarousel(): void  { this.paused = true; }
  resumeCarousel(): void { this.paused = false; }

  private startCarousel(): void {
    this.ngZone.runOutsideAngular(() => {
      this.tickTimer = setInterval(() => {
        if (this.paused || this.lightboxOpen) return;

        this.elapsed += TICK_MS;
        this.progressPct = Math.min((this.elapsed / SLIDE_DURATION_MS) * 100, 100);

        if (this.elapsed >= SLIDE_DURATION_MS) {
          this.elapsed     = 0;
          this.progressPct = 0;
          this.ngZone.run(() => {
            this.carouselIndex = (this.carouselIndex + 1) % this.images.length;
          });
        }

        this.cdr.detectChanges();
      }, TICK_MS);
    });
  }

  private stopCarousel(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  private resetProgress(): void {
    this.elapsed     = 0;
    this.progressPct = 0;
  }

  /* ── Lightbox ── */
  openLightbox(index: number): void {
    this.lightboxIndex = index;
    this.lightboxOpen  = true;
    document.body.style.overflow = 'hidden';
  }

  closeLightbox(): void {
    this.lightboxOpen = false;
    document.body.style.overflow = '';
    this.resetProgress();
  }

  nextImage(e: Event): void {
    e.stopPropagation();
    this.lightboxIndex = (this.lightboxIndex + 1) % this.images.length;
  }

  prevImage(e: Event): void {
    e.stopPropagation();
    this.lightboxIndex = (this.lightboxIndex - 1 + this.images.length) % this.images.length;
  }

  /* ── Keyboard ── */
  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (this.lightboxOpen) {
      if (e.key === 'Escape')      this.closeLightbox();
      if (e.key === 'ArrowRight')  this.nextImage(e);
      if (e.key === 'ArrowLeft')   this.prevImage(e);
    } else {
      if (e.key === 'ArrowRight') {
        this.carouselIndex = (this.carouselIndex + 1) % this.images.length;
        this.resetProgress();
      }
      if (e.key === 'ArrowLeft') {
        this.carouselIndex = (this.carouselIndex - 1 + this.images.length) % this.images.length;
        this.resetProgress();
      }
    }
  }
}