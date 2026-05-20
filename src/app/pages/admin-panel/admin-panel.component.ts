import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { DataService } from '../../services/data.service';
import { Category, Product } from '../../models/product.model';

type AdminTab  = 'categories' | 'products';
type ModalType = 'add-cat' | 'edit-cat' | 'add-prod' | 'edit-prod' | null;

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.scss']
})
export class AdminPanelComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router   = inject(Router);
  private ds       = inject(DataService);

  categories   = this.ds.categoriesSignal;
  products     = this.ds.productsSignal;
  loading      = this.ds.loading;

  loadError     = signal('');
  activeTab     = signal<AdminTab>('categories');
  modalType     = signal<ModalType>(null);
  saving        = signal(false);
  deleting      = signal<string | number | null>(null);
  toast         = signal('');
  uploadingImg  = signal(false);
  navScrolled   = signal(false);
  logoutConfirm = signal(false);

  // ── Search & Category Filter ──────────────
  productSearch       = '';
  private _searchTerm = signal('');
  selectedCategoryId  = signal<string>('');

  filteredProducts = computed(() => {
    const term  = this._searchTerm().toLowerCase().trim();
    const catId = this.selectedCategoryId();
    let list    = this.products();

    if (catId) {
      list = list.filter(p => p.categoryId === catId);
    }
    if (term) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.description ?? '').toLowerCase().includes(term) ||
        (p.badge ?? '').toLowerCase().includes(term) ||
        (this.ds.getCategoryById(p.categoryId)?.name ?? '').toLowerCase().includes(term)
      );
    }
    return list;
  });

  private toastTimer?: ReturnType<typeof setTimeout>;
  private logoutTimer?: ReturnType<typeof setTimeout>;

  catForm  = { id: '', name: '', subtitle: '', description: '', image: '', color: '#ffffff' };
  prodForm = { id: 0, name: '', description: '', price: 0, categoryId: '', image: '', featured: false, badge: '' };
  editingId: string | number | null = null;

  async ngOnInit() {
    await this.loadAll();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.navScrolled.set(window.scrollY > 40);
  }

  // ── Sign-out ──────────────────────────────
  requestLogout() {
    this.logoutConfirm.set(true);
    clearTimeout(this.logoutTimer);
    this.logoutTimer = setTimeout(() => this.cancelLogout(), 10000);
  }

  confirmLogout() {
    clearTimeout(this.logoutTimer);
    this.logoutConfirm.set(false);
    localStorage.removeItem('cdp_admin');
    this.router.navigate(['/admin-login']);
  }

  cancelLogout() {
    clearTimeout(this.logoutTimer);
    this.logoutConfirm.set(false);
  }

  // ── Data ──────────────────────────────────
  async loadAll() {
    this.loadError.set('');
    await this.ds.loadAll(true);
    if (this.ds.error()) this.loadError.set(this.ds.error() ?? '');
  }

  getCategoryById(id: string): Category | undefined {
    return this.ds.getCategoryById(id);
  }

  getProductsByCategory(categoryId: string): Product[] {
    return this.ds.getProductsByCategory(categoryId);
  }

  getFeaturedCount(): number {
    return this.products().filter(p => p.featured).length;
  }

  // ── Search & filter ───────────────────────
  onSearchChange(value: string) { this._searchTerm.set(value); }

  clearSearch(): void {
    this.productSearch = '';
    this._searchTerm.set('');
  }

  setCategoryFilter(catId: string) { this.selectedCategoryId.set(catId); }

  clearFilters(): void {
    this.productSearch = '';
    this._searchTerm.set('');
    this.selectedCategoryId.set('');
  }

  get hasActiveFilters(): boolean {
    return this.productSearch.length > 0 || this.selectedCategoryId() !== '';
  }

  // ── Tab ───────────────────────────────────
  setTab(tab: AdminTab) {
    this.activeTab.set(tab);
    this.clearFilters();
  }

  // ── Category ID auto-gen ──────────────────
  onCatNameChange(name: string) {
    if (!this.editingId) {
      this.catForm.id = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }
  }

  // ── Category modal ────────────────────────
  openAddCat() {
    this.catForm   = { id: '', name: '', subtitle: '', description: '', image: '', color: '#ffffff' };
    this.editingId = null;
    this.modalType.set('add-cat');
  }

  openEditCat(cat: Category) {
    this.catForm = {
      id:          cat.id,
      name:        cat.name,
      subtitle:    cat.subtitle    ?? '',
      description: cat.description ?? '',
      image:       cat.image       ?? '',
      color:       cat.color       ?? '#ffffff'
    };
    this.editingId = cat.id;
    this.modalType.set('edit-cat');
  }

  // ── Product modal ─────────────────────────
  openAddProd() {
    this.prodForm  = { id: 0, name: '', description: '', price: 0, categoryId: '', image: '', featured: false, badge: '' };
    this.editingId = null;
    this.modalType.set('add-prod');
  }

  openEditProd(p: Product) {
    this.prodForm = {
      id:          p.id,
      name:        p.name,
      description: p.description ?? '',
      price:       p.price,
      categoryId:  p.categoryId,
      image:       p.image    ?? '',
      featured:    p.featured ?? false,
      badge:       p.badge    ?? ''
    };
    this.editingId = p.id;
    this.modalType.set('edit-prod');
  }

  closeModal() { this.modalType.set(null); }

  // ── Image upload ──────────────────────────
  async onImageSelected(event: Event, target: 'cat' | 'prod') {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    this.uploadingImg.set(true);
    const ext      = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;

    const { error } = await this.supabase.client.storage
      .from('images').upload(fileName, file, { upsert: true });

    if (error) {
      this.showToast('Upload failed: ' + error.message);
      this.uploadingImg.set(false);
      return;
    }

    const { data: urlData } = this.supabase.client.storage
      .from('images').getPublicUrl(fileName);

    if (target === 'cat')  this.catForm.image  = urlData.publicUrl;
    if (target === 'prod') this.prodForm.image = urlData.publicUrl;
    this.uploadingImg.set(false);
    this.showToast('Image uploaded ✓');
  }

  // ── Save category ─────────────────────────
  async saveCat() {
    if (!this.catForm.id?.trim() || !this.catForm.name?.trim()) {
      this.showToast('ID and Name are required.');
      return;
    }
    this.saving.set(true);

    const row = {
      id:          this.catForm.id.trim(),
      name:        this.catForm.name.trim(),
      subtitle:    this.catForm.subtitle    || null,
      description: this.catForm.description || null,
      image:       this.catForm.image       || null,
      color:       this.catForm.color       || null
    };

    try {
      const result = this.editingId
        ? await this.supabase.client.from('categories').update(row).eq('id', this.editingId).select()
        : await this.supabase.client.from('categories').insert(row).select();

      if (result.error) { this.showToast('Error: ' + result.error.message); return; }

      if (this.editingId) {
        // Patch only this category in the local signal — no page reload
        this.ds.categoriesSignal.update(list =>
          list.map(c => c.id === this.editingId
            ? {
                ...c,
                name:        row.name,
                subtitle:    row.subtitle    ?? undefined,
                description: row.description ?? undefined,
                image:       row.image       ?? undefined,
                color:       row.color       ?? undefined
              } as Category
            : c
          )
        );
      } else {
        // Append the new category returned by Supabase
        const created = result.data?.[0];
        if (created) {
          const newCat: Category = {
            ...created,
            subtitle:    created.subtitle    ?? undefined,
            description: created.description ?? undefined,
            image:       created.image       ?? undefined,
            color:       created.color       ?? undefined
          };
          this.ds.categoriesSignal.update(list => [...list, newCat]);
        }
      }

      this.showToast(this.editingId ? 'Category updated ✓' : 'Category added ✓');
      this.closeModal();
    } catch (err: any) {
      this.showToast('Unexpected error: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Delete category ───────────────────────
  async deleteCat(id: string) {
    if (!confirm('Delete this category? This cannot be undone.')) return;
    this.deleting.set(id);

    try {
      const result = await this.supabase.client.from('categories').delete().eq('id', id).select();
      if (result.error) { this.showToast('Error: ' + result.error.message); return; }

      // Remove only this category from the local signal — no page reload
      this.ds.categoriesSignal.update(list => list.filter(c => c.id !== id));
      this.showToast('Category deleted');
    } catch (err: any) {
      this.showToast('Unexpected error: ' + (err?.message ?? err));
    } finally {
      this.deleting.set(null);
    }
  }

  // ── Save product ──────────────────────────
  async saveProd() {
    if (!this.prodForm.name?.trim() || !this.prodForm.categoryId) {
      this.showToast('Name and Category are required.');
      return;
    }
    this.saving.set(true);

    const row = {
      name:        this.prodForm.name.trim(),
      description: this.prodForm.description || null,
      price:       Number(this.prodForm.price),
      category_id: this.prodForm.categoryId,
      image:       this.prodForm.image       || null,
      featured:    this.prodForm.featured,
      badge:       this.prodForm.badge?.trim() || null
    };

    try {
      const result = this.editingId
        ? await this.supabase.client.from('products').update(row).eq('id', this.editingId).select()
        : await this.supabase.client.from('products').insert(row).select();

      if (result.error) { this.showToast('Error: ' + result.error.message); return; }

      if (this.editingId) {
        // Patch only this product in the local signal — no page reload
        this.ds.productsSignal.update(list =>
          list.map(p => p.id === this.editingId
            ? {
                ...p,
                name:        row.name,
                description: row.description ?? undefined,
                price:       row.price,
                categoryId:  this.prodForm.categoryId,
                image:       row.image    ?? undefined,
                featured:    row.featured,
                badge:       row.badge    ?? undefined
              } as Product
            : p
          )
        );
      } else {
        // Append the new product returned by Supabase, mapping category_id → categoryId
        const created = result.data?.[0];
        if (created) {
          const newProduct: Product = {
            ...created,
            categoryId:  created.category_id,
            description: created.description ?? undefined,
            image:       created.image       ?? undefined,
            badge:       created.badge       ?? undefined
          };
          this.ds.productsSignal.update(list => [...list, newProduct]);
        }
      }

      this.showToast(this.editingId ? 'Product updated ✓' : 'Product added ✓');
      this.closeModal();
    } catch (err: any) {
      this.showToast('Unexpected error: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Delete product ────────────────────────
  async deleteProd(id: number) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    this.deleting.set(id);

    try {
      const result = await this.supabase.client.from('products').delete().eq('id', id).select();
      if (result.error) { this.showToast('Error: ' + result.error.message); return; }

      // Remove only this product from the local signal — no page reload
      this.ds.productsSignal.update(list => list.filter(p => p.id !== id));
      this.showToast('Product deleted');
    } catch (err: any) {
      this.showToast('Unexpected error: ' + (err?.message ?? err));
    } finally {
      this.deleting.set(null);
    }
  }

  // ── Toast helper ──────────────────────────
  private showToast(msg: string) {
    clearTimeout(this.toastTimer);
    this.toast.set(msg);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3500);
  }
}