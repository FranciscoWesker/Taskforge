import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TuiButton } from '@taiga-ui/core';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, TuiButton],
  template: `
  <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 animate-in">
    <!-- Navigation Header -->
    <nav class="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-lg">
              TF
            </div>
            <span class="text-xl font-bold text-gray-900">TaskForge</span>
          </div>
          <div class="flex items-center gap-3">
            @if (!auth.isAuthenticated()) {
              <a routerLink="/login" tuiButton appearance="flat" size="s" class="hover-lift">
                Iniciar sesión
              </a>
              <a routerLink="/register" tuiButton appearance="primary" size="s" class="hover-glow">
                Crear cuenta
              </a>
            } @else {
              <a routerLink="/app" tuiButton appearance="primary" size="s" class="hover-glow">
                Ir a la app
              </a>
            }
          </div>
        </div>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="relative overflow-hidden py-20 sm:py-32">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center space-y-8 animate-slide-up">
          <h1 class="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
            Organiza tu trabajo con
            <span class="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              TaskForge
            </span>
          </h1>
          <p class="text-xl sm:text-2xl text-gray-700 max-w-3xl mx-auto">
            La herramienta perfecta para gestionar proyectos con <span class="font-semibold text-purple-600">Inteligencia Artificial</span>, tableros Kanban y comunicación en tiempo real
          </p>
          <div class="flex items-center justify-center gap-2 pt-2">
            <span class="px-3 py-1 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 rounded-full text-sm font-semibold border border-purple-200">
              ✨ Con IA Generativa
            </span>
          </div>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            @if (!auth.isAuthenticated()) {
              <a routerLink="/register" tuiButton appearance="primary" size="l" class="shadow-xl hover-glow animate-scale-in">
                Comenzar gratis
              </a>
              <a routerLink="/login" tuiButton appearance="outline" size="l" class="hover-lift">
                Ya tengo cuenta
              </a>
            } @else {
              <a routerLink="/app" tuiButton appearance="primary" size="l" class="shadow-xl hover-glow">
                Ir a la aplicación
              </a>
            }
          </div>
        </div>
      </div>
    </section>

    <!-- AI Features Highlight Section -->
    <section class="py-20 bg-gradient-to-br from-purple-50 via-blue-50 to-purple-50 border-y border-purple-100">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12 animate-slide-up">
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full mb-6 text-sm font-semibold shadow-lg">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
            NUEVO: Inteligencia Artificial Integrada
          </div>
          <h2 class="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Asistente IA que hace tu trabajo más inteligente
          </h2>
          <p class="text-xl text-gray-700 max-w-3xl mx-auto mb-8">
            Potenciado por Google Gemini 2.0 Flash. Automatiza tareas repetitivas, detecta problemas antes de que ocurran y mejora la calidad de tus proyectos.
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <!-- AI Feature 1: Dependency Detection -->
          <div class="bg-white rounded-xl p-6 shadow-lg border-2 border-purple-200 hover-elevate">
            <div class="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center mb-4">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
              </svg>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">Detección de Dependencias</h3>
            <p class="text-gray-600 text-sm">
              La IA identifica automáticamente qué tareas dependen de otras, evitando trabajar en tareas bloqueadas.
            </p>
          </div>

          <!-- AI Feature 2: Duplicate Detection -->
          <div class="bg-white rounded-xl p-6 shadow-lg border-2 border-purple-200 hover-elevate">
            <div class="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-white flex items-center justify-center mb-4">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">Detección de Duplicados</h3>
            <p class="text-gray-600 text-sm">
              Encuentra tareas similares o duplicadas antes de crearlas, evitando trabajo redundante.
            </p>
          </div>

          <!-- AI Feature 3: Intelligent Checklists -->
          <div class="bg-white rounded-xl p-6 shadow-lg border-2 border-purple-200 hover-elevate">
            <div class="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center mb-4">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">Checklists Inteligentes</h3>
            <p class="text-gray-600 text-sm">
              Genera automáticamente checklists específicos basados en el tipo de tarea, asegurando que no olvides pasos importantes.
            </p>
          </div>

          <!-- AI Feature 4: Description Improvement -->
          <div class="bg-white rounded-xl p-6 shadow-lg border-2 border-purple-200 hover-elevate">
            <div class="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center mb-4">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">Mejora Automática de Descripciones</h3>
            <p class="text-gray-600 text-sm">
              La IA mejora tus descripciones identificando qué falta y agregando información crítica automáticamente.
            </p>
          </div>

          <!-- AI Feature 5: Bottleneck Detection -->
          <div class="bg-white rounded-xl p-6 shadow-lg border-2 border-purple-200 hover-elevate">
            <div class="h-10 w-10 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 text-white flex items-center justify-center mb-4">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">Detección de Cuellos de Botella</h3>
            <p class="text-gray-600 text-sm">
              Identifica automáticamente tareas estancadas y sugiere acciones específicas para desbloquearlas.
            </p>
          </div>

          <!-- AI Feature 6: Task Analysis -->
          <div class="bg-white rounded-xl p-6 shadow-lg border-2 border-purple-200 hover-elevate">
            <div class="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white flex items-center justify-center mb-4">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">Análisis Inteligente de Tareas</h3>
            <p class="text-gray-600 text-sm">
              Obtén análisis críticos que identifican información faltante y sugiere mejoras específicas para cada tarea.
            </p>
          </div>
        </div>

        <div class="text-center">
          <p class="text-gray-600 mb-4">✨ Todo impulsado por <span class="font-semibold text-purple-600">Google Gemini 2.0 Flash</span></p>
          <a routerLink="/app" tuiButton appearance="primary" size="m" class="hover-glow">
            Probar funcionalidades de IA
          </a>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="py-20 bg-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16 animate-slide-up">
          <h2 class="text-4xl font-bold text-gray-900 mb-4">Características principales</h2>
          <p class="text-xl text-gray-700 max-w-2xl mx-auto">
            Todo lo que necesitas para gestionar tus proyectos eficientemente
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <!-- Feature 1: Kanban -->
          <div class="card bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 shadow-lg hover-elevate animate-slide-up">
            <div class="card-body p-6">
              <div class="h-12 w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-4 shadow-md">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 class="text-xl font-bold text-gray-900 mb-2">Tableros Kanban</h3>
              <p class="text-gray-700">
                Organiza tus tareas con tableros Kanban interactivos. Drag & drop intuitivo, límites WIP configurables, compartir tableros y sincronización en tiempo real.
              </p>
            </div>
          </div>

          <!-- Feature 2: Chat -->
          <div class="card bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 shadow-lg hover-elevate animate-slide-up">
            <div class="card-body p-6">
              <div class="h-12 w-12 rounded-xl bg-purple-600 text-white flex items-center justify-center mb-4 shadow-md">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 class="text-xl font-bold text-gray-900 mb-2">Chat en tiempo real</h3>
              <p class="text-gray-700">
                Comunícate con tu equipo mediante chat por tablero. Historial persistente, presencia de usuarios e indicadores de escritura en vivo.
              </p>
            </div>
          </div>

          <!-- Feature 3: GitHub Integration -->
          <div class="card bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 shadow-lg hover-elevate animate-slide-up">
            <div class="card-body p-6">
              <div class="h-12 w-12 rounded-xl bg-orange-600 text-white flex items-center justify-center mb-4 shadow-md">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"/>
                </svg>
              </div>
              <h3 class="text-xl font-bold text-gray-900 mb-2">Integración con GitHub</h3>
              <p class="text-gray-700">
                Conecta tus repositorios GitHub y sincroniza automáticamente commits, pull requests y branches. Mapea ramas a columnas Kanban y visualiza el estado CI/CD en tiempo real.
              </p>
            </div>
          </div>

          <!-- Feature 4: Colaboración -->
          <div class="card bg-gradient-to-br from-green-50 to-green-100 border border-green-200 shadow-lg hover-elevate animate-slide-up">
            <div class="card-body p-6">
              <div class="h-12 w-12 rounded-xl bg-green-600 text-white flex items-center justify-center mb-4 shadow-md">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 class="text-xl font-bold text-gray-900 mb-2">Colaboración en vivo</h3>
              <p class="text-gray-700">
                Comparte tableros con tu equipo y trabaja juntos con sincronización instantánea. Todos los cambios se reflejan en tiempo real para mantener a todos alineados.
              </p>
            </div>
          </div>

          <!-- Feature 5: Firebase Auth -->
          <div class="card bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 shadow-lg hover-elevate animate-slide-up">
            <div class="card-body p-6">
              <div class="h-12 w-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-4 shadow-md">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 class="text-xl font-bold text-gray-900 mb-2">Autenticación Segura</h3>
              <p class="text-gray-700">
                Inicio de sesión seguro con Firebase. Soporta autenticación por email/password y Google OAuth. Gestión de sesiones persistente y segura.
              </p>
            </div>
          </div>

          <!-- Feature 6: UI Moderna -->
          <div class="card bg-gradient-to-br from-pink-50 to-pink-100 border border-pink-200 shadow-lg hover-elevate animate-slide-up">
            <div class="card-body p-6">
              <div class="h-12 w-12 rounded-xl bg-pink-600 text-white flex items-center justify-center mb-4 shadow-md">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <h3 class="text-xl font-bold text-gray-900 mb-2">UI Moderna</h3>
              <p class="text-gray-700">
                Interfaz construida con Taiga UI y Tailwind CSS. Diseño responsive, animaciones suaves y microinteracciones para una experiencia de usuario excepcional.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white animate-slide-up">
        <h2 class="text-4xl font-bold mb-4">¿Listo para comenzar?</h2>
        <p class="text-xl mb-8 text-blue-100">
          Únete a TaskForge hoy y transforma la forma en que gestionas tus proyectos
        </p>
        @if (!auth.isAuthenticated()) {
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a routerLink="/register" tuiButton appearance="primary" size="l" class="bg-white text-blue-600 border-0 shadow-xl hover-glow">
              Crear cuenta gratis
            </a>
            <a routerLink="/login" tuiButton appearance="outline" size="l" class="border-2 border-white text-white hover:bg-white hover:text-blue-600 hover-lift">
              Iniciar sesión
            </a>
          </div>
        } @else {
          <a routerLink="/app" tuiButton appearance="primary" size="l" class="bg-white text-blue-600 border-0 shadow-xl hover-glow">
            Ir a la aplicación
          </a>
        }
      </div>
    </section>

    <!-- Footer -->
    <footer class="bg-gray-900 text-gray-400 py-12">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <div class="flex items-center justify-center gap-3 mb-4">
            <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-sm font-bold">
              TF
            </div>
            <span class="text-lg font-bold text-white">TaskForge</span>
          </div>
          <p class="text-sm">© 2025 TaskForge. Organiza tu trabajo, colabora mejor.</p>
        </div>
      </div>
    </footer>
  </div>
  `
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);
}

