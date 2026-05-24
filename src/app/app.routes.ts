import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home.component').then(m => m.HomeComponent),
    title: 'Papaloca — Restaurant'
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./pages/categories/categories.component').then(m => m.CategoriesComponent),
    title: 'Categories — Papaloca'
  },
  {
    path: 'products',
    loadComponent: () =>
      import('./pages/products/products.component').then(m => m.ProductsComponent),
    title: 'Our Menu — Papaloca'
  },
  {
    path: 'products/:category',
    loadComponent: () =>
      import('./pages/products/products.component').then(m => m.ProductsComponent),
    title: 'Menu — Papaloca'
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about.component').then(m => m.AboutComponent),
    title: 'About Us — Papaloca'
  },
  {
    path: 'visit',
    loadComponent: () =>
      import('./pages/visit-us/visit-us.component').then(m => m.VisitUsComponent),
    title: 'Visit Us — Papaloca'
  },
  {
    path: 'admin-login',
    loadComponent: () =>
      import('./pages/admin-login/admin-login.component').then(m => m.AdminLoginComponent),
    title: 'Admin Login — Papaloca'
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/admin-panel/admin-panel.component').then(m => m.AdminPanelComponent),
    // canActivate (not canLoad) so PreloadAllModules can still preload this chunk
    canActivate: [adminGuard],
    title: 'Admin Panel — Papaloca'
  },
  {
    path: '**',
    redirectTo: ''
  }
];