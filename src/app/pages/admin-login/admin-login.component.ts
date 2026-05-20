import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss']
})
export class AdminLoginComponent {
  username     = '';
  password     = '';
  error        = signal('');
  loading      = signal(false);
  showPassword = false;

  /* ── Change credentials here ── */
  private readonly ADMIN_USER = 'admin';
  private readonly ADMIN_PASS = 'papaloca2025';

  constructor(private router: Router) {}

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  login(): void {
    this.error.set('');
    this.loading.set(true);

    setTimeout(() => {
      if (
        this.username.trim() === this.ADMIN_USER &&
        this.password === this.ADMIN_PASS
      ) {
        localStorage.setItem('cdp_admin', 'true');
        this.router.navigate(['/admin']);
      } else {
        this.error.set('Utilizador ou palavra-passe incorretos.');
      }
      this.loading.set(false);
    }, 650);
  }
}