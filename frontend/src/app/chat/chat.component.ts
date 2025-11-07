import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
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
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-lg font-semibold flex items-center gap-2">
        <span>Chat del tablero</span>
        @if (presence.length > 0) {
          <span tuiBadge>{{ presence.length }}</span>
        }
      </h1>
      @if (messages.length > 5) {
        <button
          tuiButton
          type="button"
          appearance="flat"
          size="s"
          iconStart="tuiIconHistory"
          (click)="summarizeChat()"
          [disabled]="summarizing"
          title="Resumir conversación con IA"
        >
          {{ summarizing ? 'Resumiendo...' : 'Resumir' }}
        </button>
      }
    </div>
    @if (presence.length > 0) {
      <div class="flex items-center gap-1">
        @for (u of presence.slice(0,5); track u) {
          <tui-avatar size="s" [round]="true">{{ initials(u) }}</tui-avatar>
        }
        @if (presence.length > 5) {
          <tui-avatar size="s" [round]="true">{{ '+' + (presence.length - 5) }}</tui-avatar>
        }
      </div>
    }
    <div class="text-xs text-gray-700 font-medium">
      Conectados: {{ presence.length }}
      @if (presence.length > 0) {
        <span>— {{ presence.slice(0,5).join(', ') }}@if (presence.length > 5) {<span> y {{ presence.length - 5 }} más</span>}</span>
      }
    </div>
    @if (typingAuthors.size > 0) {
      <div class="text-xs text-gray-700 font-medium h-4">
        <span>{{ getTypingAuthors() }} {{ typingAuthors.size > 1 ? 'están' : 'está' }} escribiendo…</span>
      </div>
    }
    <div class="card bg-white shadow p-3 min-h-48 max-h-80 overflow-y-auto space-y-2 border border-gray-200">
      @for (m of messages; track m.ts) {
        <div class="text-sm">
          <span class="font-semibold text-gray-900">{{ m.author }}</span>
          <span class="text-gray-600">· {{ m.ts | date:'shortTime' }}</span>
          <div class="text-gray-900 mt-1">{{ m.text }}</div>
        </div>
      }
      @if (messages.length === 0) {
        <div class="text-xs text-gray-600">Aún no hay mensajes.</div>
      }
      @if (chatSummary) {
        <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex items-center gap-2">
              <tui-icon icon="tuiIconHistory" class="text-blue-600 dark:text-blue-400"></tui-icon>
              <span class="text-sm font-semibold text-blue-900 dark:text-blue-100">Resumen de la conversación</span>
            </div>
            <button
              tuiButton
              type="button"
              appearance="flat"
              size="xs"
              iconStart="tuiIconX"
              (click)="chatSummary = ''"
              class="!p-1 !min-h-0 !h-5 !w-5"
              title="Cerrar resumen"
            ></button>
          </div>
          <p class="text-sm text-blue-800 dark:text-blue-200">{{ chatSummary }}</p>
        </div>
      }
    </div>
    <form (ngSubmit)="send()" class="flex gap-2">
      <tui-textfield class="flex-1">
        <input
          tuiTextfield
          type="text"
          placeholder="Escribe un mensaje..."
          [(ngModel)]="draft"
          name="draft"
          (input)="onDraftInput()"
        />
      </tui-textfield>
      <button
        tuiButton
        type="submit"
        appearance="primary"
        size="m"
        [disabled]="!draft.trim()"
      >
        Enviar
      </button>
    </form>
  </div>
  `,
  imports: [CommonModule, FormsModule, TuiAvatar, TuiBadge, TuiButton, TuiTextfield, TuiIcon]
})
export class ChatComponent implements OnInit, OnDestroy {
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


