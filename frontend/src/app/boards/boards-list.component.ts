/**
 * Componente para listar, crear y gestionar tableros Kanban del usuario.
 * Permite crear nuevos tableros, compartirlos con otros usuarios, renombrarlos y eliminarlos.
 */
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TuiButton, TuiTextfield, TuiIcon, TuiDialogService, TuiAlertService } from '@taiga-ui/core';
import { TuiAvatar } from '@taiga-ui/kit';
import { AuthService } from '../core/auth.service';
import { API_BASE } from '../core/env';

/**
 * Interfaz que representa un tablero Kanban con su información básica.
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
  selector: 'app-boards-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TuiButton,
    TuiTextfield,
    TuiIcon,
    TuiAvatar,
  ],
  template: `
  <div class="space-y-6 animate-in">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <tui-icon icon="tuiIconGridLarge" class="text-blue-600"></tui-icon>
          <span>Mis Tableros</span>
        </h1>
        <p class="text-sm text-gray-700 mt-1">Gestiona tus tableros Kanban</p>
      </div>
        <button
        tuiButton
        type="button"
        appearance="primary"
        size="m"
        iconStart="tuiIconPlus"
        (click)="openCreateDialog()"
        aria-label="Crear nuevo tablero (Ctrl+N)"
        title="Crear nuevo tablero (Ctrl+N o Cmd+N)"
      >
        Nuevo Tablero
      </button>
    </div>

    <!-- Búsqueda y Filtros -->
    @if (!loading && boards.length > 0) {
      <div class="flex flex-col sm:flex-row gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <!-- Búsqueda -->
        <div class="flex-1">
          <tui-textfield class="w-full">
            <input
              tuiTextfield
              type="text"
              [(ngModel)]="searchQuery"
              (ngModelChange)="applyFilters()"
              placeholder="Buscar tableros..."
              class="w-full"
            />
          </tui-textfield>
        </div>
        
        <!-- Filtros -->
        <div class="flex gap-2 flex-wrap">
          <select 
            [(ngModel)]="filterBy"
            (ngModelChange)="applyFilters()"
            class="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos</option>
            <option value="owned">Mis tableros</option>
            <option value="shared">Compartidos</option>
          </select>
          
          <select 
            [(ngModel)]="sortBy"
            (ngModelChange)="applyFilters()"
            class="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="updated">Recientes</option>
            <option value="name">Nombre (A-Z)</option>
            <option value="tasks">Más tareas</option>
          </select>
          
          @if (searchQuery || filterBy !== 'all' || sortBy !== 'updated') {
            <button
              tuiButton
              type="button"
              appearance="flat"
              size="s"
              (click)="clearFilters()"
              class="text-gray-700"
            >
              Limpiar
            </button>
          }
        </div>
      </div>
    }

    <!-- Loading -->
    @if (loading) {
      <div class="flex items-center justify-center py-12">
        <div class="text-center space-y-3">
          <div class="inline-block w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-gray-700">Cargando tableros...</p>
        </div>
      </div>
    }

    <!-- Error -->
    @if (error && !loading) {
      <div class="alert alert-error shadow-lg">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
        <span>{{ error }}</span>
        <button
          tuiButton
          type="button"
          appearance="flat"
          size="xs"
          (click)="loadBoards()"
        >
          Reintentar
        </button>
      </div>
    }

    <!-- Empty State (sin resultados de búsqueda) -->
    @if (!loading && !error && boards.length > 0 && filteredBoards.length === 0) {
      <div class="text-center py-12">
        <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 mx-auto flex items-center justify-center mb-4">
          <tui-icon icon="tuiIconGridLarge" class="text-4xl text-gray-400"></tui-icon>
        </div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">No se encontraron tableros</h2>
        <p class="text-gray-700 mb-6">Intenta ajustar tus filtros de búsqueda</p>
        <button
          tuiButton
          type="button"
          appearance="flat"
          size="m"
          (click)="clearFilters()"
        >
          Limpiar filtros
        </button>
      </div>
    }

    <!-- Empty State (sin tableros) -->
    @if (!loading && !error && boards.length === 0) {
      <div class="text-center py-12">
        <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 mx-auto flex items-center justify-center mb-4">
          <tui-icon icon="tuiIconGridLarge" class="text-4xl text-blue-600"></tui-icon>
        </div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">No tienes tableros aún</h2>
        <p class="text-gray-700 mb-6">Crea tu primer tablero para empezar a organizar tus tareas</p>
        <button
          tuiButton
          type="button"
          appearance="primary"
          size="m"
          iconStart="tuiIconPlus"
          (click)="openCreateDialog()"
        >
          Crear mi primer tablero
        </button>
      </div>
    }

    <!-- Boards Grid -->
    @if (!loading && filteredBoards.length > 0) {
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        @for (board of filteredBoards; track board.boardId) {
          <div 
            class="card card-hover bg-white shadow-md hover:shadow-xl transition-all duration-300 border border-gray-300 hover:border-blue-500 group rounded-lg overflow-hidden focus-visible-ring"
            role="article"
            [attr.aria-label]="'Tablero: ' + (board.name || 'Sin nombre')"
            tabindex="0"
            (keydown.enter)="router.navigate(['/app/boards', board.boardId])"
            (keydown.space)="router.navigate(['/app/boards', board.boardId])"
          >
            <div class="card-body p-5 bg-gradient-to-br from-white to-gray-50">
              <div class="flex items-start justify-between gap-2 mb-3">
                <div class="flex-1 min-w-0">
                  <h3 class="font-bold text-gray-900 truncate mb-1 text-lg">
                    {{ board.name || 'Sin nombre' }}
                  </h3>
                  <p class="text-xs text-gray-700 font-medium">
                    Actualizado {{ formatDate(board.updatedAt) }}
                  </p>
                </div>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    tuiButton
                    type="button"
                    appearance="flat"
                    size="xs"
                    iconStart="tuiIconEdit"
                    (click)="renameBoard(board)"
                    title="Renombrar"
                    class="!p-1 !min-h-0 !h-6 !w-6"
                  ></button>
                  <button
                    tuiButton
                    type="button"
                    appearance="flat"
                    size="xs"
                    iconStart="tuiIconSettings"
                    (click)="shareBoard(board)"
                    title="Compartir"
                    class="!p-1 !min-h-0 !h-6 !w-6"
                  ></button>
                  <button
                    tuiButton
                    type="button"
                    appearance="flat"
                    size="xs"
                    iconStart="tuiIconTrash"
                    (click)="deleteBoard(board)"
                    title="Eliminar"
                    class="!p-1 !min-h-0 !h-6 !w-6 text-red-600"
                  ></button>
                </div>
              </div>
              
              @if (board.todoCount !== undefined || board.doingCount !== undefined || board.doneCount !== undefined) {
                <div class="flex items-center gap-4 text-sm font-semibold mb-3 p-2 bg-gray-100 rounded-lg">
                  <span class="flex items-center gap-1.5 text-blue-700">
                    <span class="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></span>
                    <span class="text-gray-900">{{ board.todoCount || 0 }}</span>
                  </span>
                  <span class="flex items-center gap-1.5 text-yellow-700">
                    <span class="w-3 h-3 rounded-full bg-yellow-500 shadow-sm"></span>
                    <span class="text-gray-900">{{ board.doingCount || 0 }}</span>
                  </span>
                  <span class="flex items-center gap-1.5 text-green-700">
                    <span class="w-3 h-3 rounded-full bg-green-500 shadow-sm"></span>
                    <span class="text-gray-900">{{ board.doneCount || 0 }}</span>
                  </span>
                </div>
              }

              @if (board.members && board.members.length > 0) {
                <div class="flex items-center gap-2 text-sm text-gray-800 mb-3 font-medium">
                  <tui-icon icon="tuiIconMessage" class="text-base text-blue-600"></tui-icon>
                  <span>{{ board.members.length }} miembro{{ board.members.length > 1 ? 's' : '' }}</span>
                </div>
              }

                     <div class="flex gap-2 mt-2">
                       <a
                         [routerLink]="['/app/boards', board.boardId]"
                         tuiButton
                         type="button"
                         appearance="primary"
                         size="s"
                         class="flex-1"
                       >
                         Abrir
                       </a>
                       <a
                         [routerLink]="['/app/boards', board.boardId, 'chat']"
                         tuiButton
                         type="button"
                         appearance="flat"
                         size="s"
                         iconStart="tuiIconMessage"
                         title="Chat"
                       ></a>
                       <a
                         [routerLink]="['/app/settings/integrations']"
                         [queryParams]="{ boardId: board.boardId }"
                         tuiButton
                         type="button"
                         appearance="flat"
                         size="s"
                         iconStart="tuiIconSettings"
                         title="Integraciones Git"
                         class="text-blue-600"
                       ></a>
                     </div>
            </div>
          </div>
        }
      </div>
    }

    <!-- Create Board Dialog -->
    @if (createDialogOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-in" (click)="createDialogOpen = false">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 animate-scale-in" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2 mb-4">
            <tui-icon icon="tuiIconPlus" class="text-blue-600"></tui-icon>
            <h3 class="text-xl font-bold text-gray-900">Nuevo Tablero</h3>
          </div>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <tui-textfield>
                <label tuiLabel>Nombre del tablero</label>
                <input
                  tuiTextfield
                  [(ngModel)]="newBoardName"
                  placeholder="Mi proyecto..."
                  class="w-full bg-white text-gray-900"
                  (keydown.enter)="createBoard()"
                  autofocus
                />
              </tui-textfield>
            </div>
            <div class="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-200">
              <button
                tuiButton
                type="button"
                appearance="flat"
                size="m"
                (click)="createDialogOpen = false; newBoardName = ''"
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
                (click)="createBoard()"
                [disabled]="!newBoardName.trim() || creating"
              >
                {{ creating ? 'Creando...' : 'Crear' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Share Board Dialog -->
    @if (shareDialogOpen && selectedBoard) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-in" (click)="shareDialogOpen = false">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 animate-scale-in" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2 mb-4">
            <tui-icon icon="tuiIconSettings" class="text-blue-600"></tui-icon>
            <h3 class="text-xl font-bold text-gray-900">Compartir Tablero</h3>
          </div>
          <div class="space-y-4">
            <div>
              <p class="text-sm font-medium text-gray-700 mb-2">Tablero: {{ selectedBoard.name || 'Sin nombre' }}</p>
            </div>
            <div class="flex flex-col gap-2">
              <tui-textfield>
                <label tuiLabel>Email del usuario</label>
                <input
                  tuiTextfield
                  type="email"
                  [(ngModel)]="shareEmail"
                  placeholder="usuario@example.com"
                  class="w-full bg-white text-gray-900"
                  (keydown.enter)="addMember()"
                />
              </tui-textfield>
            </div>
            @if (selectedBoard.members && selectedBoard.members.length > 0) {
              <div>
                <p class="text-sm font-medium text-gray-700 mb-2">Miembros compartidos:</p>
                <div class="space-y-2">
                  @for (member of selectedBoard.members; track member) {
                    <div class="flex items-center justify-between p-2 bg-gray-100 rounded border border-gray-200">
                      <span class="text-sm text-gray-900 font-medium">{{ member }}</span>
                      <button
                        tuiButton
                        type="button"
                        appearance="flat"
                        size="xs"
                        iconStart="tuiIconTrash"
                        (click)="removeMember(member)"
                        class="!p-1 !min-h-0 !h-6 !w-6 text-red-600"
                      ></button>
                    </div>
                  }
                </div>
              </div>
            }
            <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
              <button
                tuiButton
                type="button"
                appearance="flat"
                size="m"
                (click)="shareDialogOpen = false; shareEmail = ''"
                class="text-gray-700"
              >
                Cerrar
              </button>
              <button
                tuiButton
                type="button"
                appearance="primary"
                size="m"
                iconStart="tuiIconPlus"
                (click)="addMember()"
                [disabled]="!shareEmail.trim() || sharing"
              >
                {{ sharing ? 'Compartiendo...' : 'Agregar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Rename Board Dialog -->
    @if (renameDialogOpen && renameBoardData) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm animate-in" (click)="renameDialogOpen = false">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 animate-scale-in" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2 mb-4">
            <tui-icon icon="tuiIconEdit" class="text-blue-600"></tui-icon>
            <h3 class="text-xl font-bold text-gray-900">Renombrar Tablero</h3>
          </div>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <tui-textfield>
                <label tuiLabel>Nombre del tablero</label>
                <input
                  tuiTextfield
                  [(ngModel)]="renameName"
                  placeholder="Nombre del tablero..."
                  class="w-full bg-white text-gray-900"
                  (keydown.enter)="saveRename()"
                  autofocus
                />
              </tui-textfield>
            </div>
            <div class="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-200">
              <button
                tuiButton
                type="button"
                appearance="flat"
                size="m"
                (click)="renameDialogOpen = false; renameName = ''"
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
                (click)="saveRename()"
                [disabled]="!renameName.trim()"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  </div>
  `
})
export class BoardsListComponent implements OnInit, OnDestroy {
  protected readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(TuiAlertService);
  
  // Estado del componente
  boards: Board[] = [];
  filteredBoards: Board[] = [];
  loading = false;
  error: string | null = null;
  
  // Estado de búsqueda y filtros
  searchQuery = '';
  sortBy: 'name' | 'updated' | 'tasks' = 'updated';
  filterBy: 'all' | 'owned' | 'shared' = 'all';
  
  // Estado del diálogo de creación
  createDialogOpen = false;
  newBoardName = '';
  creating = false;
  
  // Estado del diálogo de compartir
  shareDialogOpen = false;
  selectedBoard: Board | null = null;
  shareEmail = '';
  sharing = false;

  // Estado del diálogo de renombrar
  renameDialogOpen = false;
  renameBoardData: Board | null = null;
  renameName = '';

  /**
   * Inicializa el componente cargando los tableros del usuario.
   */
  ngOnInit(): void {
    this.loadBoards();
    
    // Atajos de teclado globales
    document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
  }

  /**
   * Helper para obtener los headers de autenticación con el email del usuario.
   */
  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {};
    const userEmail = this.auth.getEmail();
    if (userEmail) {
      headers['X-User-Email'] = userEmail;
    }
    return headers;
  }

  /**
   * Maneja atajos de teclado globales para accesibilidad.
   */
  private handleKeyboardShortcuts(event: KeyboardEvent): void {
    // Evitar cuando el usuario está escribiendo en un input
    if ((event.target as HTMLElement)?.tagName === 'INPUT' || 
        (event.target as HTMLElement)?.tagName === 'TEXTAREA') {
      return;
    }

    // 'N' para nuevo tablero
    if (event.key === 'n' || event.key === 'N') {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.openCreateDialog();
    }

    // '?' para mostrar ayuda (TODO: implementar)
    if (event.key === '?') {
      event.preventDefault();
      // Mostrar diálogo de ayuda
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
  }

  /**
   * Carga los tableros del usuario actual desde el backend.
   * Filtra los tableros donde el usuario es propietario o miembro.
   */
  async loadBoards(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const userEmail = this.auth.getEmail();
      if (!userEmail) {
        this.error = 'No estás autenticado';
        return;
      }
      const res = await fetch(`${API_BASE}/api/boards?owner=${encodeURIComponent(userEmail)}`, {
        credentials: 'include',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) {
        throw new Error('Error al cargar tableros');
      }
      const data = await res.json() as Board[];
      this.boards = data;
      this.applyFilters();
    } catch (err: any) {
      this.error = err.message || 'Error al cargar los tableros';
      console.error('Error loading boards:', err);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Aplica los filtros y ordenamiento a la lista de tableros.
   */
  applyFilters(): void {
    let filtered = [...this.boards];

    // Filtro por búsqueda
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(board => 
        (board.name || '').toLowerCase().includes(query) ||
        (board.owner || '').toLowerCase().includes(query) ||
        (board.members || []).some(m => m.toLowerCase().includes(query))
      );
    }

    // Filtro por tipo
    const userEmail = this.auth.getEmail();
    if (this.filterBy === 'owned' && userEmail) {
      filtered = filtered.filter(board => board.owner === userEmail);
    } else if (this.filterBy === 'shared' && userEmail) {
      filtered = filtered.filter(board => 
        board.owner !== userEmail && 
        (board.members || []).includes(userEmail)
      );
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'tasks':
          const aTotal = (a.todoCount || 0) + (a.doingCount || 0) + (a.doneCount || 0);
          const bTotal = (b.todoCount || 0) + (b.doingCount || 0) + (b.doneCount || 0);
          return bTotal - aTotal;
        case 'updated':
        default:
          return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
    });

    this.filteredBoards = filtered;
  }

  /**
   * Limpia todos los filtros y la búsqueda.
   */
  clearFilters(): void {
    this.searchQuery = '';
    this.sortBy = 'updated';
    this.filterBy = 'all';
    this.applyFilters();
  }

  /**
   * Abre el diálogo modal para crear un nuevo tablero.
   */
  openCreateDialog(): void {
    this.createDialogOpen = true;
    this.newBoardName = '';
  }

  /**
   * Crea un nuevo tablero con el nombre especificado.
   * Navega automáticamente al tablero recién creado.
   */
  async createBoard(): Promise<void> {
    if (!this.newBoardName.trim()) return;
    this.creating = true;
    try {
      const userEmail = this.auth.getEmail();
      if (!userEmail) {
        this.alerts.open('No estás autenticado', { label: 'Error', appearance: 'negative' }).subscribe();
        return;
      }
      const res = await fetch(`${API_BASE}/api/boards`, {
        method: 'POST',
        headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: this.newBoardName.trim(),
          owner: userEmail
        })
      });
      if (!res.ok) {
        throw new Error('Error al crear el tablero');
      }
      const board = await res.json() as Board;
      this.alerts.open('Tablero creado exitosamente', { label: 'Éxito', appearance: 'success' }).subscribe();
      this.createDialogOpen = false;
      this.newBoardName = '';
      await this.loadBoards();
      // Navegar al nuevo tablero
      this.router.navigate(['/app/boards', board.boardId]);
    } catch (err: any) {
      this.alerts.open(err.message || 'Error al crear el tablero', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.creating = false;
    }
  }

  /**
   * Abre el diálogo para renombrar un tablero.
   */
  renameBoard(board: Board): void {
    this.renameBoardData = board;
    this.renameName = board.name || '';
    this.renameDialogOpen = true;
  }

  /**
   * Guarda el nuevo nombre del tablero.
   */
  async saveRename(): Promise<void> {
    if (!this.renameBoardData || !this.renameName.trim()) return;
    const trimmed = this.renameName.trim();
    if (trimmed === this.renameBoardData.name) {
      this.renameDialogOpen = false;
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.renameBoardData.boardId)}`, {
        method: 'PUT',
        headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Error al renombrar');
      }
      this.alerts.open('Tablero renombrado', { label: 'Éxito', appearance: 'success' }).subscribe();
      this.renameDialogOpen = false;
      await this.loadBoards();
    } catch (err: any) {
      this.alerts.open(err.message || 'Error al renombrar el tablero', { label: 'Error', appearance: 'negative' }).subscribe();
    }
  }

  /**
   * Abre el diálogo para compartir un tablero con otros usuarios.
   */
  shareBoard(board: Board): void {
    this.selectedBoard = board;
    this.shareEmail = '';
    this.shareDialogOpen = true;
  }

  /**
   * Agrega un miembro al tablero compartido mediante su email.
   */
  async addMember(): Promise<void> {
    if (!this.shareEmail.trim() || !this.selectedBoard) return;
    this.sharing = true;
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.selectedBoard.boardId)}/share`, {
        method: 'POST',
        headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: this.shareEmail.trim() })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Error al compartir');
      }
      this.alerts.open('Tablero compartido exitosamente', { label: 'Éxito', appearance: 'success' }).subscribe();
      this.shareEmail = '';
      await this.loadBoards();
      // Actualizar el tablero seleccionado con la información más reciente
      const updated = this.boards.find(b => b.boardId === this.selectedBoard!.boardId);
      if (updated) this.selectedBoard = updated;
    } catch (err: any) {
      this.alerts.open(err.message || 'Error al compartir el tablero', { label: 'Error', appearance: 'negative' }).subscribe();
    } finally {
      this.sharing = false;
    }
  }

  /**
   * Elimina un miembro del tablero compartido.
   */
  async removeMember(email: string): Promise<void> {
    if (!this.selectedBoard) return;
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.selectedBoard.boardId)}/share`, {
        method: 'DELETE',
        headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      });
      if (!res.ok) throw new Error('Error al eliminar miembro');
      this.alerts.open('Miembro eliminado', { label: 'Éxito', appearance: 'success' }).subscribe();
      await this.loadBoards();
      const updated = this.boards.find(b => b.boardId === this.selectedBoard!.boardId);
      if (updated) this.selectedBoard = updated;
    } catch (err: any) {
      this.alerts.open('Error al eliminar miembro', { label: 'Error', appearance: 'negative' }).subscribe();
    }
  }

  /**
   * Elimina un tablero después de confirmar la acción.
   */
  async deleteBoard(board: Board): Promise<void> {
    if (!confirm(`¿Estás seguro de eliminar el tablero "${board.name || 'Sin nombre'}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(board.boardId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) throw new Error('Error al eliminar');
      this.alerts.open('Tablero eliminado', { label: 'Éxito', appearance: 'success' }).subscribe();
      await this.loadBoards();
    } catch (err: any) {
      this.alerts.open('Error al eliminar el tablero', { label: 'Error', appearance: 'negative' }).subscribe();
    }
  }

  /**
   * Formatea un timestamp como una cadena legible relativa (hoy, ayer, hace X días, etc.).
   */
  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 7) return `hace ${days} días`;
    if (days < 30) return `hace ${Math.floor(days / 7)} semanas`;
    if (days < 365) return `hace ${Math.floor(days / 30)} meses`;
    return `hace ${Math.floor(days / 365)} años`;
  }
}
