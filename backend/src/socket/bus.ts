import type { Server } from 'socket.io';

let ioRef: Server | null = null;

export function setIo(io: Server): void {
  ioRef = io;
}

export function emitToBoard(boardId: string, event: string, payload: unknown): void {
  ioRef?.to(`board:${boardId}`).emit(event, payload);
}

export function emitDeploymentLog(boardId: string, log: { level: 'info' | 'warn' | 'error' | 'success'; message: string; timestamp: number; context?: string }): void {
  ioRef?.to(`deployment:${boardId}`).emit('deployment:log', log);
}

export function emitDeploymentStatus(boardId: string, status: { state: 'pending' | 'running' | 'success' | 'failure' | 'cancelled'; pipeline?: string; version?: string; timestamp: number }): void {
  ioRef?.to(`deployment:${boardId}`).emit('deployment:status', status);
}


