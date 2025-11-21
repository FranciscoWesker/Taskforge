import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TuiInputPassword } from '@taiga-ui/kit';
import { TuiButton } from '@taiga-ui/core';
import { TuiTextfield } from '@taiga-ui/core';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    NgIf,
    FormsModule,
    RouterLink,
    TuiInputPassword,
    TuiButton,
    TuiTextfield,
  ],
  template: `
  <div class="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12 animate-in">
    <div class="w-full max-w-[420px]">
      <!-- Brand Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-500/30 mb-4">
          <span class="text-xl font-bold tracking-tight">TF</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Welcome back</h1>
        <p class="text-slate-500 dark:text-slate-400 mt-2 text-sm">Sign in to your account to continue</p>
      </div>

      <!-- Main Card -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="p-8">
          <form #f="ngForm" (ngSubmit)="onSubmit(f)" class="space-y-5">
            <!-- Email Field -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Email address</label>
              <tui-textfield class="!rounded-xl overflow-hidden">
                <input
                  tuiTextfield
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  required
                  email
                  placeholder="name@company.com"
                  class="!bg-slate-50 dark:!bg-slate-800/50"
                  [class.input-error]="f.submitted && (!email || f.controls['email']?.errors?.['email'])"
                />
              </tui-textfield>
              <span *ngIf="f.submitted && (!email || f.controls['email']?.errors?.['email'])" class="text-xs text-error flex items-center gap-1 ml-1 animate-fade-in">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Please enter a valid email
              </span>
            </div>

            <!-- Password Field -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between ml-1">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                <a href="#" class="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400" tabindex="-1">Forgot password?</a>
              </div>
              <tui-textfield class="!rounded-xl overflow-hidden">
                <input
                  tuiInputPassword
                  [(ngModel)]="password"
                  name="password"
                  required
                  placeholder="••••••••"
                  class="!bg-slate-50 dark:!bg-slate-800/50"
                  [class.input-error]="f.submitted && (!password || password.length < 3)"
                />
              </tui-textfield>
              <span *ngIf="f.submitted && (!password || password.length < 6)" class="text-xs text-error flex items-center gap-1 ml-1 animate-fade-in">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Password must be at least 6 characters
              </span>
            </div>

            <!-- Submit Button -->
            <button
              tuiButton
              type="submit"
              class="w-full !rounded-xl !py-3 !text-base font-medium shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-all"
              appearance="primary"
              [disabled]="loading || f.invalid"
            >
              {{ loading ? 'Signing in...' : 'Sign in' }}
            </button>
          </form>

          <!-- Error Alert -->
          <div *ngIf="error" class="mt-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 flex items-start gap-3 animate-slide-down">
            <svg class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p class="text-sm text-red-800 dark:text-red-200">{{ error }}</p>
          </div>

          <!-- Divider -->
          <div class="relative my-8">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-slate-200 dark:border-slate-700"></div>
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-white dark:bg-slate-900 px-2 text-slate-500">Or continue with</span>
            </div>
          </div>

          <!-- Social Login -->
          <button
            tuiButton
            type="button"
            class="w-full !rounded-xl !bg-white dark:!bg-slate-800 !border-slate-200 dark:!border-slate-700 !text-slate-700 dark:!text-slate-200 hover:!bg-slate-50 dark:hover:!bg-slate-700/50"
            appearance="outline"
            iconStart="tuiIconGoogle"
            (click)="loginWithGoogle()"
            [disabled]="loading"
          >
            Google
          </button>
        </div>

        <!-- Footer -->
        <div class="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Don't have an account?
            <a routerLink="/register" class="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline transition-colors">Create account</a>
          </p>
        </div>
      </div>
    </div>
  </div>
  `
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  loading = false;
  error: string | null = null;

  ngOnInit(): void {
    // Si el usuario ya está autenticado, redirigir a la app
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/app']);
    }
    try {
      const last = localStorage.getItem('tf-last-email');
      if (last) this.email = last;
    } catch { }
  }

  async onSubmit(form: any): Promise<void> {
    if (form.invalid) return;
    this.error = null;
    this.loading = true;

    try {
      await this.auth.login(this.email, this.password);
      try { localStorage.setItem('tf-last-email', this.email); } catch { }
      this.router.navigate(['/app']);
    } catch (err: any) {
      this.error = err || 'Error al iniciar sesión. Inténtalo de nuevo.';
    } finally {
      this.loading = false;
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.error = null;
    this.loading = true;

    try {
      await this.auth.loginWithGoogle();
      this.router.navigate(['/app']);
    } catch (err: any) {
      this.error = err || 'Error al iniciar sesión con Google. Inténtalo de nuevo.';
    } finally {
      this.loading = false;
    }
  }
}


