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
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4 py-8 animate-in">
    <div class="w-full max-w-md">
      <!-- Card principal con animación -->
      <div class="card bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 animate-slide-up">
        <div class="card-body p-8">
          <!-- Logo y header -->
          <div class="flex flex-col items-center mb-6 space-y-3">
            <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg hover-lift">
              TF
            </div>
            <div class="text-center">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Crea tu cuenta</h1>
              <p class="text-sm text-gray-700 dark:text-gray-300">Únete a TaskForge y comienza a organizarte</p>
            </div>
          </div>

          <!-- Formulario -->
          <form #f="ngForm" (ngSubmit)="onSubmit(f)" class="space-y-4">
            <!-- Campo Nombre completo -->
            <div class="form-control">
              <tui-textfield>
                <label tuiLabel>Nombre completo</label>
                <input
                  tuiTextfield
                  id="fullName"
                  type="text"
                  [(ngModel)]="fullName"
                  name="fullName"
                  required
                  minlength="3"
                  placeholder="Tu nombre completo"
                  [class.input-error]="f.submitted && (!fullName || fullName.length < 3)"
                />
              </tui-textfield>
              <label class="label py-1" *ngIf="f.submitted && (!fullName || fullName.length < 3)">
                <span class="label-text-alt text-error animate-fade-in">
                  <span class="inline-flex items-center gap-1">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    El nombre es requerido (mínimo 3 caracteres)
                  </span>
                </span>
              </label>
            </div>


            <!-- Campo Email -->
            <div class="form-control">
              <tui-textfield>
                <label tuiLabel>Email</label>
                <input
                  tuiTextfield
                  id="email"
                  type="email"
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
                    Ingresa un email válido
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
                  required
                  minlength="6"
                  placeholder="Mínimo 6 caracteres"
                  [class.input-error]="f.submitted && (!password || password.length < 6)"
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

            <!-- Campo Confirmar Contraseña -->
            <div class="form-control">
              <tui-textfield>
                <label tuiLabel>Confirmar contraseña</label>
                <input
                  tuiInputPassword
                  id="confirmPassword"
                  [(ngModel)]="confirmPassword"
                  name="confirmPassword"
                  required
                  placeholder="Repite tu contraseña"
                  [class.input-error]="f.submitted && password !== confirmPassword"
                />
              </tui-textfield>
              <label class="label py-1" *ngIf="f.submitted && password !== confirmPassword">
                <span class="label-text-alt text-error animate-fade-in">
                  <span class="inline-flex items-center gap-1">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                    Las contraseñas no coinciden
                  </span>
                </span>
              </label>
            </div>

            <!-- Términos y condiciones -->
            <div class="form-control">
              <label class="label cursor-pointer gap-2 py-1">
                <input type="checkbox" [(ngModel)]="acceptTerms" name="acceptTerms" class="checkbox checkbox-sm checkbox-primary" required />
                <span class="label-text text-sm text-gray-600 dark:text-gray-400">
                  Acepto los <a href="#" class="link link-primary dark:text-blue-400" (click)="$event.preventDefault()">términos y condiciones</a>
                </span>
              </label>
              <label class="label py-1" *ngIf="f.submitted && !acceptTerms">
                <span class="label-text-alt text-error animate-fade-in">Debes aceptar los términos</span>
              </label>
            </div>

            <!-- Botón de envío -->
            <button
              tuiButton
              type="submit"
              class="w-full"
              size="l"
              appearance="primary"
                    [disabled]="loading || f.invalid || password !== confirmPassword || !acceptTerms"
            >
              {{ loading ? 'Creando cuenta...' : 'Crear cuenta' }}
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

          <!-- Separador -->
          <div class="divider my-6">
            <span class="text-xs text-gray-400 dark:text-gray-500">¿Ya tienes cuenta?</span>
          </div>

          <!-- Enlace a login -->
          <div class="text-center">
            <a
              routerLink="/login"
              tuiButton
              type="button"
              class="w-full hover-lift"
              size="m"
              appearance="outline"
            >
              Iniciar sesión
            </a>
          </div>
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
    } catch {}
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
      } catch {}
      this.router.navigate(['/app']);
    } catch (err: any) {
      this.error = err || 'Error al crear la cuenta. Inténtalo de nuevo.';
    } finally {
      this.loading = false;
    }
  }
}

