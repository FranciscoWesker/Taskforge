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
import { AIService } from '../core/ai.service';
import { API_BASE, isDevelopment } from '../core/env';
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
    <div class="mb-8 space-y-6 animate-in">
      <!-- Header del tablero -->
      <div class="flex flex-col gap-4 px-1">
        <!-- Título del tablero -->
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
          <h1 class="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate flex-1 tracking-tight">
            {{ boardName || 'Tablero Kanban' }}
          </h1>
          <button 
            tuiButton 
            type="button" 
            appearance="outline" 
            size="s" 
            iconStart="tuiIconEdit"
            (click)="renameBoard()"
            class="flex-shrink-0 hover-lift border-slate-200 dark:border-slate-700 hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-400 transition-all shadow-sm rounded-lg"
            title="Renombrar tablero"
          >
            <span class="hidden sm:inline">Renombrar</span>
            <span class="sm:hidden">Editar</span>
          </button>
        </div>
        
        <!-- Botones de acción -->
        <div class="flex flex-wrap gap-2">
          <a
            routerLink="/app/boards"
            tuiButton
            type="button"
            appearance="flat"
            size="s"
            iconStart="tuiIconChevronLeft"
            class="text-slate-600 dark:text-slate-400 flex-shrink-0 hover-lift hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Volver a la lista de tableros"
            (click)="navigateToBoardsList()"
          >
            <span class="hidden sm:inline">Volver a tableros</span>
            <span class="sm:hidden">Volver</span>
          </a>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconSearch"
            (click)="searchOpen = !searchOpen"
            class="text-slate-600 dark:text-slate-400 flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Buscar tarjetas (Ctrl+F o Cmd+F)"
          >
            <span class="hidden sm:inline">Buscar</span>
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconBarChart"
            (click)="openStatistics()"
            class="text-slate-600 dark:text-slate-400 flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Ver estadísticas del tablero"
          >
            <span class="hidden sm:inline">Estadísticas</span>
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconHistory"
            (click)="openActivityHistory()"
            class="text-slate-600 dark:text-slate-400 flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Ver historial de actividad"
          >
            <span class="hidden sm:inline">Historial</span>
          </button>
          @if (aiAvailable) {
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="s"
              iconStart="tuiIconAlertCircle"
              (click)="detectBottlenecks()"
              class="text-orange-600 dark:text-orange-400 flex-shrink-0"
              title="Detectar cuellos de botella"
            >
              <span class="hidden sm:inline">Cuellos de botella</span>
              <span class="sm:hidden">Cuellos</span>
            </button>
          }
          <button 
            tuiButton 
            type="button" 
            appearance="primary" 
            size="s"
            iconStart="tuiIconPlus"
            (click)="openAdd('todo')"
            class="flex-shrink-0"
          >
            <span class="hidden sm:inline">Añadir a Por hacer</span>
            <span class="sm:hidden">Por hacer</span>
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="primary" 
            size="s"
            iconStart="tuiIconPlus"
            (click)="openAdd('doing')"
            class="flex-shrink-0"
          >
            <span class="hidden sm:inline">Añadir a En progreso</span>
            <span class="sm:hidden">En progreso</span>
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="primary" 
            size="s"
            iconStart="tuiIconPlus"
            (click)="openAdd('done')"
            class="flex-shrink-0"
          >
            <span class="hidden sm:inline">Añadir a Hecho</span>
            <span class="sm:hidden">Hecho</span>
          </button>
        </div>
      </div>

      <!-- Estadísticas y controles WIP -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 p-5 sm:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-sm">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-3 px-4 py-3 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
            <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-sm text-white">
              <tui-icon icon="tuiIconGridLarge" class="text-base"></tui-icon>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">Total</span>
              <span class="text-xl font-bold text-slate-900 dark:text-slate-100 leading-none mt-0.5">{{ todo.length + doing.length + done.length }}</span>
            </div>
          </div>
          <div class="flex items-center gap-3 px-4 py-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl border border-amber-200/50 dark:border-amber-800/30 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
            <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm text-white">
              <tui-icon icon="tuiIconRefresh" class="text-base"></tui-icon>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">En progreso</span>
              <span class="text-xl font-bold text-slate-900 dark:text-slate-100 leading-none mt-0.5">{{ doing.length }}</span>
            </div>
          </div>
          <div class="flex items-center gap-3 px-4 py-3 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl border border-emerald-200/50 dark:border-emerald-800/30 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
            <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm text-white">
              <tui-icon icon="tuiIconCheckCircle" class="text-base"></tui-icon>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">Completadas</span>
              <span class="text-xl font-bold text-slate-900 dark:text-slate-100 leading-none mt-0.5">{{ done.length }}</span>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <a
            [routerLink]="['/app/settings/integrations']"
            [queryParams]="{ boardId: boardId }"
            tuiButton
            type="button"
            appearance="flat"
            size="s"
            iconStart="tuiIconSettings"
            class="hover-lift text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Gestionar integraciones Git"
          >
            <span class="hidden sm:inline">Integraciones Git</span>
            <span class="sm:hidden">Git</span>
          </a>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconRefresh"
            (click)="openDeploymentPanel()"
            class="hover-lift text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg"
            title="Ver logs de deployment y CI/CD"
          >
            <span class="hidden sm:inline">Deployment Logs</span>
            <span class="sm:hidden">Logs</span>
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconTag"
            (click)="openLabelsModal()"
            class="hover-lift text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Gestionar etiquetas"
          >
            <span class="hidden sm:inline">Etiquetas</span>
            <span class="sm:hidden">Tags</span>
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconDownload"
            (click)="exportBoard('json')"
            class="hover-lift text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Exportar a JSON"
          >
            <span class="hidden sm:inline">Exportar JSON</span>
            <span class="sm:hidden">JSON</span>
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconDownload"
            (click)="exportBoard('csv')"
            class="hover-lift text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Exportar a CSV"
          >
            <span class="hidden sm:inline">Exportar CSV</span>
            <span class="sm:hidden">CSV</span>
          </button>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="s"
            iconStart="tuiIconRefresh"
            (click)="resetWip()"
            [disabled]="wipSaving"
            class="hover-lift text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <span class="hidden sm:inline">Reset WIP</span>
            <span class="sm:hidden">Reset</span>
          </button>
          @if (wipSaving) {
            <span class="text-sm text-slate-600 dark:text-slate-400 font-medium flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-700 animate-fade-in">
              <span class="spinner-sm"></span>
              Guardando…
            </span>
          }
          @if (wipJustSaved && !wipSaving) {
            <span class="text-sm text-green-700 dark:text-green-400 font-medium flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-700">
              <tui-icon icon="tuiIconCheck" class="text-sm"></tui-icon>
              Guardado
            </span>
          }
        </div>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
      <!-- Columna: Por hacer -->
      <div class="flex flex-col space-y-4 min-w-0">
        <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200/80 dark:border-slate-800/50 shadow-sm backdrop-blur-sm">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-2 h-2 rounded-full bg-primary-500 shadow-sm flex-shrink-0"></div>
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              Por hacer
            </h2>
            <span class="ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg flex-shrink-0" 
                  [class.bg-red-100]="isExceeded('todo')" 
                  [class.text-red-700]="isExceeded('todo')"
                  [class.dark:bg-red-900/30]="isExceeded('todo')"
                  [class.dark:text-red-300]="isExceeded('todo')"
                  [class.bg-slate-100]="!isExceeded('todo')" 
                  [class.text-slate-700]="!isExceeded('todo')"
                  [class.dark:bg-slate-800/50]="!isExceeded('todo')"
                  [class.dark:text-slate-300]="!isExceeded('todo')">
              {{ todo.length }}/{{ wipLimits.todo }}
            </span>
          </div>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="xs"
            iconStart="tuiIconSettings"
            (click)="setWipLimit('todo')"
            class="opacity-70 hover:opacity-100 text-slate-500 dark:text-slate-400"
            title="Configurar límite WIP"
          ></button>
        </div>
        <div 
          cdkDropList 
          id="todo-list"
          [cdkDropListData]="todo" 
          [cdkDropListConnectedTo]="['doing-list', 'done-list']"
          (cdkDropListDropped)="drop($event)" 
          class="bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl p-4 min-h-[600px] space-y-3 transition-all duration-300 border-2 border-dashed border-slate-200 dark:border-slate-800/50 relative"
          [ngClass]="{
            'border-red-400 bg-red-50/50 dark:bg-red-900/10': wipFlash.todo,
            'border-slate-200 dark:border-slate-800/50': !wipFlash.todo
          }"
        >
          @if (todo.length === 0) {
            <div class="flex flex-col items-center justify-center h-full min-h-[500px] text-slate-400 dark:text-slate-500 rounded-xl">
              <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary-100 to-indigo-100 dark:from-primary-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-4 shadow-sm">
                <tui-icon icon="tuiIconPlus" class="text-3xl text-primary-500 dark:text-primary-400"></tui-icon>
              </div>
              <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Arrastra tarjetas aquí</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">o crea una nueva tarjeta</p>
            </div>
          }
          @for (c of todo; track c.id; let i = $index) {
            <div 
              class="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/50 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 cursor-move group min-h-[140px] flex flex-col relative isolate"
              [class.ring-2]="selectedCardIndex?.list === 'todo' && selectedCardIndex?.index === i"
              [class.ring-primary-500]="selectedCardIndex?.list === 'todo' && selectedCardIndex?.index === i"
              [class.border-primary-500]="selectedCardIndex?.list === 'todo' && selectedCardIndex?.index === i"
              [class.shadow-md]="selectedCardIndex?.list === 'todo' && selectedCardIndex?.index === i"
              [class.z-10]="selectedCardIndex?.list === 'todo' && selectedCardIndex?.index === i"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('todo', i); selectedCardIndex = { list: 'todo', index: i };"
              (keydown.space)="editCard('todo', i); selectedCardIndex = { list: 'todo', index: i };"
              (click)="selectedCardIndex = { list: 'todo', index: i }"
            >
              <div class="p-4 flex-1 flex flex-col overflow-visible">
                <!-- Header con prioridad y etiquetas -->
                @if (c.priority || (c.labels && c.labels.length > 0)) {
                  <div class="flex items-center gap-2 mb-3 flex-wrap">
                    @if (c.priority) {
                      @switch (c.priority) {
                        @case ('urgent') {
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-semibold rounded-lg border border-red-200/50 dark:border-red-800/30 shadow-sm">
                            <tui-icon icon="tuiIconAlertCircle" class="text-xs w-3.5 h-3.5"></tui-icon>
                            Urgente
                          </span>
                        }
                        @case ('high') {
                          <span class="inline-flex items-center px-2.5 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xs font-semibold rounded-lg border border-orange-200/50 dark:border-orange-800/30 shadow-sm">
                            Alta
                          </span>
                        }
                        @case ('medium') {
                          <span class="inline-flex items-center px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-lg border border-amber-200/50 dark:border-amber-800/30 shadow-sm">
                            Media
                          </span>
                        }
                        @case ('low') {
                          <span class="inline-flex items-center px-2.5 py-1 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 text-xs font-semibold rounded-lg border border-primary-200/50 dark:border-primary-800/30 shadow-sm">
                            Baja
                          </span>
                        }
                      }
                    }
                    @if (c.labels && c.labels.length > 0) {
                      @for (labelId of c.labels.slice(0, 3); track labelId) {
                        @if (getLabelById(labelId)) {
                          <span 
                            class="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border shadow-sm"
                            [style.background-color]="getLabelById(labelId)!.color + '15'"
                            [style.color]="getLabelById(labelId)!.color"
                            [style.border-color]="getLabelById(labelId)!.color + '40'"
                          >
                            {{ getLabelById(labelId)!.name }}
                          </span>
                        }
                      }
                      @if (c.labels.length > 3) {
                        <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">+{{ c.labels.length - 3 }}</span>
                      }
                    }
                  </div>
                }
                
                <!-- Título y acciones -->
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-start gap-2 mb-1">
                      @if (c.metadata?.type === 'commit') {
                        <tui-icon icon="tuiIconCode" class="text-blue-600 dark:text-blue-400 text-sm mt-0.5 flex-shrink-0" title="Commit"></tui-icon>
                      }
                      @if (c.metadata?.type === 'pull_request') {
                        <tui-icon icon="tuiIconGitBranch" class="text-purple-600 dark:text-purple-400 text-sm mt-0.5 flex-shrink-0" title="Pull Request"></tui-icon>
                      }
                      @if (c.metadata?.type === 'branch') {
                        <tui-icon icon="tuiIconGitBranch" class="text-green-600 dark:text-green-400 text-sm mt-0.5 flex-shrink-0" title="Branch"></tui-icon>
                      }
                      <h3 class="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-relaxed break-words">{{ c.title }}</h3>
                    </div>
                    @if (c.description) {
                      <p class="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">{{ c.description }}</p>
                    }
                  </div>
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 relative z-10">
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconComment"
                      (click)="openComments(c.id); $event.stopPropagation()"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-slate-100 dark:hover:bg-slate-700 rounded relative z-10"
                      title="Comentarios"
                    ></button>
                    @if (c.checklist && c.checklist.length > 0) {
                      <button 
                        tuiButton 
                        type="button" 
                        appearance="flat" 
                        size="xs"
                        iconStart="tuiIconCheckCircle"
                        (click)="openChecklist(c.id); $event.stopPropagation()"
                        class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                        [title]="getChecklistProgress(c.checklist) + '/' + c.checklist.length + ' completados'"
                      ></button>
                    }
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconEdit"
                      (click)="editCard('todo', i); $event.stopPropagation()"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                      title="Editar"
                    ></button>
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconTrash"
                      (click)="removeCard('todo', i); $event.stopPropagation()"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      title="Eliminar"
                    ></button>
                  </div>
                </div>
                
                <!-- Checklist progress indicator -->
                @if (c.checklist && c.checklist.length > 0) {
                  <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <button
                      type="button"
                      class="flex items-center gap-2 w-full text-left text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      (click)="openChecklist(c.id); $event.stopPropagation()"
                      title="Gestionar checklist"
                    >
                      <tui-icon icon="tuiIconCheckCircle" class="text-sm text-green-600 dark:text-green-400"></tui-icon>
                      <span class="flex-1 font-medium">
                        {{ getChecklistProgress(c.checklist) }}/{{ c.checklist.length }}
                      </span>
                      <div class="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          class="h-full bg-green-500 dark:bg-green-400 transition-all rounded-full"
                          [style.width.%]="getChecklistProgressPercent(c.checklist)"
                        ></div>
                      </div>
                    </button>
                  </div>
                }
                
                <!-- Footer con metadata y fechas -->
                @if (c.dueDate || c.assignee || c.createdAt || (c.updatedAt && c.updatedAt !== c.createdAt)) {
                  <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div class="flex items-center gap-2 flex-wrap">
                      @if (c.dueDate) {
                        <div 
                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                          [class.bg-red-50]="isOverdue(c.dueDate)"
                          [class.text-red-700]="isOverdue(c.dueDate)"
                          [class.dark:bg-red-900/20]="isOverdue(c.dueDate)"
                          [class.dark:text-red-400]="isOverdue(c.dueDate)"
                          [class.bg-orange-50]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                          [class.text-orange-700]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                          [class.dark:bg-orange-900/20]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                          [class.dark:text-orange-400]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                          [class.bg-slate-50]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                          [class.text-slate-600]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                          [class.dark:bg-slate-800/50]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                          [class.dark:text-slate-400]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                          [title]="'Vence: ' + formatDueDate(c.dueDate)"
                        >
                          <tui-icon 
                            [icon]="isOverdue(c.dueDate) ? 'tuiIconAlertCircle' : 'tuiIconCalendar'" 
                            class="text-xs w-3 h-3"
                          ></tui-icon>
                          <span class="whitespace-nowrap">{{ formatDueDate(c.dueDate) }}</span>
                        </div>
                      }
                      @if (c.assignee) {
                        <div 
                          class="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-medium"
                          [title]="'Asignado a: ' + c.assignee"
                        >
                          <div class="w-3.5 h-3.5 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0">
                            {{ getInitials(c.assignee) }}
                          </div>
                          <span class="truncate max-w-[80px]">{{ c.assignee }}</span>
                        </div>
                      }
                      @if (c.createdAt) {
                        <div class="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400" title="Creada {{ formatCardDate(c.createdAt) }}">
                          <tui-icon icon="tuiIconClock" class="text-xs w-3 h-3"></tui-icon>
                          <span class="whitespace-nowrap">{{ formatCardDateRelative(c.createdAt) }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
                
                @if (getTaskReferences(c).length > 0) {
                  <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div class="flex items-center gap-1.5 mb-2">
                      <tui-icon icon="tuiIconCode" class="text-xs text-blue-600 dark:text-blue-400"></tui-icon>
                      <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Referencias</span>
                    </div>
                    <div class="space-y-1.5">
                      @for (ref of getTaskReferences(c).slice(0, 2); track ref.timestamp || ref.url) {
                        <div class="bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-xs">
                          <div class="flex items-start gap-2">
                            @if (ref.type === 'commit') {
                              <tui-icon icon="tuiIconCode" class="text-blue-600 dark:text-blue-400 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                              <div class="flex-1 min-w-0">
                                <div class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ ref.message || 'Commit' }}</div>
                                @if (ref.url) {
                                  <a [href]="ref.url" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline mt-0.5 inline-block text-xs">
                                    Ver →
                                  </a>
                                }
                              </div>
                            }
                            @if (ref.type === 'pull_request') {
                              <tui-icon icon="tuiIconGitBranch" class="text-purple-600 dark:text-purple-400 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                              <div class="flex-1 min-w-0">
                                <div class="font-medium text-gray-900 dark:text-gray-100 truncate">PR #{{ ref.number }}: {{ ref.title || 'Pull Request' }}</div>
                                @if (ref.url) {
                                  <a [href]="ref.url" target="_blank" rel="noopener noreferrer" class="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 underline mt-0.5 inline-block text-xs">
                                    Ver →
                                  </a>
                                }
                              </div>
                            }
                          </div>
                        </div>
                      }
                      @if (getTaskReferences(c).length > 2) {
                        <div class="text-xs text-gray-500 dark:text-gray-400 text-center pt-0.5">
                          +{{ getTaskReferences(c).length - 2 }} más
                        </div>
                      }
                    </div>
                  </div>
                }
                @if (c.metadata?.ciStatus) {
                  <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div class="flex items-center gap-2 flex-wrap">
                      @switch (c.metadata?.ciStatus?.state) {
                        @case ('success') {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium">
                            <tui-icon icon="tuiIconCheck" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('failure') {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium">
                            <tui-icon icon="tuiIconClose" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('pending') {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs font-medium">
                            <span class="inline-block w-2.5 h-2.5 border-2 border-yellow-600 dark:border-yellow-400 border-t-transparent rounded-full animate-spin"></span>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('error') {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium">
                            <tui-icon icon="tuiIconAlertCircle" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @default {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium">
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                      }
                      @if (c.metadata?.url) {
                        <a 
                          [href]="c.metadata!.url!" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
                          title="Ver en GitHub"
                        >
                          Ver →
                        </a>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Columna: En progreso -->
      <div class="flex flex-col space-y-4 min-w-0">
        <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200/80 dark:border-slate-800/50 shadow-sm backdrop-blur-sm">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-2 h-2 rounded-full bg-amber-500 shadow-sm flex-shrink-0"></div>
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              En progreso
            </h2>
            <span class="ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg flex-shrink-0" 
                  [class.bg-red-100]="isExceeded('doing')" 
                  [class.text-red-700]="isExceeded('doing')"
                  [class.dark:bg-red-900/30]="isExceeded('doing')"
                  [class.dark:text-red-300]="isExceeded('doing')"
                  [class.bg-slate-100]="!isExceeded('doing')" 
                  [class.text-slate-700]="!isExceeded('doing')"
                  [class.dark:bg-slate-800/50]="!isExceeded('doing')"
                  [class.dark:text-slate-300]="!isExceeded('doing')">
              {{ doing.length }}/{{ wipLimits.doing }}
            </span>
          </div>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="xs"
            iconStart="tuiIconSettings"
            (click)="setWipLimit('doing')"
            class="opacity-70 hover:opacity-100 text-slate-500 dark:text-slate-400"
            title="Configurar límite WIP"
          ></button>
        </div>
        <div 
          cdkDropList 
          id="doing-list"
          [cdkDropListData]="doing" 
          [cdkDropListConnectedTo]="['todo-list', 'done-list']"
          (cdkDropListDropped)="drop($event)" 
          class="bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl p-4 min-h-[600px] space-y-3 transition-all duration-300 border-2 border-dashed border-slate-200 dark:border-slate-800/50 relative"
          [ngClass]="{
            'border-red-400 bg-red-50/50 dark:bg-red-900/10': wipFlash.doing,
            'border-slate-200 dark:border-slate-800/50': !wipFlash.doing
          }"
        >
          @if (doing.length === 0) {
            <div class="flex flex-col items-center justify-center h-full min-h-[500px] text-slate-400 dark:text-slate-500 rounded-xl">
              <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4 shadow-sm">
                <tui-icon icon="tuiIconPlus" class="text-3xl text-amber-500 dark:text-amber-400"></tui-icon>
              </div>
              <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Arrastra tarjetas aquí</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">o crea una nueva tarjeta</p>
            </div>
          }
          @for (c of doing; track c.id; let i = $index) {
            <div 
              class="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/50 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 cursor-move group min-h-[140px] flex flex-col relative isolate"
              [class.ring-2]="selectedCardIndex?.list === 'doing' && selectedCardIndex?.index === i"
              [class.ring-amber-500]="selectedCardIndex?.list === 'doing' && selectedCardIndex?.index === i"
              [class.border-amber-500]="selectedCardIndex?.list === 'doing' && selectedCardIndex?.index === i"
              [class.shadow-md]="selectedCardIndex?.list === 'doing' && selectedCardIndex?.index === i"
              [class.z-10]="selectedCardIndex?.list === 'doing' && selectedCardIndex?.index === i"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('doing', i); selectedCardIndex = { list: 'doing', index: i };"
              (keydown.space)="editCard('doing', i); selectedCardIndex = { list: 'doing', index: i };"
              (click)="selectedCardIndex = { list: 'doing', index: i }"
            >
              <div class="p-4 flex-1 flex flex-col overflow-visible">
                <!-- Header con prioridad y etiquetas -->
                @if (c.priority || (c.labels && c.labels.length > 0)) {
                  <div class="flex items-center gap-2 mb-3 flex-wrap">
                    @if (c.priority) {
                      @switch (c.priority) {
                        @case ('urgent') {
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-semibold rounded-lg border border-red-200/50 dark:border-red-800/30 shadow-sm">
                            <tui-icon icon="tuiIconAlertCircle" class="text-xs w-3.5 h-3.5"></tui-icon>
                            Urgente
                          </span>
                        }
                        @case ('high') {
                          <span class="inline-flex items-center px-2.5 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xs font-semibold rounded-lg border border-orange-200/50 dark:border-orange-800/30 shadow-sm">
                            Alta
                          </span>
                        }
                        @case ('medium') {
                          <span class="inline-flex items-center px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-lg border border-amber-200/50 dark:border-amber-800/30 shadow-sm">
                            Media
                          </span>
                        }
                        @case ('low') {
                          <span class="inline-flex items-center px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-semibold rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-sm">
                            Baja
                          </span>
                        }
                      }
                    }
                    @if (c.labels && c.labels.length > 0) {
                      @for (labelId of c.labels.slice(0, 3); track labelId) {
                        @if (getLabelById(labelId)) {
                          <span 
                            class="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border shadow-sm"
                            [style.background-color]="getLabelById(labelId)!.color + '15'"
                            [style.color]="getLabelById(labelId)!.color"
                            [style.border-color]="getLabelById(labelId)!.color + '40'"
                          >
                            {{ getLabelById(labelId)!.name }}
                          </span>
                        }
                      }
                      @if (c.labels.length > 3) {
                        <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">+{{ c.labels.length - 3 }}</span>
                      }
                    }
                  </div>
                }
                
                <!-- Título y acciones -->
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-start gap-2 mb-1">
                      @if (c.metadata?.type === 'commit') {
                        <tui-icon icon="tuiIconCode" class="text-blue-600 dark:text-blue-400 text-sm mt-0.5 flex-shrink-0" title="Commit"></tui-icon>
                      }
                      @if (c.metadata?.type === 'pull_request') {
                        <tui-icon icon="tuiIconGitBranch" class="text-purple-600 dark:text-purple-400 text-sm mt-0.5 flex-shrink-0" title="Pull Request"></tui-icon>
                      }
                      @if (c.metadata?.type === 'branch') {
                        <tui-icon icon="tuiIconGitBranch" class="text-green-600 dark:text-green-400 text-sm mt-0.5 flex-shrink-0" title="Branch"></tui-icon>
                      }
                      <h3 class="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-relaxed break-words">{{ c.title }}</h3>
                    </div>
                    @if (c.description) {
                      <p class="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">{{ c.description }}</p>
                    }
                  </div>
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 relative z-10">
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconComment"
                      (click)="openComments(c.id); $event.stopPropagation()"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-slate-100 dark:hover:bg-slate-700 rounded relative z-10"
                      title="Comentarios"
                    ></button>
                    @if (c.checklist && c.checklist.length > 0) {
                      <button 
                        tuiButton 
                        type="button" 
                        appearance="flat" 
                        size="xs"
                        iconStart="tuiIconCheckCircle"
                        (click)="openChecklist(c.id); $event.stopPropagation()"
                        class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                        [title]="getChecklistProgress(c.checklist) + '/' + c.checklist.length + ' completados'"
                      ></button>
                    }
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconEdit"
                      (click)="editCard('doing', i); $event.stopPropagation()"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                      title="Editar"
                    ></button>
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconTrash"
                      (click)="removeCard('doing', i); $event.stopPropagation()"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      title="Eliminar"
                    ></button>
                  </div>
                </div>
                
                <!-- Checklist progress indicator -->
                @if (c.checklist && c.checklist.length > 0) {
                  <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <button
                      type="button"
                      class="flex items-center gap-2 w-full text-left text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      (click)="openChecklist(c.id); $event.stopPropagation()"
                      title="Gestionar checklist"
                    >
                      <tui-icon icon="tuiIconCheckCircle" class="text-sm text-green-600 dark:text-green-400"></tui-icon>
                      <span class="flex-1 font-medium">
                        {{ getChecklistProgress(c.checklist) }}/{{ c.checklist.length }}
                      </span>
                      <div class="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          class="h-full bg-green-500 dark:bg-green-400 transition-all rounded-full"
                          [style.width.%]="getChecklistProgressPercent(c.checklist)"
                        ></div>
                      </div>
                    </button>
                  </div>
                }
                
                <!-- Footer con metadata y fechas -->
                @if (c.dueDate || c.assignee || c.createdAt || (c.updatedAt && c.updatedAt !== c.createdAt)) {
                  <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <div class="flex items-center gap-2 flex-wrap">
                      @if (c.dueDate) {
                        <div 
                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                          [class.bg-red-50]="isOverdue(c.dueDate)"
                          [class.text-red-700]="isOverdue(c.dueDate)"
                          [class.dark:bg-red-900/20]="isOverdue(c.dueDate)"
                          [class.dark:text-red-400]="isOverdue(c.dueDate)"
                          [class.bg-orange-50]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                          [class.text-orange-700]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                          [class.dark:bg-orange-900/20]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                          [class.dark:text-orange-400]="!isOverdue(c.dueDate) && isDueSoon(c.dueDate)"
                          [class.bg-slate-50]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                          [class.text-slate-600]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                          [class.dark:bg-slate-800/50]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                          [class.dark:text-slate-400]="!isOverdue(c.dueDate) && !isDueSoon(c.dueDate)"
                          [title]="'Vence: ' + formatDueDate(c.dueDate)"
                        >
                          <tui-icon 
                            [icon]="isOverdue(c.dueDate) ? 'tuiIconAlertCircle' : 'tuiIconCalendar'" 
                            class="text-xs w-3 h-3"
                          ></tui-icon>
                          <span class="whitespace-nowrap">{{ formatDueDate(c.dueDate) }}</span>
                        </div>
                      }
                      @if (c.assignee) {
                        <div 
                          class="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-medium"
                          [title]="'Asignado a: ' + c.assignee"
                        >
                          <div class="w-3.5 h-3.5 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0">
                            {{ getInitials(c.assignee) }}
                          </div>
                          <span class="truncate max-w-[80px]">{{ c.assignee }}</span>
                        </div>
                      }
                      @if (c.createdAt) {
                        <div class="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400" title="Creada {{ formatCardDate(c.createdAt) }}">
                          <tui-icon icon="tuiIconClock" class="text-xs w-3 h-3"></tui-icon>
                          <span class="whitespace-nowrap">{{ formatCardDateRelative(c.createdAt) }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
                
                @if (getTaskReferences(c).length > 0) {
                  <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div class="flex items-center gap-1.5 mb-2">
                      <tui-icon icon="tuiIconCode" class="text-xs text-blue-600 dark:text-blue-400"></tui-icon>
                      <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Referencias</span>
                    </div>
                    <div class="space-y-1.5">
                      @for (ref of getTaskReferences(c).slice(0, 2); track ref.timestamp || ref.url) {
                        <div class="bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-xs">
                          <div class="flex items-start gap-2">
                            @if (ref.type === 'commit') {
                              <tui-icon icon="tuiIconCode" class="text-blue-600 dark:text-blue-400 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                              <div class="flex-1 min-w-0">
                                <div class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ ref.message || 'Commit' }}</div>
                                @if (ref.url) {
                                  <a [href]="ref.url" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline mt-0.5 inline-block text-xs">
                                    Ver →
                                  </a>
                                }
                              </div>
                            }
                            @if (ref.type === 'pull_request') {
                              <tui-icon icon="tuiIconGitBranch" class="text-purple-600 dark:text-purple-400 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                              <div class="flex-1 min-w-0">
                                <div class="font-medium text-gray-900 dark:text-gray-100 truncate">PR #{{ ref.number }}: {{ ref.title || 'Pull Request' }}</div>
                                @if (ref.url) {
                                  <a [href]="ref.url" target="_blank" rel="noopener noreferrer" class="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 underline mt-0.5 inline-block text-xs">
                                    Ver →
                                  </a>
                                }
                              </div>
                            }
                          </div>
                        </div>
                      }
                      @if (getTaskReferences(c).length > 2) {
                        <div class="text-xs text-gray-500 dark:text-gray-400 text-center pt-0.5">
                          +{{ getTaskReferences(c).length - 2 }} más
                        </div>
                      }
                    </div>
                  </div>
                }
                @if (c.metadata?.ciStatus) {
                  <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div class="flex items-center gap-2 flex-wrap">
                      @switch (c.metadata?.ciStatus?.state) {
                        @case ('success') {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium">
                            <tui-icon icon="tuiIconCheck" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('failure') {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium">
                            <tui-icon icon="tuiIconClose" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('pending') {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs font-medium">
                            <span class="inline-block w-2.5 h-2.5 border-2 border-yellow-600 dark:border-yellow-400 border-t-transparent rounded-full animate-spin"></span>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('error') {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium">
                            <tui-icon icon="tuiIconAlertCircle" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @default {
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium">
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                      }
                      @if (c.metadata?.url) {
                        <a 
                          [href]="c.metadata!.url!" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
                          title="Ver en GitHub"
                        >
                          Ver →
                        </a>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Columna: Hecho -->
      <div class="flex flex-col space-y-4 min-w-0">
        <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200/80 dark:border-slate-800/50 shadow-sm backdrop-blur-sm">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-sm flex-shrink-0"></div>
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              Hecho
            </h2>
            <span class="ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg flex-shrink-0" 
                  [class.bg-red-100]="isExceeded('done')" 
                  [class.text-red-700]="isExceeded('done')"
                  [class.dark:bg-red-900/30]="isExceeded('done')"
                  [class.dark:text-red-300]="isExceeded('done')"
                  [class.bg-slate-100]="!isExceeded('done')" 
                  [class.text-slate-700]="!isExceeded('done')"
                  [class.dark:bg-slate-800/50]="!isExceeded('done')"
                  [class.dark:text-slate-300]="!isExceeded('done')">
              {{ done.length }}/{{ wipLimits.done }}
            </span>
          </div>
          <button 
            tuiButton 
            type="button" 
            appearance="flat" 
            size="xs"
            iconStart="tuiIconSettings"
            (click)="setWipLimit('done')"
            class="opacity-70 hover:opacity-100 text-slate-500 dark:text-slate-400"
            title="Configurar límite WIP"
          ></button>
        </div>
        <div 
          cdkDropList 
          id="done-list"
          [cdkDropListData]="done" 
          [cdkDropListConnectedTo]="['todo-list', 'doing-list']"
          (cdkDropListDropped)="drop($event)" 
          class="bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl p-4 min-h-[600px] space-y-3 transition-all duration-300 border-2 border-dashed border-slate-200 dark:border-slate-800/50 relative"
          [ngClass]="{
            'border-red-400 bg-red-50/50 dark:bg-red-900/10': wipFlash.done,
            'border-slate-200 dark:border-slate-800/50': !wipFlash.done
          }"
        >
          @if (done.length === 0) {
            <div class="flex flex-col items-center justify-center h-full min-h-[500px] text-slate-400 dark:text-slate-500 rounded-xl">
              <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center mb-4 shadow-sm">
                <tui-icon icon="tuiIconCheck" class="text-3xl text-emerald-500 dark:text-emerald-400"></tui-icon>
              </div>
              <p class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Arrastra tarjetas aquí</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">o crea una nueva tarjeta</p>
            </div>
          }
          @for (c of done; track c.id; let i = $index) {
            <div 
              class="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/50 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 cursor-move group min-h-[140px] flex flex-col relative isolate opacity-90"
              [class.ring-2]="selectedCardIndex?.list === 'done' && selectedCardIndex?.index === i"
              [class.ring-emerald-500]="selectedCardIndex?.list === 'done' && selectedCardIndex?.index === i"
              [class.border-emerald-500]="selectedCardIndex?.list === 'done' && selectedCardIndex?.index === i"
              [class.shadow-md]="selectedCardIndex?.list === 'done' && selectedCardIndex?.index === i"
              [class.z-10]="selectedCardIndex?.list === 'done' && selectedCardIndex?.index === i"
              cdkDrag
              [cdkDragData]="c"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Tarjeta: ' + c.title"
              (keydown.enter)="editCard('done', i); selectedCardIndex = { list: 'done', index: i };"
              (keydown.space)="editCard('done', i); selectedCardIndex = { list: 'done', index: i };"
              (click)="selectedCardIndex = { list: 'done', index: i }"
            >
              <div class="p-4 flex-1 flex flex-col overflow-visible">
                <!-- Header con prioridad y etiquetas -->
                @if (c.priority || (c.labels && c.labels.length > 0)) {
                  <div class="flex items-center gap-2 mb-3 flex-wrap">
                    @if (c.priority) {
                      @switch (c.priority) {
                        @case ('urgent') {
                          <span class="inline-flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md border-0 opacity-75">
                            <tui-icon icon="tuiIconAlertCircle" class="text-xs w-3 h-3"></tui-icon>
                            Urgente
                          </span>
                        }
                        @case ('high') {
                          <span class="inline-flex items-center bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md border-0 opacity-75">
                            Alta
                          </span>
                        }
                        @case ('medium') {
                          <span class="inline-flex items-center bg-gradient-to-r from-yellow-500 to-yellow-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md border-0 opacity-75">
                            Media
                          </span>
                        }
                        @case ('low') {
                          <span class="inline-flex items-center bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md border-0 opacity-75">
                            Baja
                          </span>
                        }
                      }
                    }
                    @if (c.labels && c.labels.length > 0) {
                      @for (labelId of c.labels.slice(0, 3); track labelId) {
                        @if (getLabelById(labelId)) {
                          <span 
                            class="px-2 py-0.5 text-xs font-medium rounded-full border shadow-sm opacity-75"
                            [style.background-color]="getLabelById(labelId)!.color + '20'"
                            [style.color]="getLabelById(labelId)!.color"
                            [style.border-color]="getLabelById(labelId)!.color + '40'"
                          >
                            {{ getLabelById(labelId)!.name }}
                        </span>
                        }
                      }
                      @if (c.labels.length > 3) {
                        <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">+{{ c.labels.length - 3 }}</span>
                      }
                    }
                  </div>
                }
                
                <div class="flex justify-between items-start gap-2 mb-3 px-4">
                  <div class="font-bold text-base text-slate-900 dark:text-slate-100 flex-1 flex items-center gap-2 leading-tight line-through opacity-75">
                    @if (c.metadata?.type === 'commit') {
                      <tui-icon icon="tuiIconCode" class="text-blue-600 dark:text-blue-400 text-base flex-shrink-0" title="Commit"></tui-icon>
                    }
                    @if (c.metadata?.type === 'pull_request') {
                      <tui-icon icon="tuiIconGitBranch" class="text-purple-600 dark:text-purple-400 text-base flex-shrink-0" title="Pull Request"></tui-icon>
                    }
                    @if (c.metadata?.type === 'branch') {
                      <tui-icon icon="tuiIconGitBranch" class="text-green-600 dark:text-green-400 text-base flex-shrink-0" title="Branch"></tui-icon>
                    }
                    <span class="break-words">{{ c.title }}</span>
                  </div>
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconComment"
                      (click)="openComments(c.id)"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
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
                        class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
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
                        class="!p-1.5 !min-h-0 !h-7 !w-7 opacity-50 hover:opacity-100 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                        title="Agregar checklist"
                      ></button>
                    }
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconEdit"
                      (click)="editCard('done', i)"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="Editar"
                    ></button>
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="xs"
                      iconStart="tuiIconTrash"
                      (click)="removeCard('done', i)"
                      class="!p-1.5 !min-h-0 !h-7 !w-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Eliminar"
                    ></button>
                  </div>
                </div>
                @if (c.description) {
                  <div class="text-sm text-slate-700 dark:text-slate-300 mt-2 mb-3 px-4 line-clamp-3 leading-relaxed line-through opacity-75">{{ c.description }}</div>
                }
                @if (c.metadata?.ciStatus) {
                  <div class="mt-3 pt-3 px-5 border-t border-slate-200 dark:border-slate-700">
                    <div class="flex items-center gap-2 flex-wrap">
                      @switch (c.metadata?.ciStatus?.state) {
                        @case ('success') {
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 text-xs font-medium">
                            <tui-icon icon="tuiIconCheck" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('failure') {
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-medium">
                            <tui-icon icon="tuiIconClose" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('pending') {
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 text-xs font-medium">
                            <span class="inline-block w-2.5 h-2.5 border-2 border-yellow-600 dark:border-yellow-400 border-t-transparent rounded-full animate-spin"></span>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @case ('error') {
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-medium">
                            <tui-icon icon="tuiIconAlertCircle" class="text-xs w-3 h-3"></tui-icon>
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                        @default {
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium">
                            CI: {{ c.metadata?.ciStatus?.context || '' }}
                          </span>
                        }
                      }
                      @if (c.metadata?.url) {
                        <a 
                          [href]="c.metadata!.url!" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
                          title="Ver en GitHub"
                        >
                          Ver →
                        </a>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>

    @if (editOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="editOpen=false; editCardId=null">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto mx-2 sm:mx-4 animate-scale-in border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-3 mb-4 sm:mb-5 flex-shrink-0 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div class="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
              <tui-icon icon="tuiIconEdit" class="text-xl"></tui-icon>
            </div>
            <div>
              <h3 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Editar tarjeta</h3>
              <p class="text-sm text-slate-500 dark:text-slate-400">Modifica los detalles de la tarea</p>
            </div>
          </div>
          <div class="flex flex-col gap-4 sm:gap-5">
            <div class="flex flex-col gap-2">
              <tui-textfield class="!rounded-xl overflow-hidden">
                <label tuiLabel>Título</label>
                <input 
                  tuiTextfield 
                  [(ngModel)]="editTitle" 
                  placeholder="Título de la tarjeta" 
                  class="!bg-slate-50 dark:!bg-slate-800/50 text-slate-900 dark:text-slate-100"
                />
              </tui-textfield>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Descripción</label>
              <textarea 
                class="textarea w-full resize-none bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none transition-all" 
                rows="4" 
                [(ngModel)]="editDescription"
                placeholder="Añade una descripción detallada..."
              ></textarea>
            </div>
            
            <!-- Prioridad -->
            <div class="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconFlag" class="text-primary-600 dark:text-primary-400"></tui-icon>
                <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Prioridad</label>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                  [class.bg-red-50]="editPriority === 'urgent'"
                  [class.text-red-700]="editPriority === 'urgent'"
                  [class.border-red-200]="editPriority === 'urgent'"
                  [class.dark:bg-red-900/20]="editPriority === 'urgent'"
                  [class.dark:text-red-400]="editPriority === 'urgent'"
                  [class.dark:border-red-800]="editPriority === 'urgent'"
                  [class.bg-slate-50]="editPriority !== 'urgent'"
                  [class.text-slate-600]="editPriority !== 'urgent'"
                  [class.border-slate-200]="editPriority !== 'urgent'"
                  [class.dark:bg-slate-800/50]="editPriority !== 'urgent'"
                  [class.dark:text-slate-400]="editPriority !== 'urgent'"
                  [class.dark:border-slate-700]="editPriority !== 'urgent'"
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
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                  [class.bg-orange-50]="editPriority === 'high'"
                  [class.text-orange-700]="editPriority === 'high'"
                  [class.border-orange-200]="editPriority === 'high'"
                  [class.dark:bg-orange-900/20]="editPriority === 'high'"
                  [class.dark:text-orange-400]="editPriority === 'high'"
                  [class.dark:border-orange-800]="editPriority === 'high'"
                  [class.bg-slate-50]="editPriority !== 'high'"
                  [class.text-slate-600]="editPriority !== 'high'"
                  [class.border-slate-200]="editPriority !== 'high'"
                  [class.dark:bg-slate-800/50]="editPriority !== 'high'"
                  [class.dark:text-slate-400]="editPriority !== 'high'"
                  [class.dark:border-slate-700]="editPriority !== 'high'"
                  (click)="editPriority = editPriority === 'high' ? null : 'high'"
                  title="Alta"
                >
                  Alta
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                  [class.bg-amber-50]="editPriority === 'medium'"
                  [class.text-amber-700]="editPriority === 'medium'"
                  [class.border-amber-200]="editPriority === 'medium'"
                  [class.dark:bg-amber-900/20]="editPriority === 'medium'"
                  [class.dark:text-amber-400]="editPriority === 'medium'"
                  [class.dark:border-amber-800]="editPriority === 'medium'"
                  [class.bg-slate-50]="editPriority !== 'medium'"
                  [class.text-slate-600]="editPriority !== 'medium'"
                  [class.border-slate-200]="editPriority !== 'medium'"
                  [class.dark:bg-slate-800/50]="editPriority !== 'medium'"
                  [class.dark:text-slate-400]="editPriority !== 'medium'"
                  [class.dark:border-slate-700]="editPriority !== 'medium'"
                  (click)="editPriority = editPriority === 'medium' ? null : 'medium'"
                  title="Media"
                >
                  Media
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                  [class.bg-blue-50]="editPriority === 'low'"
                  [class.text-blue-700]="editPriority === 'low'"
                  [class.border-blue-200]="editPriority === 'low'"
                  [class.dark:bg-blue-900/20]="editPriority === 'low'"
                  [class.dark:text-blue-400]="editPriority === 'low'"
                  [class.dark:border-blue-800]="editPriority === 'low'"
                  [class.bg-slate-50]="editPriority !== 'low'"
                  [class.text-slate-600]="editPriority !== 'low'"
                  [class.border-slate-200]="editPriority !== 'low'"
                  [class.dark:bg-slate-800/50]="editPriority !== 'low'"
                  [class.dark:text-slate-400]="editPriority !== 'low'"
                  [class.dark:border-slate-700]="editPriority !== 'low'"
                  (click)="editPriority = editPriority === 'low' ? null : 'low'"
                  title="Baja"
                >
                  Baja
                </button>
              </div>
            </div>
            
            <!-- Fecha de vencimiento -->
            <div class="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconCalendar" class="text-primary-600 dark:text-primary-400"></tui-icon>
                <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Fecha de vencimiento</label>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="date"
                  [(ngModel)]="editDueDate"
                  class="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none transition-all"
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
                    class="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    title="Quitar fecha de vencimiento"
                  ></button>
                }
              </div>
            </div>
            
            <!-- Asignación -->
            @if (boardMembers.length > 0) {
              <div class="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2 mb-2">
                  <tui-icon icon="tuiIconUser" class="text-primary-600 dark:text-primary-400"></tui-icon>
                  <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Asignar a</label>
                </div>
                <select
                  [(ngModel)]="editAssignee"
                  class="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none transition-all"
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
              <div class="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2 mb-2">
                  <tui-icon icon="tuiIconTag" class="text-primary-600 dark:text-primary-400"></tui-icon>
                  <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Etiquetas</label>
                </div>
                <div class="flex flex-wrap gap-2">
                  @for (label of boardLabels; track label.id) {
                    <button
                      type="button"
                      class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                      [class.opacity-50]="!cardHasLabel(editCardId, label.id)"
                      [style.background-color]="cardHasLabel(editCardId, label.id) ? label.color + '20' : 'transparent'"
                      [style.color]="cardHasLabel(editCardId, label.id) ? label.color : '#64748b'"
                      [style.border-color]="cardHasLabel(editCardId, label.id) ? label.color + '40' : '#e2e8f0'"
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
            <div class="flex flex-col gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconCode" class="text-primary-600 dark:text-primary-400"></tui-icon>
                <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Vincular con Git</label>
              </div>
              <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 mb-3">
                <p class="font-semibold text-blue-900 dark:text-blue-100 mb-1">💡 Formatos soportados:</p>
                <ul class="list-disc list-inside space-y-1 ml-2">
                  <li>Commit: <code class="bg-white dark:bg-slate-800 px-1 rounded text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">https://github.com/owner/repo/commit/SHA</code></li>
                  <li>Pull Request: <code class="bg-white dark:bg-slate-800 px-1 rounded text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">https://github.com/owner/repo/pull/123</code></li>
                  <li>Branch: <code class="bg-white dark:bg-slate-800 px-1 rounded text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">https://github.com/owner/repo/tree/branch-name</code></li>
                </ul>
              </div>
              <div class="flex flex-col gap-2">
                <tui-textfield class="!rounded-xl overflow-hidden">
                  <label tuiLabel>URL de Git (opcional)</label>
                  <input
                    tuiTextfield
                    type="url"
                    [(ngModel)]="editGitUrl"
                    placeholder="https://github.com/owner/repo/commit/abc123..."
                    class="!bg-slate-50 dark:!bg-slate-800/50 text-slate-900 dark:text-slate-100"
                  />
                </tui-textfield>
                <p class="text-xs text-slate-500 dark:text-slate-400">Pega la URL de un commit, Pull Request o branch de GitHub</p>
              </div>
            </div>
            
            <div class="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
                <button 
                tuiButton 
                type="button" 
                appearance="flat" 
                size="m" 
                (click)="editOpen=false; editCardId=null; editGitUrl=''; editPriority=null; editDueDate=null; editAssignee=null"
                class="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
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
                class="rounded-xl"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    @if (addOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="addOpen=false">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto mx-2 sm:mx-4 animate-scale-in border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-3 mb-4 sm:mb-5 flex-shrink-0 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div class="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
              <tui-icon icon="tuiIconPlus" class="text-xl"></tui-icon>
            </div>
            <div>
              <h3 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Nueva tarjeta</h3>
              <p class="text-sm text-slate-500 dark:text-slate-400">Crea una nueva tarea en el tablero</p>
            </div>
          </div>
          <div class="flex flex-col gap-4 sm:gap-5">
            <div class="flex flex-col gap-2">
              <tui-textfield class="!rounded-xl overflow-hidden">
                <label tuiLabel>Título</label>
                <input 
                  tuiTextfield 
                  [(ngModel)]="addTitle" 
                  placeholder="Título de la tarjeta" 
                  class="!bg-slate-50 dark:!bg-slate-800/50 text-slate-900 dark:text-slate-100"
                />
              </tui-textfield>
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Descripción</label>
                @if (aiAvailable && addTitle.trim()) {
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all hover:shadow-sm"
                    [class.bg-purple-50]="improvingDescription || addDescription.trim()"
                    [class.border-purple-200]="improvingDescription || addDescription.trim()"
                    [class.text-purple-700]="improvingDescription || addDescription.trim()"
                    [class.dark:bg-purple-900/20]="improvingDescription || addDescription.trim()"
                    [class.dark:border-purple-800]="improvingDescription || addDescription.trim()"
                    [class.dark:text-purple-400]="improvingDescription || addDescription.trim()"
                    [class.bg-white]="!improvingDescription && !addDescription.trim()"
                    [class.border-slate-200]="!improvingDescription && !addDescription.trim()"
                    [class.text-slate-700]="!improvingDescription && !addDescription.trim()"
                    [class.dark:bg-slate-800]="!improvingDescription && !addDescription.trim()"
                    [class.dark:border-slate-700]="!improvingDescription && !addDescription.trim()"
                    [class.dark:text-slate-300]="!improvingDescription && !addDescription.trim()"
                    [class.opacity-50]="improvingDescription"
                    (click)="improveCardDescription()"
                    [disabled]="improvingDescription"
                    title="Mejorar descripción con IA"
                  >
                    <tui-icon icon="tuiIconStarLarge" class="text-xs"></tui-icon>
                    <span>{{ improvingDescription ? 'Mejorando...' : 'Mejorar con IA' }}</span>
                  </button>
                }
              </div>
              <textarea 
                class="textarea w-full resize-none bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none transition-all" 
                rows="4" 
                [(ngModel)]="addDescription"
                placeholder="Añade una descripción detallada..."
              ></textarea>
            </div>
            
            <!-- Funcionalidades de IA -->
            @if (aiAvailable && addTitle.trim()) {
              <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2 mb-3">
                  <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
                    <tui-icon icon="tuiIconStarLarge" class="text-white text-sm"></tui-icon>
                  </div>
                  <div>
                    <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Asistente IA</label>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Herramientas inteligentes para mejorar tu tarea</p>
                  </div>
                </div>
                
                <div class="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    class="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                    [class.bg-orange-50]="detectedDuplicates.length > 0"
                    [class.border-orange-200]="detectedDuplicates.length > 0"
                    [class.text-orange-700]="detectedDuplicates.length > 0"
                    [class.dark:bg-orange-900/20]="detectedDuplicates.length > 0"
                    [class.dark:border-orange-800]="detectedDuplicates.length > 0"
                    [class.dark:text-orange-400]="detectedDuplicates.length > 0"
                    [class.bg-white]="detectedDuplicates.length === 0"
                    [class.border-slate-200]="detectedDuplicates.length === 0"
                    [class.text-slate-700]="detectedDuplicates.length === 0"
                    [class.dark:bg-slate-800]="detectedDuplicates.length === 0"
                    [class.dark:border-slate-700]="detectedDuplicates.length === 0"
                    [class.dark:text-slate-300]="detectedDuplicates.length === 0"
                    [class.opacity-50]="detectingDuplicates"
                    (click)="detectCardDuplicates()"
                    [disabled]="detectingDuplicates"
                    title="Detectar tareas duplicadas"
                  >
                    <tui-icon icon="tuiIconSearch" class="text-xs"></tui-icon>
                    <span>{{ detectingDuplicates ? 'Buscando...' : 'Duplicados' }}</span>
                    @if (detectedDuplicates.length > 0) {
                      <span class="ml-auto px-1.5 py-0.5 bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 rounded text-[10px] font-semibold">
                        {{ detectedDuplicates.length }}
                      </span>
                    }
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                    [class.bg-blue-50]="detectedDependencies.length > 0"
                    [class.border-blue-200]="detectedDependencies.length > 0"
                    [class.text-blue-700]="detectedDependencies.length > 0"
                    [class.dark:bg-blue-900/20]="detectedDependencies.length > 0"
                    [class.dark:border-blue-800]="detectedDependencies.length > 0"
                    [class.dark:text-blue-400]="detectedDependencies.length > 0"
                    [class.bg-white]="detectedDependencies.length === 0"
                    [class.border-slate-200]="detectedDependencies.length === 0"
                    [class.text-slate-700]="detectedDependencies.length === 0"
                    [class.dark:bg-slate-800]="detectedDependencies.length === 0"
                    [class.dark:border-slate-700]="detectedDependencies.length === 0"
                    [class.dark:text-slate-300]="detectedDependencies.length === 0"
                    [class.opacity-50]="detectingDependencies"
                    (click)="detectCardDependencies()"
                    [disabled]="detectingDependencies"
                    title="Detectar dependencias"
                  >
                    <tui-icon icon="tuiIconGrid" class="text-xs"></tui-icon>
                    <span>{{ detectingDependencies ? 'Analizando...' : 'Dependencias' }}</span>
                    @if (detectedDependencies.length > 0) {
                      <span class="ml-auto px-1.5 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-[10px] font-semibold">
                        {{ detectedDependencies.length }}
                      </span>
                    }
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                    [class.bg-green-50]="taskAnalysis"
                    [class.border-green-200]="taskAnalysis"
                    [class.text-green-700]="taskAnalysis"
                    [class.dark:bg-green-900/20]="taskAnalysis"
                    [class.dark:border-green-800]="taskAnalysis"
                    [class.dark:text-green-400]="taskAnalysis"
                    [class.bg-white]="!taskAnalysis"
                    [class.border-slate-200]="!taskAnalysis"
                    [class.text-slate-700]="!taskAnalysis"
                    [class.dark:bg-slate-800]="!taskAnalysis"
                    [class.dark:border-slate-700]="!taskAnalysis"
                    [class.dark:text-slate-300]="!taskAnalysis"
                    [class.opacity-50]="analyzingTask"
                    (click)="analyzeCardTask()"
                    [disabled]="analyzingTask"
                    title="Analizar tarea"
                  >
                    <tui-icon icon="tuiIconBarChart" class="text-xs"></tui-icon>
                    <span>{{ analyzingTask ? 'Analizando...' : 'Analizar' }}</span>
                    @if (taskAnalysis) {
                      <tui-icon icon="tuiIconCheck" class="text-xs ml-auto"></tui-icon>
                    }
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                    [class.bg-indigo-50]="aiGeneratedChecklist"
                    [class.border-indigo-200]="aiGeneratedChecklist"
                    [class.text-indigo-700]="aiGeneratedChecklist"
                    [class.dark:bg-indigo-900/20]="aiGeneratedChecklist"
                    [class.dark:border-indigo-800]="aiGeneratedChecklist"
                    [class.dark:text-indigo-400]="aiGeneratedChecklist"
                    [class.bg-white]="!aiGeneratedChecklist"
                    [class.border-slate-200]="!aiGeneratedChecklist"
                    [class.text-slate-700]="!aiGeneratedChecklist"
                    [class.dark:bg-slate-800]="!aiGeneratedChecklist"
                    [class.dark:border-slate-700]="!aiGeneratedChecklist"
                    [class.dark:text-slate-300]="!aiGeneratedChecklist"
                    [class.opacity-50]="generatingChecklist"
                    (click)="generateCardChecklist()"
                    [disabled]="generatingChecklist"
                    title="Generar checklist"
                  >
                    <tui-icon icon="tuiIconCheck" class="text-xs"></tui-icon>
                    <span>{{ generatingChecklist ? 'Generando...' : 'Checklist' }}</span>
                    @if (aiGeneratedChecklist) {
                      <span class="ml-auto px-1.5 py-0.5 bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 rounded text-[10px] font-semibold">
                        {{ aiGeneratedChecklist.length }}
                      </span>
                    }
                  </button>
                </div>
                
                <!-- Mostrar resultados de análisis -->
                @if (taskAnalysis) {
                  <div class="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div class="flex items-start gap-2 mb-2">
                      <tui-icon icon="tuiIconCheckCircle" class="text-green-600 dark:text-green-400 text-sm mt-0.5 flex-shrink-0"></tui-icon>
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-semibold text-green-900 dark:text-green-100 mb-1.5">Análisis completado</div>
                        @if (taskAnalysis.priority) {
                          <div class="text-xs text-green-800 dark:text-green-200 mb-1">
                            <strong>Prioridad sugerida:</strong> {{ getPriorityNameFromString(taskAnalysis.priority) }}
                          </div>
                        }
                        @if (taskAnalysis.estimatedTime) {
                          <div class="text-xs text-green-800 dark:text-green-200 mb-1">
                            <strong>Tiempo estimado:</strong> {{ taskAnalysis.estimatedTime }}
                          </div>
                        }
                        @if (taskAnalysis.missingInfo.length > 0) {
                          <div class="text-xs text-green-800 dark:text-green-200 mb-1">
                            <strong>Información faltante:</strong> {{ taskAnalysis.missingInfo.join(', ') }}
                          </div>
                        }
                        @if (taskAnalysis.improvementSuggestions.length > 0) {
                          <div class="text-xs text-green-800 dark:text-green-200">
                            <strong>Sugerencias:</strong>
                            <ul class="list-disc list-inside mt-1 space-y-0.5">
                              @for (suggestion of taskAnalysis.improvementSuggestions; track suggestion) {
                                <li>{{ suggestion }}</li>
                              }
                            </ul>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                }
                
                <!-- Mostrar dependencias detectadas -->
                @if (detectedDependencies.length > 0) {
                  <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div class="flex items-start gap-2 mb-2">
                      <tui-icon icon="tuiIconGrid" class="text-blue-600 dark:text-blue-400 text-sm mt-0.5 flex-shrink-0"></tui-icon>
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1.5">Dependencias detectadas</div>
                        <div class="space-y-1">
                          @for (dep of detectedDependencies; track dep.taskId) {
                            <div class="text-xs text-blue-800 dark:text-blue-200 p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded">
                              <div class="font-medium">{{ dep.title }}</div>
                              <div class="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">{{ dep.relationship }} ({{ dep.confidence }})</div>
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                }
                
                <!-- Mostrar duplicados detectados -->
                @if (detectedDuplicates.length > 0) {
                  <div class="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div class="flex items-start gap-2 mb-2">
                      <tui-icon icon="tuiIconAlertCircle" class="text-orange-600 dark:text-orange-400 text-sm mt-0.5 flex-shrink-0"></tui-icon>
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-semibold text-orange-900 dark:text-orange-100 mb-1.5">Tareas similares encontradas</div>
                        <div class="space-y-1">
                          @for (dup of detectedDuplicates; track dup.taskId) {
                            <div class="text-xs text-orange-800 dark:text-orange-200 p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded">
                              <div class="font-medium">{{ dup.title }}</div>
                              <div class="text-[11px] text-orange-700 dark:text-orange-300 mt-0.5">Similitud: {{ dup.similarity }}</div>
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
            
            <!-- Fecha de vencimiento -->
            <div class="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconCalendar" class="text-primary-600 dark:text-primary-400"></tui-icon>
                <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Fecha de vencimiento</label>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="date"
                  [(ngModel)]="addDueDate"
                  class="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none transition-all"
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
                    class="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    title="Quitar fecha de vencimiento"
                  ></button>
                }
              </div>
            </div>
            
            <!-- Prioridad -->
            <div class="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconFlag" class="text-primary-600 dark:text-primary-400"></tui-icon>
                <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Prioridad</label>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                  [class.bg-red-50]="addPriority === 'urgent'"
                  [class.text-red-700]="addPriority === 'urgent'"
                  [class.border-red-200]="addPriority === 'urgent'"
                  [class.dark:bg-red-900/20]="addPriority === 'urgent'"
                  [class.dark:text-red-400]="addPriority === 'urgent'"
                  [class.dark:border-red-800]="addPriority === 'urgent'"
                  [class.bg-slate-50]="addPriority !== 'urgent'"
                  [class.text-slate-600]="addPriority !== 'urgent'"
                  [class.border-slate-200]="addPriority !== 'urgent'"
                  [class.dark:bg-slate-800/50]="addPriority !== 'urgent'"
                  [class.dark:text-slate-400]="addPriority !== 'urgent'"
                  [class.dark:border-slate-700]="addPriority !== 'urgent'"
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
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                  [class.bg-orange-50]="addPriority === 'high'"
                  [class.text-orange-700]="addPriority === 'high'"
                  [class.border-orange-200]="addPriority === 'high'"
                  [class.dark:bg-orange-900/20]="addPriority === 'high'"
                  [class.dark:text-orange-400]="addPriority === 'high'"
                  [class.dark:border-orange-800]="addPriority === 'high'"
                  [class.bg-slate-50]="addPriority !== 'high'"
                  [class.text-slate-600]="addPriority !== 'high'"
                  [class.border-slate-200]="addPriority !== 'high'"
                  [class.dark:bg-slate-800/50]="addPriority !== 'high'"
                  [class.dark:text-slate-400]="addPriority !== 'high'"
                  [class.dark:border-slate-700]="addPriority !== 'high'"
                  (click)="addPriority = addPriority === 'high' ? null : 'high'"
                  title="Alta"
                >
                  Alta
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                  [class.bg-amber-50]="addPriority === 'medium'"
                  [class.text-amber-700]="addPriority === 'medium'"
                  [class.border-amber-200]="addPriority === 'medium'"
                  [class.dark:bg-amber-900/20]="addPriority === 'medium'"
                  [class.dark:text-amber-400]="addPriority === 'medium'"
                  [class.dark:border-amber-800]="addPriority === 'medium'"
                  [class.bg-slate-50]="addPriority !== 'medium'"
                  [class.text-slate-600]="addPriority !== 'medium'"
                  [class.border-slate-200]="addPriority !== 'medium'"
                  [class.dark:bg-slate-800/50]="addPriority !== 'medium'"
                  [class.dark:text-slate-400]="addPriority !== 'medium'"
                  [class.dark:border-slate-700]="addPriority !== 'medium'"
                  (click)="addPriority = addPriority === 'medium' ? null : 'medium'"
                  title="Media"
                >
                  Media
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm hover:-translate-y-0.5"
                  [class.bg-blue-50]="addPriority === 'low'"
                  [class.text-blue-700]="addPriority === 'low'"
                  [class.border-blue-200]="addPriority === 'low'"
                  [class.dark:bg-blue-900/20]="addPriority === 'low'"
                  [class.dark:text-blue-400]="addPriority === 'low'"
                  [class.dark:border-blue-800]="addPriority === 'low'"
                  [class.bg-slate-50]="addPriority !== 'low'"
                  [class.text-slate-600]="addPriority !== 'low'"
                  [class.border-slate-200]="addPriority !== 'low'"
                  [class.dark:bg-slate-800/50]="addPriority !== 'low'"
                  [class.dark:text-slate-400]="addPriority !== 'low'"
                  [class.dark:border-slate-700]="addPriority !== 'low'"
                  (click)="addPriority = addPriority === 'low' ? null : 'low'"
                  title="Baja"
                >
                  Baja
                </button>
              </div>
            </div>
            
            <!-- Asignación -->
            @if (boardMembers.length > 0) {
              <div class="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2 mb-2">
                  <tui-icon icon="tuiIconUser" class="text-primary-600 dark:text-primary-400"></tui-icon>
                  <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Asignar a</label>
                </div>
                <select
                  [(ngModel)]="addAssignee"
                  class="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none transition-all"
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
            <div class="flex flex-col gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2 mb-2">
                <tui-icon icon="tuiIconCode" class="text-primary-600 dark:text-primary-400"></tui-icon>
                <label class="text-sm font-semibold text-slate-900 dark:text-slate-100">Vincular con Git</label>
              </div>
              <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 mb-3">
                <p class="font-semibold text-blue-900 dark:text-blue-100 mb-1">💡 Formatos soportados:</p>
                <ul class="list-disc list-inside space-y-1 ml-2">
                  <li>Commit: <code class="bg-white dark:bg-slate-800 px-1 rounded text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">https://github.com/owner/repo/commit/SHA</code></li>
                  <li>Pull Request: <code class="bg-white dark:bg-slate-800 px-1 rounded text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">https://github.com/owner/repo/pull/123</code></li>
                  <li>Branch: <code class="bg-white dark:bg-slate-800 px-1 rounded text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">https://github.com/owner/repo/tree/branch-name</code></li>
                </ul>
              </div>
              <div class="flex flex-col gap-2">
                <tui-textfield class="!rounded-xl overflow-hidden">
                  <label tuiLabel>URL de Git (opcional)</label>
                  <input
                    tuiTextfield
                    type="url"
                    [(ngModel)]="addGitUrl"
                    placeholder="https://github.com/owner/repo/commit/abc123..."
                    class="!bg-slate-50 dark:!bg-slate-800/50 text-slate-900 dark:text-slate-100"
                  />
                </tui-textfield>
                <p class="text-xs text-slate-500 dark:text-slate-400">Pega la URL de un commit, Pull Request o branch de GitHub</p>
              </div>
            </div>
            
            <div class="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
              <button 
                tuiButton 
                type="button" 
                appearance="flat" 
                size="m" 
                (click)="addOpen=false"
                class="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
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
                class="rounded-xl"
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
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in" (click)="deploymentPanelOpen = false">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col animate-scale-in border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <tui-icon icon="tuiIconRefresh" class="text-purple-600 dark:text-purple-400"></tui-icon>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">Logs de Deployment y CI/CD</h3>
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="deploymentPanelOpen = false"
              class="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            ></button>
          </div>

          <!-- Status Summary -->
          <div class="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div class="w-3 h-3 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800" 
                  [class.bg-green-500]="deploymentStatus.state === 'success'" 
                  [class.ring-green-200]="deploymentStatus.state === 'success'"
                  [class.dark:ring-green-900]="deploymentStatus.state === 'success'"
                  [class.bg-yellow-500]="deploymentStatus.state === 'running'" 
                  [class.ring-yellow-200]="deploymentStatus.state === 'running'"
                  [class.dark:ring-yellow-900]="deploymentStatus.state === 'running'"
                  [class.bg-red-500]="deploymentStatus.state === 'failure'" 
                  [class.ring-red-200]="deploymentStatus.state === 'failure'"
                  [class.dark:ring-red-900]="deploymentStatus.state === 'failure'"
                  [class.bg-slate-400]="deploymentStatus.state === 'pending'"
                  [class.ring-slate-200]="deploymentStatus.state === 'pending'"
                  [class.dark:ring-slate-700]="deploymentStatus.state === 'pending'"></div>
                <div>
                  <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</p>
                  <p class="font-bold text-slate-900 dark:text-slate-100">{{ getStatusText(deploymentStatus.state) }}</p>
                </div>
              </div>
              @if (deploymentStatus.pipeline) {
                <div class="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div class="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <tui-icon icon="tuiIconCode" class="text-blue-600 dark:text-blue-400"></tui-icon>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pipeline</p>
                    <p class="font-bold text-slate-900 dark:text-slate-100 truncate">{{ deploymentStatus.pipeline }}</p>
                  </div>
                </div>
              }
              @if (deploymentStatus.version) {
                <div class="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div class="p-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <tui-icon icon="tuiIconSettings" class="text-purple-600 dark:text-purple-400"></tui-icon>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Versión</p>
                    <p class="font-bold text-slate-900 dark:text-slate-100 truncate">{{ deploymentStatus.version }}</p>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Logs Container -->
          <div class="flex-1 overflow-y-auto p-6 bg-slate-950 text-slate-300 font-mono text-sm">
            <div class="space-y-1">
              @if (deploymentLogs.length === 0) {
                <div class="flex flex-col items-center justify-center py-12 text-slate-500">
                  <tui-icon icon="tuiIconTerminal" class="text-4xl mb-4 opacity-50"></tui-icon>
                  <p class="font-medium text-slate-400">No hay logs disponibles</p>
                  <p class="text-sm mt-2">Los logs aparecerán aquí cuando:</p>
                  <ul class="text-sm text-left mt-4 space-y-2 list-disc list-inside opacity-80">
                    <li>Se ejecuten builds o deployments desde GitHub</li>
                    <li>Se reciban eventos de CI/CD desde webhooks</li>
                    <li>Se actualice el estado de pipelines</li>
                  </ul>
                </div>
              }
              @for (log of deploymentLogs; track log.timestamp || log.message) {
                <div class="flex items-start gap-3 p-1.5 rounded hover:bg-slate-900 transition-colors group" 
                  [class.text-green-400]="log.level === 'success'" 
                  [class.text-blue-400]="log.level === 'info'" 
                  [class.text-yellow-400]="log.level === 'warn'" 
                  [class.text-red-400]="log.level === 'error'">
                  <span class="text-slate-600 select-none text-xs mt-0.5 w-20 flex-shrink-0">{{ formatTimestamp(log.timestamp) }}</span>
                  @if (log.level === 'success') {
                    <tui-icon icon="tuiIconCheck" class="text-green-500 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                  }
                  @if (log.level === 'info') {
                    <tui-icon icon="tuiIconInfo" class="text-blue-500 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                  }
                  @if (log.level === 'warn') {
                    <tui-icon icon="tuiIconAlertTriangle" class="text-yellow-500 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                  }
                  @if (log.level === 'error') {
                    <tui-icon icon="tuiIconXCircle" class="text-red-500 text-xs mt-0.5 flex-shrink-0"></tui-icon>
                  }
                  <span class="flex-1 break-all">{{ log.message }}</span>
                  @if (log.context) {
                    <span class="text-slate-600 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">[{{ log.context }}]</span>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="s"
              iconStart="tuiIconTrash"
              (click)="clearDeploymentLogs()"
              class="text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
            >
              Limpiar logs
            </button>
            <div class="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              {{ deploymentLogs.length }} log{{ deploymentLogs.length !== 1 ? 's' : '' }}
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Modal de Comentarios -->
    @if (commentsOpen && commentsCardId) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="commentsOpen = false; commentsCardId = null">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in mx-2 sm:mx-4 border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <tui-icon icon="tuiIconMessageSquare" class="text-blue-600 dark:text-blue-400"></tui-icon>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">Comentarios</h3>
              @if (getCommentCount(commentsCardId) > 0) {
                <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold">{{ getCommentCount(commentsCardId) }}</span>
              }
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="commentsOpen = false; commentsCardId = null"
              class="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            ></button>
          </div>

          <!-- Lista de comentarios -->
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
            @if (!comments.has(commentsCardId) || comments.get(commentsCardId)!.length === 0) {
              <div class="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <tui-icon icon="tuiIconMessageSquare" class="text-3xl opacity-50"></tui-icon>
                </div>
                <p class="text-sm font-medium">No hay comentarios aún</p>
                <p class="text-xs mt-1">Sé el primero en comentar en esta tarjeta</p>
              </div>
            } @else {
              @for (comment of comments.get(commentsCardId)!; track comment._id) {
                <div class="flex gap-3 group">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0">
                    {{ getInitials(comment.author) }}
                  </div>
                  <div class="flex-1">
                    <div class="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-none p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                      <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-bold text-slate-900 dark:text-slate-100">{{ comment.author }}</span>
                          <span class="text-xs text-slate-500 dark:text-slate-400">{{ formatCardDate(comment.ts) }}</span>
                        </div>
                        @if (comment.author === auth.getEmail()) {
                          <button 
                            tuiButton 
                            type="button" 
                            appearance="flat" 
                            size="xs"
                            iconStart="tuiIconTrash"
                            (click)="deleteComment(comment._id)"
                            class="!p-1 !min-h-0 !h-6 !w-6 text-slate-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            title="Eliminar comentario"
                          ></button>
                        }
                      </div>
                      <p class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{{ comment.text }}</p>
                    </div>
                    @if (comment.edited) {
                      <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1 ml-2 italic">Editado</p>
                    }
                  </div>
                </div>
              }
            }
          </div>

          <!-- Input para nuevo comentario -->
          <div class="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-2xl">
            <div class="flex gap-3">
              <div class="flex-1 relative">
                <textarea 
                  class="w-full resize-none bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl p-3 pr-12 focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 focus:outline-none text-sm transition-all" 
                  rows="2" 
                  [(ngModel)]="newCommentText"
                  placeholder="Escribe un comentario..."
                  (keydown.enter)="handleCommentKeydown($event)"
                ></textarea>
                <div class="absolute right-2 bottom-2 text-[10px] text-slate-400">
                  Enter para enviar
                </div>
              </div>
              <button 
                tuiButton 
                type="button" 
                appearance="primary" 
                size="m"
                iconStart="tuiIconSend"
                (click)="addComment()"
                [disabled]="!newCommentText.trim()"
                class="self-end !rounded-xl shadow-lg shadow-primary-500/20"
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
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="labelsModalOpen = false; editingLabel = null; newLabelName = ''; newLabelColor = '#3B82F6'">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in mx-2 sm:mx-4 border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <tui-icon icon="tuiIconTag" class="text-blue-600 dark:text-blue-400"></tui-icon>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">Gestionar Etiquetas</h3>
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="labelsModalOpen = false; editingLabel = null; newLabelName = ''; newLabelColor = '#3B82F6'"
              class="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            ></button>
          </div>

          <!-- Contenido -->
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50 dark:bg-slate-900/50">
            <!-- Formulario para crear/editar label -->
            <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h4 class="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                @if (editingLabel) {
                  <tui-icon icon="tuiIconEdit" class="text-primary-500"></tui-icon>
                  Editar Etiqueta
                } @else {
                  <tui-icon icon="tuiIconPlus" class="text-primary-500"></tui-icon>
                  Nueva Etiqueta
                }
              </h4>
              
              <div class="flex flex-col gap-4">
                <!-- Nombre del label -->
                <div class="flex flex-col gap-2">
                  <tui-textfield class="!rounded-xl overflow-hidden">
                    <label tuiLabel>Nombre de la etiqueta</label>
                    <input 
                      tuiTextfield 
                      [(ngModel)]="newLabelName" 
                      placeholder="Ej: Bug, Feature, Urgente..." 
                      class="!bg-slate-50 dark:!bg-slate-900 text-slate-900 dark:text-slate-100"
                      maxlength="50"
                    />
                  </tui-textfield>
                </div>

                <!-- Selector de color -->
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-semibold text-slate-700 dark:text-slate-300">Color</label>
                  <div class="flex flex-wrap gap-2">
                    @for (color of predefinedColors; track color) {
                      <button
                        type="button"
                        class="w-8 h-8 rounded-full border-2 hover:scale-110 transition-transform shadow-sm"
                        [class.border-slate-900]="newLabelColor === color"
                        [class.dark:border-white]="newLabelColor === color"
                        [class.border-transparent]="newLabelColor !== color"
                        [style.background-color]="color"
                        (click)="newLabelColor = color"
                        [title]="color"
                      ></button>
                    }
                  </div>
                  <!-- Input de color personalizado -->
                  <div class="flex items-center gap-2 mt-2 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <label class="text-xs font-medium text-slate-600 dark:text-slate-400">Personalizado:</label>
                    <div class="relative w-8 h-8 rounded-full overflow-hidden border border-slate-300 dark:border-slate-600 shadow-sm">
                      <input
                        type="color"
                        [(ngModel)]="newLabelColor"
                        class="absolute -top-2 -left-2 w-12 h-12 cursor-pointer p-0 border-0"
                        title="Seleccionar color personalizado"
                      />
                    </div>
                    <input
                      type="text"
                      [(ngModel)]="newLabelColor"
                      class="flex-1 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                      placeholder="#3B82F6"
                      pattern="^#[0-9A-Fa-f]{6}$"
                      maxlength="7"
                    />
                  </div>
                </div>

                <!-- Botones de acción -->
                <div class="flex justify-end gap-2 pt-2">
                  @if (editingLabel) {
                    <button 
                      tuiButton 
                      type="button" 
                      appearance="flat" 
                      size="m"
                      (click)="editingLabel = null; newLabelName = ''; newLabelColor = '#3B82F6'"
                      class="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                    >
                      Cancelar
                    </button>
                  }
                  <button 
                    tuiButton 
                    type="button" 
                    appearance="primary" 
                    size="m"
                    iconStart="tuiIconCheck"
                    (click)="editingLabel ? updateLabel() : createLabel()"
                    [disabled]="!newLabelName.trim() || !isValidColor(newLabelColor)"
                    class="rounded-xl shadow-lg shadow-primary-500/20"
                  >
                    {{ editingLabel ? 'Actualizar' : 'Crear etiqueta' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Lista de labels existentes -->
            <div class="space-y-3">
              <h4 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                <span>Etiquetas Existentes</span>
                <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs">{{ boardLabels.length }}</span>
              </h4>
              
              @if (boardLabels.length === 0) {
                <div class="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  <tui-icon icon="tuiIconTag" class="text-3xl mb-2 opacity-50"></tui-icon>
                  <p class="text-sm font-medium">No hay etiquetas aún</p>
                  <p class="text-xs">Crea tu primera etiqueta arriba</p>
                </div>
              } @else {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  @for (label of boardLabels; track label.id) {
                    <div class="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all group">
                      <!-- Color y nombre -->
                      <div 
                        class="w-10 h-10 rounded-lg shadow-sm flex items-center justify-center text-white"
                        [style.background-color]="label.color"
                      >
                        <tui-icon icon="tuiIconTag" class="text-lg"></tui-icon>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{{ label.name }}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400 font-mono">{{ label.color }}</p>
                      </div>
                      
                      <!-- Botones de acción -->
                      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          tuiButton 
                          type="button" 
                          appearance="flat" 
                          size="xs"
                          iconStart="tuiIconEdit"
                          (click)="startEditLabel(label)"
                          class="!p-1.5 !min-h-0 !h-7 !w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                          title="Editar etiqueta"
                        ></button>
                        <button 
                          tuiButton 
                          type="button" 
                          appearance="flat" 
                          size="xs"
                          iconStart="tuiIconTrash"
                          (click)="deleteLabel(label.id)"
                          class="!p-1.5 !min-h-0 !h-7 !w-7 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
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
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="checklistOpen = false; checklistCardId = null; checklistCard = null">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in mx-2 sm:mx-4 border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <tui-icon icon="tuiIconCheckCircle" class="text-green-600 dark:text-green-400"></tui-icon>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">Checklist</h3>
              @if (checklistCard.checklist && checklistCard.checklist.length > 0) {
                <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold">
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
              class="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            ></button>
          </div>

          <!-- Lista de items -->
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
            @if (!checklistCard.checklist || checklistCard.checklist.length === 0) {
              <div class="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <tui-icon icon="tuiIconCheckCircle" class="text-3xl opacity-50"></tui-icon>
                </div>
                <p class="text-sm font-medium">No hay items en el checklist</p>
                <p class="text-xs mt-1">Agrega el primer item abajo</p>
              </div>
            } @else {
              <div class="space-y-2">
                @for (item of checklistCard.checklist; track item.id) {
                  <div class="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-sm transition-all group">
                    <div class="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        [checked]="item.completed"
                        (change)="toggleChecklistItem(checklistCardId, item.id, $event)"
                        class="peer w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-green-600 focus:ring-green-500 cursor-pointer transition-colors"
                      />
                    </div>
                    <div class="flex-1 min-w-0">
                      <label 
                        class="text-sm cursor-pointer block truncate transition-all"
                        [class.line-through]="item.completed"
                        [class.text-slate-400]="item.completed"
                        [class.dark:text-slate-500]="item.completed"
                        [class.text-slate-900]="!item.completed"
                        [class.dark:text-slate-100]="!item.completed"
                        [class.font-medium]="!item.completed"
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
                      class="!p-1.5 !min-h-0 !h-7 !w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Eliminar item"
                    ></button>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Input para nuevo item -->
          <div class="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-2xl">
            <div class="flex gap-3">
              <div class="flex-1 relative">
                <input
                  type="text"
                  class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 focus:outline-none text-sm transition-all"
                  [(ngModel)]="newChecklistItemText"
                  placeholder="Nuevo item del checklist..."
                  (keydown.enter)="addChecklistItem()"
                />
                <div class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                  Enter
                </div>
              </div>
              <button 
                tuiButton 
                type="button" 
                appearance="primary" 
                size="m"
                iconStart="tuiIconPlus"
                (click)="addChecklistItem()"
                [disabled]="!newChecklistItemText.trim()"
                class="self-end !rounded-xl shadow-lg shadow-primary-500/20"
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
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="shortcutsHelpOpen = false">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-scale-in mx-2 sm:mx-4 border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                <tui-icon icon="tuiIconKeyboard" class="text-indigo-600 dark:text-indigo-400"></tui-icon>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">Atajos de Teclado</h3>
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="shortcutsHelpOpen = false"
              class="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            ></button>
          </div>

          <!-- Contenido -->
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-900/50">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <!-- Atajos de Navegación -->
              <div class="space-y-4">
                <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <tui-icon icon="tuiIconNavigation" class="text-sm"></tui-icon>
                  Navegación
                </h4>
                <div class="space-y-2 text-sm bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">Flecha ↑ ↓</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Navegar</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">Flecha ← →</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Columnas</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">1, 2, 3</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Ir a columna</kbd>
                  </div>
                </div>
              </div>

              <!-- Atajos de Acciones -->
              <div class="space-y-4">
                <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <tui-icon icon="tuiIconZap" class="text-sm"></tui-icon>
                  Acciones
                </h4>
                <div class="space-y-2 text-sm bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">Ctrl/Cmd + N</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Nueva tarjeta</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">N</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Nueva en Todo</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">E</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Editar</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">Supr / Back</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Eliminar</kbd>
                  </div>
                </div>
              </div>

              <!-- Atajos de Modales -->
              <div class="space-y-4">
                <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <tui-icon icon="tuiIconMaximize" class="text-sm"></tui-icon>
                  Modales
                </h4>
                <div class="space-y-2 text-sm bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">Escape</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Cerrar</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">Ctrl/Cmd + S</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Guardar</kbd>
                  </div>
                </div>
              </div>

              <!-- Atajos de Ayuda -->
              <div class="space-y-4">
                <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <tui-icon icon="tuiIconHelpCircle" class="text-sm"></tui-icon>
                  Ayuda
                </h4>
                <div class="space-y-2 text-sm bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">Ctrl/Cmd + K</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Buscar</kbd>
                  </div>
                  <div class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span class="text-slate-700 dark:text-slate-300 font-medium">Ctrl/Cmd + /</span>
                    <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-600 shadow-sm">Ayuda</kbd>
                  </div>
                </div>
              </div>
            </div>

            <!-- Nota al pie -->
            <div class="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
              <p class="text-xs text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/10 px-4 py-2 rounded-lg inline-block border border-blue-100 dark:border-blue-800/30">
                💡 Tip: Los atajos solo funcionan cuando no estás escribiendo en un campo de texto.
              </p>
            </div>
          </div>
        </div>
      </div>
    }
    
    <!-- Modal de Búsqueda Avanzada -->
    @if (searchOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="searchOpen = false">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-scale-in mx-2 sm:mx-4 border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <tui-icon icon="tuiIconSearch" class="text-blue-600 dark:text-blue-400"></tui-icon>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">Búsqueda Avanzada</h3>
              @if (getSearchResults().length > 0) {
                <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold">{{ getSearchResults().length }} resultado{{ getSearchResults().length !== 1 ? 's' : '' }}</span>
              }
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="searchOpen = false; clearSearch()"
              class="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            ></button>
          </div>

          <!-- Filtros -->
          <div class="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-4 flex-shrink-0">
            <!-- Búsqueda de texto -->
            <div class="flex flex-col gap-2">
              <label class="text-sm font-bold text-slate-900 dark:text-slate-100">Buscar en título y descripción</label>
              <div class="relative">
                <tui-icon icon="tuiIconSearch" class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none"></tui-icon>
                <input
                  type="text"
                  class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 focus:outline-none text-sm transition-all"
                  [(ngModel)]="searchQuery"
                  placeholder="Escribe para buscar..."
                  (ngModelChange)="applySearch()"
                />
              </div>
            </div>

            <!-- Filtros avanzados -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <!-- Filtro por columna -->
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Columna</label>
                <select
                  [(ngModel)]="searchFilters.column"
                  (ngModelChange)="applySearch()"
                  class="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none text-sm"
                >
                  <option [value]="undefined">Todas</option>
                  <option value="todo">Por hacer</option>
                  <option value="doing">En progreso</option>
                  <option value="done">Hecho</option>
                </select>
              </div>

              <!-- Filtro por prioridad -->
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Prioridad</label>
                <select
                  [(ngModel)]="searchFilters.priority"
                  (ngModelChange)="applySearch()"
                  class="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none text-sm"
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
                  <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Asignado a</label>
                  <select
                    [(ngModel)]="searchFilters.assignee"
                    (ngModelChange)="applySearch()"
                    class="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none text-sm"
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
                <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fecha de vencimiento</label>
                <select
                  [(ngModel)]="searchFilters.dueDate"
                  (ngModelChange)="applySearch()"
                  class="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none text-sm"
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
                <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Etiquetas</label>
                <div class="flex flex-wrap gap-2">
                  @for (label of boardLabels; track label.id) {
                    <button
                      type="button"
                      class="px-3 py-1.5 text-xs font-bold rounded-lg border transition-all shadow-sm hover:shadow-md"
                      [class.opacity-50]="!searchFilters.labels?.includes(label.id)"
                      [class.grayscale]="!searchFilters.labels?.includes(label.id)"
                      [style.background-color]="label.color + '20'"
                      [style.color]="label.color"
                      [style.border-color]="label.color + '40'"
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
                class="w-full text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Limpiar filtros
              </button>
            }
          </div>

          <!-- Resultados -->
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-950">
            @if (getSearchResults().length === 0) {
              <div class="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <tui-icon icon="tuiIconSearch" class="text-3xl opacity-50"></tui-icon>
                </div>
                <p class="text-sm font-medium mb-1">No se encontraron resultados</p>
                <p class="text-xs">Intenta ajustar tus filtros de búsqueda</p>
              </div>
            } @else {
              <div class="space-y-3">
                @for (result of getSearchResults(); track result.card.id) {
                  <div
                    class="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all cursor-pointer group"
                    (click)="selectSearchResult(result.list, result.index)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                          <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                            [class.bg-blue-50]="result.list === 'todo'"
                            [class.text-blue-700]="result.list === 'todo'"
                            [class.dark:bg-blue-900/20]="result.list === 'todo'"
                            [class.dark:text-blue-400]="result.list === 'todo'"
                            [class.bg-yellow-50]="result.list === 'doing'"
                            [class.text-yellow-700]="result.list === 'doing'"
                            [class.dark:bg-yellow-900/20]="result.list === 'doing'"
                            [class.dark:text-yellow-400]="result.list === 'doing'"
                            [class.bg-green-50]="result.list === 'done'"
                            [class.text-green-700]="result.list === 'done'"
                            [class.dark:bg-green-900/20]="result.list === 'done'"
                            [class.dark:text-green-400]="result.list === 'done'"
                          >
                            @if (result.list === 'todo') { Por hacer }
                            @if (result.list === 'doing') { En progreso }
                            @if (result.list === 'done') { Hecho }
                          </span>
                          @if (result.card.priority) {
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border"
                              [class.bg-red-50]="result.card.priority === 'urgent'"
                              [class.text-red-700]="result.card.priority === 'urgent'"
                              [class.border-red-200]="result.card.priority === 'urgent'"
                              [class.dark:bg-red-900/20]="result.card.priority === 'urgent'"
                              [class.dark:text-red-400]="result.card.priority === 'urgent'"
                              [class.dark:border-red-800/30]="result.card.priority === 'urgent'"
                              [class.bg-orange-50]="result.card.priority === 'high'"
                              [class.text-orange-700]="result.card.priority === 'high'"
                              [class.border-orange-200]="result.card.priority === 'high'"
                              [class.dark:bg-orange-900/20]="result.card.priority === 'high'"
                              [class.dark:text-orange-400]="result.card.priority === 'high'"
                              [class.dark:border-orange-800/30]="result.card.priority === 'high'"
                              [class.bg-amber-50]="result.card.priority === 'medium'"
                              [class.text-amber-700]="result.card.priority === 'medium'"
                              [class.border-amber-200]="result.card.priority === 'medium'"
                              [class.dark:bg-amber-900/20]="result.card.priority === 'medium'"
                              [class.dark:text-amber-400]="result.card.priority === 'medium'"
                              [class.dark:border-amber-800/30]="result.card.priority === 'medium'"
                              [class.bg-slate-50]="result.card.priority === 'low'"
                              [class.text-slate-700]="result.card.priority === 'low'"
                              [class.border-slate-200]="result.card.priority === 'low'"
                              [class.dark:bg-slate-800]="result.card.priority === 'low'"
                              [class.dark:text-slate-400]="result.card.priority === 'low'"
                              [class.dark:border-slate-700]="result.card.priority === 'low'"
                            >
                              {{ getPriorityName(result.card.priority) }}
                            </span>
                          }
                        </div>
                        <h4 class="font-bold text-slate-900 dark:text-slate-100 mb-1 text-base group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{{ result.card.title }}</h4>
                        @if (result.card.description) {
                          <p class="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">{{ result.card.description }}</p>
                        }
                        <div class="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-500">
                          @if (result.card.assignee) {
                            <span class="flex items-center gap-1.5">
                              <div class="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-600 dark:text-slate-300">
                                {{ getInitials(result.card.assignee) }}
                              </div>
                              {{ result.card.assignee }}
                            </span>
                          }
                          @if (result.card.dueDate) {
                            <span class="flex items-center gap-1.5"
                              [class.text-red-600]="isOverdue(result.card.dueDate)"
                              [class.dark:text-red-400]="isOverdue(result.card.dueDate)"
                              [class.text-orange-600]="!isOverdue(result.card.dueDate) && isDueSoon(result.card.dueDate)"
                              [class.dark:text-orange-400]="!isOverdue(result.card.dueDate) && isDueSoon(result.card.dueDate)"
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
                        class="!p-2 !min-h-0 !h-8 !w-8 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
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
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="activityOpen = false">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-scale-in mx-2 sm:mx-4 border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <tui-icon icon="tuiIconClock" class="text-blue-600 dark:text-blue-400"></tui-icon>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">Historial de Actividad</h3>
              @if (activities.length > 0) {
                <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold">{{ activities.length }} actividad{{ activities.length !== 1 ? 'es' : '' }}</span>
              }
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="activityOpen = false"
              class="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            ></button>
          </div>

          <!-- Filtros -->
          <div class="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-3 flex-wrap">
            <select
              [(ngModel)]="activityFilters.action"
              (ngModelChange)="loadActivities()"
              class="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none text-sm"
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
              class="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none text-sm"
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
                class="text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
              >
                Limpiar filtros
              </button>
            }
          </div>

          <!-- Lista de actividades -->
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-950">
            @if (loadingActivities) {
              <div class="flex items-center justify-center py-12">
                <div class="text-center space-y-3">
                  <div class="inline-block w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                  <p class="text-sm text-slate-600 dark:text-slate-400">Cargando actividades...</p>
                </div>
              </div>
            } @else if (activities.length === 0) {
              <div class="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <tui-icon icon="tuiIconClock" class="text-3xl opacity-50"></tui-icon>
                </div>
                <p class="text-sm font-medium mb-1">No hay actividades registradas</p>
                <p class="text-xs">Las acciones en el tablero aparecerán aquí</p>
              </div>
            } @else {
              <div class="space-y-4">
                @for (activity of activities; track activity._id) {
                  <div class="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div class="flex items-start gap-3">
                      <div class="flex-shrink-0 mt-1">
                        <div class="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                          <tui-icon 
                            [icon]="getActivityIcon(activity.action)" 
                            class="text-blue-600 dark:text-blue-400 text-sm"
                          ></tui-icon>
                        </div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                          <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {{ getActivityMessage(activity) }}
                          </span>
                          <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wide">
                            {{ getActivityActionName(activity.action) }}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                          <span class="font-medium text-slate-700 dark:text-slate-300">{{ activity.userId }}</span>
                          <span>·</span>
                          <span>{{ formatActivityDate(activity.timestamp) }}</span>
                        </div>
                        @if (activity.details && hasActivityDetails(activity)) {
                          <div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 text-xs text-slate-600 dark:text-slate-400">
                            @if (activity.details.field && activity.details.oldValue !== undefined && activity.details.newValue !== undefined) {
                              <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-medium text-slate-700 dark:text-slate-300">{{ getFieldName(activity.details.field) }}:</span>
                                <span class="line-through text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">{{ formatDetailValue(activity.details.oldValue) }}</span>
                                <tui-icon icon="tuiIconArrowRight" class="text-slate-400 text-[10px]"></tui-icon>
                                <span class="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded font-medium">{{ formatDetailValue(activity.details.newValue) }}</span>
                              </div>
                            }
                            @if (activity.details.fromList && activity.details.toList) {
                              <div class="flex items-center gap-2 mt-1 flex-wrap">
                                <span class="font-medium text-slate-700 dark:text-slate-300">Movida de:</span>
                                <span class="px-2 py-0.5 rounded text-xs font-medium" [class]="getListBadgeClass(activity.details.fromList)">
                                  {{ getListNameForActivity(activity.details.fromList) }}
                                </span>
                                <tui-icon icon="tuiIconArrowRight" class="text-slate-400 text-[10px]"></tui-icon>
                                <span class="px-2 py-0.5 rounded text-xs font-medium" [class]="getListBadgeClass(activity.details.toList)">
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
    
    <!-- Modal de Estadísticas -->
    @if (statisticsPanelOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in p-2 sm:p-4" (click)="statisticsPanelOpen = false">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-scale-in mx-2 sm:mx-4 border border-slate-200 dark:border-slate-800" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <tui-icon icon="tuiIconBarChart" class="text-blue-600 dark:text-blue-400"></tui-icon>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">Estadísticas del Tablero</h3>
            </div>
            <button 
              tuiButton 
              type="button" 
              appearance="flat" 
              size="xs"
              iconStart="tuiIconClose"
              (click)="statisticsPanelOpen = false"
              class="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            ></button>
          </div>

          <!-- Contenido -->
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-950">
            @if (loadingStatistics) {
              <div class="flex items-center justify-center py-12">
                <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
              </div>
            } @else if (!statistics) {
              <div class="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <tui-icon icon="tuiIconBarChart" class="text-3xl opacity-50"></tui-icon>
                </div>
                <p class="text-sm font-medium">No se pudieron cargar las estadísticas</p>
              </div>
            } @else {
              <div class="space-y-6">
                <!-- Métricas principales -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div class="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Por hacer</div>
                    <div class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{{ statistics.columnStats?.todo || 0 }}</div>
                    <div class="h-1 w-full bg-blue-100 dark:bg-blue-900/30 rounded-full mt-2 overflow-hidden">
                        <div class="h-full bg-blue-500" style="width: 40%"></div>
                    </div>
                  </div>
                  <div class="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">En progreso</div>
                    <div class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{{ statistics.columnStats?.doing || 0 }}</div>
                    <div class="h-1 w-full bg-yellow-100 dark:bg-yellow-900/30 rounded-full mt-2 overflow-hidden">
                        <div class="h-full bg-yellow-500" style="width: 60%"></div>
                    </div>
                  </div>
                  <div class="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Completadas</div>
                    <div class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{{ statistics.columnStats?.done || 0 }}</div>
                    <div class="h-1 w-full bg-green-100 dark:bg-green-900/30 rounded-full mt-2 overflow-hidden">
                        <div class="h-full bg-green-500" style="width: 80%"></div>
                    </div>
                  </div>
                  <div class="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-inner">
                    <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Total</div>
                    <div class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{{ statistics.columnStats?.total || 0 }}</div>
                  </div>
                </div>

                <!-- Gráfico de distribución por columna -->
                <div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h4 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-6">Distribución por Columna</h4>
                  <div class="space-y-4">
                    @for (col of [
                      { name: 'Por hacer', value: statistics.columnStats?.todo || 0, color: 'bg-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/20', max: statistics.columnStats?.total || 1 },
                      { name: 'En progreso', value: statistics.columnStats?.doing || 0, color: 'bg-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/20', max: statistics.columnStats?.total || 1 },
                      { name: 'Completadas', value: statistics.columnStats?.done || 0, color: 'bg-green-500', bg: 'bg-green-100 dark:bg-green-900/20', max: statistics.columnStats?.total || 1 }
                    ]; track col.name) {
                      <div>
                        <div class="flex justify-between items-center mb-2">
                          <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ col.name }}</span>
                          <span class="text-sm font-bold text-slate-900 dark:text-slate-100">{{ col.value }} <span class="text-slate-400 text-xs font-normal ml-1">({{ (col.value / col.max * 100) | number:'1.0-0' }}%)</span></span>
                        </div>
                        <div class="w-full h-3 rounded-full overflow-hidden" [class]="col.bg">
                          <div 
                            class="h-full {{ col.color }} transition-all duration-500 ease-out rounded-full"
                            [style.width.%]="(col.value / col.max) * 100"
                          ></div>
                        </div>
                      </div>
                    }
                  </div>
                </div>

                <!-- Grid de métricas adicionales -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <!-- Distribución por prioridad -->
                  <div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <h4 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Por Prioridad</h4>
                    <div class="space-y-3">
                      @for (priority of [
                        { name: 'Urgente', value: statistics.priorityStats?.urgent || 0, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/20' },
                        { name: 'Alta', value: statistics.priorityStats?.high || 0, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/20' },
                        { name: 'Media', value: statistics.priorityStats?.medium || 0, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/20' },
                        { name: 'Baja', value: statistics.priorityStats?.low || 0, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/20' },
                        { name: 'Sin prioridad', value: statistics.priorityStats?.none || 0, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' }
                      ]; track priority.name) {
                        <div class="flex justify-between items-center p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
                          <div class="flex items-center gap-3">
                            <div class="w-2 h-2 rounded-full" [class]="priority.bg.replace('/20', '')"></div>
                            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ priority.name }}</span>
                          </div>
                          <span class="text-sm font-bold text-slate-900 dark:text-slate-100">{{ priority.value }}</span>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Tiempo promedio por columna -->
                  <div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <h4 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Tiempo Promedio</h4>
                    <div class="space-y-4">
                      @for (col of [
                        { name: 'Por hacer', hours: statistics.avgTimeInColumn?.todo || 0, icon: 'tuiIconList' },
                        { name: 'En progreso', hours: statistics.avgTimeInColumn?.doing || 0, icon: 'tuiIconLoader' },
                        { name: 'Completadas', hours: statistics.avgTimeInColumn?.done || 0, icon: 'tuiIconCheckCircle' }
                      ]; track col.name) {
                        <div class="flex justify-between items-center">
                          <div class="flex items-center gap-3">
                            <div class="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
                                <tui-icon [icon]="col.icon" class="text-sm"></tui-icon>
                            </div>
                            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ col.name }}</span>
                          </div>
                          <span class="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                            @if (col.hours > 0) {
                              {{ col.hours }}h
                            } @else {
                              <span class="text-slate-400">-</span>
                            }
                          </span>
                        </div>
                      }
                    </div>
                  </div>
                </div>

                <!-- Velocidad de flujo y completadas -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                    <div class="text-sm text-blue-700 dark:text-blue-300 font-bold mb-2">Velocidad de flujo</div>
                    <div class="text-3xl font-bold text-blue-900 dark:text-blue-100">
                      {{ statistics.throughput7Days || 0 }} <span class="text-base font-normal opacity-70">/ día</span>
                    </div>
                    <div class="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">Promedio últimos 7 días</div>
                  </div>
                  <div class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
                    <div class="text-sm text-green-700 dark:text-green-300 font-bold mb-2">Completadas (7 días)</div>
                    <div class="text-3xl font-bold text-green-900 dark:text-green-100">
                      {{ statistics.completedLast7Days || 0 }}
                    </div>
                    <div class="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">Total última semana</div>
                  </div>
                  <div class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                    <div class="text-sm text-purple-700 dark:text-purple-300 font-bold mb-2">Completadas (30 días)</div>
                    <div class="text-3xl font-bold text-purple-900 dark:text-purple-100">
                      {{ statistics.completedLast30Days || 0 }}
                    </div>
                    <div class="text-xs text-purple-600 dark:text-purple-400 mt-2 font-medium">Total último mes</div>
                  </div>
                </div>

                <!-- Tarjetas vencidas y próximas a vencer -->
                @if (statistics.overdueCards && statistics.overdueCards.length > 0) {
                  <div class="bg-red-50 dark:bg-red-900/10 rounded-xl p-6 border border-red-200 dark:border-red-900/30">
                    <div class="flex items-center gap-2 mb-4">
                      <tui-icon icon="tuiIconAlertCircle" class="text-red-600 dark:text-red-400"></tui-icon>
                      <h4 class="text-base font-bold text-red-900 dark:text-red-100">Tarjetas Vencidas ({{ statistics.overdueCards.length }})</h4>
                    </div>
                    <div class="space-y-2">
                      @for (card of statistics.overdueCards.slice(0, 5); track card.id) {
                        <div class="flex items-center gap-2 text-sm text-red-800 dark:text-red-200 bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                          <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          {{ card.title }}
                        </div>
                      }
                      @if (statistics.overdueCards.length > 5) {
                        <div class="text-xs font-bold text-red-600 dark:text-red-400 pl-4">
                          +{{ statistics.overdueCards.length - 5 }} más
                        </div>
                      }
                    </div>
                  </div>
                }

                @if (statistics.dueSoonCards && statistics.dueSoonCards.length > 0) {
                  <div class="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-6 border border-orange-200 dark:border-orange-900/30">
                    <div class="flex items-center gap-2 mb-4">
                      <tui-icon icon="tuiIconClock" class="text-orange-600 dark:text-orange-400"></tui-icon>
                      <h4 class="text-base font-bold text-orange-900 dark:text-orange-100">Próximas a Vencer ({{ statistics.dueSoonCards.length }})</h4>
                    </div>
                    <div class="space-y-2">
                      @for (card of statistics.dueSoonCards.slice(0, 5); track card.id) {
                        <div class="flex items-center gap-2 text-sm text-orange-800 dark:text-orange-200 bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                          <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                          {{ card.title }}
                        </div>
                      }
                      @if (statistics.dueSoonCards.length > 5) {
                        <div class="text-xs font-bold text-orange-600 dark:text-orange-400 pl-4">
                          +{{ statistics.dueSoonCards.length - 5 }} más
                        </div>
                      }
                    </div>
                  </div>
                }

                <!-- Distribución por asignado -->
                @if (statistics.assigneeStats && getObjectKeys(statistics.assigneeStats).length > 0) {
                  <div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <h4 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Por Asignado</h4>
                    <div class="space-y-2">
                      @for (assignee of getObjectEntries(statistics.assigneeStats); track assignee[0]) {
                        <div class="flex justify-between items-center p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
                          <div class="flex items-center gap-3">
                            <div class="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                {{ assignee[0].substring(0, 2).toUpperCase() }}
                            </div>
                            <span class="text-sm font-medium text-slate-700 dark:text-slate-300 truncate flex-1">{{ assignee[0] }}</span>
                          </div>
                          <span class="text-sm font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">{{ assignee[1] }}</span>
                        </div>
                      }
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
  private readonly ai = inject(AIService);
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

  // Estado de IA
  aiAvailable = false;
  detectingDependencies = false;
  detectingDuplicates = false;
  analyzingTask = false;
  improvingDescription = false;
  generatingChecklist = false;
  aiGeneratedChecklist: ChecklistItem[] | null = null; // Checklist generado por IA
  detectedDependencies: Array<{ taskId: string; title: string; relationship: string; confidence: string; reason: string }> = [];
  detectedDuplicates: Array<{ taskId: string; title: string; similarity: string; reason: string }> = [];
  taskAnalysis: { priority: string; estimatedTime?: string; improvementSuggestions: string[]; missingInfo: string[]; recommendedLabels?: string[] } | null = null;
  bottlenecks: Array<{ cardId: string; title: string; list: string; daysStuck: number; severity: string; suggestion?: string }> = [];
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

    // Verificar disponibilidad de IA
    this.checkAIAvailability();

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
        try { localStorage.setItem('tf-last-board', this.boardId); } catch { }
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
      if (isDevelopment()) console.warn('[Kanban] Socket no conectado, intentando unirse de todas formas...');
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
      if (isDevelopment()) console.warn('[Kanban] Socket no conectado, intentando unirse de todas formas...');
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
    // Resetear estado de IA
    this.detectedDependencies = [];
    this.detectedDuplicates = [];
    this.taskAnalysis = null;
    this.aiGeneratedChecklist = null;
    this.cdr.markForCheck();
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

      // Agregar checklist generado por IA si existe
      if (this.aiGeneratedChecklist && Array.isArray(this.aiGeneratedChecklist) && this.aiGeneratedChecklist.length > 0) {
        payload.checklist = this.aiGeneratedChecklist;
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
    // Resetear estado de IA
    this.detectedDependencies = [];
    this.detectedDuplicates = [];
    this.taskAnalysis = null;
    this.aiGeneratedChecklist = null;
    this.cdr.markForCheck();
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
      if (isDevelopment()) console.warn('[Kanban] No se puede cargar estado inicial: boardId no definido');
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
          if (isDevelopment()) console.warn('[Kanban] Tablero no encontrado, usando estado vacío');
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

      if (isDevelopment()) console.log(`[Kanban] Estado inicial cargado: ${this.todo.length + this.doing.length + this.done.length} tarjetas`);
    } catch (error) {
      console.error('[Kanban] Error al cargar estado inicial:', error);
      this.alerts.open('Error al cargar el tablero. Por favor, recarga la página.', { label: 'Error', appearance: 'negative' }).subscribe();

      // Reintentar una vez después de un segundo si no hay datos
      if (this.todo.length === 0 && this.doing.length === 0 && this.done.length === 0) {
        if (isDevelopment()) console.warn('[Kanban] Reintentando cargar estado inicial...');
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
  /**
   * Navega a la lista de tableros, marcando que es una navegación explícita.
   */
  navigateToBoardsList(): void {
    try {
      // Marcar que el usuario navegó explícitamente a la lista de tableros
      // Esto evita que el guard redirija al último tablero visitado
      sessionStorage.setItem('tf-explicit-navigation-to-boards', 'true');
      this.router.navigate(['/app/boards']);
    } catch (err) {
      // Si hay error con sessionStorage, navegar de todas formas
      this.router.navigate(['/app/boards']);
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
  private deploymentLogHandler?: (...args: unknown[]) => void;
  private deploymentStatusHandler?: (...args: unknown[]) => void;
  private deploymentSubscribed = false;

  // Statistics panel state
  statisticsPanelOpen = false;
  statistics: any = null;
  loadingStatistics = false;

  openDeploymentPanel(): void {
    this.deploymentPanelOpen = true;

    // Suscribirse a logs de deployment solo si no está ya suscrito
    if (this.boardId && !this.deploymentSubscribed) {
      if (!this.socket.isConnected()) {
        this.socket.connect();
        // Esperar un poco antes de suscribirse
        setTimeout(() => {
          if (this.socket.isConnected()) {
            this.socket.emit('deployment:subscribe', { boardId: this.boardId });
            this.deploymentSubscribed = true;
          }
        }, 300);
      } else {
        this.socket.emit('deployment:subscribe', { boardId: this.boardId });
        this.deploymentSubscribed = true;
      }
    }

    // Escuchar logs en tiempo real (solo si no hay handler ya registrado)
    if (!this.deploymentLogHandler) {
      this.deploymentLogHandler = (...args: unknown[]) => {
        const log = args[0] as { level: 'info' | 'warn' | 'error' | 'success'; message: string; timestamp: number; context?: string };
        this.deploymentLogs = [...this.deploymentLogs, log].slice(-1000); // Mantener últimos 1000 logs
        this.cdr.markForCheck();
      };
      this.socket.on('deployment:log', this.deploymentLogHandler);
    }

    // Escuchar cambios de estado (solo si no hay handler ya registrado)
    if (!this.deploymentStatusHandler) {
      this.deploymentStatusHandler = (...args: unknown[]) => {
        const status = args[0] as { state: 'pending' | 'running' | 'success' | 'failure' | 'cancelled'; pipeline?: string; version?: string; timestamp: number };
        this.deploymentStatus = status;
        this.cdr.markForCheck();
      };
      this.socket.on('deployment:status', this.deploymentStatusHandler);
    }
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
    if (this.boardId && this.socket.isConnected() && this.deploymentSubscribed) {
      this.socket.emit('deployment:unsubscribe', { boardId: this.boardId });
      this.deploymentSubscribed = false;
    }
    // Remover handlers de deployment
    if (this.deploymentLogHandler) {
      this.socket.off('deployment:log', this.deploymentLogHandler);
      this.deploymentLogHandler = undefined;
    }
    if (this.deploymentStatusHandler) {
      this.socket.off('deployment:status', this.deploymentStatusHandler);
      this.deploymentStatusHandler = undefined;
    }
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
   * Obtiene el nombre de la prioridad desde un string (para uso con taskAnalysis).
   */
  getPriorityNameFromString(priority: string): string {
    const validPriorities: Array<'low' | 'medium' | 'high' | 'urgent'> = ['low', 'medium', 'high', 'urgent'];
    const normalizedPriority = priority.toLowerCase() as 'low' | 'medium' | 'high' | 'urgent';
    if (validPriorities.includes(normalizedPriority)) {
      return this.getPriorityName(normalizedPriority);
    }
    return priority; // Retornar el string original si no es válido
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
   * Abre el modal de estadísticas y carga las estadísticas.
   */
  async openStatistics(): Promise<void> {
    this.statisticsPanelOpen = true;
    await this.loadStatistics();
  }

  /**
   * Carga las estadísticas del tablero desde el API.
   */
  async loadStatistics(): Promise<void> {
    if (!this.boardId) return;

    this.loadingStatistics = true;
    this.cdr.markForCheck();

    try {
      const userEmail = this.auth.getEmail();
      if (!userEmail) {
        this.alerts.open('No estás autenticado', { label: 'Error', appearance: 'negative' }).subscribe();
        return;
      }

      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/statistics`, {
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
        const error = await res.json().catch(() => ({ message: 'Error al cargar estadísticas' }));
        throw new Error(error.message || `Error ${res.status}`);
      }

      this.statistics = await res.json();
    } catch (err: any) {
      console.error('[Kanban] Error cargando estadísticas:', err);
      this.alerts.open(err.message || 'Error al cargar estadísticas', { label: 'Error', appearance: 'negative' }).subscribe();
      this.statistics = null;
    } finally {
      this.loadingStatistics = false;
      this.cdr.markForCheck();
    }
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
      card_moved: 'tuiIconChevronRight',
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
   * Helper para usar Object.keys en el template.
   */
  protected getObjectKeys(obj: Record<string, any> | null | undefined): string[] {
    return obj ? Object.keys(obj) : [];
  }

  /**
   * Helper para usar Object.entries en el template.
   */
  protected getObjectEntries(obj: Record<string, any> | null | undefined): [string, any][] {
    if (!obj) return [];
    return Object.entries(obj).sort((a, b) => {
      // Ordenar por valor descendente (número mayor primero)
      const valA = typeof a[1] === 'number' ? a[1] : 0;
      const valB = typeof b[1] === 'number' ? b[1] : 0;
      return valB - valA;
    });
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

  // ============ Métodos de IA ============

  /**
   * Verifica la disponibilidad del servicio de IA.
   */
  private async checkAIAvailability(): Promise<void> {
    try {
      this.aiAvailable = await this.ai.checkAvailability();
    } catch (error) {
      console.warn('[AI] Error verificando disponibilidad:', error);
      this.aiAvailable = false;
    }
  }

  /**
   * Detecta dependencias entre la nueva tarjeta y las existentes.
   */
  async detectCardDependencies(): Promise<void> {
    if (!this.aiAvailable || !this.addTitle.trim()) return;

    this.detectingDependencies = true;
    this.detectedDependencies = [];
    this.cdr.markForCheck();

    try {
      const allCards = [...this.todo, ...this.doing, ...this.done];
      const existingTasks = allCards.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        list: this.getListNameForCard(c) as 'todo' | 'doing' | 'done'
      }));

      const dependencies = await this.ai.detectDependencies({
        newTask: { title: this.addTitle, description: this.addDescription || undefined },
        existingTasks
      });

      this.detectedDependencies = dependencies;

      if (dependencies.length > 0) {
        const msg = `Se encontraron ${dependencies.length} dependencia(s) con otras tareas.`;
        this.alerts.open(msg, { label: 'Dependencias detectadas', appearance: 'info' }).subscribe();
      }
    } catch (error: any) {
      console.error('[AI] Error detectando dependencias:', error);
      this.alerts.open('Error al detectar dependencias', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.detectingDependencies = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Detecta tareas duplicadas.
   */
  async detectCardDuplicates(): Promise<void> {
    if (!this.aiAvailable || !this.addTitle.trim()) return;

    this.detectingDuplicates = true;
    this.detectedDuplicates = [];
    this.cdr.markForCheck();

    try {
      const allCards = [...this.todo, ...this.doing, ...this.done];
      const existingTasks = allCards.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description
      }));

      const duplicates = await this.ai.detectDuplicates({
        newTask: { title: this.addTitle, description: this.addDescription || undefined },
        existingTasks
      });

      this.detectedDuplicates = duplicates;

      if (duplicates.length > 0) {
        const msg = `Se encontraron ${duplicates.length} tarea(s) similar(es) o duplicada(s).`;
        this.alerts.open(msg, { label: 'Duplicados detectados', appearance: 'warning' }).subscribe();
      } else {
        this.alerts.open('No se encontraron tareas duplicadas', { label: 'Sin duplicados', appearance: 'success' }).subscribe();
      }
    } catch (error: any) {
      console.error('[AI] Error detectando duplicados:', error);
      this.alerts.open('Error al detectar duplicados', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.detectingDuplicates = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Analiza la tarea y sugiere mejoras.
   */
  async analyzeCardTask(): Promise<void> {
    if (!this.aiAvailable || !this.addTitle.trim()) return;

    this.analyzingTask = true;
    this.taskAnalysis = null;
    this.cdr.markForCheck();

    try {
      const allCards = [...this.todo, ...this.doing, ...this.done];
      const existingTasks = allCards.slice(0, 5).map(c => ({
        title: c.title,
        description: c.description
      }));

      const analysis = await this.ai.analyzeTask({
        title: this.addTitle,
        description: this.addDescription || undefined,
        context: `Tablero: ${this.boardName || 'Sin nombre'}`,
        existingTasks
      });

      this.taskAnalysis = analysis;

      // Aplicar prioridad sugerida si no hay una definida
      if (!this.addPriority && analysis.priority) {
        this.addPriority = analysis.priority as 'low' | 'medium' | 'high' | 'urgent';
      }

      this.alerts.open('Análisis completado', { label: 'Análisis de tarea', appearance: 'success' }).subscribe();
    } catch (error: any) {
      console.error('[AI] Error analizando tarea:', error);
      this.alerts.open('Error al analizar la tarea', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.analyzingTask = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Mejora la descripción de la tarjeta.
   */
  async improveCardDescription(): Promise<void> {
    if (!this.aiAvailable || !this.addTitle.trim()) return;

    this.improvingDescription = true;
    this.cdr.markForCheck();

    try {
      const improvement = await this.ai.improveDescription({
        title: this.addTitle,
        currentDescription: this.addDescription || undefined,
        context: `Tablero: ${this.boardName || 'Sin nombre'}`
      });

      this.addDescription = improvement.improvedDescription;

      if (improvement.missingElements.length > 0) {
        const msg = `Se agregaron: ${improvement.missingElements.join(', ')}`;
        this.alerts.open(msg, { label: 'Descripción mejorada', appearance: 'success' }).subscribe();
      }
    } catch (error: any) {
      console.error('[AI] Error mejorando descripción:', error);
      this.alerts.open('Error al mejorar la descripción', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.improvingDescription = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Genera un checklist inteligente para la tarjeta.
   */
  async generateCardChecklist(): Promise<void> {
    if (!this.aiAvailable || !this.addTitle.trim()) return;

    this.generatingChecklist = true;
    this.cdr.markForCheck();

    try {
      const checklist = await this.ai.generateChecklist({
        title: this.addTitle,
        description: this.addDescription || undefined
      });

      // Convertir a formato de ChecklistItem y mostrar sugerencia
      const checklistItems = checklist.map((item, idx) => ({
        id: `ai-${Date.now()}-${idx}`,
        text: item.text,
        completed: false,
        createdAt: Date.now()
      }));

      // Guardar en una variable temporal para usar al crear la tarjeta
      this.aiGeneratedChecklist = checklistItems;

      this.alerts.open(`Se generaron ${checklist.length} elementos de checklist`, {
        label: 'Checklist generado',
        appearance: 'success'
      }).subscribe();
    } catch (error: any) {
      console.error('[AI] Error generando checklist:', error);
      this.alerts.open('Error al generar el checklist', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.generatingChecklist = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Detecta cuellos de botella en el tablero.
   */
  async detectBottlenecks(): Promise<void> {
    if (!this.aiAvailable) {
      this.alerts.open('Servicio de IA no disponible', { label: 'IA no disponible', appearance: 'info' }).subscribe();
      return;
    }

    try {
      const allCards = [...this.todo, ...this.doing, ...this.done];

      // Validar que haya tarjetas antes de analizar
      if (allCards.length === 0) {
        this.alerts.open('No hay tarjetas en el tablero para analizar', {
          label: 'Sin tarjetas',
          appearance: 'info'
        }).subscribe();
        return;
      }

      const cards = allCards.map(c => ({
        id: c.id,
        title: c.title,
        list: this.getListNameForCard(c) as 'todo' | 'doing' | 'done',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }));

      const bottlenecks = await this.ai.detectBottlenecks({
        cards,
        thresholdDays: 7 // 7 días por defecto
      });

      this.bottlenecks = bottlenecks;

      if (bottlenecks.length > 0) {
        const critical = bottlenecks.filter(b => b.severity === 'critical').length;
        const msg = `Se detectaron ${bottlenecks.length} cuello(s) de botella (${critical} crítico(s)).`;
        this.alerts.open(msg, { label: 'Cuellos de botella', appearance: 'warning' }).subscribe();
      } else {
        this.alerts.open('No se detectaron cuellos de botella', { label: 'Todo bien', appearance: 'success' }).subscribe();
      }
    } catch (error: any) {
      console.error('[AI] Error detectando cuellos de botella:', error);
      const errorMsg = error.error?.message || error.message || 'Error al detectar cuellos de botella';
      this.alerts.open(errorMsg, { label: 'Error', appearance: 'negative' }).subscribe();
    }
  }

  /**
   * Helper para obtener el nombre de la lista de una tarjeta individual.
   */
  private getListNameForCard(card: KanbanCard): 'todo' | 'doing' | 'done' | null {
    if (this.todo.includes(card)) return 'todo';
    if (this.doing.includes(card)) return 'doing';
    if (this.done.includes(card)) return 'done';
    return null;
  }
}


