import {
  Component, inject, OnInit, AfterViewInit,
  OnDestroy, ViewChild, ElementRef, signal
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';
import { CartService } from '../../services/cart.service';
import { Product, Category } from '../../models/product.model';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss']
})
export class ProductsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('pvBody') pvBodyRef!: ElementRef<HTMLElement>;

  dataService = inject(DataService);
  cartService  = inject(CartService);
  route        = inject(ActivatedRoute);

  activeCategory   = signal<string>('all');
  filteredProducts = signal<Product[]>([]);
  addedId          = signal<number | null>(null);

  private observer?: IntersectionObserver;

  ngOnInit() {
    this.route.params.subscribe(params => {
      const cat = params['category'] || 'all';
      this.activeCategory.set(cat);
      this.filterProducts(cat);
    });
  }

  ngAfterViewInit() {
    setTimeout(() => this.setupReveal(), 100);
  }

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
    const body = this.pvBodyRef?.nativeElement;
    if (body) body.scrollTop = 0;
  }

  addToCart(p: Product) {
    this.cartService.addToCart(p);
    this.addedId.set(p.id);
    setTimeout(() => this.addedId.set(null), 1500);
  }

  getActiveCategory(): Category | undefined {
    return this.activeCategory() === 'all'
      ? undefined
      : this.dataService.getCategoryById(this.activeCategory());
  }

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
  onImgLoad(event: Event) {
  (event.target as HTMLImageElement).classList.add('is-loaded');
}

  ngOnDestroy() { this.observer?.disconnect(); }
}
