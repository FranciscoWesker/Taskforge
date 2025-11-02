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

interface ChecklistItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: number;
    completedAt?: number;
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
    dueDate?: number; // Fecha de vencimiento en epoch ms
    checklist?: ChecklistItem[]; // Lista de items del checklist
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

interface CardComment {
    _id: string;
    cardId: string;
    boardId: string;
    author: string;
    text: string;
    ts: number;
    edited?: boolean;
    editedAt?: number;
}

interface BoardLabel {
    id: string;
    name: string;
    color: string; // Color en formato hex (#rrggbb)
    createdAt: number;
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
            appearance="flat" 
            size="s"
            iconStart="tuiIconSearch"
            (click)="searchOpen = !searchOpen"
            class="text-gray-700 dark:text-gray-300"
            title="Buscar tarjetas (Ctrl+F o Cmd+F)"
          >
            Buscar
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconHistory"
            (click)="openActivityHistory()"
            class="text-gray-700 dark:text-gray-300"
            title="Ver historial de actividad"
          >
            Historial
          </button>
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
            iconStart="tuiIconTag"
            (click)="openLabelsModal()"
            title="Gestionar etiquetas"
          >
            Etiquetas
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconDownload"
            (click)="exportBoard('json')"
            title="Exportar a JSON"
          >
            Exportar JSON
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconDownload"
            (click)="exportBoard('csv')"
            title="Exportar a CSV"
          >
            Exportar CSV
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
              class="card kanban-card bg-white shadow-md hover:shadow-lg transition-all duration-200 border cursor-move group focus-visible-ring"
              [class.border-gray-200]="selectedCardIndex?.list !== 'todo' || selectedCardIndex?.index !== i"
              [class.hover:border-blue-300]="selectedCardIndex?.list !== 'todo' || selectedCardIndex?.index !== i"
              [class.border-blue-500]="selectedCardIndex?.list === 'todo' && selectedCardIndex?.index === i"
              [class.ring-2]="selectedCardIndex?.list === 'todo' && selectedCardIndex?.index === i"
              [class.ring-blue-300]="selectedCardIndex?.list === 'todo' && selectedCardIndex?.index === i"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('todo', i); selectedCardIndex = { list: 'todo', index: i };"
              (keydown.space)="editCard('todo', i); selectedCardIndex = { list: 'todo', index: i };"
              (click)="selectedCardIndex = { list: 'todo', index: i }"
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
                      @for (labelId of c.labels.slice(0, 3); track labelId) {
                        @if (getLabelById(labelId)) {
                          <span 
                            class="px-2 py-0.5 text-xs font-medium rounded border"
                            [style.background-color]="getLabelById(labelId)!.color + '20'"
                            [style.color]="getLabelById(labelId)!.color"
                            [style.border-color]="getLabelById(labelId)!.color + '40'"
                          >
                            {{ getLabelById(labelId)!.name }}
                        </span>
                        }
                      }
                      @if (c.labels.length > 3) {
                        <span class="text-xs text-gray-500 dark:text-gray-400">+{{ c.labels.length - 3 }}</span>
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
                      iconStart="tuiIconComment"
                      (click)="openComments(c.id)"
                      class="!p-1 !min-h-0 !h-6 !w-6"
                      title="Comentarios"
                    ></button>
                    @if (c.checklist && c.checklist.length > 0) {
                      <button 
                        tuiButton 
                        type="button" 
                        appearance="flat" 
                        size="xs"
                        iconStart="tuiIconCheckCircle"
                        (click)="openChecklist(c.id)"
                        class="!p-1 !min-h-0 !h-6 !w-6"
                        [title]="getChecklistProgress(c.checklist) + '/' + c.checklist.length + ' completados'"
                      ></button>
                    }
                    @if (!c.checklist || c.checklist.length === 0) {
                      <button 
                        tuiButton 
                        type="button" 
                        appearance="flat" 
                        size="xs"
                        iconStart="tuiIconCheckCircle"
                        (click)="openChecklist(c.id)"
                        class="!p-1 !min-h-0 !h-6 !w-6 opacity-50"
                        title="Agregar checklist"
                      ></button>
                    }
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
                  <div class="text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-2">{{ c.description }}</div>
                }
                
                <!-- Checklist progress indicator -->
                @if (c.checklist && c.checklist.length > 0) {
                  <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <button
                      type="button"
                      class="flex items-center gap-2 w-full text-left text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                      (click)="openChecklist(c.id)"
                      title="Gestionar checklist"
                    >
                      <tui-icon icon="tuiIconCheckCircle" class="text-sm"></tui-icon>
                      <span class="flex-1">
                        {{ getChecklistProgress(c.checklist) }} de {{ c.checklist.length }} completado{{ c.checklist.length !== 1 ? 's' : '' }}
                      </span>
                      <div class="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          class="h-full bg-blue-500 dark:bg-blue-400 transition-all"
                          [style.width.%]="getChecklistProgressPercent(c.checklist)"
                        ></div>
                      </div>
                    </button>
                  </div>
                }
                
                <!-- Footer con metadata y fechas -->
                <div class="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                  <div class="flex items-center gap-2 flex-wrap">
                    @if (c.dueDate) {
                      <div 
                        class="flex items-center gap-1 px-2 py-0.5 rounded border transition-colors"
                        [class.bg-red-100]="isOverdue(c.dueDate)"
                        [class.text-red-800]="isOverdue(c.dueDate)"
                        [class.border-red-300]="isOverdue(c.dueDate)"
                        [class.dark:bg-red-900/30]="isOverdue(c.dueDate)"
                        [class.dark:text-red-300]="isOverdue(c.dueDate)"
                        [class.bg-orange-100]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                        [class.text-orange-800]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                        [class.border-orange-300]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                        [class.dark:bg-orange-900/30]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                        [class.dark:text-orange-300]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                        [class.bg-gray-100]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                        [class.text-gray-700]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                        [class.border-gray-300]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                        [class.dark:bg-gray-700]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                        [class.dark:text-gray-300]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                        [title]="'Vence: ' + formatDueDate(c.dueDate)"
                      >
                        <tui-icon 
                          [icon]="isOverdue(c.dueDate) ? 'tuiIconAlertCircle' : 'tuiIconCalendar'" 
                          class="text-xs"
                        ></tui-icon>
                        <span>{{ formatDueDate(c.dueDate) }}</span>
                      </div>
                    }
                    @if (c.assignee) {
                      <div 
                        class="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                        [title]="'Asignado a: ' + c.assignee"
                      >
                        <div class="w-4 h-4 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          {{ getInitials(c.assignee) }}
                        </div>
                        <span class="truncate max-w-[80px] text-xs">{{ c.assignee }}</span>
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
                    <span class="text-gray-400 dark:text-gray-500" title="Actualizada {{ formatCardDate(c.updatedAt) }}">
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
              class="card kanban-card bg-white shadow-md hover:shadow-lg transition-all duration-200 border cursor-move group focus-visible-ring"
              [class.border-gray-200]="selectedCardIndex?.list !== 'doing' || selectedCardIndex?.index !== i"
              [class.hover:border-yellow-300]="selectedCardIndex?.list !== 'doing' || selectedCardIndex?.index !== i"
              [class.border-blue-500]="selectedCardIndex?.list === 'doing' && selectedCardIndex?.index === i"
              [class.ring-2]="selectedCardIndex?.list === 'doing' && selectedCardIndex?.index === i"
              [class.ring-blue-300]="selectedCardIndex?.list === 'doing' && selectedCardIndex?.index === i"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('doing', i); selectedCardIndex = { list: 'doing', index: i };"
              (keydown.space)="editCard('doing', i); selectedCardIndex = { list: 'doing', index: i };"
              (click)="selectedCardIndex = { list: 'doing', index: i }"
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
                      iconStart="tuiIconComment"
                      (click)="openComments(c.id)"
                      class="!p-1 !min-h-0 !h-6 !w-6"
                      title="Comentarios"
                    ></button>
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
              class="card kanban-card bg-white shadow-md hover:shadow-lg transition-all duration-200 border cursor-move group opacity-90 focus-visible-ring"
              [class.border-gray-200]="selectedCardIndex?.list !== 'done' || selectedCardIndex?.index !== i"
              [class.hover:border-green-300]="selectedCardIndex?.list !== 'done' || selectedCardIndex?.index !== i"
              [class.border-blue-500]="selectedCardIndex?.list === 'done' && selectedCardIndex?.index === i"
              [class.ring-2]="selectedCardIndex?.list === 'done' && selectedCardIndex?.index === i"
              [class.ring-blue-300]="selectedCardIndex?.list === 'done' && selectedCardIndex?.index === i"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('done', i); selectedCardIndex = { list: 'done', index: i };"
              (keydown.space)="editCard('done', i); selectedCardIndex = { list: 'done', index: i };"
              (click)="selectedCardIndex = { list: 'done', index: i }"
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
                      iconStart="tuiIconComment"
                      (click)="openComments(c.id)"
                      class="!p-1 !min-h-0 !h-6 !w-6"
                      title="Comentarios"
                    ></button>
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
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Descripción</label>
              <textarea 
                class="textarea w-full resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md p-3 focus:border-blue-500 focus:outline-none" 
                rows="4" 
                [(ngModel)]="editDescription"
                placeholder="Descripción opcional..."
              ></textarea>
            </div>
            
            <!-- Prioridad -->
            <div class="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconFlag" class="text-blue-600 dark:text-blue-400"></tui-icon>
                <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Prioridad</label>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                  [class.bg-red-100]="editPriority === 'urgent'"
                  [class.text-red-800]="editPriority === 'urgent'"
                  [class.border-red-300]="editPriority === 'urgent'"
                  [class.bg-gray-100]="editPriority !== 'urgent'"
                  [class.text-gray-700]="editPriority !== 'urgent'"
                  [class.border-gray-300]="editPriority !== 'urgent'"
                  (click)="editPriority = editPriority === 'urgent' ? null : 'urgent'"
                  title="Urgente"
                >
                  <span class="flex items-center gap-1.5">
                    <tui-icon icon="tuiIconAlertCircle" class="text-xs"></tui-icon>
                    Urgente
                  </span>
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                  [class.bg-orange-100]="editPriority === 'high'"
                  [class.text-orange-800]="editPriority === 'high'"
                  [class.border-orange-300]="editPriority === 'high'"
                  [class.bg-gray-100]="editPriority !== 'high'"
                  [class.text-gray-700]="editPriority !== 'high'"
                  [class.border-gray-300]="editPriority !== 'high'"
                  (click)="editPriority = editPriority === 'high' ? null : 'high'"
                  title="Alta"
                >
                  Alta
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                  [class.bg-yellow-100]="editPriority === 'medium'"
                  [class.text-yellow-800]="editPriority === 'medium'"
                  [class.border-yellow-300]="editPriority === 'medium'"
                  [class.bg-gray-100]="editPriority !== 'medium'"
                  [class.text-gray-700]="editPriority !== 'medium'"
                  [class.border-gray-300]="editPriority !== 'medium'"
                  (click)="editPriority = editPriority === 'medium' ? null : 'medium'"
                  title="Media"
                >
                  Media
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                  [class.bg-blue-100]="editPriority === 'low'"
                  [class.text-blue-800]="editPriority === 'low'"
                  [class.border-blue-300]="editPriority === 'low'"
                  [class.bg-gray-100]="editPriority !== 'low'"
                  [class.text-gray-700]="editPriority !== 'low'"
                  [class.border-gray-300]="editPriority !== 'low'"
                  (click)="editPriority = editPriority === 'low' ? null : 'low'"
                  title="Baja"
                >
                  Baja
                </button>
              </div>
            </div>
            
            <!-- Fecha de vencimiento -->
            <div class="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconCalendar" class="text-blue-600 dark:text-blue-400"></tui-icon>
                <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Fecha de vencimiento</label>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="date"
                  [(ngModel)]="editDueDate"
                  class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
                  [min]="getTodayDate()"
                  title="Seleccionar fecha de vencimiento"
                />
                @if (editDueDate) {
                  <button
                    type="button"
                    tuiButton
                    appearance="flat"
                    size="xs"
                    iconStart="tuiIconClose"
                    (click)="editDueDate = null"
                    class="text-gray-600 dark:text-gray-400"
                    title="Quitar fecha de vencimiento"
                  ></button>
                }
              </div>
            </div>
            
            <!-- Asignación -->
            @if (boardMembers.length > 0) {
              <div class="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-2 mb-2">
                  <tui-icon icon="tuiIconUser" class="text-blue-600 dark:text-blue-400"></tui-icon>
                  <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Asignar a</label>
                </div>
                <select
                  [(ngModel)]="editAssignee"
                  class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
                  title="Seleccionar usuario para asignar"
                >
                  <option [value]="null">Sin asignar</option>
                  @for (member of boardMembers; track member) {
                    <option [value]="member">{{ member }}</option>
                  }
                </select>
              </div>
            }
            
            <!-- Labels -->
            @if (boardLabels.length > 0) {
              <div class="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-2 mb-2">
                  <tui-icon icon="tuiIconTag" class="text-blue-600 dark:text-blue-400"></tui-icon>
                  <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Etiquetas</label>
                </div>
                <div class="flex flex-wrap gap-2">
                  @for (label of boardLabels; track label.id) {
                    <button
                      type="button"
                      class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                      [class.opacity-50]="!cardHasLabel(editCardId, label.id)"
                      [style.background-color]="cardHasLabel(editCardId, label.id) ? label.color + '20' : 'transparent'"
                      [style.color]="cardHasLabel(editCardId, label.id) ? label.color : '#6B7280'"
                      [style.border-color]="cardHasLabel(editCardId, label.id) ? label.color + '40' : '#E5E7EB'"
                      (click)="toggleCardLabel(editCardId, label.id)"
                      title="{{ cardHasLabel(editCardId, label.id) ? 'Quitar etiqueta' : 'Agregar etiqueta' }}"
                    >
                      <span class="flex items-center gap-1.5">
                        @if (cardHasLabel(editCardId, label.id)) {
                          <tui-icon icon="tuiIconCheck" class="text-xs"></tui-icon>
                        }
                        {{ label.name }}
                      </span>
                    </button>
                  }
                </div>
              </div>
            }
            
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
                (click)="editOpen=false; editCardId=null; editGitUrl=''; editPriority=null; editDueDate=null; editAssignee=null"
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
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Descripción</label>
              <textarea 
                class="textarea w-full resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md p-3 focus:border-blue-500 focus:outline-none" 
                rows="4" 
                [(ngModel)]="addDescription"
                placeholder="Descripción opcional..."
              ></textarea>
            </div>
            
            <!-- Fecha de vencimiento -->
            <div class="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconCalendar" class="text-blue-600 dark:text-blue-400"></tui-icon>
                <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Fecha de vencimiento</label>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="date"
                  [(ngModel)]="addDueDate"
                  class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
                  [min]="getTodayDate()"
                  title="Seleccionar fecha de vencimiento"
                />
                @if (addDueDate) {
                  <button
                    type="button"
                    tuiButton
                    appearance="flat"
                    size="xs"
                    iconStart="tuiIconClose"
                    (click)="addDueDate = null"
                    class="text-gray-600 dark:text-gray-400"
                    title="Quitar fecha de vencimiento"
                  ></button>
                }
              </div>
            </div>
            
            <!-- Prioridad -->
            <div class="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconFlag" class="text-blue-600 dark:text-blue-400"></tui-icon>
                <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Prioridad</label>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                  [class.bg-red-100]="addPriority === 'urgent'"
                  [class.text-red-800]="addPriority === 'urgent'"
                  [class.border-red-300]="addPriority === 'urgent'"
                  [class.bg-gray-100]="addPriority !== 'urgent'"
                  [class.text-gray-700]="addPriority !== 'urgent'"
                  [class.border-gray-300]="addPriority !== 'urgent'"
                  (click)="addPriority = addPriority === 'urgent' ? null : 'urgent'"
                  title="Urgente"
                >
                  <span class="flex items-center gap-1.5">
                    <tui-icon icon="tuiIconAlertCircle" class="text-xs"></tui-icon>
                    Urgente
                  </span>
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                  [class.bg-orange-100]="addPriority === 'high'"
                  [class.text-orange-800]="addPriority === 'high'"
                  [class.border-orange-300]="addPriority === 'high'"
                  [class.bg-gray-100]="addPriority !== 'high'"
                  [class.text-gray-700]="addPriority !== 'high'"
                  [class.border-gray-300]="addPriority !== 'high'"
                  (click)="addPriority = addPriority === 'high' ? null : 'high'"
                  title="Alta"
                >
                  Alta
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                  [class.bg-yellow-100]="addPriority === 'medium'"
                  [class.text-yellow-800]="addPriority === 'medium'"
                  [class.border-yellow-300]="addPriority === 'medium'"
                  [class.bg-gray-100]="addPriority !== 'medium'"
                  [class.text-gray-700]="addPriority !== 'medium'"
                  [class.border-gray-300]="addPriority !== 'medium'"
                  (click)="addPriority = addPriority === 'medium' ? null : 'medium'"
                  title="Media"
                >
                  Media
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded border transition-all hover:opacity-80"
                  [class.bg-blue-100]="addPriority === 'low'"
                  [class.text-blue-800]="addPriority === 'low'"
                  [class.border-blue-300]="addPriority === 'low'"
                  [class.bg-gray-100]="addPriority !== 'low'"
                  [class.text-gray-700]="addPriority !== 'low'"
                  [class.border-gray-300]="addPriority !== 'low'"
                  (click)="addPriority = addPriority === 'low' ? null : 'low'"
                  title="Baja"
                >
                  Baja
                </button>
              </div>
            </div>
            
            <!-- Asignación -->
            @if (boardMembers.length > 0) {
              <div class="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-2 mb-2">
                  <tui-icon icon="tuiIconUser" class="text-blue-600 dark:text-blue-400"></tui-icon>
                  <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Asignar a</label>
                </div>
                <select
                  [(ngModel)]="addAssignee"
                  class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
                  title="Seleccionar usuario para asignar"
                >
                  <option [value]="null">Sin asignar</option>
                  @for (member of boardMembers; track member) {
                    <option [value]="member">{{ member }}</option>
                  }
                </select>
              </div>
            }
            
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

    <!-- Modal de Comentarios -->
    @if (commentsOpen && commentsCardId) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-black/70 backdrop-blur-sm animate-in" (click)="commentsOpen = false; commentsCardId = null">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col animate-scale-in" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <tui-icon icon="tuiIconComment" class="text-blue-600 dark:text-blue-400"></tui-icon>
              <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Comentarios</h3>
              @if (getCommentCount(commentsCardId) > 0) {
                <span tuiBadge class="ml-2">{{ getCommentCount(commentsCardId) }}</span>
              }
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="commentsOpen = false; commentsCardId = null"
              class="text-gray-600 dark:text-gray-400"
            ></button>
          </div>

          <!-- Lista de comentarios -->
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            @if (!comments.has(commentsCardId) || comments.get(commentsCardId)!.length === 0) {
              <div class="text-center py-8 text-gray-500 dark:text-gray-400">
                <tui-icon icon="tuiIconComment" class="text-4xl mb-2 opacity-40"></tui-icon>
                <p class="text-sm">No hay comentarios aún. Sé el primero en comentar.</p>
              </div>
            } @else {
              @for (comment of comments.get(commentsCardId)!; track comment._id) {
                <div class="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ comment.author }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatCardDate(comment.ts) }}</span>
                      @if (comment.edited) {
                        <span class="text-xs text-gray-400 dark:text-gray-500 italic">(editado)</span>
                      }
                    </div>
                    <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ comment.text }}</p>
                  </div>
                  @if (comment.author === auth.getEmail()) {
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconTrash"
                      (click)="deleteComment(comment._id)"
                      class="!p-1 !min-h-0 !h-6 !w-6 text-red-600 dark:text-red-400"
                      title="Eliminar comentario"
                    ></button>
                  }
                </div>
              }
            }
          </div>

          <!-- Input para nuevo comentario -->
          <div class="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div class="flex gap-3">
              <textarea 
                class="flex-1 resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md p-3 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm" 
                rows="3" 
                [(ngModel)]="newCommentText"
                placeholder="Escribe un comentario..."
                (keydown.enter)="handleCommentKeydown($event)"
              ></textarea>
              <button 
                tuiButton 
                type="button" 
                appearance="primary" 
                size="m"
                iconStart="tuiIconSend"
                (click)="addComment()"
                [disabled]="!newCommentText.trim()"
                class="self-end"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Modal de Gestión de Labels -->
    @if (labelsModalOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-black/70 backdrop-blur-sm animate-in" (click)="labelsModalOpen = false; editingLabel = null; newLabelName = ''; newLabelColor = '#3B82F6'">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col animate-scale-in" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <tui-icon icon="tuiIconTag" class="text-blue-600 dark:text-blue-400"></tui-icon>
              <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Gestionar Etiquetas</h3>
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="labelsModalOpen = false; editingLabel = null; newLabelName = ''; newLabelColor = '#3B82F6'"
              class="text-gray-500 dark:text-gray-400"
            ></button>
          </div>

          <!-- Contenido -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- Formulario para crear/editar label -->
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
              <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {{ editingLabel ? 'Editar Etiqueta' : 'Nueva Etiqueta' }}
              </h4>
              
              <div class="flex flex-col gap-4">
                <!-- Nombre del label -->
                <div class="flex flex-col gap-2">
                  <tui-textfield>
                    <label tuiLabel>Nombre de la etiqueta</label>
                    <input 
                      tuiTextfield 
                      [(ngModel)]="newLabelName" 
                      placeholder="Ej: Bug, Feature, Urgente..." 
                      class="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      maxlength="50"
                    />
                  </tui-textfield>
                </div>

                <!-- Selector de color -->
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
                  <div class="flex flex-wrap gap-2">
                    @for (color of predefinedColors; track color) {
                      <button
                        type="button"
                        class="w-10 h-10 rounded-lg border-2 transition-all hover:scale-110"
                        [class.border-blue-600]="newLabelColor === color"
                        [class.border-gray-300]="newLabelColor !== color"
                        [style.background-color]="color"
                        (click)="newLabelColor = color"
                        [title]="color"
                      ></button>
                    }
                  </div>
                  <!-- Input de color personalizado -->
                  <div class="flex items-center gap-2 mt-2">
                    <label class="text-xs text-gray-600 dark:text-gray-400">Color personalizado:</label>
                    <input
                      type="color"
                      [(ngModel)]="newLabelColor"
                      class="w-12 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                      title="Seleccionar color personalizado"
                    />
                    <input
                      type="text"
                      [(ngModel)]="newLabelColor"
                      class="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded"
                      placeholder="#3B82F6"
                      pattern="^#[0-9A-Fa-f]{6}$"
                      maxlength="7"
                    />
                  </div>
                </div>

                <!-- Botones de acción -->
                <div class="flex justify-end gap-2">
                  @if (editingLabel) {
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="s"
                      (click)="editingLabel = null; newLabelName = ''; newLabelColor = '#3B82F6'"
                      class="text-gray-700 dark:text-gray-300"
                    >
                      Cancelar
                    </button>
                  }
                  <button 
                    tuiButton 
                    type="button" 
                    appearance="primary" 
                    size="s"
                    iconStart="tuiIconCheck"
                    (click)="editingLabel ? updateLabel() : createLabel()"
                    [disabled]="!newLabelName.trim() || !isValidColor(newLabelColor)"
                  >
                    {{ editingLabel ? 'Actualizar' : 'Crear' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Lista de labels existentes -->
            <div class="space-y-3">
              <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Etiquetas Existentes ({{ boardLabels.length }})
              </h4>
              
              @if (boardLabels.length === 0) {
                <div class="text-center py-8 text-gray-500 dark:text-gray-400">
                  <tui-icon icon="tuiIconTag" class="text-4xl mb-2 opacity-40"></tui-icon>
                  <p class="text-sm">No hay etiquetas aún. Crea tu primera etiqueta arriba.</p>
                </div>
              } @else {
                <div class="space-y-2">
                  @for (label of boardLabels; track label.id) {
                    <div class="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:shadow-md transition-shadow">
                      <!-- Color y nombre -->
                      <div 
                        class="w-8 h-8 rounded-lg border border-gray-300 dark:border-gray-600"
                        [style.background-color]="label.color"
                      ></div>
                      <div class="flex-1">
                        <span 
                          class="px-3 py-1.5 text-xs font-medium rounded border"
                          [style.background-color]="label.color + '20'"
                          [style.color]="label.color"
                          [style.border-color]="label.color + '40'"
                        >
                          {{ label.name }}
                        </span>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ label.color }}</p>
                      </div>
                      
                      <!-- Botones de acción -->
                      <div class="flex items-center gap-2">
                        <button 
                          tuiButton 
                          type="button" 
                          appearance="flat" 
                          size="xs"
                          iconStart="tuiIconEdit"
                          (click)="startEditLabel(label)"
                          class="text-blue-600 dark:text-blue-400"
                          title="Editar etiqueta"
                        ></button>
                        <button 
                          tuiButton 
                          type="button" 
                          appearance="flat" 
                          size="xs"
                          iconStart="tuiIconTrash"
                          (click)="deleteLabel(label.id)"
                          class="text-red-600 dark:text-red-400"
                          title="Eliminar etiqueta"
                        ></button>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    }
    
    <!-- Modal de Checklist -->
    @if (checklistOpen && checklistCardId && checklistCard) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-black/70 backdrop-blur-sm animate-in" (click)="checklistOpen = false; checklistCardId = null; checklistCard = null">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col animate-scale-in" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <tui-icon icon="tuiIconCheckCircle" class="text-blue-600 dark:text-blue-400"></tui-icon>
              <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Checklist</h3>
              @if (checklistCard.checklist && checklistCard.checklist.length > 0) {
                <span tuiBadge class="ml-2">
                  {{ getChecklistProgress(checklistCard.checklist) }}/{{ checklistCard.checklist.length }}
                </span>
              }
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="checklistOpen = false; checklistCardId = null; checklistCard = null"
              class="text-gray-600 dark:text-gray-400"
            ></button>
          </div>

          <!-- Lista de items -->
          <div class="flex-1 overflow-y-auto p-6 space-y-2">
            @if (!checklistCard.checklist || checklistCard.checklist.length === 0) {
              <div class="text-center py-8 text-gray-500 dark:text-gray-400">
                <tui-icon icon="tuiIconCheckCircle" class="text-4xl mb-2 opacity-40"></tui-icon>
                <p class="text-sm">No hay items en el checklist. Agrega el primero abajo.</p>
              </div>
            } @else {
              @for (item of checklistCard.checklist; track item.id) {
                <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="checkbox"
                    [checked]="item.completed"
                    (change)="toggleChecklistItem(checklistCardId, item.id, $event)"
                    class="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div class="flex-1">
                    <label 
                      class="text-sm cursor-pointer"
                      [class.line-through]="item.completed"
                      [class.text-gray-500]="item.completed"
                      [class.dark:text-gray-400]="item.completed"
                      [class.text-gray-900]="!item.completed"
                      [class.dark:text-gray-100]="!item.completed"
                    >
                      {{ item.text }}
                    </label>
                  </div>
                  <button 
                    tuiButton 
                    type="button" 
                    appearance="flat" 
                    size="xs"
                    iconStart="tuiIconTrash"
                    (click)="deleteChecklistItem(checklistCardId, item.id)"
                    class="!p-1 !min-h-0 !h-6 !w-6 text-red-600 dark:text-red-400"
                    title="Eliminar item"
                  ></button>
                </div>
              }
            }
          </div>

          <!-- Input para nuevo item -->
          <div class="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div class="flex gap-3">
              <input
                type="text"
                class="flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm"
                [(ngModel)]="newChecklistItemText"
                placeholder="Nuevo item del checklist..."
                (keydown.enter)="addChecklistItem()"
              />
              <button 
                tuiButton 
                type="button" 
                appearance="primary" 
                size="m"
                iconStart="tuiIconPlus"
                (click)="addChecklistItem()"
                [disabled]="!newChecklistItemText.trim()"
                class="self-end"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      </div>
    }
    
    <!-- Modal de Ayuda de Atajos de Teclado -->
    @if (shortcutsHelpOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-black/70 backdrop-blur-sm animate-in" (click)="shortcutsHelpOpen = false">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col animate-scale-in" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <tui-icon icon="tuiIconKeyboard" class="text-blue-600 dark:text-blue-400"></tui-icon>
              <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Atajos de Teclado</h3>
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="shortcutsHelpOpen = false"
              class="text-gray-600 dark:text-gray-400"
            ></button>
          </div>

          <!-- Contenido -->
          <div class="flex-1 overflow-y-auto p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Atajos de Navegación -->
              <div class="space-y-4">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Navegación</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">Flecha ↑ ↓</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Navegar entre tarjetas</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">Flecha ← →</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Cambiar de columna</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">1, 2, 3</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Ir a columna (Todo/Doing/Done)</kbd>
                  </div>
                </div>
              </div>

              <!-- Atajos de Acciones -->
              <div class="space-y-4">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Acciones</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">Ctrl/Cmd + N</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Nueva tarjeta</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">N</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Nueva tarjeta en Todo</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">E</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Editar tarjeta seleccionada</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">Delete/Backspace</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Eliminar tarjeta seleccionada</kbd>
                  </div>
                </div>
              </div>

              <!-- Atajos de Modales -->
              <div class="space-y-4">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Modales</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">Escape</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Cerrar modal</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">Ctrl/Cmd + S</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Guardar cambios</kbd>
                  </div>
                </div>
              </div>

              <!-- Atajos de Ayuda -->
              <div class="space-y-4">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Ayuda</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">Ctrl/Cmd + K</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Mostrar/ocultar ayuda</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span class="text-gray-700 dark:text-gray-300">Ctrl/Cmd + /</span>
                    <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Mostrar/ocultar ayuda</kbd>
                  </div>
                </div>
              </div>
            </div>

            <!-- Nota al pie -->
            <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p class="text-xs text-gray-500 dark:text-gray-400 italic">
                💡 Tip: Los atajos solo funcionan cuando no estás escribiendo en un campo de texto.
              </p>
            </div>
          </div>
        </div>
      </div>
    }
    
    <!-- Modal de Búsqueda Avanzada -->
    @if (searchOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-black/70 backdrop-blur-sm animate-in" (click)="searchOpen = false">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col animate-scale-in" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <tui-icon icon="tuiIconSearch" class="text-blue-600 dark:text-blue-400"></tui-icon>
              <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Búsqueda Avanzada</h3>
              @if (getSearchResults().length > 0) {
                <span tuiBadge class="ml-2">{{ getSearchResults().length }} resultado{{ getSearchResults().length !== 1 ? 's' : '' }}</span>
              }
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="searchOpen = false; clearSearch()"
              class="text-gray-600 dark:text-gray-400"
            ></button>
          </div>

          <!-- Filtros -->
          <div class="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-4">
            <!-- Búsqueda de texto -->
            <div class="flex flex-col gap-2">
              <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Buscar en título y descripción</label>
              <input
                type="text"
                class="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm"
                [(ngModel)]="searchQuery"
                placeholder="Escribe para buscar..."
                (ngModelChange)="applySearch()"
              />
            </div>

            <!-- Filtros avanzados -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Filtro por columna -->
              <div class="flex flex-col gap-2">
                <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Columna</label>
                <select
                  [(ngModel)]="searchFilters.column"
                  (ngModelChange)="applySearch()"
                  class="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm"
                >
                  <option [value]="undefined">Todas</option>
                  <option value="todo">Por hacer</option>
                  <option value="doing">En progreso</option>
                  <option value="done">Hecho</option>
                </select>
              </div>

              <!-- Filtro por prioridad -->
              <div class="flex flex-col gap-2">
                <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Prioridad</label>
                <select
                  [(ngModel)]="searchFilters.priority"
                  (ngModelChange)="applySearch()"
                  class="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm"
                >
                  <option [value]="undefined">Todas</option>
                  <option value="urgent">Urgente</option>
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </select>
              </div>

              <!-- Filtro por asignado -->
              @if (boardMembers.length > 0) {
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Asignado a</label>
                  <select
                    [(ngModel)]="searchFilters.assignee"
                    (ngModelChange)="applySearch()"
                    class="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm"
                  >
                    <option [value]="undefined">Cualquiera</option>
                    <option value="unassigned">Sin asignar</option>
                    @for (member of boardMembers; track member) {
                      <option [value]="member">{{ member }}</option>
                    }
                  </select>
                </div>
              }

              <!-- Filtro por fecha de vencimiento -->
              <div class="flex flex-col gap-2">
                <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Fecha de vencimiento</label>
                <select
                  [(ngModel)]="searchFilters.dueDate"
                  (ngModelChange)="applySearch()"
                  class="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm"
                >
                  <option [value]="undefined">Cualquiera</option>
                  <option value="overdue">Vencidas</option>
                  <option value="dueSoon">Próximas (3 días)</option>
                  <option value="due">Con fecha</option>
                  <option value="noDueDate">Sin fecha</option>
                </select>
              </div>
            </div>

            <!-- Filtro por labels -->
            @if (boardLabels.length > 0) {
              <div class="flex flex-col gap-2">
                <label class="text-sm font-semibold text-gray-900 dark:text-gray-100">Etiquetas</label>
                <div class="flex flex-wrap gap-2">
                  @for (label of boardLabels; track label.id) {
                    <button
                      type="button"
                      class="px-3 py-1.5 text-xs font-medium rounded border transition-all"
                      [class.opacity-50]="!searchFilters.labels?.includes(label.id)"
                      [style.background-color]="searchFilters.labels?.includes(label.id) ? label.color + '20' : 'transparent'"
                      [style.color]="searchFilters.labels?.includes(label.id) ? label.color : '#6B7280'"
                      [style.border-color]="searchFilters.labels?.includes(label.id) ? label.color + '40' : '#E5E7EB'"
                      (click)="toggleSearchLabel(label.id)"
                      title="{{ searchFilters.labels?.includes(label.id) ? 'Quitar filtro' : 'Agregar filtro' }}"
                    >
                      {{ label.name }}
                    </button>
                  }
                </div>
              </div>
            }

            <!-- Botón limpiar filtros -->
            @if (hasActiveFilters()) {
              <button
                type="button"
                tuiButton
                appearance="flat"
                size="s"
                (click)="clearSearch()"
                class="w-full text-gray-700 dark:text-gray-300"
              >
                Limpiar filtros
              </button>
            }
          </div>

          <!-- Resultados -->
          <div class="flex-1 overflow-y-auto p-6">
            @if (getSearchResults().length === 0) {
              <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                <tui-icon icon="tuiIconSearch" class="text-4xl mb-2 opacity-40"></tui-icon>
                <p class="text-sm font-medium mb-1">No se encontraron resultados</p>
                <p class="text-xs">Intenta ajustar tus filtros de búsqueda</p>
              </div>
            } @else {
              <div class="space-y-3">
                @for (result of getSearchResults(); track result.card.id) {
                  <div
                    class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    (click)="selectSearchResult(result.list, result.index)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                          <span class="text-xs font-semibold px-2 py-0.5 rounded"
                            [class.bg-blue-100]="result.list === 'todo'"
                            [class.text-blue-800]="result.list === 'todo'"
                            [class.bg-yellow-100]="result.list === 'doing'"
                            [class.text-yellow-800]="result.list === 'doing'"
                            [class.bg-green-100]="result.list === 'done'"
                            [class.text-green-800]="result.list === 'done'"
                          >
                            @if (result.list === 'todo') { Por hacer }
                            @if (result.list === 'doing') { En progreso }
                            @if (result.list === 'done') { Hecho }
                          </span>
                          @if (result.card.priority) {
                            <span tuiBadge 
                              [class.bg-red-100]="result.card.priority === 'urgent'"
                              [class.text-red-800]="result.card.priority === 'urgent'"
                              [class.bg-orange-100]="result.card.priority === 'high'"
                              [class.text-orange-800]="result.card.priority === 'high'"
                              [class.bg-blue-100]="result.card.priority === 'medium'"
                              [class.text-blue-800]="result.card.priority === 'medium'"
                              [class.bg-gray-100]="result.card.priority === 'low'"
                              [class.text-gray-800]="result.card.priority === 'low'"
                              class="text-xs"
                            >
                              {{ getPriorityName(result.card.priority) }}
                            </span>
                          }
                        </div>
                        <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-1">{{ result.card.title }}</h4>
                        @if (result.card.description) {
                          <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{{ result.card.description }}</p>
                        }
                        <div class="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-500">
                          @if (result.card.assignee) {
                            <span class="flex items-center gap-1">
                              <tui-icon icon="tuiIconUser" class="text-xs"></tui-icon>
                              {{ result.card.assignee }}
                            </span>
                          }
                          @if (result.card.dueDate) {
                            <span class="flex items-center gap-1"
                              [class.text-red-600]="isOverdue(result.card.dueDate)"
                              [class.text-orange-600]="!isOverdue(result.card.dueDate) && isDueSoon(result.card.dueDate)"
                            >
                              <tui-icon icon="tuiIconCalendar" class="text-xs"></tui-icon>
                              {{ formatDueDate(result.card.dueDate) }}
                            </span>
                          }
                        </div>
                      </div>
                      <button
                        type="button"
                        tuiButton
                        appearance="flat"
                        size="xs"
                        iconStart="tuiIconEdit"
                        (click)="editCard(result.list, result.index); searchOpen = false;"
                        title="Editar tarjeta"
                      ></button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
    
    <!-- Modal de Historial de Actividad -->
    @if (activityOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-black/70 backdrop-blur-sm animate-in" (click)="activityOpen = false">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col animate-scale-in" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <tui-icon icon="tuiIconHistory" class="text-blue-600 dark:text-blue-400"></tui-icon>
              <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Historial de Actividad</h3>
              @if (activities.length > 0) {
                <span tuiBadge class="ml-2">{{ activities.length }} actividad{{ activities.length !== 1 ? 'es' : '' }}</span>
              }
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="activityOpen = false"
              class="text-gray-600 dark:text-gray-400"
            ></button>
          </div>

          <!-- Filtros -->
          <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex gap-3">
            <select
              [(ngModel)]="activityFilters.action"
              (ngModelChange)="loadActivities()"
              class="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm"
            >
              <option [value]="undefined">Todas las acciones</option>
              <option value="card_created">Tarjeta creada</option>
              <option value="card_updated">Tarjeta editada</option>
              <option value="card_deleted">Tarjeta eliminada</option>
              <option value="card_moved">Tarjeta movida</option>
              <option value="label_created">Label creado</option>
              <option value="label_updated">Label editado</option>
              <option value="label_deleted">Label eliminado</option>
            </select>
            <select
              [(ngModel)]="activityFilters.entityType"
              (ngModelChange)="loadActivities()"
              class="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-sm"
            >
              <option [value]="undefined">Todos los tipos</option>
              <option value="card">Tarjetas</option>
              <option value="label">Labels</option>
              <option value="board">Tablero</option>
              <option value="comment">Comentarios</option>
              <option value="checklist">Checklist</option>
            </select>
            @if (activityFilters.action || activityFilters.entityType) {
              <button
                type="button"
                tuiButton
                appearance="flat"
                size="s"
                (click)="activityFilters = {}; loadActivities()"
                class="text-gray-700 dark:text-gray-300"
              >
                Limpiar filtros
              </button>
            }
          </div>

          <!-- Lista de actividades -->
          <div class="flex-1 overflow-y-auto p-6">
            @if (loadingActivities) {
              <div class="flex items-center justify-center py-12">
                <div class="text-center space-y-3">
                  <div class="inline-block w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p class="text-sm text-gray-700 dark:text-gray-300">Cargando actividades...</p>
                </div>
              </div>
            } @else if (activities.length === 0) {
              <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                <tui-icon icon="tuiIconHistory" class="text-4xl mb-2 opacity-40"></tui-icon>
                <p class="text-sm font-medium mb-1">No hay actividades registradas</p>
                <p class="text-xs">Las acciones en el tablero aparecerán aquí</p>
              </div>
            } @else {
              <div class="space-y-4">
                @for (activity of activities; track activity._id) {
                  <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div class="flex items-start gap-3">
                      <div class="flex-shrink-0 mt-1">
                        <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <tui-icon 
                            [icon]="getActivityIcon(activity.action)" 
                            class="text-blue-600 dark:text-blue-400 text-sm"
                          ></tui-icon>
                        </div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                            {{ getActivityMessage(activity) }}
                          </span>
                          <span tuiBadge class="text-xs">
                            {{ getActivityActionName(activity.action) }}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                          <span>{{ activity.userId }}</span>
                          <span>·</span>
                          <span>{{ formatActivityDate(activity.timestamp) }}</span>
                        </div>
                        @if (activity.details && hasActivityDetails(activity)) {
                          <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-400">
                            @if (activity.details.field && activity.details.oldValue !== undefined && activity.details.newValue !== undefined) {
                              <div class="flex items-center gap-2">
                                <span class="font-medium">{{ getFieldName(activity.details.field) }}:</span>
                                <span class="line-through text-red-600 dark:text-red-400">{{ formatDetailValue(activity.details.oldValue) }}</span>
                                <span>→</span>
                                <span class="text-green-600 dark:text-green-400">{{ formatDetailValue(activity.details.newValue) }}</span>
                              </div>
                            }
                            @if (activity.details.fromList && activity.details.toList) {
                              <div class="flex items-center gap-2 mt-1">
                                <span class="font-medium">Movida de:</span>
                                <span class="px-2 py-0.5 rounded text-xs" [class]="getListBadgeClass(activity.details.fromList)">
                                  {{ getListNameForActivity(activity.details.fromList) }}
                                </span>
                                <span>→</span>
                                <span class="px-2 py-0.5 rounded text-xs" [class]="getListBadgeClass(activity.details.toList)">
                                  {{ getListNameForActivity(activity.details.toList) }}
                                </span>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
    `
})
export class KanbanBoardDndComponent implements OnInit, OnDestroy {
    private readonly socket = inject(SocketService);
    protected readonly auth = inject(AuthService); // Protected para acceso desde template
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
    editPriority: 'low' | 'medium' | 'high' | 'urgent' | null = null;
    editDueDate: string | null = null; // Fecha de vencimiento en formato YYYY-MM-DD para input date
    editAssignee: string | null = null; // Email del usuario asignado

    // Estado de creación (modal)
    addOpen = false;
    addList: 'todo' | 'doing' | 'done' = 'todo';
    addTitle = '';
    addDescription = '';
    addPriority: 'low' | 'medium' | 'high' | 'urgent' | null = null;
    addGitUrl = ''; // URL de commit, PR o branch de Git
    addDueDate: string | null = null; // Fecha de vencimiento en formato YYYY-MM-DD para input date
    addAssignee: string | null = null; // Email del usuario asignado

    // Estado de comentarios
    commentsOpen = false;
    commentsCardId: string | null = null;
    comments: Map<string, CardComment[]> = new Map(); // cardId -> comentarios
    newCommentText = '';

    // Estado de checklist
    checklistOpen = false;
    checklistCardId: string | null = null;
    checklistCard: KanbanCard | null = null;
    newChecklistItemText = '';

    // Estado de shortcuts/ayuda
    shortcutsHelpOpen = false;
    selectedCardIndex: { list: 'todo' | 'doing' | 'done'; index: number } | null = null;

    // Estado de búsqueda avanzada
    searchOpen = false;
    searchQuery = '';
    searchFilters: {
        labels?: string[]; // IDs de labels
        assignee?: string; // Email del usuario asignado
        priority?: 'low' | 'medium' | 'high' | 'urgent';
        dueDate?: 'overdue' | 'dueSoon' | 'due' | 'noDueDate'; // overdue: vencidas, dueSoon: próximas (3 días), due: con fecha, noDueDate: sin fecha
        column?: 'todo' | 'doing' | 'done' | 'all';
    } = {};

    // Estado de historial de actividad
    activityOpen = false;
    activities: Array<{
        _id: string;
        boardId: string;
        userId: string;
        action: string;
        entityType: 'card' | 'label' | 'board' | 'comment' | 'checklist';
        entityId?: string;
        details?: {
            cardTitle?: string;
            cardId?: string;
            fromList?: 'todo' | 'doing' | 'done';
            toList?: 'todo' | 'doing' | 'done';
            field?: string;
            oldValue?: unknown;
            newValue?: unknown;
            labelName?: string;
            labelColor?: string;
            memberEmail?: string;
            commentText?: string;
            checklistItemText?: string;
            wipLimits?: { todo?: number; doing?: number; done?: number };
            boardName?: string;
        };
        timestamp: number;
    }> = [];
    loadingActivities = false;
    activityFilters: {
        action?: string;
        entityType?: string;
    } = {};

    // Labels del tablero
    boardLabels: BoardLabel[] = [];
    
    // Miembros del tablero (owner + members)
    boardMembers: string[] = []; // Lista de emails de usuarios disponibles para asignar

    // Estado de gestión de labels
    labelsModalOpen = false;
    editingLabel: BoardLabel | null = null;
    newLabelName = '';
    newLabelColor = '#3B82F6'; // Color por defecto (azul)
    
    // Colores predefinidos para labels
    predefinedColors = [
        '#EF4444', // Rojo
        '#F59E0B', // Naranja
        '#10B981', // Verde
        '#3B82F6', // Azul
        '#8B5CF6', // Púrpura
        '#EC4899', // Rosa
        '#6366F1', // Índigo
        '#14B8A6', // Cyan
        '#F97316', // Naranja oscuro
        '#84CC16', // Lima
        '#06B6D4', // Cyan claro
        '#A855F7', // Púrpura claro
    ];

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
                
                // Actualizar labels del tablero
                if ((state as any).labels && Array.isArray((state as any).labels)) {
                    this.boardLabels = (state as any).labels as BoardLabel[];
                }
                
                this.cdr.markForCheck(); // Notificar cambio para OnPush
            }
        );

        // Escuchar eventos de labels del tablero
        this.socket.on<{ boardId: string; labels: BoardLabel[] }>(
            'board:labels:updated',
            (data) => {
                if (data.boardId !== this.boardId) return;
                this.boardLabels = data.labels || [];
                this.cdr.markForCheck();
            }
        );

        // Escuchar eventos de comentarios
        this.socket.on<{ boardId: string; cardId: string; comment: CardComment }>(
            'card:comment:added',
            (data) => {
                if (data.boardId !== this.boardId) return;
                const cardComments = this.comments.get(data.cardId) || [];
                if (!cardComments.find(c => c._id === data.comment._id)) {
                    cardComments.push(data.comment);
                    this.comments.set(data.cardId, cardComments);
                    this.cdr.markForCheck();
                }
            }
        );

        this.socket.on<{ boardId: string; cardId: string; commentId: string; comment: CardComment }>(
            'card:comment:updated',
            (data) => {
                if (data.boardId !== this.boardId) return;
                const cardComments = this.comments.get(data.cardId) || [];
                const index = cardComments.findIndex(c => c._id === data.commentId);
                if (index >= 0) {
                    cardComments[index] = data.comment;
                    this.comments.set(data.cardId, cardComments);
                    this.cdr.markForCheck();
                }
            }
        );

        this.socket.on<{ boardId: string; cardId: string; commentId: string }>(
            'card:comment:deleted',
            (data) => {
                if (data.boardId !== this.boardId) return;
                const cardComments = this.comments.get(data.cardId) || [];
                const filtered = cardComments.filter(c => c._id !== data.commentId);
                this.comments.set(data.cardId, filtered);
                this.cdr.markForCheck();
            }
        );

        // Listener para actualizaciones de checklist
        this.socket.on<{ boardId: string; cardId: string; checklist: ChecklistItem[] }>(
            'card:checklist:updated',
            (data) => {
                if (data.boardId !== this.boardId) return;
                // Actualizar checklist en la tarjeta local
                const allCards = [...this.todo, ...this.doing, ...this.done];
                const card = allCards.find(c => c.id === data.cardId);
                if (card) {
                    if (data.checklist && data.checklist.length > 0) {
                        card.checklist = data.checklist;
                    } else {
                        delete card.checklist;
                    }
                    // También actualizar en checklistCard si está abierto
                    if (this.checklistCard && this.checklistCard.id === data.cardId) {
                        if (data.checklist && data.checklist.length > 0) {
                            this.checklistCard.checklist = data.checklist;
                        } else {
                            this.checklistCard.checklist = [];
                        }
                    }
                    this.cdr.markForCheck();
                }
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

    /**
     * Maneja los atajos de teclado globales del tablero.
     */
    @HostListener('document:keydown', ['$event'])
    handleKeyboardShortcuts(event: KeyboardEvent): void {
        // No procesar shortcuts si estamos en un input, textarea o modal
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || 
            target.closest('input') || target.closest('textarea')) {
            // Permitir escape incluso en inputs para cerrar modales
            if (event.key === 'Escape') {
                this.handleEscapeKey();
            }
            return;
        }

        // Detectar combinaciones con Ctrl (Windows/Linux) o Cmd (Mac)
        const isCtrl = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();

        // Escape: Cerrar modales
        if (event.key === 'Escape') {
            this.handleEscapeKey();
            return;
        }

        // Ctrl/Cmd + N: Nueva tarjeta en 'todo'
        if (isCtrl && key === 'n') {
            event.preventDefault();
            this.openAddCard('todo');
            return;
        }

        // Ctrl/Cmd + F: Buscar (abrir modal de búsqueda)
        if (isCtrl && key === 'f') {
            event.preventDefault();
            this.searchOpen = !this.searchOpen;
            return;
        }

        // Ctrl/Cmd + S: Guardar (si hay cambios pendientes)
        if (isCtrl && key === 's') {
            event.preventDefault();
            // Si hay un modal abierto con cambios, guardar
            if (this.editOpen) {
                this.saveEdit();
            } else if (this.addOpen) {
                this.saveAdd();
            }
            return;
        }

        // Ctrl/Cmd + K o Ctrl/Cmd + /: Mostrar ayuda de shortcuts
        if (isCtrl && (key === 'k' || key === '/')) {
            event.preventDefault();
            this.shortcutsHelpOpen = !this.shortcutsHelpOpen;
            return;
        }

        // Tecla 'N' o 'n' (sin Ctrl): Nueva tarjeta en la primera columna
        if (key === 'n' && !isCtrl && !event.shiftKey) {
            event.preventDefault();
            this.openAddCard('todo');
            return;
        }

        // Tecla 'E' o 'e': Editar tarjeta seleccionada
        if (key === 'e' && !isCtrl && !event.shiftKey) {
            event.preventDefault();
            if (this.selectedCardIndex) {
                this.editCard(this.selectedCardIndex.list, this.selectedCardIndex.index);
            }
            return;
        }

        // Delete o Backspace: Eliminar tarjeta seleccionada
        if ((event.key === 'Delete' || event.key === 'Backspace') && !isCtrl) {
            event.preventDefault();
            if (this.selectedCardIndex) {
                if (confirm('¿Eliminar esta tarjeta?')) {
                    this.removeCard(this.selectedCardIndex.list, this.selectedCardIndex.index);
                }
            }
            return;
        }

        // Flechas: Navegar entre tarjetas
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            this.handleArrowKeys(event.key);
            return;
        }

        // Números 1, 2, 3: Cambiar a columna Todo, Doing, Done
        if (['1', '2', '3'].includes(key) && !isCtrl) {
            event.preventDefault();
            const lists: ('todo' | 'doing' | 'done')[] = ['todo', 'doing', 'done'];
            const listIndex = parseInt(key) - 1;
            if (listIndex >= 0 && listIndex < lists.length) {
                // Opcional: Podríamos agregar focus a la columna
                // Por ahora solo movemos la selección
                this.selectedCardIndex = null;
            }
            return;
        }
    }

    /**
     * Maneja la tecla Escape para cerrar modales.
     */
    private handleEscapeKey(): void {
        if (this.checklistOpen) {
            this.checklistOpen = false;
            this.checklistCardId = null;
            this.checklistCard = null;
            this.cdr.markForCheck();
            return;
        }
        if (this.commentsOpen) {
            this.commentsOpen = false;
            this.commentsCardId = null;
            this.cdr.markForCheck();
            return;
        }
        if (this.labelsModalOpen) {
            this.labelsModalOpen = false;
            this.editingLabel = null;
            this.newLabelName = '';
            this.newLabelColor = '#3B82F6';
            this.cdr.markForCheck();
            return;
        }
        if (this.editOpen) {
            this.editOpen = false;
            this.editCardId = null;
            this.editGitUrl = '';
            this.editPriority = null;
            this.editDueDate = null;
            this.editAssignee = null;
            this.cdr.markForCheck();
            return;
        }
        if (this.addOpen) {
            this.addOpen = false;
            this.addTitle = '';
            this.addDescription = '';
            this.addGitUrl = '';
            this.addPriority = null;
            this.addDueDate = null;
            this.addAssignee = null;
            this.cdr.markForCheck();
            return;
        }
        if (this.shortcutsHelpOpen) {
            this.shortcutsHelpOpen = false;
            this.cdr.markForCheck();
            return;
        }
    }

    /**
     * Maneja las teclas de flecha para navegar entre tarjetas.
     */
    private handleArrowKeys(key: string): void {
        if (!this.selectedCardIndex) {
            // Si no hay tarjeta seleccionada, seleccionar la primera de 'todo'
            if (this.todo.length > 0) {
                this.selectedCardIndex = { list: 'todo', index: 0 };
                this.cdr.markForCheck();
            }
            return;
        }

        const { list, index } = this.selectedCardIndex;
        const lists = { todo: this.todo, doing: this.doing, done: this.done };
        const currentList = lists[list];

        let newIndex = index;
        let newList: 'todo' | 'doing' | 'done' = list;

        switch (key) {
            case 'ArrowUp':
                newIndex = Math.max(0, index - 1);
                break;
            case 'ArrowDown':
                newIndex = Math.min(currentList.length - 1, index + 1);
                break;
            case 'ArrowLeft':
                // Mover a la columna anterior
                if (list === 'done') newList = 'doing';
                else if (list === 'doing') newList = 'todo';
                else newList = 'todo'; // Ya estamos en todo
                const prevList = lists[newList];
                newIndex = Math.min(prevList.length - 1, Math.floor((index / currentList.length) * prevList.length));
                break;
            case 'ArrowRight':
                // Mover a la columna siguiente
                if (list === 'todo') newList = 'doing';
                else if (list === 'doing') newList = 'done';
                else newList = 'done'; // Ya estamos en done
                const nextList = lists[newList];
                newIndex = Math.min(nextList.length - 1, Math.floor((index / currentList.length) * nextList.length));
                break;
        }

        if (newList !== list || newIndex !== index) {
            this.selectedCardIndex = { list: newList, index: newIndex };
            this.cdr.markForCheck();
        }
    }

    /**
     * Abre el modal para agregar una nueva tarjeta.
     */
    private openAddCard(list: 'todo' | 'doing' | 'done'): void {
        this.addList = list;
        this.addTitle = '';
        this.addDescription = '';
        this.addGitUrl = '';
        this.addPriority = null;
        this.addDueDate = null;
        this.addAssignee = null;
        this.addOpen = true;
        this.cdr.markForCheck();
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

    // Modal de creación - método openAdd
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
        this.addPriority = null;
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
        this.addTitle = '';
        this.addDescription = '';
        this.addGitUrl = '';
        this.addPriority = null;
        this.addDueDate = null;
        this.addAssignee = null;
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
            
            // Agregar prioridad si está definida
            if (this.addPriority !== null && this.addPriority !== undefined) {
                payload.priority = this.addPriority;
            }
            
            // Agregar fecha de vencimiento si está definida
            if (this.addDueDate !== null && this.addDueDate !== undefined && this.addDueDate.trim()) {
                const dueDateTimestamp = this.parseDateInput(this.addDueDate);
                if (dueDateTimestamp) {
                    payload.dueDate = dueDateTimestamp;
                }
            }
            
            // Agregar asignado si está definido
            if (this.addAssignee !== null && this.addAssignee !== undefined && this.addAssignee.trim()) {
                payload.assignee = this.addAssignee.trim();
            }
            
            // Agregar metadata de Git si existe
            if (gitMetadata) {
                payload.metadata = {
                    ...gitMetadata,
                    url: gitMetadata.url
                };
            } else if (this.addGitUrl && this.addGitUrl.trim()) {
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
        this.addTitle = '';
        this.addDescription = '';
        this.addGitUrl = '';
        this.addPriority = null;
        this.addDueDate = null;
        this.addAssignee = null;
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

    /**
     * Abre el modal de gestión de labels.
     */
    openLabelsModal(): void {
        this.labelsModalOpen = true;
        this.editingLabel = null;
        this.newLabelName = '';
        this.newLabelColor = '#3B82F6';
    }

    /**
     * Inicia la edición de un label.
     */
    startEditLabel(label: BoardLabel): void {
        this.editingLabel = label;
        this.newLabelName = label.name;
        this.newLabelColor = label.color;
    }

    /**
     * Valida un color hexadecimal.
     */
    isValidColor(color: string): boolean {
        const colorRegex = /^#[0-9A-Fa-f]{6}$/;
        return colorRegex.test(color);
    }

    /**
     * Crea un nuevo label en el tablero.
     */
    async createLabel(): Promise<void> {
        if (!this.boardId || !this.newLabelName.trim() || !this.isValidColor(this.newLabelColor)) {
            this.alerts.open('Por favor, completa todos los campos correctamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
            return;
        }

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) {
                this.alerts.open('No estás autenticado. Por favor, inicia sesión.', { 
                    label: 'Error', 
                    appearance: 'negative' 
                }).subscribe();
                this.router.navigate(['/login']);
                return;
            }

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/labels`, {
                method: 'POST',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: this.newLabelName.trim(),
                    color: this.newLabelColor.toUpperCase()
                })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al crear la etiqueta' }));
                throw new Error(error.message || 'Error al crear la etiqueta');
            }

            this.newLabelName = '';
            this.newLabelColor = '#3B82F6';
            this.alerts.open('Etiqueta creada exitosamente.', { 
                label: 'Éxito', 
                appearance: 'success' 
            }).subscribe();
        } catch (error: any) {
            console.error('[Kanban] Error al crear label:', error);
            this.alerts.open(error.message || 'Error al crear la etiqueta. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
        }
    }

    /**
     * Actualiza un label existente.
     */
    async updateLabel(): Promise<void> {
        if (!this.boardId || !this.editingLabel || !this.newLabelName.trim() || !this.isValidColor(this.newLabelColor)) {
            this.alerts.open('Por favor, completa todos los campos correctamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
            return;
        }

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) {
                this.alerts.open('No estás autenticado. Por favor, inicia sesión.', { 
                    label: 'Error', 
                    appearance: 'negative' 
                }).subscribe();
                this.router.navigate(['/login']);
                return;
            }

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/labels/${encodeURIComponent(this.editingLabel.id)}`, {
                method: 'PATCH',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: this.newLabelName.trim(),
                    color: this.newLabelColor.toUpperCase()
                })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al actualizar la etiqueta' }));
                throw new Error(error.message || 'Error al actualizar la etiqueta');
            }

            this.editingLabel = null;
            this.newLabelName = '';
            this.newLabelColor = '#3B82F6';
            this.alerts.open('Etiqueta actualizada exitosamente.', { 
                label: 'Éxito', 
                appearance: 'success' 
            }).subscribe();
        } catch (error: any) {
            console.error('[Kanban] Error al actualizar label:', error);
            this.alerts.open(error.message || 'Error al actualizar la etiqueta. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
        }
    }

    /**
     * Elimina un label del tablero.
     */
    async deleteLabel(labelId: string): Promise<void> {
        if (!this.boardId || !labelId) return;

        // Confirmar eliminación
        const confirmed = confirm('¿Estás seguro de que quieres eliminar esta etiqueta? Se eliminará de todas las tarjetas que la tengan. Esta acción no se puede deshacer.');
        if (!confirmed) return;

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) {
                this.alerts.open('No estás autenticado. Por favor, inicia sesión.', { 
                    label: 'Error', 
                    appearance: 'negative' 
                }).subscribe();
                this.router.navigate(['/login']);
                return;
            }

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/labels/${encodeURIComponent(labelId)}`, {
                method: 'DELETE',
                headers: { ...this.getAuthHeaders() },
                credentials: 'include'
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al eliminar la etiqueta' }));
                throw new Error(error.message || 'Error al eliminar la etiqueta');
            }

            this.alerts.open('Etiqueta eliminada exitosamente.', { 
                label: 'Éxito', 
                appearance: 'success' 
            }).subscribe();
        } catch (error: any) {
            console.error('[Kanban] Error al eliminar label:', error);
            this.alerts.open(error.message || 'Error al eliminar la etiqueta. Por favor, intenta nuevamente.', { 
                label: 'Error', 
                appearance: 'negative' 
            }).subscribe();
        }
    }

    /**
     * Obtiene un label por su ID.
     */
    getLabelById(labelId: string): BoardLabel | undefined {
        return this.boardLabels.find(l => l.id === labelId);
    }

    /**
     * Verifica si una tarjeta tiene un label asignado.
     */
    cardHasLabel(cardId: string | null, labelId: string): boolean {
        if (!cardId) return false;
        const card = [...this.todo, ...this.doing, ...this.done].find(c => c.id === cardId);
        return card?.labels?.includes(labelId) ?? false;
    }

    /**
     * Alterna un label en una tarjeta (agregar si no existe, quitar si existe).
     */
    toggleCardLabel(cardId: string | null, labelId: string): void {
        if (!cardId) return;
        const card = [...this.todo, ...this.doing, ...this.done].find(c => c.id === cardId);
        if (!card) return;
        
        if (!card.labels) {
            card.labels = [];
        }
        
        const index = card.labels.indexOf(labelId);
        if (index >= 0) {
            card.labels.splice(index, 1);
        } else {
            card.labels.push(labelId);
        }
        
        // Guardar cambios en el backend
        this.updateCardLabels(cardId, card.labels).catch(err => {
            console.error('[Kanban] Error actualizando labels:', err);
        });
    }

    /**
     * Actualiza los labels de una tarjeta en el backend.
     */
    private async updateCardLabels(cardId: string, labelIds: string[]): Promise<void> {
        if (!this.boardId || !cardId) return;
        
        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) return;
            
            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(cardId)}/labels`, {
                method: 'PATCH',
                headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ labelIds })
            });
            
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al actualizar labels' }));
                throw new Error(error.message || 'Error al actualizar labels');
            }
        } catch (error: any) {
            console.error('[Kanban] Error actualizando labels:', error);
            this.alerts.open(error.message || 'Error al actualizar labels. Por favor, intenta nuevamente.', {
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
        this.editPriority = card.priority ?? null;
        // Cargar fecha de vencimiento si existe
        this.editDueDate = card.dueDate ? this.formatDateForInput(card.dueDate) : null;
        // Cargar asignado si existe
        this.editAssignee = card.assignee ?? null;
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
        
        // Agregar prioridad si está definida
        if (this.editPriority !== null && this.editPriority !== undefined) {
            payload.priority = this.editPriority;
        } else {
            payload.priority = null; // Eliminar prioridad si se deselecciona
        }
        
        // Agregar fecha de vencimiento si está definida
        if (this.editDueDate !== null && this.editDueDate !== undefined && this.editDueDate.trim()) {
            const dueDateTimestamp = this.parseDateInput(this.editDueDate);
            payload.dueDate = dueDateTimestamp;
        } else {
            payload.dueDate = null; // Eliminar fecha de vencimiento si se quita
        }
        
        // Agregar asignado si está definido
        if (this.editAssignee !== null && this.editAssignee !== undefined && this.editAssignee.trim()) {
            payload.assignee = this.editAssignee.trim();
        } else {
            payload.assignee = null; // Eliminar asignado si se desasigna
        }
        
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
        this.editPriority = null;
        this.editDueDate = null;
        this.editAssignee = null;
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
            
            const data = await res.json() as any;
            
            // Validar y actualizar datos
            this.boardName = typeof data.name === 'string' ? data.name : this.boardName;
            
            // Cargar labels del tablero
            if (Array.isArray(data.labels)) {
                this.boardLabels = data.labels;
            } else {
                this.boardLabels = [];
            }
            
            // Cargar miembros del tablero (owner + members)
            const members: string[] = [];
            if (data.owner && typeof data.owner === 'string') {
                members.push(data.owner);
            }
            if (Array.isArray(data.members)) {
                data.members.forEach((email: string) => {
                    if (email && typeof email === 'string' && !members.includes(email)) {
                        members.push(email);
                    }
                });
            }
            this.boardMembers = members;
            
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
     * Formatea una fecha de vencimiento para mostrar.
     */
    formatDueDate(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diff = dueDate.getTime() - today.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days < 0) {
            return `Vencida hace ${Math.abs(days)}d`;
        }
        if (days === 0) {
            return 'Vence hoy';
        }
        if (days === 1) {
            return 'Vence mañana';
        }
        if (days <= 7) {
            return `Vence en ${days}d`;
        }
        
        // Formato largo para fechas más lejanas
        const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${date.getDate()} ${months[date.getMonth()]}`;
    }

    /**
     * Verifica si una fecha de vencimiento está vencida.
     */
    isOverdue(timestamp: number): boolean {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueDate = new Date(new Date(timestamp).getFullYear(), new Date(timestamp).getMonth(), new Date(timestamp).getDate());
        return dueDate.getTime() < today.getTime();
    }

    /**
     * Verifica si una fecha de vencimiento está próxima (dentro de 3 días).
     */
    isDueSoon(timestamp: number): boolean {
        if (this.isOverdue(timestamp)) return false;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueDate = new Date(new Date(timestamp).getFullYear(), new Date(timestamp).getMonth(), new Date(timestamp).getDate());
        const diff = dueDate.getTime() - today.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        return days <= 3;
    }

    /**
     * Obtiene la fecha de hoy en formato YYYY-MM-DD para input date.
     */
    getTodayDate(): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Convierte un timestamp a formato YYYY-MM-DD para input date.
     */
    formatDateForInput(timestamp: number): string {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Convierte un string YYYY-MM-DD a timestamp (epoch ms).
     */
    parseDateInput(dateString: string | null): number | null {
        if (!dateString) return null;
        // Crear fecha a medianoche UTC para evitar problemas de zona horaria
        const date = new Date(dateString + 'T00:00:00');
        return date.getTime();
    }

    /**
     * Obtiene las iniciales de un email para mostrar como avatar.
     */
    getInitials(email: string): string {
        if (!email) return '?';
        // Extraer nombre y apellido del email si es posible
        const parts = email.split('@')[0].split(/[._-]/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
        }
        // Si solo hay una parte, tomar las primeras 2 letras
        if (parts[0].length >= 2) {
            return parts[0].slice(0, 2).toUpperCase();
        }
        return parts[0][0].toUpperCase();
    }

    /**
     * Aplica los filtros de búsqueda y actualiza la vista.
     */
    applySearch(): void {
        this.cdr.markForCheck();
    }

    /**
     * Limpia todos los filtros de búsqueda.
     */
    clearSearch(): void {
        this.searchQuery = '';
        this.searchFilters = {};
        this.cdr.markForCheck();
    }

    /**
     * Verifica si hay filtros activos.
     */
    hasActiveFilters(): boolean {
        return !!(
            this.searchQuery.trim() ||
            this.searchFilters.column ||
            this.searchFilters.priority ||
            this.searchFilters.assignee ||
            this.searchFilters.dueDate ||
            (this.searchFilters.labels && this.searchFilters.labels.length > 0)
        );
    }

    /**
     * Alterna un label en los filtros de búsqueda.
     */
    toggleSearchLabel(labelId: string): void {
        if (!this.searchFilters.labels) {
            this.searchFilters.labels = [];
        }
        const index = this.searchFilters.labels.indexOf(labelId);
        if (index >= 0) {
            this.searchFilters.labels.splice(index, 1);
        } else {
            this.searchFilters.labels.push(labelId);
        }
        this.applySearch();
    }

    /**
     * Obtiene los resultados de la búsqueda filtrados.
     */
    getSearchResults(): Array<{ card: KanbanCard; list: 'todo' | 'doing' | 'done'; index: number }> {
        const allCards: Array<{ card: KanbanCard; list: 'todo' | 'doing' | 'done'; index: number }> = [];
        
        // Agregar todas las tarjetas con su información de lista
        this.todo.forEach((card, index) => {
            allCards.push({ card, list: 'todo', index });
        });
        this.doing.forEach((card, index) => {
            allCards.push({ card, list: 'doing', index });
        });
        this.done.forEach((card, index) => {
            allCards.push({ card, list: 'done', index });
        });

        // Si no hay filtros activos, retornar todas las tarjetas
        if (!this.hasActiveFilters()) {
            return allCards;
        }

        // Filtrar por texto de búsqueda
        let filtered = allCards;
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase().trim();
            filtered = filtered.filter(({ card }) => {
                const titleMatch = card.title?.toLowerCase().includes(query);
                const descMatch = card.description?.toLowerCase().includes(query);
                return titleMatch || descMatch;
            });
        }

        // Filtrar por columna
        if (this.searchFilters.column && this.searchFilters.column !== 'all') {
            filtered = filtered.filter(({ list }) => list === this.searchFilters.column);
        }

        // Filtrar por prioridad
        if (this.searchFilters.priority) {
            filtered = filtered.filter(({ card }) => card.priority === this.searchFilters.priority);
        }

        // Filtrar por asignado
        if (this.searchFilters.assignee) {
            if (this.searchFilters.assignee === 'unassigned') {
                filtered = filtered.filter(({ card }) => !card.assignee);
            } else {
                filtered = filtered.filter(({ card }) => card.assignee === this.searchFilters.assignee);
            }
        }

        // Filtrar por fecha de vencimiento
        if (this.searchFilters.dueDate) {
            filtered = filtered.filter(({ card }) => {
                if (!card.dueDate) {
                    return this.searchFilters.dueDate === 'noDueDate';
                }
                if (this.searchFilters.dueDate === 'overdue') {
                    return this.isOverdue(card.dueDate);
                }
                if (this.searchFilters.dueDate === 'dueSoon') {
                    return this.isDueSoon(card.dueDate);
                }
                if (this.searchFilters.dueDate === 'due') {
                    return true; // Tiene fecha (no vencida y no próxima)
                }
                return false;
            });
        }

        // Filtrar por labels
        if (this.searchFilters.labels && this.searchFilters.labels.length > 0) {
            filtered = filtered.filter(({ card }) => {
                if (!card.labels || card.labels.length === 0) return false;
                // La tarjeta debe tener al menos uno de los labels seleccionados
                return this.searchFilters.labels!.some(labelId => card.labels!.includes(labelId));
            });
        }

        return filtered;
    }

    /**
     * Selecciona un resultado de búsqueda y navega a él.
     */
    selectSearchResult(list: 'todo' | 'doing' | 'done', index: number): void {
        this.selectedCardIndex = { list, index };
        this.searchOpen = false;
        // Scroll a la tarjeta si es necesario
        setTimeout(() => {
            const cards = document.querySelectorAll('.kanban-card');
            if (cards.length > 0 && this.selectedCardIndex) {
                // Calcular índice global para encontrar la tarjeta
                let globalIndex = 0;
                if (this.selectedCardIndex.list === 'todo') {
                    globalIndex = this.selectedCardIndex.index;
                } else if (this.selectedCardIndex.list === 'doing') {
                    globalIndex = this.todo.length + this.selectedCardIndex.index;
                } else {
                    globalIndex = this.todo.length + this.doing.length + this.selectedCardIndex.index;
                }
                const targetCard = Array.from(cards)[globalIndex];
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (targetCard as HTMLElement).focus();
                }
            }
        }, 100);
        this.cdr.markForCheck();
    }

    /**
     * Obtiene el nombre de la prioridad para mostrar.
     */
    getPriorityName(priority: 'low' | 'medium' | 'high' | 'urgent'): string {
        const names: Record<string, string> = {
            low: 'Baja',
            medium: 'Media',
            high: 'Alta',
            urgent: 'Urgente'
        };
        return names[priority] || priority;
    }

    /**
     * Obtiene el color de la prioridad para mostrar.
     */
    getPriorityColor(priority: 'low' | 'medium' | 'high' | 'urgent'): string {
        const colors: Record<string, string> = {
            low: 'gray',
            medium: 'blue',
            high: 'orange',
            urgent: 'red'
        };
        return colors[priority] || 'gray';
    }

    /**
     * Abre el modal de checklist para una tarjeta.
     */
    async openChecklist(cardId: string): Promise<void> {
        if (!this.boardId || !cardId) return;
        
        // Buscar la tarjeta en todas las listas
        const allCards = [...this.todo, ...this.doing, ...this.done];
        const card = allCards.find(c => c.id === cardId);
        
        if (!card) {
            this.alerts.open('Tarjeta no encontrada', { label: 'Error', appearance: 'negative' }).subscribe();
            return;
        }
        
        this.checklistCardId = cardId;
        this.checklistCard = { ...card };
        this.checklistOpen = true;
        this.newChecklistItemText = '';
        this.cdr.markForCheck();
    }

    /**
     * Agrega un nuevo item al checklist.
     */
    async addChecklistItem(): Promise<void> {
        if (!this.checklistCardId || !this.boardId || !this.newChecklistItemText.trim()) return;

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) {
                this.alerts.open('No estás autenticado', { label: 'Error', appearance: 'negative' }).subscribe();
                return;
            }

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(this.checklistCardId)}/checklist`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: this.newChecklistItemText.trim()
                })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al agregar item' }));
                throw new Error(error.message || `Error ${res.status}`);
            }

            const data = await res.json() as { item: ChecklistItem };
            
            // Actualizar el checklist localmente
            if (this.checklistCard && this.checklistCard.checklist) {
                this.checklistCard.checklist.push(data.item);
            } else if (this.checklistCard) {
                this.checklistCard.checklist = [data.item];
            }
            
            this.newChecklistItemText = '';
            this.cdr.markForCheck();
        } catch (err: any) {
            console.error('[Kanban] Error agregando item al checklist:', err);
            this.alerts.open(err.message || 'Error al agregar item al checklist', { label: 'Error', appearance: 'negative' }).subscribe();
        }
    }

    /**
     * Alterna el estado completado de un item del checklist.
     */
    async toggleChecklistItem(cardId: string, itemId: string, event: Event): Promise<void> {
        if (!this.boardId || !cardId || !itemId) return;
        
        const checkbox = event.target as HTMLInputElement;
        const completed = checkbox.checked;

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) return;

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(cardId)}/checklist/${encodeURIComponent(itemId)}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    completed
                })
            });

            if (!res.ok) {
                // Revertir el cambio si falla
                checkbox.checked = !completed;
                const error = await res.json().catch(() => ({ message: 'Error al actualizar item' }));
                throw new Error(error.message || `Error ${res.status}`);
            }

            // Actualizar el checklist localmente
            if (this.checklistCard && this.checklistCard.checklist) {
                const item = this.checklistCard.checklist.find(i => i.id === itemId);
                if (item) {
                    item.completed = completed;
                    item.completedAt = completed ? Date.now() : undefined;
                }
            }
            
            this.cdr.markForCheck();
        } catch (err: any) {
            console.error('[Kanban] Error actualizando item del checklist:', err);
            this.alerts.open(err.message || 'Error al actualizar item', { label: 'Error', appearance: 'negative' }).subscribe();
        }
    }

    /**
     * Elimina un item del checklist.
     */
    async deleteChecklistItem(cardId: string, itemId: string): Promise<void> {
        if (!this.boardId || !cardId || !itemId) return;

        if (!confirm('¿Eliminar este item del checklist?')) {
            return;
        }

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) return;

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(cardId)}/checklist/${encodeURIComponent(itemId)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error al eliminar item' }));
                throw new Error(error.message || `Error ${res.status}`);
            }

            // Actualizar el checklist localmente
            if (this.checklistCard && this.checklistCard.checklist) {
                this.checklistCard.checklist = this.checklistCard.checklist.filter(i => i.id !== itemId);
            }
            
            this.cdr.markForCheck();
        } catch (err: any) {
            console.error('[Kanban] Error eliminando item del checklist:', err);
            this.alerts.open(err.message || 'Error al eliminar item', { label: 'Error', appearance: 'negative' }).subscribe();
        }
    }

    /**
     * Obtiene el número de items completados en un checklist.
     */
    getChecklistProgress(checklist: ChecklistItem[] | undefined): number {
        if (!checklist || checklist.length === 0) return 0;
        return checklist.filter(item => item.completed).length;
    }

    /**
     * Obtiene el porcentaje de items completados en un checklist.
     */
    getChecklistProgressPercent(checklist: ChecklistItem[] | undefined): number {
        if (!checklist || checklist.length === 0) return 0;
        const completed = this.getChecklistProgress(checklist);
        return Math.round((completed / checklist.length) * 100);
    }

    /**
     * Abre el modal de historial de actividad y carga las actividades.
     */
    async openActivityHistory(): Promise<void> {
        this.activityOpen = true;
        await this.loadActivities();
    }

    /**
     * Carga las actividades del tablero desde el API.
     */
    async loadActivities(): Promise<void> {
        if (!this.boardId) return;
        
        this.loadingActivities = true;
        this.cdr.markForCheck();
        
        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) {
                this.alerts.open('No estás autenticado', { label: 'Error', appearance: 'negative' }).subscribe();
                return;
            }

            const params = new URLSearchParams();
            params.append('limit', '50');
            if (this.activityFilters.action) {
                params.append('action', this.activityFilters.action);
            }
            if (this.activityFilters.entityType) {
                params.append('entityType', this.activityFilters.entityType);
            }

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/activity?${params.toString()}`, {
                credentials: 'include',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    this.alerts.open('No tienes acceso a este tablero', { label: 'Error', appearance: 'negative' }).subscribe();
                    return;
                }
                throw new Error(`Error ${res.status}: ${res.statusText}`);
            }

            const data = await res.json() as {
                activities: Array<{
                    _id: string;
                    boardId: string;
                    userId: string;
                    action: string;
                    entityType: 'card' | 'label' | 'board' | 'comment' | 'checklist';
                    entityId?: string;
                    details?: Record<string, unknown>;
                    timestamp: number;
                }>;
                total: number;
                limit: number;
                offset: number;
                hasMore: boolean;
            };

            this.activities = data.activities || [];
            this.cdr.markForCheck();
        } catch (err: any) {
            console.error('[ActivityHistory] Error cargando actividades:', err);
            this.alerts.open('Error al cargar el historial de actividad', { label: 'Error', appearance: 'negative' }).subscribe();
            this.activities = [];
        } finally {
            this.loadingActivities = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Obtiene el icono apropiado para una acción.
     */
    getActivityIcon(action: string): string {
        const iconMap: Record<string, string> = {
            card_created: 'tuiIconPlus',
            card_updated: 'tuiIconEdit',
            card_deleted: 'tuiIconTrash',
            card_moved: 'tuiIconArrowRight',
            card_assigned: 'tuiIconUser',
            card_unassigned: 'tuiIconUserX',
            label_created: 'tuiIconTag',
            label_updated: 'tuiIconEdit',
            label_deleted: 'tuiIconTrash',
            board_renamed: 'tuiIconEdit',
            board_member_added: 'tuiIconUserPlus',
            board_member_removed: 'tuiIconUserX',
            comment_added: 'tuiIconMessage',
            comment_updated: 'tuiIconEdit',
            comment_deleted: 'tuiIconTrash'
        };
        return iconMap[action] || 'tuiIconInfo';
    }

    /**
     * Obtiene el nombre legible de una acción.
     */
    getActivityActionName(action: string): string {
        const nameMap: Record<string, string> = {
            card_created: 'Creado',
            card_updated: 'Editado',
            card_deleted: 'Eliminado',
            card_moved: 'Movido',
            card_assigned: 'Asignado',
            card_unassigned: 'Sin asignar',
            label_created: 'Creado',
            label_updated: 'Editado',
            label_deleted: 'Eliminado',
            board_renamed: 'Renombrado',
            board_member_added: 'Miembro agregado',
            board_member_removed: 'Miembro eliminado',
            comment_added: 'Comentario agregado',
            comment_updated: 'Comentario editado',
            comment_deleted: 'Comentario eliminado'
        };
        return nameMap[action] || action;
    }

    /**
     * Genera el mensaje descriptivo de una actividad.
     */
    getActivityMessage(activity: {
        action: string;
        entityType: string;
        details?: Record<string, unknown>;
    }): string {
        const details = activity.details || {};
        
        if (activity.action === 'card_created') {
            return `Creó la tarjeta "${details['cardTitle'] || 'Sin título'}"`;
        }
        if (activity.action === 'card_updated') {
            const cardTitle = details['cardTitle'] || 'Sin título';
            return `Editó la tarjeta "${cardTitle}"`;
        }
        if (activity.action === 'card_deleted') {
            return `Eliminó la tarjeta "${details['cardTitle'] || 'Sin título'}"`;
        }
        if (activity.action === 'card_moved') {
            const cardTitle = details['cardTitle'] || 'Sin título';
            const fromList = details['fromList'] ? this.getListNameForActivity(details['fromList'] as 'todo' | 'doing' | 'done') : '';
            const toList = details['toList'] ? this.getListNameForActivity(details['toList'] as 'todo' | 'doing' | 'done') : '';
            return `Movió la tarjeta "${cardTitle}" de ${fromList} a ${toList}`;
        }
        if (activity.action === 'label_created') {
            return `Creó el label "${details['labelName'] || 'Sin nombre'}"`;
        }
        if (activity.action === 'label_updated') {
            return `Editó el label "${details['labelName'] || 'Sin nombre'}"`;
        }
        if (activity.action === 'label_deleted') {
            return `Eliminó el label "${details['labelName'] || 'Sin nombre'}"`;
        }
        if (activity.action === 'board_renamed') {
            return `Renombró el tablero a "${details['boardName'] || 'Sin nombre'}"`;
        }
        if (activity.action === 'board_member_added') {
            return `Agregó al miembro "${details['memberEmail'] || 'Sin email'}"`;
        }
        if (activity.action === 'board_member_removed') {
            return `Eliminó al miembro "${details['memberEmail'] || 'Sin email'}"`;
        }
        
        return `${this.getActivityActionName(activity.action)} ${activity.entityType}`;
    }

    /**
     * Verifica si una actividad tiene detalles que mostrar.
     */
    hasActivityDetails(activity: {
        details?: Record<string, unknown>;
    }): boolean {
        const details = activity.details || {};
        return !!(details['field'] || details['fromList'] || details['toList']);
    }

    /**
     * Obtiene el nombre legible de un campo.
     */
    getFieldName(field: string): string {
        const fieldMap: Record<string, string> = {
            title: 'Título',
            description: 'Descripción',
            priority: 'Prioridad',
            assignee: 'Asignado',
            dueDate: 'Fecha de vencimiento',
            labels: 'Etiquetas'
        };
        return fieldMap[field] || field;
    }

    /**
     * Formatea un valor de detalle para mostrar.
     */
    formatDetailValue(value: unknown): string {
        if (value === null || value === undefined) {
            return 'Sin valor';
        }
        if (Array.isArray(value)) {
            return value.length > 0 ? value.join(', ') : 'Ninguno';
        }
        if (typeof value === 'number') {
            // Si es un timestamp, formatearlo como fecha
            if (value > 1000000000000) {
                return new Date(value).toLocaleDateString('es-ES');
            }
            return value.toString();
        }
        if (typeof value === 'boolean') {
            return value ? 'Sí' : 'No';
        }
        return String(value);
    }

    /**
     * Formatea la fecha de una actividad.
     */
    formatActivityDate(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'Hace menos de un minuto';
        }
        if (diffMins < 60) {
            return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
        }
        if (diffHours < 24) {
            return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
        }
        if (diffDays < 7) {
            return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
        }
        return date.toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Obtiene el nombre legible de una lista.
     */
    getListNameForActivity(list: 'todo' | 'doing' | 'done'): string {
        const names: Record<string, string> = {
            todo: 'Por hacer',
            doing: 'En progreso',
            done: 'Hecho'
        };
        return names[list] || list;
    }

    /**
     * Obtiene las clases CSS para el badge de una lista.
     */
    getListBadgeClass(list: 'todo' | 'doing' | 'done'): string {
        const classes: Record<string, string> = {
            todo: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
            doing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
            done: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        };
        return classes[list] || '';
    }

    /**
     * Exporta el tablero a JSON o CSV.
     */
    async exportBoard(format: 'json' | 'csv'): Promise<void> {
        if (!this.boardId) {
            this.alerts.open('No se puede exportar: tablero no encontrado', { label: 'Error', appearance: 'negative' }).subscribe();
            return;
        }

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) {
                this.alerts.open('No estás autenticado. Por favor, inicia sesión.', { label: 'Error', appearance: 'negative' }).subscribe();
                this.router.navigate(['/login']);
                return;
            }

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/export/${format}`, {
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
                    return;
                } else if (res.status === 404) {
                    this.alerts.open('Tablero no encontrado.', { label: 'Error', appearance: 'negative' }).subscribe();
                    return;
                }
                const errorData = await res.json().catch(() => ({}));
                this.alerts.open(`Error al exportar: ${errorData.message || res.statusText}`, { label: 'Error', appearance: 'negative' }).subscribe();
                return;
            }

            // Obtener el nombre del archivo del header o generar uno
            const contentDisposition = res.headers.get('Content-Disposition');
            let filename = `taskforge-board-${this.boardId}-${Date.now()}.${format}`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match) {
                    filename = match[1];
                }
            }

            // Descargar el archivo
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.alerts.open(`Tablero exportado exitosamente como ${format.toUpperCase()}`, { label: 'Éxito', appearance: 'success' }).subscribe();
        } catch (error) {
            console.error('[Kanban] Error al exportar tablero:', error);
            this.alerts.open('Error al exportar el tablero. Por favor, intenta nuevamente.', { label: 'Error', appearance: 'negative' }).subscribe();
        }
    }

    /**
     * Abre el panel de comentarios para una tarjeta.
     */
    async openComments(cardId: string): Promise<void> {
        this.commentsCardId = cardId;
        this.commentsOpen = true;
        this.newCommentText = '';
        
        // Cargar comentarios si no están en caché
        if (!this.comments.has(cardId) || this.comments.get(cardId)!.length === 0) {
            await this.loadComments(cardId);
        }
        
        this.cdr.markForCheck();
    }

    /**
     * Carga los comentarios de una tarjeta.
     */
    private async loadComments(cardId: string): Promise<void> {
        if (!this.boardId || !cardId) return;

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) return;

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(cardId)}/comments`, {
                credentials: 'include',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) {
                console.error('[Kanban] Error cargando comentarios:', res.status, res.statusText);
                return;
            }

            const comments = await res.json() as CardComment[];
            this.comments.set(cardId, comments || []);
            this.cdr.markForCheck();
        } catch (error) {
            console.error('[Kanban] Error cargando comentarios:', error);
        }
    }

    /**
     * Maneja el evento keydown en el textarea de comentarios.
     * Permite Enter para enviar, Shift+Enter para nueva línea.
     */
    handleCommentKeydown(event: Event): void {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
            keyboardEvent.preventDefault();
            this.addComment();
        }
    }

    /**
     * Crea un nuevo comentario.
     */
    async addComment(): Promise<void> {
        if (!this.commentsCardId || !this.boardId || !this.newCommentText.trim()) return;

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) {
                this.alerts.open('No estás autenticado. Por favor, inicia sesión.', { label: 'Error', appearance: 'negative' }).subscribe();
                return;
            }

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(this.commentsCardId)}/comments`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: this.newCommentText.trim(),
                    author: userEmail
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                this.alerts.open(`Error al crear comentario: ${errorData.message || res.statusText}`, { label: 'Error', appearance: 'negative' }).subscribe();
                return;
            }

            const comment = await res.json() as CardComment;
            const cardComments = this.comments.get(this.commentsCardId) || [];
            cardComments.push(comment);
            this.comments.set(this.commentsCardId, cardComments);
            this.newCommentText = '';
            this.cdr.markForCheck();
        } catch (error) {
            console.error('[Kanban] Error creando comentario:', error);
            this.alerts.open('Error al crear comentario. Por favor, intenta nuevamente.', { label: 'Error', appearance: 'negative' }).subscribe();
        }
    }

    /**
     * Elimina un comentario.
     */
    async deleteComment(commentId: string): Promise<void> {
        if (!this.commentsCardId || !this.boardId) return;

        try {
            const userEmail = this.auth.getEmail();
            if (!userEmail) return;

            const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/cards/${encodeURIComponent(this.commentsCardId)}/comments/${encodeURIComponent(commentId)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                this.alerts.open(`Error al eliminar comentario: ${errorData.message || res.statusText}`, { label: 'Error', appearance: 'negative' }).subscribe();
                return;
            }

            const cardComments = this.comments.get(this.commentsCardId) || [];
            const filtered = cardComments.filter(c => c._id !== commentId);
            this.comments.set(this.commentsCardId, filtered);
            this.cdr.markForCheck();
        } catch (error) {
            console.error('[Kanban] Error eliminando comentario:', error);
            this.alerts.open('Error al eliminar comentario. Por favor, intenta nuevamente.', { label: 'Error', appearance: 'negative' }).subscribe();
        }
    }

    /**
     * Obtiene el número de comentarios de una tarjeta.
     */
    getCommentCount(cardId: string): number {
        return this.comments.get(cardId)?.length || 0;
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


