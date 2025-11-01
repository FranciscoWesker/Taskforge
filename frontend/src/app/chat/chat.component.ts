import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TuiAvatar } from '@taiga-ui/kit';
import { TuiBadge } from '@taiga-ui/kit';
import { TuiButton } from '@taiga-ui/core';
import { TuiTextfield } from '@taiga-ui/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../core/socket.service';
import { AuthService } from '../core/auth.service';
import { API_BASE } from '../core/env';

@Component({
  selector: 'app-chat',
  standalone: true,
  template: `
  <div class="space-y-3">
    <h1 class="text-lg font-semibold flex items-center gap-2">
      <span>Chat del tablero</span>
      @if (presence.length > 0) {
        <span tuiBadge>{{ presence.length }}</span>
      }
    </h1>
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
  imports: [CommonModule, FormsModule, TuiAvatar, TuiBadge, TuiButton, TuiTextfield]
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly socket = inject(SocketService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private boardId: string = '';
  messages: { author: string; text: string; ts: number }[] = [];
  draft = '';
  
  get author(): string {
    return this.auth.getDisplayName() || this.auth.getEmail() || 'Anónimo';
  }
  private messageHandler = (msg: { boardId: string; author: string; text: string; ts: number }) => {
    if (msg.boardId !== this.boardId) return;
    this.messages = [...this.messages, { author: msg.author, text: msg.text, ts: msg.ts }];
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
        this.socket.emit('board:join', { boardId: this.boardId, user: this.author });
        // cargar historial
        this.loadHistory();
      } else {
        this.socket.emit('board:join', { boardId: this.boardId, user: this.author });
        try { localStorage.setItem('tf-last-board', this.boardId); } catch {}
      }
    });

    // Escuchar mensajes del chat del tablero
    this.socket.on('board:chat:message', this.messageHandler);
    this.socket.on('board:chat:typing', this.typingHandler);
    this.socket.on('board:presence', this.presenceHandler);
  }

  ngOnDestroy(): void {
    // Abandonar sala de tablero al salir del componente
    this.socket.emit('board:leave', { boardId: this.boardId });
    this.socket.off('board:chat:message', this.messageHandler as unknown as (...args: unknown[]) => void);
    this.socket.off('board:chat:typing', this.typingHandler as unknown as (...args: unknown[]) => void);
    this.socket.off('board:presence', this.presenceHandler as unknown as (...args: unknown[]) => void);
  }

  @HostListener('window:beforeunload')
  handleBeforeUnload(): void {
    // asegurar abandono de la sala si se cierra o recarga la pestaña
    this.socket.emit('board:leave', { boardId: this.boardId });
  }

  send(): void {
    const text = this.draft.trim();
    if (!text) return;
    const payload = { boardId: this.boardId, author: this.author, text, ts: Date.now() };
    this.socket.emit('board:chat:message', payload);
    this.draft = '';
    // detener typing si estaba activo
    this.emitTyping(false);
  }

  private async loadHistory(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(this.boardId)}/messages?limit=50`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as Array<{ author: string; text: string; ts: number }>;
      this.messages = data;
    } catch {}
  }

  onDraftInput(): void {
    this.emitTyping(true);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.emitTyping(false), 1200);
  }

  private emitTyping(typing: boolean): void {
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
}


