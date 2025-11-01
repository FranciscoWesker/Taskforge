/**
 * Componente del tablero Kanban con drag & drop, actualizaciones en tiempo real y gestión de tareas.
 * Optimizado con OnPush change detection para mejor rendimiento.
 */
import { Component, HostListener, OnDestroy, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { SocketService } from '../core/socket.service';
import { AuthService } from '../core/auth.service';
import { API_BASE } from '../core/env';
import { TuiButton } from '@taiga-ui/core';
import { TuiTextfield } from '@taiga-ui/core';
import { TuiDialogService } from '@taiga-ui/core';
import { TuiAlertService } from '@taiga-ui/core';
import { TuiIcon } from '@taiga-ui/core';
import { TuiBadge } from '@taiga-ui/kit';

/**
 * Interfaz que representa una tarjeta Kanban.
 * Puede tener metadata adicional para integraciones Git (commits, PRs, branches).
 */
interface TaskReference {
    type: 'commit' | 'pull_request' | 'comment';
    sha?: string;
    number?: number;
    url?: string;
    message?: string;
    title?: string;
    context?: string;
    timestamp?: number;
}

interface KanbanCard {
    id: string;
    title: string;
    description?: string;
    createdAt?: number;
    updatedAt?: number;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    labels?: string[];
    assignee?: string;
    metadata?: {
        type?: 'commit' | 'pull_request' | 'branch';
        sha?: string;
        branch?: string;
        number?: number;
        state?: string;
        url?: string;
        ciStatus?: {
            state: 'pending' | 'success' | 'failure' | 'error' | 'cancelled';
            context: string;
            description: string;
            target_url: string | null;
        };
        referencedIn?: TaskReference[];
    };
}

@Component({
    selector: 'app-kanban-board-dnd',
    standalone: true,
    imports: [CommonModule, FormsModule, DragDropModule, TuiButton, TuiTextfield, TuiIcon, TuiBadge, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush, // Optimización de rendimiento
    template: `
    <div class="mb-6 space-y-4 animate-in">
      <!-- Header del tablero -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <tui-icon icon="tuiIconGridLarge" class="text-blue-600"></tui-icon>
            <span>{{ boardName || 'Tablero Kanban' }}</span>
          </h1>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s" 
            iconStart="tuiIconEdit"
            (click)="renameBoard()"
            class="text-gray-600"
          >
            Renombrar
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button 
            tuiButton 
            type="button" 
            appearance="primary" 
            size="s"
            iconStart="tuiIconPlus"
            (click)="openAdd('todo')"
          >
            Añadir a Por hacer
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="primary" 
            size="s"
            iconStart="tuiIconPlus"
            (click)="openAdd('doing')"
          >
            Añadir a En progreso
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="primary" 
            size="s"
            iconStart="tuiIconPlus"
            (click)="openAdd('done')"
          >
            Añadir a Hecho
          </button>
        </div>
      </div>

      <!-- Estadísticas y controles WIP -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-300">
        <div class="flex items-center gap-4 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-gray-600">Total:</span>
            <span tuiBadge class="font-semibold">{{ todo.length + doing.length + done.length }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-gray-600">En progreso:</span>
            <span tuiBadge class="font-semibold">{{ doing.length }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a
            [routerLink]="['/app/settings/integrations']"
            [queryParams]="{ boardId: boardId }"
            tuiButton
            type="button"
            appearance="flat"
            size="s"
            iconStart="tuiIconSettings"
            class="text-blue-600"
            title="Gestionar integraciones Git"
          >
            Integraciones Git
          </a>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconRefresh"
            (click)="openDeploymentPanel()"
            class="text-purple-600"
            title="Ver logs de deployment y CI/CD"
          >
            Deployment Logs
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconRefresh"
            (click)="resetWip()"
            [disabled]="wipSaving"
          >
            Reset WIP
          </button>
          @if (wipSaving) {
            <span class="text-sm text-gray-700 font-medium flex items-center gap-1">
              <span class="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></span>
              Guardando…
            </span>
          }
          @if (wipJustSaved && !wipSaving) {
            <span class="text-sm text-green-600 flex items-center gap-1">
              <tui-icon icon="tuiIconCheck"></tui-icon>
              Guardado
            </span>
          }
        </div>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Columna: Por hacer -->
      <div class="flex flex-col space-y-3">
        <div class="flex items-center justify-between p-2 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-blue-500"></div>
            <h2 class="font-semibold text-gray-900">
              Por hacer
              <span class="ml-2 text-sm font-normal" [class.text-red-600]="isExceeded('todo')" [class.text-gray-600]="!isExceeded('todo')">
                {{ todo.length }}/{{ wipLimits.todo }}
              </span>
            </h2>
          </div>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="xs"
            iconStart="tuiIconSettings"
            (click)="setWipLimit('todo')"
            class="opacity-70 hover:opacity-100"
            title="Configurar límite WIP"
          ></button>
        </div>
        <div 
          cdkDropList 
          id="todo-list"
          [cdkDropListData]="todo" 
          [cdkDropListConnectedTo]="['doing-list', 'done-list']"
          (cdkDropListDropped)="drop($event)" 
          class="bg-gray-50 rounded-lg p-3 min-h-64 space-y-3 transition-all duration-200 border border-gray-200"
          [ngClass]="{
            'border-2 border-red-400 bg-red-50': wipFlash.todo,
            'border-2 border-blue-300': !wipFlash.todo
          }"
        >
          @if (todo.length === 0) {
            <div class="flex flex-col items-center justify-center h-64 text-gray-600">
              <tui-icon icon="tuiIconPlus" class="text-4xl mb-2 opacity-40"></tui-icon>
              <p class="text-sm font-medium">Arrastra tarjetas aquí</p>
            </div>
          }
          @for (c of todo; track c.id; let i = $index) {
            <div 
              class="card kanban-card bg-white shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200 hover:border-blue-300 cursor-move group focus-visible-ring"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('todo', i)"
              (keydown.space)="editCard('todo', i)"
            >
              <div class="card-body p-4">
                <!-- Header con prioridad y etiquetas -->
                @if (c.priority || (c.labels && c.labels.length > 0)) {
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    @if (c.priority) {
                      @switch (c.priority) {
                        @case ('urgent') {
                          <span tuiBadge class="bg-red-100 text-red-800 border-red-300 text-xs font-semibold">
                            <tui-icon icon="tuiIconAlertCircle" class="text-xs"></tui-icon>
                            Urgente
                          </span>
                        }
                        @case ('high') {
                          <span tuiBadge class="bg-orange-100 text-orange-800 border-orange-300 text-xs font-semibold">
                            Alta
                          </span>
                        }
                        @case ('medium') {
                          <span tuiBadge class="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs font-semibold">
                            Media
                          </span>
                        }
                        @case ('low') {
                          <span tuiBadge class="bg-blue-100 text-blue-800 border-blue-300 text-xs font-semibold">
                            Baja
                          </span>
                        }
                      }
                    }
                    @if (c.labels && c.labels.length > 0) {
                      @for (label of c.labels.slice(0, 3); track label) {
                        <span class="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700 border border-gray-200">
                          {{ label }}
                        </span>
                      }
                      @if (c.labels.length > 3) {
                        <span class="text-xs text-gray-500">+{{ c.labels.length - 3 }}</span>
                      }
                    }
                  </div>
                }
                
                <div class="flex justify-between items-start gap-2 mb-2">
                  <div class="font-semibold text-gray-900 flex-1 flex items-center gap-2">
                    @if (c.metadata?.type === 'commit') {
                      <tui-icon icon="tuiIconCode" class="text-blue-600 text-sm" title="Commit"></tui-icon>
                    }
                    @if (c.metadata?.type === 'pull_request') {
                      <tui-icon icon="tuiIconGitBranch" class="text-purple-600 text-sm" title="Pull Request"></tui-icon>
                    }
                    @if (c.metadata?.type === 'branch') {
                      <tui-icon icon="tuiIconGitBranch" class="text-green-600 text-sm" title="Branch"></tui-icon>
                    }
                    <span>{{ c.title }}</span>
                  </div>
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconEdit"
                      (click)="editCard('todo', i)"
                      class="!p-1 !min-h-0 !h-6 !w-6"
                      title="Editar"
                    ></button>
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconTrash"
                      (click)="removeCard('todo', i)"
                      class="!p-1 !min-h-0 !h-6 !w-6 text-red-600"
                      title="Eliminar"
                    ></button>
                  </div>
                </div>
                @if (c.description) {
                  <div class="text-sm text-gray-700 mt-2 line-clamp-2">{{ c.description }}</div>
                }
                
                <!-- Footer con metadata y fechas -->
                <div class="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500">
                  <div class="flex items-center gap-2">
                    @if (c.assignee) {
                      <div class="flex items-center gap-1">
                        <tui-icon icon="tuiIconUser" class="text-xs"></tui-icon>
                        <span class="truncate max-w-[80px]">{{ c.assignee }}</span>
                      </div>
                    }
                    @if (c.createdAt) {
                      <div class="flex items-center gap-1" title="Creada {{ formatCardDate(c.createdAt) }}">
                        <tui-icon icon="tuiIconCalendar" class="text-xs"></tui-icon>
                        <span>{{ formatCardDate(c.createdAt) }}</span>
                      </div>
                    }
                  </div>
                  @if (c.updatedAt && c.updatedAt !== c.createdAt) {
                    <span class="text-gray-400" title="Actualizada {{ formatCardDate(c.updatedAt) }}">
                      {{ formatCardDateRelative(c.updatedAt) }}
                    </span>
                  }
                </div>
                
                @if (getTaskReferences(c).length > 0) {
                  <div class="mt-3 pt-3 border-t border-gray-200">
                    <div class="flex items-center gap-2 mb-2">
                      <tui-icon icon="tuiIconCode" class="text-xs text-blue-600"></tui-icon>
                      <span class="text-xs font-semibold text-gray-700">Referencias en código</span>
                    </div>
                    <div class="space-y-2">
                      @for (ref of getTaskReferences(c).slice(0, 2); track ref.timestamp || ref.url) {
                          <div class="bg-blue-50 border border-blue-200 rounded p-2 text-xs">
                            <div class="flex items-start gap-2">
                              @if (ref.type === 'commit') {
                                <tui-icon icon="tuiIconCode" class="text-blue-600 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                                <div class="flex-1 min-w-0">
                                  <div class="font-medium text-blue-900 truncate">{{ ref.message || 'Commit' }}</div>
                                  @if (ref.context) {
                                    <div class="text-blue-700 mt-1 truncate">{{ ref.context }}</div>
                                  }
                                  @if (ref.url) {
                                    <a [href]="ref.url" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline mt-1 inline-block">
                                      Ver commit →
                                    </a>
                                  }
                                </div>
                              }
                              @if (ref.type === 'pull_request') {
                                <tui-icon icon="tuiIconGitBranch" class="text-purple-600 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                                <div class="flex-1 min-w-0">
                                  <div class="font-medium text-purple-900 truncate">PR #{{ ref.number }}: {{ ref.title || 'Pull Request' }}</div>
                                  @if (ref.context) {
                                    <div class="text-purple-700 mt-1 truncate">{{ ref.context }}</div>
                                  }
                                  @if (ref.url) {
                                    <a [href]="ref.url" target="_blank" rel="noopener noreferrer" class="text-purple-600 hover:text-purple-800 underline mt-1 inline-block">
                                      Ver PR →
                                    </a>
                                  }
                                </div>
                              }
                            </div>
                          </div>
                        }
                        @if (getTaskReferences(c).length > 2) {
                          <div class="text-xs text-gray-600 text-center pt-1">
                            +{{ getTaskReferences(c).length - 2 }} más
                          </div>
                        }
                      </div>
                    </div>
                }
                @if (c.metadata?.ciStatus) {
                  <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                    @switch (c.metadata?.ciStatus?.state) {
                      @case ('success') {
                        <span tuiBadge class="bg-green-100 text-green-800 border-green-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconCheck" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('failure') {
                        <span tuiBadge class="bg-red-100 text-red-800 border-red-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconClose" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('pending') {
                        <span tuiBadge class="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs font-semibold">
                          <span class="inline-block w-2 h-2 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></span>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('error') {
                        <span tuiBadge class="bg-red-100 text-red-800 border-red-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconAlertCircle" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @default {
                        <span tuiBadge class="bg-gray-100 text-gray-800 border-gray-300 text-xs font-semibold">
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                    }
                    @if (c.metadata?.url) {
                      <a 
                        [href]="c.metadata!.url!" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="text-xs text-blue-600 hover:text-blue-800 underline"
                        title="Ver en GitHub"
                      >
                        Ver →
                      </a>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Columna: En progreso -->
      <div class="flex flex-col space-y-3">
        <div class="flex items-center justify-between p-2 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg border border-yellow-200">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
            <h2 class="font-semibold text-gray-900">
              En progreso
              <span class="ml-2 text-sm font-normal" [class.text-red-600]="isExceeded('doing')" [class.text-gray-600]="!isExceeded('doing')">
                {{ doing.length }}/{{ wipLimits.doing }}
              </span>
            </h2>
          </div>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="xs"
            iconStart="tuiIconSettings"
            (click)="setWipLimit('doing')"
            class="opacity-70 hover:opacity-100"
            title="Configurar límite WIP"
          ></button>
        </div>
        <div 
          cdkDropList 
          id="doing-list"
          [cdkDropListData]="doing" 
          [cdkDropListConnectedTo]="['todo-list', 'done-list']"
          (cdkDropListDropped)="drop($event)" 
          class="bg-gray-50 rounded-lg p-3 min-h-64 space-y-3 transition-all duration-200 border border-gray-200"
          [ngClass]="{
            'border-2 border-red-400 bg-red-50': wipFlash.doing,
            'border-2 border-yellow-300': !wipFlash.doing
          }"
        >
          @if (doing.length === 0) {
            <div class="flex flex-col items-center justify-center h-64 text-gray-400">
              <tui-icon icon="tuiIconPlus" class="text-4xl mb-2 opacity-30"></tui-icon>
              <p class="text-sm">Arrastra tarjetas aquí</p>
            </div>
          }
          @for (c of doing; track c.id; let i = $index) {
            <div 
              class="card kanban-card bg-white shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200 hover:border-yellow-300 cursor-move group focus-visible-ring"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('doing', i)"
              (keydown.space)="editCard('doing', i)"
            >
              <div class="card-body p-4">
                <div class="flex justify-between items-start gap-2 mb-2">
                  <div class="font-semibold text-gray-900 flex-1 flex items-center gap-2">
                    @if (c.metadata?.type === 'commit') {
                      <tui-icon icon="tuiIconCode" class="text-blue-600 text-sm" title="Commit"></tui-icon>
                    }
                    @if (c.metadata?.type === 'pull_request') {
                      <tui-icon icon="tuiIconGitBranch" class="text-purple-600 text-sm" title="Pull Request"></tui-icon>
                    }
                    @if (c.metadata?.type === 'branch') {
                      <tui-icon icon="tuiIconGitBranch" class="text-green-600 text-sm" title="Branch"></tui-icon>
                    }
                    <span>{{ c.title }}</span>
                  </div>
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconEdit"
                      (click)="editCard('doing', i)"
                      class="!p-1 !min-h-0 !h-6 !w-6"
                      title="Editar"
                    ></button>
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconTrash"
                      (click)="removeCard('doing', i)"
                      class="!p-1 !min-h-0 !h-6 !w-6 text-red-600"
                      title="Eliminar"
                    ></button>
                  </div>
                </div>
                @if (c.description) {
                  <div class="text-sm text-gray-700 mt-2 line-clamp-2">{{ c.description }}</div>
                }
                @if (getTaskReferences(c).length > 0) {
                  <div class="mt-3 pt-3 border-t border-gray-200">
                    <div class="flex items-center gap-2 mb-2">
                      <tui-icon icon="tuiIconCode" class="text-xs text-blue-600"></tui-icon>
                      <span class="text-xs font-semibold text-gray-700">Referencias en código</span>
                    </div>
                    <div class="space-y-2">
                      @for (ref of getTaskReferences(c).slice(0, 2); track ref.timestamp || ref.url) {
                          <div class="bg-blue-50 border border-blue-200 rounded p-2 text-xs">
                            <div class="flex items-start gap-2">
                              @if (ref.type === 'commit') {
                                <tui-icon icon="tuiIconCode" class="text-blue-600 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                                <div class="flex-1 min-w-0">
                                  <div class="font-medium text-blue-900 truncate">{{ ref.message || 'Commit' }}</div>
                                  @if (ref.context) {
                                    <div class="text-blue-700 mt-1 truncate">{{ ref.context }}</div>
                                  }
                                  @if (ref.url) {
                                    <a [href]="ref.url" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline mt-1 inline-block">
                                      Ver commit →
                                    </a>
                                  }
                                </div>
                              }
                              @if (ref.type === 'pull_request') {
                                <tui-icon icon="tuiIconGitBranch" class="text-purple-600 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                                <div class="flex-1 min-w-0">
                                  <div class="font-medium text-purple-900 truncate">PR #{{ ref.number }}: {{ ref.title || 'Pull Request' }}</div>
                                  @if (ref.context) {
                                    <div class="text-purple-700 mt-1 truncate">{{ ref.context }}</div>
                                  }
                                  @if (ref.url) {
                                    <a [href]="ref.url" target="_blank" rel="noopener noreferrer" class="text-purple-600 hover:text-purple-800 underline mt-1 inline-block">
                                      Ver PR →
                                    </a>
                                  }
                                </div>
                              }
                            </div>
                          </div>
                        }
                        @if (getTaskReferences(c).length > 2) {
                          <div class="text-xs text-gray-600 text-center pt-1">
                            +{{ getTaskReferences(c).length - 2 }} más
                          </div>
                        }
                      </div>
                    </div>
                }
                @if (c.metadata?.ciStatus) {
                  <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                    @switch (c.metadata?.ciStatus?.state) {
                      @case ('success') {
                        <span tuiBadge class="bg-green-100 text-green-800 border-green-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconCheck" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('failure') {
                        <span tuiBadge class="bg-red-100 text-red-800 border-red-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconClose" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('pending') {
                        <span tuiBadge class="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs font-semibold">
                          <span class="inline-block w-2 h-2 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></span>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('error') {
                        <span tuiBadge class="bg-red-100 text-red-800 border-red-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconAlertCircle" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @default {
                        <span tuiBadge class="bg-gray-100 text-gray-800 border-gray-300 text-xs font-semibold">
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                    }
                    @if (c.metadata?.url) {
                      <a 
                        [href]="c.metadata!.url!" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="text-xs text-blue-600 hover:text-blue-800 underline"
                        title="Ver en GitHub"
                      >
                        Ver →
                      </a>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Columna: Hecho -->
      <div class="flex flex-col space-y-3">
        <div class="flex items-center justify-between p-2 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-green-500"></div>
            <h2 class="font-semibold text-gray-900">
              Hecho
              <span class="ml-2 text-sm font-normal" [class.text-red-600]="isExceeded('done')" [class.text-gray-600]="!isExceeded('done')">
                {{ done.length }}/{{ wipLimits.done }}
              </span>
            </h2>
          </div>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="xs"
            iconStart="tuiIconSettings"
            (click)="setWipLimit('done')"
            class="opacity-70 hover:opacity-100"
            title="Configurar límite WIP"
          ></button>
        </div>
        <div 
          cdkDropList 
          id="done-list"
          [cdkDropListData]="done" 
          [cdkDropListConnectedTo]="['todo-list', 'doing-list']"
          (cdkDropListDropped)="drop($event)" 
          class="bg-gray-50 rounded-lg p-3 min-h-64 space-y-3 transition-all duration-200 border border-gray-200"
          [ngClass]="{
            'border-2 border-red-400 bg-red-50': wipFlash.done,
            'border-2 border-green-300': !wipFlash.done
          }"
        >
          @if (done.length === 0) {
            <div class="flex flex-col items-center justify-center h-64 text-gray-600">
              <tui-icon icon="tuiIconCheck" class="text-4xl mb-2 opacity-40"></tui-icon>
              <p class="text-sm font-medium">Arrastra tarjetas aquí</p>
            </div>
          }
          @for (c of done; track c.id; let i = $index) {
            <div 
              class="card kanban-card bg-white shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200 hover:border-green-300 cursor-move group opacity-90 focus-visible-ring"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('done', i)"
              (keydown.space)="editCard('done', i)"
            >
              <div class="card-body p-4">
                <div class="flex justify-between items-start gap-2 mb-2">
                  <div class="font-semibold text-gray-900 flex-1 flex items-center gap-2 line-through">
                    @if (c.metadata?.type === 'commit') {
                      <tui-icon icon="tuiIconCode" class="text-blue-600 text-sm" title="Commit"></tui-icon>
                    }
                    @if (c.metadata?.type === 'pull_request') {
                      <tui-icon icon="tuiIconGitBranch" class="text-purple-600 text-sm" title="Pull Request"></tui-icon>
                    }
                    @if (c.metadata?.type === 'branch') {
                      <tui-icon icon="tuiIconGitBranch" class="text-green-600 text-sm" title="Branch"></tui-icon>
                    }
                    <span>{{ c.title }}</span>
                  </div>
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconEdit"
                      (click)="editCard('done', i)"
                      class="!p-1 !min-h-0 !h-6 !w-6"
                      title="Editar"
                    ></button>
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconTrash"
                      (click)="removeCard('done', i)"
                      class="!p-1 !min-h-0 !h-6 !w-6 text-red-600"
                      title="Eliminar"
                    ></button>
                  </div>
                </div>
                @if (c.description) {
                  <div class="text-sm text-gray-700 mt-2 line-clamp-2 line-through">{{ c.description }}</div>
                }
                @if (c.metadata?.ciStatus) {
                  <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                    @switch (c.metadata?.ciStatus?.state) {
                      @case ('success') {
                        <span tuiBadge class="bg-green-100 text-green-800 border-green-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconCheck" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('failure') {
                        <span tuiBadge class="bg-red-100 text-red-800 border-red-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconClose" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('pending') {
                        <span tuiBadge class="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs font-semibold">
                          <span class="inline-block w-2 h-2 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></span>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @case ('error') {
                        <span tuiBadge class="bg-red-100 text-red-800 border-red-300 text-xs font-semibold">
                          <tui-icon icon="tuiIconAlertCircle" class="text-xs"></tui-icon>
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                      @default {
                        <span tuiBadge class="bg-gray-100 text-gray-800 border-gray-300 text-xs font-semibold">
                          CI: {{ c.metadata?.ciStatus?.context || '' }}
                        </span>
                      }
                    }
                    @if (c.metadata?.url) {
                      <a 
                        [href]="c.metadata!.url!" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="text-xs text-blue-600 hover:text-blue-800 underline"
                        title="Ver en GitHub"
                      >
                        Ver →
                      </a>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>

    @if (editOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-in" (click)="editOpen=false; editCardId=null">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 animate-scale-in" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2 mb-4">
            <tui-icon icon="tuiIconEdit" class="text-blue-600"></tui-icon>
            <h3 class="text-xl font-bold text-gray-900">Editar tarjeta</h3>
          </div>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <tui-textfield>
                <label tuiLabel>Título</label>
                <input 
                  tuiTextfield 
                  [(ngModel)]="editTitle" 
                  placeholder="Título de la tarjeta" 
                  class="w-full bg-white text-gray-900"
                />
              </tui-textfield>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-gray-700">Descripción</label>
              <textarea 
                class="textarea w-full resize-none bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:border-blue-500 focus:outline-none" 
                rows="4" 
                [(ngModel)]="editDescription"
                placeholder="Descripción opcional..."
              ></textarea>
            </div>
            
            <!-- Campos de Git -->
            <div class="flex flex-col gap-3 pt-4 border-t border-gray-200">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconCode" class="text-blue-600"></tui-icon>
                <label class="text-sm font-semibold text-gray-900">Vincular con Git</label>
              </div>
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-gray-700 mb-3">
                <p class="font-semibold text-blue-900 mb-1">💡 Formatos soportados:</p>
                <ul class="list-disc list-inside space-y-1 text-gray-700 ml-2">
                  <li>Commit: <code class="bg-white px-1 rounded">https://github.com/owner/repo/commit/SHA</code></li>
                  <li>Pull Request: <code class="bg-white px-1 rounded">https://github.com/owner/repo/pull/123</code></li>
                  <li>Branch: <code class="bg-white px-1 rounded">https://github.com/owner/repo/tree/branch-name</code></li>
                </ul>
              </div>
              <div class="flex flex-col gap-2">
                <tui-textfield>
                  <label tuiLabel>URL de Git (opcional)</label>
                  <input
                    tuiTextfield
                    type="url"
                    [(ngModel)]="editGitUrl"
                    placeholder="https://github.com/owner/repo/commit/abc123..."
                    class="w-full bg-white text-gray-900"
                  />
                </tui-textfield>
                <p class="text-xs text-gray-500">Pega la URL de un commit, Pull Request o branch de GitHub</p>
              </div>
            </div>
            
            <div class="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-200">
                <button 
                tuiButton 
                type="button" 
                appearance="flat" 
                size="m" 
                (click)="editOpen=false; editCardId=null; editGitUrl=''"
                class="text-gray-700"
              >
                Cancelar
              </button>
              <button 
                tuiButton 
                type="button" 
                appearance="primary" 
                size="m" 
                iconStart="tuiIconCheck"
                (click)="saveEdit()" 
                [disabled]="!editTitle || !editTitle.trim()"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    @if (addOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-in" (click)="addOpen=false">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 animate-scale-in" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2 mb-4">
            <tui-icon icon="tuiIconPlus" class="text-blue-600"></tui-icon>
            <h3 class="text-xl font-bold text-gray-900">Nueva tarjeta</h3>
          </div>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <tui-textfield>
                <label tuiLabel>Título</label>
                <input 
                  tuiTextfield 
                  [(ngModel)]="addTitle" 
                  placeholder="Título de la tarjeta" 
                  class="w-full bg-white text-gray-900"
                />
              </tui-textfield>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-gray-700">Descripción</label>
              <textarea 
                class="textarea w-full resize-none bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:border-blue-500 focus:outline-none" 
                rows="4" 
                [(ngModel)]="addDescription"
                placeholder="Descripción opcional..."
              ></textarea>
            </div>
            
            <!-- Campos de Git -->
            <div class="flex flex-col gap-3 pt-4 border-t border-gray-200">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconCode" class="text-blue-600"></tui-icon>
                <label class="text-sm font-semibold text-gray-900">Vincular con Git</label>
              </div>
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-gray-700 mb-3">
                <p class="font-semibold text-blue-900 mb-1">💡 Formatos soportados:</p>
                <ul class="list-disc list-inside space-y-1 text-gray-700 ml-2">
                  <li>Commit: <code class="bg-white px-1 rounded">https://github.com/owner/repo/commit/SHA</code></li>
                  <li>Pull Request: <code class="bg-white px-1 rounded">https://github.com/owner/repo/pull/123</code></li>
                  <li>Branch: <code class="bg-white px-1 rounded">https://github.com/owner/repo/tree/branch-name</code></li>
                </ul>
              </div>
              <div class="flex flex-col gap-2">
                <tui-textfield>
                  <label tuiLabel>URL de Git (opcional)</label>
                  <input
                    tuiTextfield
                    type="url"
                    [(ngModel)]="addGitUrl"
                    placeholder="https://github.com/owner/repo/commit/abc123..."
                    class="w-full bg-white text-gray-900"
                  />
                </tui-textfield>
                <p class="text-xs text-gray-500">Pega la URL de un commit, Pull Request o branch de GitHub</p>
              </div>
            </div>
            
            <div class="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-200">
              <button 
                tuiButton 
                type="button" 
                appearance="flat" 
                size="m" 
                (click)="addOpen=false"
                class="text-gray-700"
              >
                Cancelar
              </button>
              <button 
                tuiButton 
                type="button" 
                appearance="primary" 
                size="m" 
                iconStart="tuiIconPlus"
                (click)="saveAdd()" 
                [disabled]="!addTitle || !addTitle.trim()"
              >
                Crear tarjeta
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Deployment Logs Panel -->
    @if (deploymentPanelOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-in" (click)="deploymentPanelOpen = false">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col animate-scale-in" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200">
            <div class="flex items-center gap-3">
              <tui-icon icon="tuiIconRefresh" class="text-purple-600"></tui-icon>
              <h3 class="text-xl font-bold text-gray-900">Logs de Deployment y CI/CD</h3>
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="deploymentPanelOpen = false"
              class="text-gray-600"
            ></button>
          </div>

          <!-- Status Summary -->
          <div class="p-6 border-b border-gray-200 bg-gray-50">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <div class="w-3 h-3 rounded-full" [class.bg-green-500]="deploymentStatus.state === 'success'" [class.bg-yellow-500]="deploymentStatus.state === 'running'" [class.bg-red-500]="deploymentStatus.state === 'failure'" [class.bg-gray-400]="deploymentStatus.state === 'pending'"></div>
                <div>
                  <p class="text-xs text-gray-600">Estado</p>
                  <p class="font-semibold text-gray-900">{{ getStatusText(deploymentStatus.state) }}</p>
                </div>
              </div>
              @if (deploymentStatus.pipeline) {
                <div class="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                  <tui-icon icon="tuiIconCode" class="text-blue-600"></tui-icon>
                  <div>
                    <p class="text-xs text-gray-600">Pipeline</p>
                    <p class="font-semibold text-gray-900 truncate">{{ deploymentStatus.pipeline }}</p>
                  </div>
                </div>
              }
              @if (deploymentStatus.version) {
                <div class="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                  <tui-icon icon="tuiIconSettings" class="text-purple-600"></tui-icon>
                  <div>
                    <p class="text-xs text-gray-600">Versión</p>
                    <p class="font-semibold text-gray-900 truncate">{{ deploymentStatus.version }}</p>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Logs Container -->
          <div class="flex-1 overflow-y-auto p-6 bg-gray-900">
            <div class="space-y-1 font-mono text-sm">
              @if (deploymentLogs.length === 0) {
                <div class="text-gray-500 text-center py-8">
                  <p>No hay logs disponibles. Los logs aparecerán aquí cuando se ejecuten builds o deployments.</p>
                </div>
              }
              @for (log of deploymentLogs; track log.timestamp || log.message) {
                <div class="flex items-start gap-3 p-2 rounded hover:bg-gray-800 transition-colors" [class.text-green-400]="log.level === 'success'" [class.text-blue-400]="log.level === 'info'" [class.text-yellow-400]="log.level === 'warn'" [class.text-red-400]="log.level === 'error'">
                  <span class="text-gray-600 flex-shrink-0">{{ formatTimestamp(log.timestamp) }}</span>
                  @if (log.level === 'success') {
                    <tui-icon icon="tuiIconCheck" class="text-green-500 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                  }
                  @if (log.level === 'info') {
                    <tui-icon icon="tuiIconCode" class="text-blue-500 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                  }
                  @if (log.level === 'warn') {
                    <tui-icon icon="tuiIconAlertCircle" class="text-yellow-500 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                  }
                  @if (log.level === 'error') {
                    <tui-icon icon="tuiIconClose" class="text-red-500 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                  }
                  <span class="flex-1">{{ log.message }}</span>
                  @if (log.context) {
                    <span class="text-gray-600 text-xs flex-shrink-0">{{ log.context }}</span>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="s"
              iconStart="tuiIconRefresh"
              (click)="clearDeploymentLogs()"
              class="text-gray-700"
            >
              Limpiar logs
            </button>
            <div class="text-xs text-gray-600">
              {{ deploymentLogs.length }} log{{ deploymentLogs.length !== 1 ? 's' : '' }}
            </div>
          </div>
        </div>
      </div>
    }
    `
})
export class KanbanBoardDndComponent implements OnInit, OnDestroy {
    private readonly socket = inject(SocketService);
    private readonly auth = inject(AuthService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly alerts = inject(TuiAlertService);
    private readonly dialogs = inject(TuiDialogService);
    private readonly cdr = inject(ChangeDetectorRef); // Para OnPush change detection
    protected boardId = ''; // Protected para acceso desde template
    boardName: string | null = null;

    todo: KanbanCard[] = [
        { id: '1', title: 'Configurar proyecto' },
        { id: '2', title: 'Definir modelos' }
    ];
    doing: KanbanCard[] = [
        { id: '3', title: 'Tablero Kanban', description: 'UI estable de tablero' }
    ];
    done: KanbanCard[] = [];

    // Estado de edición (modal)
    editOpen = false;
    editList: 'todo' | 'doing' | 'done' = 'todo';
    editIndex = -1;
    editCardId: string | null = null;
    editTitle = '';
    editDescription = '';
    editGitUrl = ''; // URL de commit, PR o branch de Git

    // Límites WIP por columna (cargados desde backend)
    wipLimits: { todo: number; doing: number; done: number } = { todo: 99, doing: 3, done: 99 };

    ngOnInit(): void {
        // Asegurar que el socket esté conectado
        this.socket.connect();
        
        // Escuchar actualizaciones del kanban ANTES de unirse a la sala
        this.socket.on<{ boardId: string; todo: KanbanCard[]; doing: KanbanCard[]; done: KanbanCard[] }>(
            'kanban:update',
            (state) => {
                if (state.boardId !== this.boardId) return;
                
                // Actualizar nombre si está presente
                if ((state as any).name) {
                    this.boardName = (state as any).name as string;
                }
                
                // Actualizar arrays solo si son válidos y diferentes
                if (Array.isArray(state.todo)) {
                    this.todo = state.todo;
                }
                if (Array.isArray(state.doing)) {
                    this.doing = state.doing;
                }
                if (Array.isArray(state.done)) {
                    this.done = state.done;
                }
                
                // Actualizar límites WIP
                if ((state as any).wipLimits) {
                    const wl = (state as any).wipLimits as { todo?: number; doing?: number; done?: number };
                    this.wipLimits = {
                        todo: typeof wl.todo === 'number' ? wl.todo : this.wipLimits.todo,
                        doing: typeof wl.doing === 'number' ? wl.doing : this.wipLimits.doing,
                        done: typeof wl.done === 'number' ? wl.done : this.wipLimits.done,
                    };
                }
                
                this.cdr.markForCheck(); // Notificar cambio para OnPush
            }
        );
        
        this.route.paramMap.subscribe(params => {
            const id = params.get('id');
            if (!id) {
                // Si no hay ID, redirigir a la lista de tableros
                this.router.navigate(['/app/boards']);
                return;
            }
            if (id !== this.boardId) {
                if (this.boardId) {
                    // abandonar room anterior
                    this.socket.emit('board:leave', { boardId: this.boardId });
                }
                this.boardId = id;
                try { localStorage.setItem('tf-last-board', this.boardId); } catch {}
                // Unirse a la sala y cargar estado inicial
                this.joinBoardAndLoadInitial();
            } else {
                // Si ya es el mismo boardId, asegurar que se haya cargado el estado
                if (this.todo.length === 0 && this.doing.length === 0 && this.done.length === 0 && this.boardId) {
                    this.loadInitial();
                }
                this.joinBoard();
            }
        });
    }
    
    private async joinBoard(): Promise<void> {
        // Esperar a que el socket esté conectado
        let attempts = 0;
        const maxAttempts = 10;
        while (!this.socket.isConnected() && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (this.socket.isConnected()) {
            this.socket.emit('board:join', { boardId: this.boardId });
        } else {
            console.warn('[Kanban] Socket no conectado, intentando unirse de todas formas...');
            this.socket.emit('board:join', { boardId: this.boardId });
        }
    }
    
    private async joinBoardAndLoadInitial(): Promise<void> {
        // Esperar a que el socket esté conectado
        let attempts = 0;
        const maxAttempts = 10;
        while (!this.socket.isConnected() && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (this.socket.isConnected()) {
            this.socket.emit('board:join', { boardId: this.boardId });
        } else {
            console.warn('[Kanban] Socket no conectado, intentando unirse de todas formas...');
            this.socket.emit('board:join', { boardId: this.boardId });
        }
        
        // Cargar estado inicial después de unirse a la sala
        await this.loadInitial();
    }


    @HostListener('window:beforeunload')
    handleBeforeUnload(): void {
        // asegurar abandono de la sala si se cierra o recarga la pestaña
        if (this.boardId && this.socket.isConnected()) {
            this.socket.emit('board:leave', { boardId: this.boardId });
        }
    }

    async drop(event: CdkDragDrop<KanbanCard[]>) {
        const previousList = this.getListName(event.previousContainer.data);
        const nextList = this.getListName(event.container.data);
        const movedCard = event.previousContainer.data[event.previousIndex];
        
        if (!previousList || !nextList || !movedCard) {
            return;
        }

        // Guardar estado original para revertir en caso de error
        const originalTodo = [...this.todo];
        const originalDoing = [...this.doing];
        const originalDone = [...this.done];
        const originalIndex = event.previousIndex;

        // Verificar límite WIP antes de mover
        if (event.previousContainer !== event.container) {
            if (this[nextList].length >= this.wipLimits[nextList]) {
                this.showWarnOnce(`wip:${nextList}`, 'Límite WIP', `No se puede mover a "${nextList}". Límite: ${this.wipLimits[nextList]}`);
                this.wipFlash[nextList] = true;
                setTimeout(() => { this.wipFlash[nextList] = false; }, 1200);
                return;
            }
        }

        // Actualizar UI optimísticamente
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
        } else {
            transferArrayItem(
                event.previousContainer.data,
                event.container.data,
                event.previousIndex,
                event.currentIndex
            );
        }
        
        // Marcar detección de cambios para OnPush
        this.cdr.markForCheck();

        // Sincronizar con backend
        try {
            const response = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(movedCard.id)}/move`, {
                method: 'PATCH',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ fromList: previousList, toList: nextList, toIndex: event.currentIndex })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: 'Error al mover la tarjeta' }));
                throw new Error(error.message || 'Error al mover la tarjeta');
            }

            // Actualizar updatedAt de la tarjeta movida
            movedCard.updatedAt = Date.now();
            this.cdr.markForCheck();
        } catch (err: any) {
            // Revertir cambios en caso de error
            this.todo = originalTodo;
            this.doing = originalDoing;
            this.done = originalDone;
            this.cdr.markForCheck();
            
            this.alerts.open(err.message || 'Error al mover la tarjeta', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
        }
    }

    // Modal de creación
    addOpen = false;
    addList: 'todo' | 'doing' | 'done' = 'todo';
    addTitle = '';
    addDescription = '';
    addGitUrl = ''; // URL de commit, PR o branch de Git

    openAdd(list: 'todo' | 'doing' | 'done') {
        if (this[list].length >= this.wipLimits[list]) {
            this.showWarnOnce(`wip:${list}`, 'Límite WIP', `No se puede añadir en "${list}". Límite: ${this.wipLimits[list]}`);
            this.wipFlash[list] = true;
            setTimeout(() => { this.wipFlash[list] = false; }, 1200);
            return;
        }
        this.addList = list;
        this.addTitle = '';
        this.addDescription = '';
        this.addGitUrl = '';
        this.addOpen = true;
    }

    async saveAdd() {
        const title = this.addTitle?.trim();
        if (!title) { this.addOpen = false; return; }
        try {
            // Revalidar WIP antes de crear
            if (this[this.addList].length >= this.wipLimits[this.addList]) {
                this.showWarnOnce(`wip:${this.addList}`, 'Límite WIP', `No se puede añadir en "${this.addList}". Límite: ${this.wipLimits[this.addList]}`);
                this.addOpen = false;
                this.wipFlash[this.addList] = true;
                setTimeout(() => { this.wipFlash[this.addList] = false; }, 1200);
                return;
            }
            
            // Parsear URL de Git si existe
            const gitMetadata = this.parseGitHubUrl(this.addGitUrl);
            
            const payload: any = { 
                list: this.addList, 
                title, 
                description: this.addDescription 
            };
            
            // Agregar metadata de Git si existe
            if (gitMetadata) {
                payload.metadata = {
                    ...gitMetadata,
                    url: gitMetadata.url
                };
            } else if (this.addGitUrl.trim()) {
                // Si hay URL pero no se pudo parsear, solo guardar la URL
                payload.metadata = {
                    url: this.addGitUrl.trim()
                };
            }
            
            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards`, {
                method: 'POST',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al crear la tarjeta' }));
                throw new Error(error.message || 'Error al crear la tarjeta');
            }
        } catch (error: any) {
            console.error('[Kanban] Error al crear tarjeta:', error);
            this.alerts.open(error.message || 'Error al crear la tarjeta. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
            // No cerrar el modal si hay error para que el usuario pueda intentar nuevamente
            return;
        }
        this.addOpen = false;
        this.addGitUrl = '';
    }

    async removeCard(list: 'todo' | 'doing' | 'done', index: number) {
        const card = this[list][index];
        if (!card) return;
        const ok = confirm(`¿Eliminar "${card.title}"?`);
        if (!ok) return;
        try {
            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(card.id)}?list=${encodeURIComponent(list)}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders(),
                credentials: 'include'
            });
            
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al eliminar la tarjeta' }));
                throw new Error(error.message || 'Error al eliminar la tarjeta');
            }
        } catch (error: any) {
            console.error('[Kanban] Error al eliminar tarjeta:', error);
            this.alerts.open(error.message || 'Error al eliminar la tarjeta. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
        }
    }

    async editCard(list: 'todo' | 'doing' | 'done', index: number) {
        const card = this[list][index];
        if (!card) return;
        this.editOpen = true;
        this.editList = list;
        this.editIndex = index;
        this.editCardId = card.id;
        this.editTitle = card.title;
        this.editDescription = card.description ?? '';
        // Cargar URL de Git si existe
        this.editGitUrl = card.metadata?.url ?? '';
    }

    /**
     * Parsea una URL de GitHub y extrae metadata de Git.
     */
    private parseGitHubUrl(url: string): { type?: 'commit' | 'pull_request' | 'branch'; url?: string; sha?: string; number?: number; branch?: string } | null {
        if (!url || !url.trim()) return null;
        
        const trimmed = url.trim();
        // Detectar tipo de URL de GitHub
        const commitMatch = trimmed.match(/github\.com\/([^\/]+)\/([^\/]+)\/commit\/([a-f0-9]+)/i);
        const prMatch = trimmed.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/i);
        const branchMatch = trimmed.match(/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/?#]+)/i);
        
        if (commitMatch) {
            return {
                type: 'commit',
                url: trimmed,
                sha: commitMatch[3]
            };
        } else if (prMatch) {
            return {
                type: 'pull_request',
                url: trimmed,
                number: parseInt(prMatch[3], 10)
            };
        } else if (branchMatch) {
            return {
                type: 'branch',
                url: trimmed,
                branch: branchMatch[3]
            };
        }
        
        return null;
    }

    async saveEdit() {
        if (!this.editCardId) {
            this.editOpen = false;
            return;
        }
        
        // Parsear URL de Git si existe
        const gitMetadata = this.parseGitHubUrl(this.editGitUrl);
        
        const payload: any = { 
            title: this.editTitle, 
            description: this.editDescription 
        };
        
        // Agregar metadata de Git si existe
        if (gitMetadata) {
            payload.metadata = {
                ...gitMetadata,
                url: gitMetadata.url
            };
        } else if (this.editGitUrl.trim()) {
            // Si hay URL pero no se pudo parsear, solo guardar la URL
            payload.metadata = {
                url: this.editGitUrl.trim()
            };
        }
        
        try {
            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(this.editCardId)}`, {
                method: 'PATCH',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al actualizar la tarjeta' }));
                throw new Error(error.message || 'Error al actualizar la tarjeta');
            }
        } catch (error: any) {
            console.error('[Kanban] Error al editar tarjeta:', error);
            this.alerts.open(error.message || 'Error al actualizar la tarjeta. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
            // No cerrar el modal si hay error para que el usuario pueda intentar nuevamente
            return;
        }
        this.editOpen = false;
        this.editCardId = null;
        this.editGitUrl = '';
    }

    isExceeded(list: 'todo' | 'doing' | 'done'): boolean {
        const count = this[list].length;
        const limit = this.wipLimits[list];
        return count > limit;
    }

    async setWipLimit(list: 'todo' | 'doing' | 'done') {
        const current = this.wipLimits[list];
        const input = prompt(`Límite WIP para "${list}"`, String(current));
        if (input == null) return;
        const num = Number(input);
        if (!Number.isFinite(num) || num <= 0) return;
        const next = { ...this.wipLimits, [list]: Math.floor(num) } as { todo: number; doing: number; done: number };
        try {
            this.wipSaving = true; this.wipJustSaved = false;
            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/wip`, {
                method: 'PATCH',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(next)
            });
            
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al actualizar límites WIP' }));
                throw new Error(error.message || 'Error al actualizar límites WIP');
            }
            
            // el servidor emitirá kanban:update con wipLimits
            this.wipJustSaved = true;
            setTimeout(() => { this.wipJustSaved = false; }, 1500);
        } catch (error: any) {
            console.error('[Kanban] Error al actualizar WIP:', error);
            this.alerts.open(error.message || 'Error al actualizar límites WIP. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
            // Revertir al valor anterior en caso de error
            this.wipLimits = { todo: current, doing: this.wipLimits.doing, done: this.wipLimits.done };
            this.cdr.markForCheck();
        } finally {
            this.wipSaving = false;
        }
    }
    wipFlash: { todo: boolean; doing: boolean; done: boolean } = { todo: false, doing: false, done: false };
    private lastToastKey = '';
    private lastToastAt = 0;

    private showWarnOnce(key: string, summary: string, detail: string): void {
        const now = Date.now();
        if (this.lastToastKey === key && now - this.lastToastAt < 1500) return;
        this.lastToastKey = key;
        this.lastToastAt = now;
        this.alerts.open(detail, { label: summary }).subscribe();
    }

    private broadcastState(): void {
        this.socket.emit('kanban:update', {
            boardId: this.boardId,
            todo: this.todo,
            doing: this.doing,
            done: this.done
        });
    }

    /**
     * Helper para obtener los headers de autenticación con el email del usuario.
     */
    private getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        const userEmail = this.auth.getEmail();
        if (userEmail) {
            headers['X-User-Email'] = userEmail;
        }
        return headers;
    }

    private async loadInitial(): Promise<void> {
        if (!this.boardId) {
            console.warn('[Kanban] No se puede cargar estado inicial: boardId no definido');
            return;
        }
        
        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) {
                this.alerts.open('No estás autenticado. Por favor, inicia sesión.', { label: 'Error', appearance: 'negative' }).subscribe();
                this.router.navigate(['/login']);
                return;
            }
            
            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/kanban`, {
                credentials: 'include',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                }
            });
            
            if (!res.ok) {
                if (res.status === 401) {
                    this.alerts.open('No estás autenticado. Por favor, inicia sesión.', { label: 'Error', appearance: 'negative' }).subscribe();
                    this.router.navigate(['/login']);
                    return;
                } else if (res.status === 403) {
                    this.alerts.open('No tienes acceso a este tablero.', { label: 'Acceso denegado', appearance: 'negative' }).subscribe();
                    this.router.navigate(['/app/boards']);
                    return;
                } else if (res.status === 404) {
                    console.warn('[Kanban] Tablero no encontrado, usando estado vacío');
                    // Usar estado vacío si el tablero no existe
                    this.boardName = null;
                    this.todo = [];
                    this.doing = [];
                    this.done = [];
                    this.wipLimits = { todo: 99, doing: 3, done: 99 };
                    this.cdr.markForCheck();
                    return;
                }
                console.error('[Kanban] Error al cargar estado inicial:', res.status, res.statusText);
                this.alerts.open(`Error al cargar el tablero: ${res.statusText}`, { label: 'Error', appearance: 'negative' }).subscribe();
                return;
            }
            
            const data = await res.json() as { name?: string; todo?: KanbanCard[]; doing?: KanbanCard[]; done?: KanbanCard[]; wipLimits?: { todo?: number; doing?: number; done?: number } };
            
            // Validar y actualizar datos
            this.boardName = typeof data.name === 'string' ? data.name : this.boardName;
            
            if (Array.isArray(data.todo)) {
                this.todo = data.todo;
            } else if (data.todo === undefined) {
                // Si no viene todo, mantener el estado actual o usar array vacío
                this.todo = this.todo.length > 0 ? this.todo : [];
            }
            
            if (Array.isArray(data.doing)) {
                this.doing = data.doing;
            } else if (data.doing === undefined) {
                this.doing = this.doing.length > 0 ? this.doing : [];
            }
            
            if (Array.isArray(data.done)) {
                this.done = data.done;
            } else if (data.done === undefined) {
                this.done = this.done.length > 0 ? this.done : [];
            }
            
            this.cdr.markForCheck(); // Notificar cambio para OnPush
            
            if (data.wipLimits) {
                this.wipLimits = {
                    todo: typeof data.wipLimits.todo === 'number' ? data.wipLimits.todo : this.wipLimits.todo,
                    doing: typeof data.wipLimits.doing === 'number' ? data.wipLimits.doing : this.wipLimits.doing,
                    done: typeof data.wipLimits.done === 'number' ? data.wipLimits.done : this.wipLimits.done,
                };
            }
            
            console.log(`[Kanban] Estado inicial cargado: ${this.todo.length + this.doing.length + this.done.length} tarjetas`);
        } catch (error) {
            console.error('[Kanban] Error al cargar estado inicial:', error);
            this.alerts.open('Error al cargar el tablero. Por favor, recarga la página.', { label: 'Error', appearance: 'negative' }).subscribe();
            
            // Reintentar una vez después de un segundo si no hay datos
            if (this.todo.length === 0 && this.doing.length === 0 && this.done.length === 0) {
                console.warn('[Kanban] Reintentando cargar estado inicial...');
                setTimeout(() => {
                    if (this.boardId) {
                        this.loadInitial();
                    }
                }, 1000);
            }
        }
    }
    // Indicadores de guardado
    wipSaving = false;
    wipJustSaved = false;

    async resetWip() {
        const defaults = { todo: 99, doing: 3, done: 99 };
        try {
            this.wipSaving = true; this.wipJustSaved = false;
            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/wip`, {
                method: 'PATCH',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(defaults)
            });
            
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al restablecer límites WIP' }));
                throw new Error(error.message || 'Error al restablecer límites WIP');
            }
            
            this.alerts.open('Límites restablecidos', { label: 'WIP', appearance: 'success' }).subscribe();
            this.wipJustSaved = true;
            setTimeout(() => { this.wipJustSaved = false; }, 1500);
        } catch (error: any) {
            console.error('[Kanban] Error al restablecer WIP:', error);
            this.alerts.open(error.message || 'Error al restablecer límites WIP. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
        } finally {
            this.wipSaving = false;
        }
    }
    async renameBoard() {
        const current = this.boardName ?? '';
        const name = prompt('Nombre del tablero:', current);
        if (name == null) return;
        const trimmed = name.trim();
        if (!trimmed) {
            this.alerts.open('El nombre no puede estar vacío.', { label: 'Nombre inválido' }).subscribe();
            return;
        }
        if (trimmed.length < 3 || trimmed.length > 60) {
            this.alerts.open('Debe tener entre 3 y 60 caracteres.', { label: 'Nombre inválido' }).subscribe();
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}`, {
                method: 'PUT',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: trimmed })
            });
            
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al actualizar el nombre del tablero' }));
                throw new Error(error.message || 'Error al actualizar el nombre del tablero');
            }
            
            // el servidor emitirá kanban:update con name actualizado
            this.alerts.open('Nombre actualizado', { label: 'Tablero', appearance: 'success' }).subscribe();
        } catch (error: any) {
            console.error('[Kanban] Error al renombrar tablero:', error);
            this.alerts.open(error.message || 'No se pudo actualizar el nombre. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
        }
    }
    // Deployment panel state
    deploymentPanelOpen = false;
    deploymentLogs: Array<{ level: 'info' | 'warn' | 'error' | 'success'; message: string; timestamp: number; context?: string }> = [];
    deploymentStatus: { state: 'pending' | 'running' | 'success' | 'failure' | 'cancelled'; pipeline?: string; version?: string; timestamp: number } = { state: 'pending', timestamp: Date.now() };

    // Statistics panel state
    statisticsPanelOpen = false;

    openDeploymentPanel(): void {
        this.deploymentPanelOpen = true;
        // Suscribirse a logs de deployment
        if (this.boardId) {
            if (!this.socket.isConnected()) {
                this.socket.connect();
                // Esperar un poco antes de suscribirse
                setTimeout(() => {
                    if (this.socket.isConnected()) {
                        this.socket.emit('deployment:subscribe', { boardId: this.boardId });
                    }
                }, 300);
            } else {
                this.socket.emit('deployment:subscribe', { boardId: this.boardId });
            }
        }
        
        // Escuchar logs en tiempo real
        this.socket.on<{ level: 'info' | 'warn' | 'error' | 'success'; message: string; timestamp: number; context?: string }>('deployment:log', (log) => {
            this.deploymentLogs = [...this.deploymentLogs, log].slice(-1000); // Mantener últimos 1000 logs
            this.cdr.markForCheck();
        });

        // Escuchar cambios de estado
        this.socket.on<{ state: 'pending' | 'running' | 'success' | 'failure' | 'cancelled'; pipeline?: string; version?: string; timestamp: number }>('deployment:status', (status) => {
            this.deploymentStatus = status;
            this.cdr.markForCheck();
        });
    }

    clearDeploymentLogs(): void {
        this.deploymentLogs = [];
        this.cdr.markForCheck();
    }

    formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
    }

    getStatusText(state: 'pending' | 'running' | 'success' | 'failure' | 'cancelled'): string {
        const texts = {
            pending: 'Pendiente',
            running: 'Ejecutando',
            success: 'Exitoso',
            failure: 'Falló',
            cancelled: 'Cancelado'
        };
        return texts[state] || state;
    }

    ngOnDestroy(): void {
        // salir de la sala actual (se mantiene la conexión global del socket)
        if (this.boardId && this.socket.isConnected()) {
            this.socket.emit('board:leave', { boardId: this.boardId });
        }
        // Cancelar suscripción a logs de deployment
        if (this.boardId && this.socket.isConnected()) {
            this.socket.emit('deployment:unsubscribe', { boardId: this.boardId });
        }
        this.socket.off('deployment:log');
        this.socket.off('deployment:status');
    }

    private getListName(arr: KanbanCard[]): 'todo' | 'doing' | 'done' | null {
        if (arr === this.todo) return 'todo';
        if (arr === this.doing) return 'doing';
        if (arr === this.done) return 'done';
        return null;
    }

    /**
     * Helper para obtener referencias de una tarjeta como array tipado.
     * Esto evita problemas con el parser de Angular en los templates.
     */
    getTaskReferences(card: KanbanCard): TaskReference[] {
        return (card.metadata?.referencedIn as TaskReference[]) || [];
    }

    /**
     * Formatea una fecha para mostrar en las tarjetas (formato corto).
     */
    formatCardDate(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            if (hours === 0) {
                const minutes = Math.floor(diff / (1000 * 60));
                return minutes <= 1 ? 'ahora' : `hace ${minutes}m`;
            }
            return `hace ${hours}h`;
        }
        if (days === 1) return 'ayer';
        if (days < 7) return `hace ${days}d`;
        if (days < 30) return `${Math.floor(days / 7)}sem`;
        return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    }

    /**
     * Formatea una fecha de forma relativa para actualizaciones recientes.
     */
    formatCardDateRelative(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        
        if (hours < 1) return 'ahora';
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        return `${days}d`;
    }

    /**
     * Obtiene estadísticas del tablero.
     */
    getBoardStatistics() {
        const total = this.todo.length + this.doing.length + this.done.length;
        const completed = this.done.length;
        const inProgress = this.doing.length;
        const pending = this.todo.length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const avgCardsPerColumn = total > 0 ? Math.round(total / 3) : 0;
        
        // Calcular tareas por prioridad
        const allCards = [...this.todo, ...this.doing, ...this.done];
        const priorities = {
            urgent: allCards.filter(c => c.priority === 'urgent').length,
            high: allCards.filter(c => c.priority === 'high').length,
            medium: allCards.filter(c => c.priority === 'medium').length,
            low: allCards.filter(c => c.priority === 'low').length,
            none: allCards.filter(c => !c.priority).length
        };

        // Calcular tareas con etiquetas
        const withLabels = allCards.filter(c => c.labels && c.labels.length > 0).length;
        
        return {
            total,
            completed,
            inProgress,
            pending,
            completionRate,
            avgCardsPerColumn,
            priorities,
            withLabels,
            withoutLabels: total - withLabels
        };
    }
}


