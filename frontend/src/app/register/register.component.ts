import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TuiInputPassword } from '@taiga-ui/kit';
import { TuiButton } from '@taiga-ui/core';
import { TuiTextfield } from '@taiga-ui/core';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-register',
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
    <div class="w-full max-w-[480px]">
      <!-- Brand Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-500/30 mb-4">
          <span class="text-xl font-bold tracking-tight">TF</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Create an account</h1>
        <p class="text-slate-500 dark:text-slate-400 mt-2 text-sm">Join TaskForge and start organizing your work</p>
      </div>

      <!-- Main Card -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="p-8">
          <form #f="ngForm" (ngSubmit)="onSubmit(f)" class="space-y-5">
            <!-- Full Name Field -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Full Name</label>
              <tui-textfield class="!rounded-xl overflow-hidden">
                <input
                  tuiTextfield
                  type="text"
                  [(ngModel)]="fullName"
                  name="fullName"
                  required
                  minlength="3"
                  placeholder="John Doe"
                  class="!bg-slate-50 dark:!bg-slate-800/50"
                  [class.input-error]="f.submitted && (!fullName || fullName.length < 3)"
                />
              </tui-textfield>
              <span *ngIf="f.submitted && (!fullName || fullName.length < 3)" class="text-xs text-error flex items-center gap-1 ml-1 animate-fade-in">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Name is required (min 3 chars)
              </span>
            </div>

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
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Password</label>
              <tui-textfield class="!rounded-xl overflow-hidden">
                <input
                  tuiInputPassword
                  [(ngModel)]="password"
                  name="password"
                  required
                  minlength="6"
                  placeholder="••••••••"
                  class="!bg-slate-50 dark:!bg-slate-800/50"
                  [class.input-error]="f.submitted && (!password || password.length < 6)"
                />
              </tui-textfield>
              <span *ngIf="f.submitted && (!password || password.length < 6)" class="text-xs text-error flex items-center gap-1 ml-1 animate-fade-in">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Password must be at least 6 characters
              </span>
            </div>

            <!-- Confirm Password Field -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Confirm Password</label>
              <tui-textfield class="!rounded-xl overflow-hidden">
                <input
                  tuiInputPassword
                  [(ngModel)]="confirmPassword"
                  name="confirmPassword"
                  required
                  placeholder="••••••••"
                  class="!bg-slate-50 dark:!bg-slate-800/50"
                  [class.input-error]="f.submitted && password !== confirmPassword"
                />
              </tui-textfield>
              <span *ngIf="f.submitted && password !== confirmPassword" class="text-xs text-error flex items-center gap-1 ml-1 animate-fade-in">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Passwords do not match
              </span>
            </div>

            <!-- Terms Checkbox -->
            <div class="flex items-start gap-3 ml-1">
              <div class="flex items-center h-5">
                <input
                  type="checkbox"
                  [(ngModel)]="acceptTerms"
                  name="acceptTerms"
                  required
                  class="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:ring-offset-slate-900"
                />
              </div>
              <div class="text-sm">
                <label class="font-medium text-slate-700 dark:text-slate-300">
                  I accept the <a href="#" class="text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline" (click)="$event.preventDefault()">Terms and Conditions</a>
                </label>
                <p *ngIf="f.submitted && !acceptTerms" class="text-xs text-error mt-1 animate-fade-in">
                  You must accept the terms
                </p>
              </div>
            </div>

            <!-- Submit Button -->
            <button
              tuiButton
              type="submit"
              class="w-full !rounded-xl !py-3 !text-base font-medium shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-all"
              appearance="primary"
              [disabled]="loading || f.invalid || password !== confirmPassword || !acceptTerms"
            >
              {{ loading ? 'Creating account...' : 'Create account' }}
            </button>
          </form>

          <!-- Error Alert -->
          <div *ngIf="error" class="mt-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 flex items-start gap-3 animate-slide-down">
            <svg class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p class="text-sm text-red-800 dark:text-red-200">{{ error }}</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Already have an account?
            <a routerLink="/login" class="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline transition-colors">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  </div>
  `
})
export class RegisterComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  fullName = '';
  email = '';
  password = '';
  confirmPassword = '';
  acceptTerms = false;
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
    if (form.invalid || this.password !== this.confirmPassword || !this.acceptTerms) return;

    this.error = null;
    this.loading = true;

    try {
      await this.auth.register(this.email, this.password, this.fullName);
      try {
        localStorage.setItem('tf-last-email', this.email);
        if (this.fullName) {
          localStorage.setItem('tf-full-name', this.fullName);
        }
      } catch { }
      this.router.navigate(['/app']);
    } catch (err: any) {
      this.error = err || 'Error al crear la cuenta. Inténtalo de nuevo.';
    } finally {
      this.loading = false;
    }
  }
}

