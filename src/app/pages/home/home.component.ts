import {
  Component, OnInit, OnDestroy, inject,
  AfterViewInit, HostListener, signal, computed
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/product.model';

declare const window: any;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {

  dataService = inject(DataService);
  cartService = inject(CartService);

  featuredProducts = computed(() =>
    this.dataService.productsSignal().filter(p => p.featured)
  );

  addedId   = signal<number | null>(null);
  flippedId = signal<number | null>(null);

  scrollY = 0;
  private observer?: IntersectionObserver;

  phrases = ['Handcrafted with Love', 'Fresh Every Morning', 'Made for You'];
  currentPhrase = signal('');
  private phraseIndex = 0;
  private charIndex   = 0;
  private isDeleting  = false;
  private typingTimer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.typingTimer = setTimeout(() => this.startTyping(), 600);
  }

  ngAfterViewInit() {
    this.setupReveal();

    this.dataService.dataReady.then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.setupReveal();
          if (typeof window.notifyPageReady === 'function') {
            window.notifyPageReady();
          }
        });
      });
    });
  }

  @HostListener('window:scroll')
  onScroll() { this.scrollY = window.scrollY; }

  addToCart(p: Product) {
    this.cartService.addToCart(p);
    this.addedId.set(p.id);
    setTimeout(() => this.addedId.set(null), 1500);
  }

  toggleFlip(id: number) {
    this.flippedId.update(current => (current === id ? null : id));
  }

  private startTyping() {
    const phrase = this.phrases[this.phraseIndex];
    if (this.isDeleting) {
      this.currentPhrase.set(phrase.substring(0, this.charIndex - 1));
      this.charIndex--;
    } else {
      this.currentPhrase.set(phrase.substring(0, this.charIndex + 1));
      this.charIndex++;
    }
    let delay = this.isDeleting ? 55 : 90;
    if (!this.isDeleting && this.charIndex === phrase.length) {
      delay = 2000; this.isDeleting = true;
    } else if (this.isDeleting && this.charIndex === 0) {
      this.isDeleting = false;
      this.phraseIndex = (this.phraseIndex + 1) % this.phrases.length;
      delay = 400;
    }
    this.typingTimer = setTimeout(() => this.startTyping(), delay);
  }

  private setupReveal() {
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
      }),
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right')
      .forEach(el => this.observer!.observe(el));
  }

  ngOnDestroy() {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.observer?.disconnect();
  }
}