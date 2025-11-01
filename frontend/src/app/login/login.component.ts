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
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4 py-8 animate-in">
    <div class="w-full max-w-md">
      <!-- Card principal con animación -->
      <div class="card bg-white shadow-2xl border border-gray-200 animate-slide-up">
        <div class="card-body p-8">
          <!-- Logo y header -->
          <div class="flex flex-col items-center mb-6 space-y-3">
            <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg transform transition-transform hover:scale-110 duration-300">
              TF
            </div>
            <div class="text-center">
              <h1 class="text-2xl font-bold text-gray-900 mb-1">Bienvenido de nuevo</h1>
              <p class="text-sm text-gray-700">Inicia sesión para continuar</p>
            </div>
          </div>

          <!-- Formulario -->
          <form #f="ngForm" (ngSubmit)="onSubmit(f)" class="space-y-4">
            <!-- Campo Email -->
            <div class="form-control">
              <tui-textfield>
                <label tuiLabel>Correo electrónico</label>
                <input
                  tuiTextfield
                  type="email"
                  id="email"
                  [(ngModel)]="email"
                  name="email"
                  required
                  email
                  placeholder="tu@email.com"
                  [class.input-error]="f.submitted && (!email || f.controls['email']?.errors?.['email'])"
                />
              </tui-textfield>
              <label class="label py-1" *ngIf="f.submitted && (!email || f.controls['email']?.errors?.['email'])">
                <span class="label-text-alt text-error animate-fade-in">
                  <span class="inline-flex items-center gap-1">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    Ingresa un correo electrónico válido
                  </span>
                </span>
              </label>
            </div>

            <!-- Campo Contraseña -->
            <div class="form-control">
              <tui-textfield>
                <label tuiLabel>Contraseña</label>
                <input
                  tuiInputPassword
                  id="password"
                  [(ngModel)]="password"
                  name="password"
                  placeholder="Ingresa tu contraseña"
                  [class.input-error]="f.submitted && (!password || password.length < 3)"
                />
              </tui-textfield>
              <label class="label py-1" *ngIf="f.submitted && (!password || password.length < 6)">
                <span class="label-text-alt text-error animate-fade-in">
                  <span class="inline-flex items-center gap-1">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    La contraseña debe tener al menos 6 caracteres
                  </span>
                </span>
              </label>
            </div>

            <!-- Botón de envío -->
            <button
              tuiButton
              type="submit"
              class="w-full"
              size="l"
              appearance="primary"
              [disabled]="loading || f.invalid"
            >
              {{ loading ? 'Entrando...' : 'Entrar' }}
            </button>
          </form>

          <!-- Mensaje de error -->
          <div class="mt-4" *ngIf="error" role="alert">
            <div class="alert alert-error shadow-lg animate-slide-down">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
              </svg>
              <span class="text-sm">{{ error }}</span>
            </div>
          </div>

          <!-- Botón Google -->
          <div class="divider my-6">
            <span class="text-xs text-gray-400">O continúa con</span>
          </div>
          <button
            tuiButton
            type="button"
            class="w-full"
            size="m"
            appearance="outline"
            iconStart="tuiIconGoogle"
            (click)="loginWithGoogle()"
            [disabled]="loading"
          >
            Continuar con Google
          </button>

          <!-- Separador -->
          <div class="divider my-6">
            <span class="text-xs text-gray-400">¿No tienes cuenta?</span>
          </div>

          <!-- Enlace a registro -->
          <div class="text-center">
            <a
              routerLink="/register"
              tuiButton
              type="button"
              class="w-full"
              size="m"
              appearance="outline"
            >
              Crear nueva cuenta
            </a>
          </div>
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
    } catch {}
  }

  async onSubmit(form: any): Promise<void> {
    if (form.invalid) return;
    this.error = null;
    this.loading = true;
    
    try {
      await this.auth.login(this.email, this.password);
      try { localStorage.setItem('tf-last-email', this.email); } catch {}
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


