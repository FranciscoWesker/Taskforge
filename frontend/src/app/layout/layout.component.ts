import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { TuiButton } from '@taiga-ui/core';
import { TuiAvatar } from '@taiga-ui/kit';
import { TuiIcon } from '@taiga-ui/core';
import { AuthService } from '../core/auth.service';
import { SocketService } from '../core/socket.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    TuiButton,
    TuiAvatar,
    TuiIcon,
  ],
  template: `
  <div class="min-h-screen flex">
    <!-- Sidebar Desktop (persistente en pantallas grandes) -->
    @if (auth.isAuthenticated()) {
      <aside class="hidden lg:flex flex-col w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 sticky top-0 h-screen">
        <div class="flex flex-col h-full">
          <!-- Logo -->
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-lg">
                TF
              </div>
              <span class="text-xl font-bold text-gray-900 dark:text-gray-100">TaskForge</span>
            </div>
          </div>
          
          <!-- Navegación -->
          <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
            <a 
              routerLink="/app/boards" 
              routerLinkActive="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-500"
              class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium transition-colors"
              [class.bg-blue-50]="isActiveRoute('/app/boards')"
              [class.dark:bg-blue-900]="isActiveRoute('/app/boards')"
            >
              <tui-icon icon="tuiIconGridLarge" class="text-lg"></tui-icon>
              <span>Tableros</span>
            </a>
            <a 
              routerLink="/app/settings/integrations" 
              routerLinkActive="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-500"
              class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium transition-colors"
            >
              <tui-icon icon="tuiIconCode" class="text-lg"></tui-icon>
              <span>Integraciones</span>
            </a>
          </nav>
          
          <!-- Usuario y acciones -->
          <div class="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <div class="flex items-center gap-3 p-2 rounded-lg">
              <tui-avatar size="s">{{ userInitials }}</tui-avatar>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ userName }}</p>
                <p class="text-xs text-gray-600 dark:text-gray-400 truncate">{{ userEmail }}</p>
              </div>
            </div>
            <button
              tuiButton
              type="button"
              appearance="flat"
              size="m"
              iconStart="tuiIconLogOut"
              class="w-full justify-start"
              (click)="logout()"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>
    }

    <!-- Contenido principal -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header móvil -->
      <header class="sticky top-0 z-10 border-b bg-white/90 dark:bg-gray-800/90 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-gray-800/80 border-gray-200 dark:border-gray-700 sticky-optimized">
        <div class="flex items-center justify-between px-4 py-2">
          <div class="flex items-center gap-2">
            <button
              tuiButton
              type="button"
              appearance="flat"
              size="s"
              iconStart="tuiIconMenu"
              (click)="toggleSidebar()"
              class="lg:hidden"
            ></button>
            <a routerLink="/app" class="font-semibold px-2 flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-sm font-bold lg:hidden">
                TF
              </div>
              <span class="hidden sm:inline">TaskForge</span>
            </a>
          </div>
          <div class="flex items-center gap-2">
            <button
              tuiButton
              type="button"
              appearance="flat"
              size="s"
              [iconStart]="isDark() ? 'tuiIconSunLarge' : 'tuiIconMoonLarge'"
              (click)="toggleTheme()"
              aria-label="Cambiar tema"
              title="Cambiar tema (T)"
            ></button>
            @if (auth.isAuthenticated()) {
              <div class="hidden md:flex items-center gap-2">
                <span class="text-sm text-gray-800 dark:text-gray-200 font-medium">{{ userName }}</span>
                <tui-avatar size="s">{{ userInitials }}</tui-avatar>
              </div>
            } @else {
              <a
                routerLink="/login"
                tuiButton
                type="button"
                appearance="outline"
                size="s"
                class="ml-2"
                aria-label="Iniciar sesión"
              >
                <span class="hidden md:inline">Iniciar sesión</span>
              </a>
            }
          </div>
        </div>
      </header>

      <!-- Sidebar móvil (overlay) -->
      @if (sidebarVisible()) {
        <div class="fixed inset-0 z-50 lg:hidden bg-black/50 dark:bg-black/70" (click)="sidebarVisible.set(false)">
          <div class="fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-800 shadow-xl p-4 space-y-2 animate-in border-r border-gray-200 dark:border-gray-700" (click)="$event.stopPropagation()">
            <div class="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-lg">
                  TF
                </div>
                <span class="text-xl font-bold text-gray-900 dark:text-gray-100">TaskForge</span>
              </div>
            </div>
            @if (auth.isAuthenticated()) {
              <a routerLink="/app/boards" class="flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium" (click)="sidebarVisible.set(false)">
                <tui-icon icon="tuiIconGridLarge"></tui-icon>
                <span>Tableros</span>
              </a>
              <a routerLink="/app/settings/integrations" class="flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium" (click)="sidebarVisible.set(false)">
                <tui-icon icon="tuiIconCode"></tui-icon>
                <span>Integraciones</span>
              </a>
              <div class="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-2 p-2 rounded-lg mb-2">
                  <tui-avatar size="s">{{ userInitials }}</tui-avatar>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ userName }}</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 truncate">{{ userEmail }}</p>
                  </div>
                </div>
                <button
                  tuiButton
                  type="button"
                  appearance="flat"
                  size="m"
                  iconStart="tuiIconLogOut"
                  class="w-full justify-start"
                  (click)="logout()"
                >
                  Cerrar sesión
                </button>
              </div>
            } @else {
              <div class="text-sm text-gray-700 dark:text-gray-300">
                <p>Inicia sesión para acceder al menú.</p>
                <a routerLink="/login" class="mt-2 inline-flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700" (click)="sidebarVisible.set(false)">
                  <tui-icon icon="tuiIconLogIn"></tui-icon>
                  <span>Ir a login</span>
                </a>
              </div>
            }
          </div>
        </div>
      }

      <!-- Contenido -->
      <main class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <div class="max-w-7xl mx-auto px-4 py-6">
          <router-outlet />
        </div>
      </main>
    </div>
  </div>
  `
})
export class LayoutComponent implements OnInit {
  protected readonly sidebarVisible = signal(false);
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  protected readonly socket = inject(SocketService);
  protected readonly isDark = signal(false);

  ngOnInit() {
    // Inicializar tema antes de renderizar
    const isDarkMode = this.getInitialTheme();
    this.isDark.set(isDarkMode);
  }
  protected readonly lastBoardId = signal<string>(
    (() => { try { return localStorage.getItem('tf-last-board') || 'demo'; } catch { return 'demo'; } })()
  );
  protected readonly presenceCount = signal<number>(0);

  protected get userName(): string {
    return this.auth.getDisplayName() || 'Usuario';
  }

  protected get userEmail(): string {
    return this.auth.getEmail() || '';
  }

  protected get userInitials(): string {
    const name = this.userName;
    if (name.includes(' ')) {
      const parts = name.split(' ');
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  get menuItems() {
    const board = this.lastBoardId();
    return [
      { label: 'Tableros', icon: 'pi pi-th-large', routerLink: ['/boards'] },
      { label: 'Chat', icon: 'pi pi-comments', routerLink: ['/boards', board, 'chat'] },
    ];
  }

  toggleSidebar() {
    this.sidebarVisible.update(v => !v);
  }

  constructor() {
    // Conectar socket globalmente al entrar al layout (app autenticada)
    this.socket.connect();
    // Mantener actualizado el último board si cambia en otra pestaña
    try {
      window.addEventListener('storage', (e) => {
        if (e.key === 'tf-last-board' && e.newValue) {
          this.lastBoardId.set(e.newValue);
        }
      });
    } catch {}

    // Escuchar presencia para el tablero activo (la suscripción funciona una vez que el socket entra en la room desde otras vistas)
    this.socket.on<string[]>('board:presence', (list) => {
      const count = Array.isArray(list) ? list.length : 0;
      this.presenceCount.set(count);
    });

    // Atajos de teclado globales
    document.addEventListener('keydown', (e) => {
      // 'T' para cambiar tema
      if (e.key === 't' || e.key === 'T') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        this.toggleTheme();
      }
      // 'M' para abrir/cerrar menú en móvil
      if ((e.key === 'm' || e.key === 'M') && window.innerWidth < 1024) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        this.toggleSidebar();
      }
    });
  }

  protected isActiveRoute(path: string): boolean {
    return this.router.url.startsWith(path);
  }

  private getInitialTheme(): boolean {
    try {
      const saved = localStorage.getItem('tf-theme');
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
        return true;
      }
    } catch {}
    return false;
  }

  toggleTheme() {
    const next = !this.isDark();
    this.isDark.set(next);
    if (next) {
      document.documentElement.classList.add('dark');
      try { localStorage.setItem('tf-theme', 'dark'); } catch {}
    } else {
      document.documentElement.classList.remove('dark');
      try { localStorage.setItem('tf-theme', 'light'); } catch {}
    }
  }

  logout() {
    this.auth.logout();
    this.sidebarVisible.set(false);
    this.router.navigate(['/login']);
  }
}
