/**
 * Componente para gestionar integraciones con repositorios Git (GitHub/GitLab/Bitbucket).
 * Permite conectar repositorios a tableros Kanban y configurar webhooks y mapeo de ramas.
 */
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TuiButton } from '@taiga-ui/core';
import { TuiTextfield } from '@taiga-ui/core';
import { TuiIcon } from '@taiga-ui/core';
import { TuiAlertService } from '@taiga-ui/core';
import { TuiBadge } from '@taiga-ui/kit';
import { API_BASE } from '../core/env';
import { AuthService } from '../core/auth.service';

/**
 * Interfaz que representa una integración con un repositorio Git.
 */
interface Integration {
  integrationId: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  repoOwner: string;
  repoName: string;
  branchMapping?: { branch: string; column: 'todo' | 'doing' | 'done' }[];
  autoCreateCards: boolean;
  autoCloseCards: boolean;
  createdAt: number;
  webhookUrl?: string;
}

/**
 * Interfaz para el mapeo de ramas en edición.
 */
interface BranchMappingEdit {
  branch: string;
  column: 'todo' | 'doing' | 'done';
}

/**
 * Interfaz que representa un tablero Kanban.
 */
interface Board {
  boardId: string;
  name?: string;
  owner?: string;
  members?: string[];
  updatedAt: number;
  todoCount?: number;
  doingCount?: number;
  doneCount?: number;
}

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TuiButton, TuiTextfield, TuiIcon, TuiBadge],
  template: `
  <div class="space-y-6 animate-in">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <tui-icon icon="tuiIconSettings" class="text-blue-600 dark:text-blue-400"></tui-icon>
          <span>Integraciones Git</span>
        </h1>
        <p class="text-sm text-gray-700 dark:text-gray-300 mt-1">Conecta repositorios Git con tus tableros Kanban y configura mapeo de ramas</p>
      </div>
      <button
        tuiButton
        type="button"
        appearance="primary"
        size="m"
        iconStart="tuiIconPlus"
        (click)="openGitHubDialog()"
      >
        Conectar GitHub
      </button>
    </div>

    <!-- Selector de Tablero -->
    @if (!boardId) {
      <div class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-xl shadow-md p-6">
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0">
            <div class="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg">
              <tui-icon icon="tuiIconGridLarge" class="text-2xl text-white"></tui-icon>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Selecciona un tablero</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Elige el tablero para el cual deseas gestionar las integraciones Git</p>
            @if (loadingBoards) {
              <div class="flex items-center gap-3 py-3">
                <div class="inline-block w-5 h-5 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-gray-700 dark:text-gray-300 font-medium">Cargando tableros...</p>
              </div>
            } @else if (boards.length === 0) {
              <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">No tienes tableros. Crea uno primero.</p>
                <a
                  [routerLink]="['/app/boards']"
                  tuiButton
                  type="button"
                  appearance="primary"
                  size="s"
                  iconStart="tuiIconPlus"
                >
                  Crear tablero
                </a>
              </div>
            } @else {
              <div class="space-y-2">
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tablero:</label>
                <select
                  [(ngModel)]="selectedBoardId"
                  (change)="selectBoard()"
                  class="w-full px-4 py-3 border-2 border-blue-300 dark:border-blue-600 rounded-xl bg-white dark:bg-gray-700 text-base font-medium text-gray-900 dark:text-gray-100 shadow-sm hover:border-blue-400 dark:hover:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200 cursor-pointer"
                >
                  <option value="" disabled class="text-gray-400 dark:text-gray-500">-- Selecciona un tablero --</option>
                  @for (board of boards; track board.boardId) {
                    <option [value]="board.boardId" class="py-2">
                      {{ board.name || 'Sin nombre' }}
                    </option>
                  }
                </select>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Selecciona un tablero para ver y gestionar sus integraciones</p>
              </div>
            }
          </div>
        </div>
      </div>
    }

    <!-- Tablero Seleccionado -->
    @if (boardId && selectedBoard) {
      <div class="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <tui-icon icon="tuiIconCheck" class="text-green-600 dark:text-green-400"></tui-icon>
          <div>
            <p class="text-sm font-semibold text-green-900 dark:text-green-100">Tablero seleccionado:</p>
            <p class="text-lg font-bold text-green-900 dark:text-green-100">{{ selectedBoard.name || 'Sin nombre' }}</p>
          </div>
        </div>
        <button
          tuiButton
          type="button"
          appearance="flat"
          size="xs"
          (click)="clearBoardSelection()"
          class="text-green-700 dark:text-green-300"
        >
          Cambiar tablero
        </button>
      </div>
    }

    <!-- Loading -->
    @if (loading) {
      <div class="flex items-center justify-center py-12">
        <div class="text-center space-y-3">
          <div class="inline-block w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-gray-700 dark:text-gray-300">Cargando integraciones...</p>
        </div>
      </div>
    }

    <!-- Error -->
    @if (error && !loading) {
      <div class="alert alert-error shadow-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
          <span class="text-red-800 dark:text-red-200 font-medium flex-1">{{ error }}</span>
          <button
            tuiButton
            type="button"
            appearance="flat"
            size="xs"
            (click)="loadIntegrations()"
            class="text-red-600 dark:text-red-400"
          >
            Reintentar
          </button>
        </div>
      </div>
    }

    <!-- Empty State -->
    @if (boardId && !loading && !error && integrations.length === 0) {
      <div class="text-center py-12">
        <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 mx-auto flex items-center justify-center mb-4">
          <tui-icon icon="tuiIconCode" class="text-4xl text-blue-600"></tui-icon>
        </div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No hay integraciones conectadas</h2>
        <p class="text-gray-700 dark:text-gray-300 mb-6">Conecta un repositorio de GitHub para crear tarjetas automáticamente desde commits y PRs</p>
        <button
          tuiButton
          type="button"
          appearance="primary"
          size="m"
          iconStart="tuiIconPlus"
          (click)="openGitHubDialog()"
        >
          Conectar mi primer repositorio
        </button>
      </div>
    }

    <!-- Mensaje cuando no hay tablero seleccionado -->
    @if (!boardId && !loadingBoards && boards.length > 0 && !error) {
      <div class="text-center py-12">
        <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 mx-auto flex items-center justify-center mb-4">
          <tui-icon icon="tuiIconGridLarge" class="text-4xl text-blue-600"></tui-icon>
        </div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Selecciona un tablero</h2>
        <p class="text-gray-700 dark:text-gray-300 mb-6">Selecciona un tablero de la lista de arriba para gestionar sus integraciones Git</p>
      </div>
    }

    <!-- Integrations List -->
    @if (boardId && !loading && integrations.length > 0) {
      <div class="grid grid-cols-1 gap-4">
        @for (integration of integrations; track integration.integrationId) {
          <div class="card bg-white dark:bg-gray-800 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-300 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-lg overflow-hidden">
            <div class="card-body p-5">
              <div class="flex items-start justify-between gap-4 mb-4">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <div class="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-xl font-bold shadow-lg flex-shrink-0">
                    @if (integration.provider === 'github') {
                      <tui-icon icon="tuiIconCode" class="text-white text-2xl"></tui-icon>
                    }
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1 truncate">
                      {{ integration.repoOwner }}/{{ integration.repoName }}
                    </h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      @if (integration.provider === 'github') {
                        <span tuiBadge class="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700 text-xs font-semibold mr-2">GitHub</span>
                      }
                      @if (integration.branchMapping && integration.branchMapping.length > 0) {
                        <span class="text-gray-600 dark:text-gray-400">{{ integration.branchMapping.length }} rama{{ integration.branchMapping.length > 1 ? 's' : '' }} mapeada{{ integration.branchMapping.length > 1 ? 's' : '' }}</span>
                      }
                    </p>
                  </div>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                  <button
                    tuiButton
                    type="button"
                    appearance="flat"
                    size="xs"
                    iconStart="tuiIconSettings"
                    (click)="openConfigDialog(integration)"
                    class="text-blue-600"
                    title="Configurar integración"
                  ></button>
                  <button
                    tuiButton
                    type="button"
                    appearance="flat"
                    size="xs"
                    iconStart="tuiIconTrash"
                    (click)="deleteIntegration(integration)"
                    class="text-red-600"
                    title="Eliminar integración"
                  ></button>
                </div>
              </div>
              
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-4">
                <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                  <span class="text-gray-600 dark:text-gray-400 font-medium">Auto-crear:</span>
                  <span [class.text-green-600]="integration.autoCreateCards" [class.dark:text-green-400]="integration.autoCreateCards" [class.text-gray-400]="!integration.autoCreateCards" [class.dark:text-gray-500]="!integration.autoCreateCards" class="font-semibold">
                    {{ integration.autoCreateCards ? 'Sí' : 'No' }}
                  </span>
                </div>
                <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                  <span class="text-gray-600 dark:text-gray-400 font-medium">Auto-cerrar:</span>
                  <span [class.text-green-600]="integration.autoCloseCards" [class.dark:text-green-400]="integration.autoCloseCards" [class.text-gray-400]="!integration.autoCloseCards" [class.dark:text-gray-500]="!integration.autoCloseCards" class="font-semibold">
                    {{ integration.autoCloseCards ? 'Sí' : 'No' }}
                  </span>
                </div>
                @if (integration.webhookUrl) {
                  <div class="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/30 rounded border border-green-200 dark:border-green-700">
                    <tui-icon icon="tuiIconCheck" class="text-green-600 dark:text-green-400 text-xs"></tui-icon>
                    <span class="text-green-800 dark:text-green-200 font-semibold text-xs">Webhook configurado</span>
                  </div>
                }
              </div>

              <!-- Branch Mappings Preview -->
              @if (integration.branchMapping && integration.branchMapping.length > 0) {
                <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Mapeo de ramas:</p>
                  <div class="flex flex-wrap gap-2">
                    @for (mapping of integration.branchMapping; track mapping.branch) {
                      <span tuiBadge 
                        [class.bg-blue-100]="mapping.column === 'todo'"
                        [class.bg-yellow-100]="mapping.column === 'doing'"
                        [class.bg-green-100]="mapping.column === 'done'"
                        [class.text-blue-800]="mapping.column === 'todo'"
                        [class.text-yellow-800]="mapping.column === 'doing'"
                        [class.text-green-800]="mapping.column === 'done'"
                        [class.border-blue-300]="mapping.column === 'todo'"
                        [class.border-yellow-300]="mapping.column === 'doing'"
                        [class.border-green-300]="mapping.column === 'done'"
                        class="text-xs font-semibold"
                      >
                        {{ mapping.branch }} → {{ getColumnName(mapping.column) }}
                      </span>
                    }
                  </div>
                </div>
              } @else {
                <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p class="text-sm text-gray-600 dark:text-gray-400 italic">No hay ramas mapeadas. Configura el mapeo para asignar ramas a columnas del Kanban.</p>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- GitHub Connection Dialog -->
    @if (githubDialogOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-in" (click)="githubDialogOpen = false; resetGitHubForm()">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-scale-in" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2 mb-4">
            <tui-icon icon="tuiIconCode" class="text-blue-600 dark:text-blue-400"></tui-icon>
            <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Conectar repositorio GitHub</h3>
          </div>

          <!-- Paso 1: Ingresar Token -->
          @if (step === 'token') {
            <div class="space-y-4">
              <div class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 text-sm text-gray-700 dark:text-gray-300">
                <p class="font-semibold text-gray-900 dark:text-gray-100 mb-1">⚠️ Requisitos:</p>
                <ul class="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                  <li>Necesitas un Personal Access Token de GitHub</li>
                  <li>El token debe tener permisos: <code class="bg-white dark:bg-gray-700 px-1 rounded text-gray-900 dark:text-gray-100">repo</code> y <code class="bg-white dark:bg-gray-700 px-1 rounded text-gray-900 dark:text-gray-100">admin:repo_hook</code></li>
                  <li>Genera uno en: <a href="https://github.com/settings/tokens" target="_blank" class="text-blue-600 dark:text-blue-400 underline">GitHub Settings → Tokens</a></li>
    </ul>
              </div>
              <div class="flex flex-col gap-2">
                <tui-textfield>
                  <label tuiLabel>Personal Access Token</label>
                  <input
                    tuiTextfield
                    type="password"
                    [(ngModel)]="githubToken"
                    placeholder="ghp_xxxxxxxxxxxxx"
                    class="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    (keydown.enter)="verifyTokenAndLoadRepos()"
                    autofocus
                  />
                </tui-textfield>
                <p class="text-xs text-gray-600 dark:text-gray-400">Solo necesitas ingresar el token. Buscaremos tus repositorios automáticamente.</p>
              </div>
              <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  tuiButton
                  type="button"
                  appearance="flat"
                  size="m"
                  (click)="githubDialogOpen = false; resetGitHubForm()"
                  class="text-gray-700 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  tuiButton
                  type="button"
                  appearance="primary"
                  size="m"
                  iconStart="tuiIconCheck"
                  (click)="verifyTokenAndLoadRepos()"
                  [disabled]="!githubToken.trim() || verifyingToken || loadingRepos"
                >
                  {{ verifyingToken || loadingRepos ? 'Verificando...' : 'Siguiente' }}
                </button>
              </div>
            </div>
          }

          <!-- Paso 2: Seleccionar Repositorio -->
          @if (step === 'select') {
            <div class="space-y-4">
              <!-- Advertencia si no hay tablero seleccionado -->
              @if (!boardId) {
                <div class="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                  <div class="flex items-start gap-3">
                    <tui-icon icon="tuiIconAlertCircle" class="text-yellow-600 text-xl flex-shrink-0 mt-0.5"></tui-icon>
                    <div class="flex-1">
                      <p class="font-semibold text-yellow-900 mb-1">Tablero requerido</p>
                      <p class="text-sm text-yellow-800 mb-3">Necesitas seleccionar un tablero antes de conectar el repositorio.</p>
                      <button
                        tuiButton
                        type="button"
                        appearance="flat"
                        size="xs"
                        (click)="githubDialogOpen = false"
                        class="text-yellow-700"
                      >
                        Seleccionar tablero primero
                      </button>
                    </div>
                  </div>
                </div>
              }
              
              @if (githubUser) {
                <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <img [src]="githubUser.avatar_url" [alt]="githubUser.login" class="w-10 h-10 rounded-full">
                  <div>
                    <p class="font-semibold text-gray-900 dark:text-gray-100">Autenticado como</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">{{ githubUser.login }}</p>
                  </div>
                </div>
              }

              @if (loadingRepos) {
                <div class="flex items-center justify-center py-8">
                  <div class="text-center space-y-3">
                    <div class="inline-block w-8 h-8 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <p class="text-sm text-gray-700 dark:text-gray-300">Cargando repositorios...</p>
                  </div>
                </div>
              }

              @if (!loadingRepos && githubRepos.length > 0) {
                <div class="space-y-2">
                  <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Selecciona un repositorio:</label>
                  <div class="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    @for (repo of githubRepos; track repo.full_name) {
                      <label class="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors">
                        <input
                          type="radio"
                          name="selectedRepo"
                          [value]="repo.full_name"
                          [(ngModel)]="selectedRepo"
                          class="w-4 h-4 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                        />
                        <div class="flex-1 min-w-0">
                          <p class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ repo.full_name }}</p>
                          <p class="text-xs text-gray-600 dark:text-gray-400">Rama por defecto: {{ repo.default_branch }}</p>
                        </div>
                        <a [href]="repo.html_url" target="_blank" rel="noopener noreferrer" (click)="$event.stopPropagation()" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                          <tui-icon icon="tuiIconCode" class="text-sm"></tui-icon>
                        </a>
                      </label>
                    }
                  </div>
                </div>
              }

              @if (!loadingRepos && githubRepos.length === 0) {
                <div class="text-center py-8">
                  <p class="text-sm text-gray-600 dark:text-gray-400">No se encontraron repositorios. Verifica que el token tenga los permisos necesarios.</p>
                </div>
              }

              <div class="flex justify-between gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  tuiButton
                  type="button"
                  appearance="flat"
                  size="m"
                  (click)="step = 'token'"
                  class="text-gray-700 dark:text-gray-300"
                >
                  ← Volver
                </button>
                <div class="flex gap-3">
                  <button
                    tuiButton
                    type="button"
                    appearance="flat"
                    size="m"
                    (click)="githubDialogOpen = false; resetGitHubForm()"
                    class="text-gray-700 dark:text-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    tuiButton
                    type="button"
                    appearance="primary"
                    size="m"
                    iconStart="tuiIconCheck"
                    (click)="connectGitHub()"
                    [disabled]="!selectedRepo || connecting || !boardId"
                    [title]="!boardId ? 'Selecciona un tablero primero' : ''"
                  >
                    {{ connecting ? 'Conectando...' : 'Conectar' }}
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Configuration Dialog -->
    @if (configDialogOpen && selectedIntegration) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-in" (click)="configDialogOpen = false">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto animate-scale-in" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2 mb-4">
            <tui-icon icon="tuiIconSettings" class="text-blue-600 dark:text-blue-400"></tui-icon>
            <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Configurar integración</h3>
          </div>
          <div class="space-y-6">
            <!-- Repository Info -->
            <div class="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Repositorio:</p>
              <p class="text-lg font-bold text-gray-900 dark:text-gray-100">{{ selectedIntegration.repoOwner }}/{{ selectedIntegration.repoName }}</p>
            </div>

            <!-- Auto Create/Close Settings -->
            <div class="space-y-4">
              <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Configuración automática</h4>
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                <div>
                  <p class="font-medium text-gray-900 dark:text-gray-100">Crear tarjetas automáticamente</p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">Crea tarjetas desde commits y PRs automáticamente</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" [(ngModel)]="configAutoCreate" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                <div>
                  <p class="font-medium text-gray-900 dark:text-gray-100">Cerrar tarjetas automáticamente</p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">Mueve tarjetas a "Hecho" cuando CI/CD sea exitoso</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" [(ngModel)]="configAutoClose" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            <!-- Branch Mapping -->
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Mapeo de ramas a columnas</h4>
                <button
                  tuiButton
                  type="button"
                  appearance="flat"
                  size="xs"
                  iconStart="tuiIconRefresh"
                  (click)="loadBranches()"
                  [disabled]="loadingBranches"
                  class="text-blue-600 dark:text-blue-400"
                >
                  {{ loadingBranches ? 'Cargando...' : 'Actualizar ramas' }}
                </button>
              </div>
              <div class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300">
                <p class="font-semibold text-blue-900 dark:text-blue-100 mb-1">💡 ¿Qué es esto?</p>
                <p>Asigna ramas del repositorio a columnas del Kanban. Los commits en ramas mapeadas crearán tarjetas en la columna correspondiente.</p>
              </div>
              
              @if (availableBranches.length === 0 && !loadingBranches) {
                <p class="text-sm text-gray-600 dark:text-gray-400 italic">Carga las ramas del repositorio para configurar el mapeo</p>
              }

              @if (loadingBranches) {
                <div class="flex items-center justify-center py-4">
                  <div class="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              }

              @if (availableBranches.length > 0) {
                <div class="space-y-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  @for (branch of availableBranches; track branch) {
                    <div class="flex items-center gap-3 p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 transition-colors">
                      <span class="font-medium text-gray-900 dark:text-gray-100 flex-1">{{ branch }}</span>
                      <select
                        [ngModel]="getBranchMapping(branch) || ''"
                        (ngModelChange)="setBranchMapping(branch, $event)"
                        class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">Sin mapear</option>
                        <option value="todo">Por hacer</option>
                        <option value="doing">En progreso</option>
                        <option value="done">Hecho</option>
                      </select>
                    </div>
                  }
                </div>
              }

              @if (branchMappingsList.length > 0) {
                <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Mapeos configurados:</p>
                  <div class="flex flex-wrap gap-2">
                    @for (mapping of branchMappingsList; track mapping.branch) {
                      <span tuiBadge 
                        [class.bg-blue-100]="mapping.column === 'todo'"
                        [class.bg-yellow-100]="mapping.column === 'doing'"
                        [class.bg-green-100]="mapping.column === 'done'"
                        [class.text-blue-800]="mapping.column === 'todo'"
                        [class.text-yellow-800]="mapping.column === 'doing'"
                        [class.text-green-800]="mapping.column === 'done'"
                        class="text-xs font-semibold"
                      >
                        {{ mapping.branch }} → {{ getColumnName(mapping.column) }}
                        <button
                          type="button"
                          (click)="removeBranchMapping(mapping.branch)"
                          class="ml-1 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          ×
                        </button>
                      </span>
                    }
                  </div>
                </div>
              }
            </div>

            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                tuiButton
                type="button"
                appearance="flat"
                size="m"
                (click)="configDialogOpen = false; resetConfig()"
                class="text-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                tuiButton
                type="button"
                appearance="primary"
                size="m"
                iconStart="tuiIconCheck"
                (click)="saveConfig()"
                [disabled]="savingConfig"
              >
                {{ savingConfig ? 'Guardando...' : 'Guardar cambios' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  </div>
  `
})
export class IntegrationsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(TuiAlertService);

  boardId: string | null = null;
  selectedBoard: Board | null = null;
  boards: Board[] = [];
  loadingBoards = false;
  selectedBoardId: string = '';
  integrations: Integration[] = [];
  loading = false;
  error: string | null = null;

  // GitHub dialog state
  githubDialogOpen = false;
  githubToken = '';
  githubUser: { login: string; avatar_url: string } | null = null;
  githubRepos: Array<{ owner: string; name: string; full_name: string; default_branch: string; html_url: string }> = [];
  selectedRepo: string = '';
  loadingRepos = false;
  verifyingToken = false;
  connecting = false;
  step: 'token' | 'select' = 'token';

  // Configuration dialog state
  configDialogOpen = false;
  selectedIntegration: Integration | null = null;
  configAutoCreate = true;
  configAutoClose = true;
  availableBranches: string[] = [];
  loadingBranches = false;
  branchMappings: Record<string, 'todo' | 'doing' | 'done' | ''> = {};
  branchMappingsList: BranchMappingEdit[] = [];
  savingConfig = false;

  ngOnInit(): void {
    // Intentar obtener boardId de query params primero
    this.route.queryParams.subscribe(qp => {
      const queryBoardId = qp['boardId'] || null;
      if (queryBoardId && queryBoardId !== this.boardId) {
        this.boardId = queryBoardId;
        this.selectedBoardId = queryBoardId;
        this.loadBoardDetails();
        this.loadIntegrations();
      } else if (!queryBoardId && !this.boardId) {
        // Si no hay boardId en query params, cargar lista de tableros para selección
        this.loadBoards();
      }
    });
  }

  /**
   * Carga la lista de tableros disponibles del usuario.
   */
  async loadBoards(): Promise<void> {
    this.loadingBoards = true;
    try {
      const email = this.auth.getEmail();
      if (!email) {
        this.error = 'No hay usuario autenticado';
        return;
      }
      
      const res = await fetch(`${API_BASE}/api/boards?owner=${encodeURIComponent(email)}`, {
        credentials: 'include',
        headers: this.getAuthHeaders()
      });
      
      if (!res.ok) {
        throw new Error('Error al cargar tableros');
      }
      
      const data = await res.json() as Board[];
      this.boards = data;
      
      // Si no hay boardId pero hay tableros, no mostrar error todavía
      if (!this.boardId && this.boards.length > 0) {
        this.error = null;
      } else if (!this.boardId && this.boards.length === 0) {
        this.error = 'No tienes tableros. Crea uno primero.';
      }
    } catch (err: any) {
      this.error = err.message || 'Error al cargar los tableros';
      console.error('Error loading boards:', err);
    } finally {
      this.loadingBoards = false;
    }
  }

  /**
   * Carga los detalles del tablero seleccionado.
   */
  async loadBoardDetails(): Promise<void> {
    if (!this.boardId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}`, {
        credentials: 'include',
        headers: this.getAuthHeaders()
      });
      
      if (res.ok) {
        const boardData = await res.json() as { boardId: string; name?: string; owner?: string; members?: string[] };
        // Mapear a la interfaz Board con valores por defecto
        this.selectedBoard = {
          boardId: boardData.boardId,
          name: boardData.name,
          owner: boardData.owner,
          members: boardData.members || [],
          updatedAt: Date.now(), // Valor por defecto ya que el endpoint no lo devuelve
          todoCount: 0,
          doingCount: 0,
          doneCount: 0
        };
      } else {
        // Si no se encuentra el tablero, limpiar selección
        this.clearBoardSelection();
      }
    } catch (err: any) {
      console.error('Error loading board details:', err);
      // En caso de error, limpiar selección
      this.clearBoardSelection();
    }
  }

  /**
   * Selecciona un tablero y actualiza la URL.
   */
  async selectBoard(): Promise<void> {
    if (!this.selectedBoardId) {
      this.clearBoardSelection();
      return;
    }
    
    this.boardId = this.selectedBoardId;
    
    // Actualizar la URL con el boardId
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { boardId: this.boardId },
      queryParamsHandling: 'merge'
    });
    
    // Cargar detalles del tablero y sus integraciones
    await this.loadBoardDetails();
    await this.loadIntegrations();
  }

  /**
   * Limpia la selección del tablero.
   */
  clearBoardSelection(): void {
    this.boardId = null;
    this.selectedBoard = null;
    this.selectedBoardId = '';
    this.integrations = [];
    this.error = null;
    
    // Actualizar la URL para remover el boardId
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      queryParamsHandling: 'merge'
    });
    
    // Recargar lista de tableros
    this.loadBoards();
  }

  /**
   * Obtiene los headers de autenticación para las peticiones fetch.
   */
  private getAuthHeaders(): HeadersInit {
    const email = this.auth.getEmail();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (email) {
      headers['X-User-Email'] = email;
    }
    return headers;
  }

  /**
   * Obtiene el nombre legible de una columna.
   */
  getColumnName(column: 'todo' | 'doing' | 'done'): string {
    const names = { todo: 'Por hacer', doing: 'En progreso', done: 'Hecho' };
    return names[column];
  }

  /**
   * Carga las integraciones del tablero actual.
   */
  async loadIntegrations(): Promise<void> {
    if (!this.boardId) {
      this.error = 'No se ha seleccionado un tablero';
      return;
    }
    
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/integrations`, {
        credentials: 'include',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) {
        throw new Error('Error al cargar integraciones');
      }
      const data = await res.json() as Integration[];
      this.integrations = data;
    } catch (err: any) {
      this.error = err.message || 'Error al cargar las integraciones';
      console.error('Error loading integrations:', err);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Abre el diálogo para conectar un repositorio de GitHub.
   */
  openGitHubDialog(): void {
    this.githubDialogOpen = true;
    this.resetGitHubForm();
    this.step = 'token';
  }

  /**
   * Resetea el formulario de GitHub.
   */
  resetGitHubForm(): void {
    this.githubToken = '';
    this.githubUser = null;
    this.githubRepos = [];
    this.selectedRepo = '';
    this.loadingRepos = false;
    this.verifyingToken = false;
    this.connecting = false;
    this.step = 'token';
  }

  /**
   * Verifica el token y carga los repositorios disponibles.
   */
  async verifyTokenAndLoadRepos(): Promise<void> {
    if (!this.githubToken.trim()) {
      this.alerts.open('Ingresa un token de acceso', { label: 'Error', appearance: 'negative' }).subscribe();
      return;
    }

    this.verifyingToken = true;
    try {
      // Verificar token
      const verifyRes = await fetch(`${API_BASE}/api/integrations/github/verify-token`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ accessToken: this.githubToken.trim() })
      });

      if (!verifyRes.ok) {
        const error = await verifyRes.json().catch(() => ({ message: 'Token inválido' }));
        throw new Error(error.message || 'Token inválido. Verifica que tenga los permisos necesarios (repo, admin:repo_hook)');
      }

      const verifyData = await verifyRes.json() as { user: { login: string; avatar_url: string } };
      this.githubUser = verifyData.user;

      // Cargar repositorios
      this.loadingRepos = true;
      const reposRes = await fetch(`${API_BASE}/api/integrations/github/repos`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ accessToken: this.githubToken.trim(), type: 'all' })
      });

      if (!reposRes.ok) {
        throw new Error('Error al cargar repositorios');
      }

      const reposData = await reposRes.json() as { repos: Array<{ owner: string; name: string; full_name: string; default_branch: string; html_url: string }> };
      this.githubRepos = reposData.repos || [];

      if (this.githubRepos.length === 0) {
        this.alerts.open('No se encontraron repositorios', { label: 'Advertencia', appearance: 'warning' }).subscribe();
      } else {
        this.step = 'select';
        this.alerts.open(`${this.githubRepos.length} repositorio${this.githubRepos.length > 1 ? 's' : ''} encontrado${this.githubRepos.length > 1 ? 's' : ''}`, { label: 'Éxito', appearance: 'success' }).subscribe();
      }
    } catch (err: any) {
      this.alerts.open(err.message || 'Error al verificar el token', { label: 'Error', appearance: 'negative' }).subscribe();
      this.resetGitHubForm();
    } finally {
      this.verifyingToken = false;
      this.loadingRepos = false;
    }
  }

  /**
   * Conecta un repositorio de GitHub al tablero actual.
   */
  async connectGitHub(): Promise<void> {
    if (!this.selectedRepo || !this.githubToken.trim()) {
      this.alerts.open('Selecciona un repositorio', { label: 'Error', appearance: 'negative' }).subscribe();
      return;
    }
    
    if (!this.boardId) {
      this.alerts.open('Debes seleccionar un tablero antes de conectar el repositorio. Cierra este diálogo y selecciona un tablero arriba.', { label: 'Tablero requerido', appearance: 'warning' }).subscribe();
      return;
    }

    this.connecting = true;
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/integrations/github`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          fullName: this.selectedRepo,
          accessToken: this.githubToken.trim()
        })
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Error al conectar el repositorio' }));
        const errorMessage = error.message || 'Error al conectar el repositorio';
        
        // Mensajes más descriptivos según el tipo de error
        if (error.error === 'webhook_creation_failed') {
          let detailedMessage = errorMessage;
          
          // Agregar consejos de solución según el tipo de error
          if (errorMessage.includes('Permisos insuficientes') || errorMessage.includes('admin:repo_hook')) {
            detailedMessage += '\n\n💡 Solución:\n1. Ve a GitHub Settings → Developer settings → Personal access tokens\n2. Edita tu token o crea uno nuevo\n3. Asegúrate de seleccionar el permiso "admin:repo_hook"\n4. También necesitas el permiso "repo"';
          } else if (errorMessage.includes('URL del webhook inválida') || errorMessage.includes('422')) {
            detailedMessage += '\n\n💡 Posible causa: El backend no está accesible públicamente o la URL del webhook es incorrecta.';
          } else if (errorMessage.includes('404')) {
            detailedMessage += '\n\n💡 Verifica que tengas acceso al repositorio y que el token tenga permisos suficientes.';
          }
          
          throw new Error(detailedMessage);
        }
        
        throw new Error(errorMessage);
      }

      this.alerts.open('Repositorio conectado exitosamente', { label: 'Éxito', appearance: 'success' }).subscribe();
      this.githubDialogOpen = false;
      this.resetGitHubForm();
      await this.loadIntegrations();
    } catch (err: any) {
      this.alerts.open(err.message || 'Error al conectar el repositorio', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Abre el diálogo de configuración para una integración.
   */
  openConfigDialog(integration: Integration): void {
    this.selectedIntegration = integration;
    this.configAutoCreate = integration.autoCreateCards;
    this.configAutoClose = integration.autoCloseCards;
    this.branchMappings = {};
    this.branchMappingsList = [];
    
    // Inicializar mapeos existentes
    if (integration.branchMapping) {
      for (const mapping of integration.branchMapping) {
        this.branchMappings[mapping.branch] = mapping.column;
        this.branchMappingsList.push({ ...mapping });
      }
    }
    
    this.configDialogOpen = true;
    this.loadBranches();
  }

  /**
   * Resetea el estado del diálogo de configuración.
   */
  resetConfig(): void {
    this.selectedIntegration = null;
    this.configAutoCreate = true;
    this.configAutoClose = true;
    this.availableBranches = [];
    this.branchMappings = {};
    this.branchMappingsList = [];
  }

  /**
   * Carga las ramas disponibles del repositorio.
   */
  async loadBranches(): Promise<void> {
    if (!this.selectedIntegration) return;
    
    this.loadingBranches = true;
    try {
      const res = await fetch(`${API_BASE}/api/integrations/${encodeURIComponent(this.selectedIntegration.integrationId)}/branches`, {
        credentials: 'include',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) {
        throw new Error('Error al cargar ramas');
      }
      const data = await res.json() as { branches: string[] };
      this.availableBranches = data.branches || [];
      
      // Sincronizar branchMappings con branchMappingsList después de cargar las ramas
      // Esto asegura que los valores se muestren correctamente en los selects
      for (const branch of this.availableBranches) {
        const existing = this.branchMappingsList.find(m => m.branch === branch);
        if (existing) {
          // Mantener sincronizado con branchMappings para compatibilidad
          this.branchMappings[branch] = existing.column;
        }
      }
    } catch (err: any) {
      this.alerts.open('Error al cargar las ramas', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.loadingBranches = false;
    }
  }

  /**
   * Obtiene el mapeo actual de una rama.
   */
  getBranchMapping(branch: string): 'todo' | 'doing' | 'done' | null {
    const mapping = this.branchMappingsList.find(m => m.branch === branch);
    return mapping ? mapping.column : null;
  }

  /**
   * Establece el mapeo de una rama a una columna.
   */
  setBranchMapping(branch: string, column: string | null): void {
    // Validar que la columna sea válida
    if (column && (column === 'todo' || column === 'doing' || column === 'done')) {
      const validColumn = column as 'todo' | 'doing' | 'done';
      // Actualizar o agregar mapeo
      const existingIndex = this.branchMappingsList.findIndex(m => m.branch === branch);
      if (existingIndex >= 0) {
        this.branchMappingsList[existingIndex].column = validColumn;
      } else {
        this.branchMappingsList.push({ branch, column: validColumn });
      }
      // Mantener sincronizado con branchMappings para compatibilidad
      this.branchMappings[branch] = validColumn;
    } else {
      // Remover mapeo (columna vacía o null)
      this.branchMappingsList = this.branchMappingsList.filter(m => m.branch !== branch);
      delete this.branchMappings[branch];
    }
  }

  /**
   * Elimina el mapeo de una rama.
   */
  removeBranchMapping(branch: string): void {
    delete this.branchMappings[branch];
    this.branchMappingsList = this.branchMappingsList.filter(m => m.branch !== branch);
  }

  /**
   * Guarda la configuración de la integración.
   */
  async saveConfig(): Promise<void> {
    if (!this.selectedIntegration) return;
    
    this.savingConfig = true;
    try {
      // Actualizar configuración (autoCreateCards, autoCloseCards)
      const configRes = await fetch(`${API_BASE}/api/integrations/${encodeURIComponent(this.selectedIntegration.integrationId)}/config`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          autoCreateCards: this.configAutoCreate,
          autoCloseCards: this.configAutoClose
        })
      });

      if (!configRes.ok) {
        const errorData = await configRes.json().catch(() => ({ message: 'Error al actualizar configuración' }));
        throw new Error(errorData.message || 'Error al actualizar configuración');
      }

      // Actualizar mapeo de ramas
      const mappingRes = await fetch(`${API_BASE}/api/integrations/${encodeURIComponent(this.selectedIntegration.integrationId)}/branch-mapping`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          branchMapping: this.branchMappingsList
        })
      });

      if (!mappingRes.ok) {
        const errorData = await mappingRes.json().catch(() => ({ message: 'Error al actualizar mapeo de ramas' }));
        const errorMessage = errorData.message || 'Error al actualizar mapeo de ramas';
        
        // Si el error es de autorización, dar un mensaje más claro
        if (mappingRes.status === 401 || mappingRes.status === 403) {
          throw new Error('No tienes permisos para modificar esta integración. Asegúrate de ser el dueño del tablero.');
        }
        
        throw new Error(errorMessage);
      }

      this.alerts.open('Configuración guardada exitosamente', { label: 'Éxito', appearance: 'success' }).subscribe();
      this.configDialogOpen = false;
      this.resetConfig();
      await this.loadIntegrations();
    } catch (err: any) {
      console.error('[Integrations] Error al guardar configuración:', err);
      this.alerts.open(err.message || 'Error al guardar la configuración', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.savingConfig = false;
    }
  }

  /**
   * Elimina una integración.
   */
  async deleteIntegration(integration: Integration): Promise<void> {
    if (!confirm(`¿Estás seguro de eliminar la integración con ${integration.repoOwner}/${integration.repoName}?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/integrations/${encodeURIComponent(integration.integrationId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: this.getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error('Error al eliminar la integración');
      }

      this.alerts.open('Integración eliminada', { label: 'Éxito', appearance: 'success' }).subscribe();
      await this.loadIntegrations();
    } catch (err: any) {
      this.alerts.open('Error al eliminar la integración', { label: 'Error', appearance: 'negative' }).subscribe();
    }
  }
}
