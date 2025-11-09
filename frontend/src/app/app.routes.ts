/**
 * Configuración de rutas de la aplicación Angular.
 * 
 * La aplicación usa lazy loading para todos los componentes para mejorar el rendimiento.
 * Todas las rutas bajo /app requieren autenticación mediante authGuard.
 */
import { Routes, CanActivateFn } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { lastBoardRedirectGuard } from './core/last-board-redirect.guard';

export const routes: Routes = [
  // Ruta raíz - Página de inicio pública
  {
    path: '',
    loadComponent: () => import('./home/home.component').then(m => m.HomeComponent)
  },
  // Rutas públicas de autenticación
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./register/register.component').then(m => m.RegisterComponent)
  },
  // Rutas protegidas de la aplicación
  {
    path: 'app',
    loadComponent: () => import('./layout').then(m => m.LayoutComponent),
    canActivate: [authGuard as CanActivateFn],
    children: [
      // Redirigir /app a /app/boards
      {
        path: '',
        redirectTo: 'boards',
        pathMatch: 'full'
      },
      // Lista de tableros del usuario
      {
        path: 'boards',
        loadComponent: () => import('./boards/boards-list.component').then(m => m.BoardsListComponent),
        canActivate: [lastBoardRedirectGuard as CanActivateFn]
      },
      // Tablero Kanban específico
      {
        path: 'boards/:id',
        loadComponent: () => import('./kanban/kanban-board-dnd.component').then(m => m.KanbanBoardDndComponent)
      },
      // Chat del tablero
      {
        path: 'boards/:id/chat',
        loadComponent: () => import('./chat/chat.component').then(m => m.ChatComponent)
      },
      // Configuración e integraciones
      {
        path: 'settings/integrations',
        loadComponent: () => import('./settings/integrations.component').then(m => m.IntegrationsComponent)
      }
    ]
  },
  // Ruta catch-all: redirigir rutas no encontradas a la página de inicio
  {
    path: '**',
    redirectTo: '/'
  }
];
