/**
 * Servicio de WebSocket optimizado para comunicación en tiempo real.
 * Maneja reconexión automática, estados de conexión y optimización de rendimiento.
 */
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL, isDevelopment } from './env';

@Injectable({ providedIn: 'root' })
export class SocketService {
	private socket?: Socket;
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;

	/**
	 * Conecta al servidor WebSocket con configuración optimizada.
	 * Evita conexiones duplicadas y maneja reconexión automática.
	 */
    connect(url = SOCKET_URL): void {
		if (this.socket?.connected) {
			if (isDevelopment()) console.log('[Socket] Ya está conectado');
			return;
		}

		if (this.socket) {
			// Si el socket existe pero está desconectado, intentar reconectar
			if (!this.socket.connected) {
				this.socket.connect();
			}
			return;
		}

		this.socket = io(url, { 
			transports: ['polling', 'websocket'], // Polling primero (más confiable en Render free tier)
			upgrade: true, // Permitir upgrade a WebSocket después de polling
			rememberUpgrade: false, // No recordar upgrade si falla
			reconnection: true,
			reconnectionDelay: 2000, // Esperar 2 segundos antes del primer intento
			reconnectionDelayMax: 10000, // Máximo 10 segundos entre intentos
			reconnectionAttempts: this.maxReconnectAttempts,
			timeout: 30000, // Timeout aumentado a 30 segundos (Render free tier puede ser lento)
			forceNew: false, // Reutilizar conexión si existe
			withCredentials: true, // Importante para CORS en producción
			autoConnect: true,
		});

		// Event listeners para manejo de conexión
		this.socket.on('connect', () => {
			this.reconnectAttempts = 0;
			if (isDevelopment()) console.log('[Socket] Conectado exitosamente');
		});

		this.socket.on('disconnect', (reason: string) => {
			if (isDevelopment()) console.log('[Socket] Desconectado:', reason);
			if (reason === 'io server disconnect') {
				// El servidor desconectó el socket, intentar reconectar manualmente
				this.socket?.connect();
			}
		});

		this.socket.on('reconnect', (attemptNumber: number) => {
			this.reconnectAttempts = attemptNumber;
			if (isDevelopment()) console.log(`[Socket] Reconectado después de ${attemptNumber} intentos`);
		});

		this.socket.on('reconnect_attempt', (attemptNumber: number) => {
			if (isDevelopment()) console.log(`[Socket] Intentando reconectar... (${attemptNumber}/${this.maxReconnectAttempts})`);
		});

		this.socket.on('reconnect_failed', () => {
			console.error('[Socket] Falló la reconexión después de todos los intentos');
		});

		this.socket.on('connect_error', (error: Error) => {
			console.error('[Socket] Error de conexión:', error);
		});
	}

	/**
	 * Emite un evento al servidor.
	 */
	emit(event: string, payload: unknown): void {
		if (!this.socket?.connected) {
			if (isDevelopment()) console.warn(`[Socket] No conectado. No se puede emitir: ${event}`);
			return;
		}
		this.socket.emit(event, payload);
	}

	/**
	 * Suscribe a un evento del servidor.
	 */
	on<T = unknown>(event: string, handler: (data: T) => void): void {
		if (!this.socket) {
			if (isDevelopment()) console.warn(`[Socket] Socket no inicializado. No se puede escuchar: ${event}`);
			return;
		}
		this.socket.on(event, handler);
	}

	/**
	 * Cancela la suscripción a un evento.
	 */
    off(event: string, handler?: (...args: unknown[]) => void): void {
        if (!this.socket) return;
		if (handler) {
			this.socket.off(event, handler);
		} else {
			this.socket.removeAllListeners(event);
    }
	}

	/**
	 * Desconecta del servidor WebSocket y limpia recursos.
	 */
    disconnect(): void {
        if (!this.socket) return;
        try {
            this.socket.disconnect();
			if (isDevelopment()) console.log('[Socket] Desconectado manualmente');
        } finally {
            this.socket = undefined;
			this.reconnectAttempts = 0;
		}
	}

	/**
	 * Verifica si el socket está conectado.
	 */
	isConnected(): boolean {
		return this.socket?.connected ?? false;
    }
}
