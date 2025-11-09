import { Component, HostListener, OnDestroy, OnInit, inject, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TuiAvatar } from '@taiga-ui/kit';
import { TuiBadge } from '@taiga-ui/kit';
import { TuiButton, TuiAlertService } from '@taiga-ui/core';
import { TuiTextfield } from '@taiga-ui/core';
import { TuiIcon } from '@taiga-ui/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../core/socket.service';
import { AuthService } from '../core/auth.service';
import { AIService } from '../core/ai.service';
import { API_BASE, isDevelopment } from '../core/env';

@Component({
  selector: 'app-chat',
  standalone: true,
  template: `
  <div class="flex flex-col h-full max-h-[calc(100vh-12rem)] space-y-4">
    <!-- Header mejorado -->
    <div class="flex items-center justify-between gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <tui-icon icon="tuiIconMessage" class="text-blue-600 dark:text-blue-400 text-xl"></tui-icon>
          <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Chat del tablero</h1>
        </div>
        @if (presence.length > 0) {
          <div class="flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-full border border-blue-200 dark:border-blue-700">
            <div class="flex items-center -space-x-2">
              @for (u of presence.slice(0,3); track u) {
                <tui-avatar size="xs" [round]="true" class="border-2 border-white dark:border-gray-800">{{ initials(u) }}</tui-avatar>
              }
            </div>
            <span tuiBadge class="ml-1 bg-blue-600 dark:bg-blue-500 text-white text-xs font-semibold">{{ presence.length }}</span>
          </div>
        }
      </div>
      @if (messages.length > 5) {
        <button
          tuiButton
          type="button"
          appearance="flat"
          size="s"
          iconStart="tuiIconHistory"
          (click)="summarizeChat()"
          [disabled]="summarizing"
          class="text-blue-600 dark:text-blue-400"
          title="Resumir conversación con IA"
        >
          {{ summarizing ? 'Resumiendo...' : 'Resumir' }}
        </button>
      }
    </div>

    <!-- Indicador de presencia y escritura -->
    @if (presence.length > 0 || typingAuthors.size > 0) {
      <div class="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        @if (presence.length > 0) {
          <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span class="font-medium">{{ presence.length }} {{ presence.length === 1 ? 'usuario conectado' : 'usuarios conectados' }}</span>
          </div>
        }
        @if (typingAuthors.size > 0) {
          <div class="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 animate-pulse">
            <div class="flex gap-1">
              <div class="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
              <div class="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
              <div class="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
            </div>
            <span class="font-medium italic">{{ getTypingAuthors() }} {{ typingAuthors.size > 1 ? 'están' : 'está' }} escribiendo…</span>
          </div>
        }
      </div>
    }

    <!-- Área de mensajes mejorada -->
    <div 
      #messagesContainer
      class="flex-1 overflow-y-auto space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 scroll-smooth"
      style="scrollbar-width: thin; scrollbar-color: rgb(156 163 175) transparent;"
    >
      @if (messages.length === 0) {
        <div class="flex flex-col items-center justify-center h-full text-center py-12">
          <div class="h-16 w-16 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center mb-4">
            <tui-icon icon="tuiIconMessage" class="text-3xl text-blue-600 dark:text-blue-400"></tui-icon>
          </div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">No hay mensajes aún</p>
          <p class="text-xs text-gray-500 dark:text-gray-500">Sé el primero en iniciar la conversación</p>
        </div>
      }
      
      @for (m of messages; track m.ts) {
        <div class="flex items-start gap-3 animate-fade-in" [class.flex-row-reverse]="isOwnMessage(m.author)">
          <!-- Avatar -->
          <div class="flex-shrink-0">
            <tui-avatar size="m" [round]="true" [class.bg-blue-600]="isOwnMessage(m.author)" [class.bg-gray-400]="!isOwnMessage(m.author)">
              {{ initials(m.author) }}
            </tui-avatar>
          </div>
          
          <!-- Mensaje -->
          <div class="flex-1 min-w-0" [class.items-end]="isOwnMessage(m.author)" [class.flex]="isOwnMessage(m.author)" [class.flex-col]="isOwnMessage(m.author)">
            <div 
              class="rounded-2xl px-4 py-2.5 max-w-[75%] shadow-sm transition-all hover:shadow-md"
              [class.bg-blue-600]="isOwnMessage(m.author)"
              [class.text-white]="isOwnMessage(m.author)"
              [class.bg-white]="!isOwnMessage(m.author)"
              [class.dark:bg-gray-800]="!isOwnMessage(m.author)"
              [class.text-gray-900]="!isOwnMessage(m.author)"
              [class.dark:text-gray-100]="!isOwnMessage(m.author)"
              [class.border]="!isOwnMessage(m.author)"
              [class.border-gray-200]="!isOwnMessage(m.author)"
              [class.dark:border-gray-700]="!isOwnMessage(m.author)"
            >
              @if (!isOwnMessage(m.author)) {
                <div class="text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">{{ m.author }}</div>
              }
              <div class="text-sm leading-relaxed whitespace-pre-wrap break-words">{{ m.text }}</div>
              <div 
                class="text-xs mt-1.5 flex items-center gap-1"
                [class.text-blue-100]="isOwnMessage(m.author)"
                [class.text-gray-500]="!isOwnMessage(m.author)"
                [class.dark:text-gray-400]="!isOwnMessage(m.author)"
              >
                <span>{{ formatMessageTime(m.ts) }}</span>
                @if (isOwnMessage(m.author)) {
                  <tui-icon icon="tuiIconCheck" class="text-xs opacity-70"></tui-icon>
                }
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Resumen de IA mejorado -->
      @if (chatSummary) {
        <div class="mt-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl border-2 border-blue-200 dark:border-blue-700 shadow-lg animate-scale-in">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-center gap-2">
              <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                <tui-icon icon="tuiIconHistory" class="text-white text-sm"></tui-icon>
              </div>
              <div>
                <span class="text-sm font-bold text-blue-900 dark:text-blue-100">Resumen de IA</span>
                <p class="text-xs text-blue-700 dark:text-blue-300">Generado por Google Gemini</p>
              </div>
            </div>
            <button
              tuiButton
              type="button"
              appearance="flat"
              size="xs"
              iconStart="tuiIconX"
              (click)="chatSummary = ''"
              class="!p-1 !min-h-0 !h-6 !w-6 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800"
              title="Cerrar resumen"
            ></button>
          </div>
          <p class="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">{{ chatSummary }}</p>
        </div>
      }
    </div>

    <!-- Input mejorado -->
    <form (ngSubmit)="send()" class="flex items-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
      <div class="flex-1 relative">
        <tui-textfield class="w-full">
          <input
            tuiTextfield
            type="text"
            placeholder="Escribe un mensaje..."
            [(ngModel)]="draft"
            name="draft"
            (input)="onDraftInput()"
            (keydown.enter)="handleEnterKey($event)"
            class="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 rounded-xl pr-12"
          />
        </tui-textfield>
        @if (draft.trim()) {
          <button
            type="button"
            (click)="send()"
            class="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white flex items-center justify-center transition-colors shadow-sm"
            title="Enviar (Enter)"
          >
            <tui-icon icon="tuiIconArrowRight" class="text-sm"></tui-icon>
          </button>
        }
      </div>
      @if (!draft.trim()) {
        <button
          tuiButton
          type="submit"
          appearance="primary"
          size="m"
          [disabled]="true"
          class="opacity-50 cursor-not-allowed"
        >
          <tui-icon icon="tuiIconArrowRight"></tui-icon>
        </button>
      }
    </form>
  </div>
  `,
  imports: [CommonModule, FormsModule, TuiAvatar, TuiBadge, TuiButton, TuiTextfield, TuiIcon]
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;
  private readonly socket = inject(SocketService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly ai = inject(AIService);
  private readonly alerts = inject(TuiAlertService);
  private boardId: string = '';
  messages: { author: string; text: string; ts: number }[] = [];
  draft = '';
  summarizing = false;
  chatSummary = '';
  
  get author(): string {
    return this.auth.getDisplayName() || this.auth.getEmail() || 'Anónimo';
  }
  private shouldScrollToBottom = false;
  
  private messageHandler = (msg: { boardId: string; author: string; text: string; ts: number }) => {
    if (msg.boardId !== this.boardId) return;
    // Evitar duplicados: verificar si el mensaje ya existe (mismo timestamp y autor)
    const isDuplicate = this.messages.some(m => 
      m.ts === msg.ts && m.author === msg.author && m.text === msg.text
    );
    if (!isDuplicate) {
      this.messages = [...this.messages, { author: msg.author, text: msg.text, ts: msg.ts }];
      // Ordenar por timestamp después de agregar
      this.messages.sort((a, b) => a.ts - b.ts);
      // Auto-scroll si el mensaje es nuevo o es del usuario actual
      this.shouldScrollToBottom = true;
    }
  };
  typingAuthors = new Set<string>();
  private typingHandler = (payload: { boardId: string; author: string; typing: boolean }) => {
    if (payload.boardId !== this.boardId || payload.author === this.author) return;
    if (payload.typing) this.typingAuthors.add(payload.author); else this.typingAuthors.delete(payload.author);
    // trigger change by reconstructing the set reference if needed
    this.typingAuthors = new Set(this.typingAuthors);
  };
  private typingTimeout?: any;
  presence: string[] = [];
  private presenceHandler = (list: string[]) => {
    this.presence = Array.isArray(list) ? list : [];
  };

  ngOnInit(): void {
    // Asegurar que el socket esté conectado
    this.socket.connect();
    
    // Escuchar mensajes del chat del tablero ANTES de unirse a la sala
    this.socket.on('board:chat:message', this.messageHandler);
    this.socket.on('board:chat:typing', this.typingHandler);
    this.socket.on('board:presence', this.presenceHandler);
    
    // Unirse a la sala del tablero según la URL
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (!id) {
        // Si no hay ID, redirigir a la lista de tableros
        this.router.navigate(['/app/boards']);
        return;
      }
      if (id !== this.boardId) {
        if (this.boardId) {
          this.socket.emit('board:leave', { boardId: this.boardId });
        }
        this.boardId = id;
        try { localStorage.setItem('tf-last-board', this.boardId); } catch {}
        
        // Esperar a que el socket esté conectado antes de unirse y cargar historial
        this.joinBoardAndLoadHistory();
      } else {
        // Si ya es el mismo boardId, asegurar que se haya cargado el historial
        if (this.messages.length === 0 && this.boardId) {
          this.loadHistory();
        }
        this.socket.emit('board:join', { boardId: this.boardId, user: this.author });
        try { localStorage.setItem('tf-last-board', this.boardId); } catch {}
      }
    });
  }
  
  private async joinBoardAndLoadHistory(): Promise<void> {
    // Esperar a que el socket esté conectado (con timeout)
    let attempts = 0;
    const maxAttempts = 10;
    while (!this.socket.isConnected() && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (this.socket.isConnected()) {
      this.socket.emit('board:join', { boardId: this.boardId, user: this.author });
      // Cargar historial después de unirse a la sala
      await this.loadHistory();
    } else {
      if (isDevelopment()) console.warn('[Chat] Socket no conectado, intentando unirse de todas formas...');
      this.socket.emit('board:join', { boardId: this.boardId, user: this.author });
      await this.loadHistory();
    }
  }

  ngOnDestroy(): void {
    // Abandonar sala de tablero al salir del componente
    if (this.boardId && this.socket.isConnected()) {
      this.socket.emit('board:leave', { boardId: this.boardId });
    }
    this.socket.off('board:chat:message', this.messageHandler as unknown as (...args: unknown[]) => void);
    this.socket.off('board:chat:typing', this.typingHandler as unknown as (...args: unknown[]) => void);
    this.socket.off('board:presence', this.presenceHandler as unknown as (...args: unknown[]) => void);
  }

  @HostListener('window:beforeunload')
  handleBeforeUnload(): void {
    // asegurar abandono de la sala si se cierra o recarga la pestaña
    if (this.boardId && this.socket.isConnected()) {
      this.socket.emit('board:leave', { boardId: this.boardId });
    }
  }

  send(): void {
    const text = this.draft.trim();
    if (!text) return;
    if (!this.boardId) {
      console.error('[Chat] No se puede enviar mensaje: boardId no definido');
      return;
    }
    
    // Asegurar que el socket esté conectado
    if (!this.socket.isConnected()) {
      if (isDevelopment()) console.warn('[Chat] Socket no conectado, intentando conectar...');
      this.socket.connect();
      // Esperar un poco antes de emitir
      setTimeout(() => {
        if (this.socket.isConnected()) {
          this.sendMessage(text);
        } else {
          console.error('[Chat] No se pudo conectar el socket, guardando mensaje para reenvío...');
          // Guardar en localStorage como fallback (aunque idealmente debería usar la API)
          this.sendMessage(text);
        }
      }, 500);
    } else {
      this.sendMessage(text);
    }
  }
  
  private sendMessage(text: string): void {
    const payload = { boardId: this.boardId, author: this.author, text, ts: Date.now() };
    this.socket.emit('board:chat:message', payload);
    this.draft = '';
    // detener typing si estaba activo
    this.emitTyping(false);
    // Auto-scroll después de enviar
    this.shouldScrollToBottom = true;
  }
  
  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }
  
  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }
  
  isOwnMessage(author: string): boolean {
    return author === this.author;
  }
  
  formatMessageTime(ts: number): string {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    
    // Si es más de una semana, mostrar fecha completa
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  private async loadHistory(): Promise<void> {
    if (!this.boardId) {
      if (isDevelopment()) console.warn('[Chat] No se puede cargar historial: boardId no definido');
      return;
    }
    
    // Obtener el email del usuario autenticado
    const userEmail = this.auth.getEmail();
    if (!userEmail) {
      console.error('[Chat] No se puede cargar historial: usuario no autenticado');
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/messages?limit=50`, { 
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail
        }
      });
      
      if (!res.ok) {
        if (res.status === 404) {
          if (isDevelopment()) console.warn('[Chat] Tablero no encontrado');
          this.messages = [];
          return;
        }
        if (res.status === 401 || res.status === 403) {
          console.error('[Chat] No autorizado para ver mensajes de este tablero');
          return;
        }
        console.error('[Chat] Error al cargar historial:', res.status, res.statusText);
        return;
      }
      
      const data = await res.json() as Array<{ author: string; text: string; ts: number }>;
      if (Array.isArray(data)) {
        this.messages = data.sort((a, b) => a.ts - b.ts); // Ordenar por timestamp ascendente
        if (isDevelopment()) console.log(`[Chat] Historial cargado: ${data.length} mensajes`);
        // Auto-scroll después de cargar historial
        setTimeout(() => {
          this.shouldScrollToBottom = true;
        }, 100);
      } else {
        if (isDevelopment()) console.warn('[Chat] Respuesta inválida del servidor');
        this.messages = [];
      }
    } catch (error) {
      console.error('[Chat] Error al cargar historial:', error);
      // Mantener mensajes existentes si hay un error de red
      if (this.messages.length === 0) {
        if (isDevelopment()) console.warn('[Chat] No se pudo cargar historial, intentando nuevamente...');
        // Reintentar una vez después de un segundo
        setTimeout(() => {
          if (this.boardId) {
            this.loadHistory();
          }
        }, 1000);
      }
    }
  }

  onDraftInput(): void {
    this.emitTyping(true);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.emitTyping(false), 1200);
  }
  
  handleEnterKey(event: KeyboardEvent): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private emitTyping(typing: boolean): void {
    if (!this.boardId) return;
    if (!this.socket.isConnected()) {
      // No es crítico si no se puede enviar el typing indicator
      return;
    }
    this.socket.emit('board:chat:typing', { boardId: this.boardId, author: this.author, typing });
  }

  initials(name: string): string {
    try {
      const parts = name.trim().split(/\s+/).filter(Boolean);
      const first = parts[0]?.[0] ?? '';
      const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
      return (first + last).toUpperCase() || (name[0]?.toUpperCase() ?? '?');
    } catch { return '?'; }
  }

  getTypingAuthors(): string {
    return Array.from(this.typingAuthors).slice(0, 3).join(', ');
  }

  /**
   * Genera un resumen de la conversación usando IA.
   */
  async summarizeChat(): Promise<void> {
    if (this.messages.length < 5 || this.summarizing) return;
    
    this.summarizing = true;
    this.chatSummary = '';
    
    try {
      const available = await this.ai.checkAvailability();
      if (!available) {
        this.alerts.open('Servicio de IA no disponible', { label: 'IA no disponible', appearance: 'warning' }).subscribe();
        return;
      }

      const formattedMessages = this.messages.map(msg => ({
        user: msg.author,
        text: msg.text,
        timestamp: new Date(msg.ts).toISOString()
      }));

      const summary = await this.ai.summarizeChat({
        messages: formattedMessages,
        maxLength: 300
      });
      
      this.chatSummary = summary;
    } catch (error: any) {
      console.error('Error resumiendo chat:', error);
      this.alerts.open(
        error.message || 'Error al generar resumen',
        { label: 'Error IA', appearance: 'negative' }
      ).subscribe();
    } finally {
      this.summarizing = false;
    }
  }
}


