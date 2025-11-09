import { Server } from 'socket.io';
import { MessageModel } from '../db/message.model';
import { BoardStateModel } from '../db/board-state.model';
import { isMongoConnected } from '../db/mongo';
import type { Server as HttpServer } from 'http';
import { getAllowedOrigins, isOriginAllowed, isDevelopment } from '../utils/cors-config';

export function createSocketServer(httpServer: HttpServer): Server {
  const allowedOrigins = getAllowedOrigins();
  const isDev = isDevelopment();

  // Configurar CORS para Socket.io
  // Usar función que valida orígenes usando isOriginAllowed
  // Esto permite localhost en desarrollo y orígenes de Render en producción
  const corsConfig = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void): void => {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin no permitido por CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
  };

  // Logging solo en desarrollo
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[Socket.io CORS] Modo: ${isDev ? 'desarrollo' : 'producción'}, Orígenes: [${allowedOrigins.join(', ') || 'ninguno'}]`);
  }
  
  const io = new Server(httpServer, {
    cors: corsConfig,
    transports: ['polling', 'websocket'], // Polling primero para mejor compatibilidad
    allowEIO3: true,
    pingTimeout: 60000, // 60 segundos (Render free tier puede tener timeouts largos)
    pingInterval: 25000, // Ping cada 25 segundos
    connectTimeout: 30000, // Timeout de conexión aumentado
  });

  io.on('connection', (socket) => {
    // Presencia por board
    const presenceByBoard: Map<string, Set<string>> = (io as any)._presenceByBoard ?? new Map();
    (io as any)._presenceByBoard = presenceByBoard;
    const membership = { boardId: undefined as string | undefined, user: undefined as string | undefined };
    // Soporte existente por proyectos
    socket.on('joinProject', (projectId: string) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('task:update', (payload) => {
      if (payload?.projectId) {
        io.to(`project:${payload.projectId}`).emit('task:updated', payload);
      }
    });

    socket.on('chat:message', (payload) => {
      if (payload?.projectId) {
        io.to(`project:${payload.projectId}`).emit('chat:message', payload);
      }
    });

    // Rooms por tablero (boards)
    socket.on('board:join', ({ boardId, user }: { boardId: string; user?: string }) => {
      if (!boardId) return;
      socket.join(`board:${boardId}`);
      membership.boardId = boardId;
      membership.user = user ?? membership.user;
      if (membership.user) {
        const set = presenceByBoard.get(boardId) ?? new Set<string>();
        set.add(membership.user);
        presenceByBoard.set(boardId, set);
        io.to(`board:${boardId}`).emit('board:presence', Array.from(set));
      }
    });

    socket.on('board:leave', ({ boardId }: { boardId: string }) => {
      if (!boardId) return;
      socket.leave(`board:${boardId}`);
      if (membership.user) {
        const set = presenceByBoard.get(boardId);
        if (set) {
          set.delete(membership.user);
          io.to(`board:${boardId}`).emit('board:presence', Array.from(set));
        }
      }
    });

    socket.on('kanban:update', async (payload: { boardId: string; name?: string; todo?: unknown; doing?: unknown; done?: unknown; wipLimits?: { todo?: number; doing?: number; done?: number } }) => {
      const boardId = payload?.boardId as string | undefined;
      if (!boardId) return;
      // difundir primero
      io.to(`board:${boardId}`).emit('kanban:update', payload);
      // persistir sin bloquear a los clientes (fire-and-forget)
      try {
        // Verificar conexión a MongoDB antes de intentar guardar
        if (!isMongoConnected()) {
          // Solo loguear errores críticos en producción
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.error('[Socket] MongoDB no está conectado, no se puede guardar estado del tablero:', boardId);
          }
          return;
        }
        
        const update: Record<string, unknown> = { updatedAt: Date.now() };
        if (typeof payload.name === 'string') update.name = payload.name;
        if (payload.todo) update.todo = payload.todo;
        if (payload.doing) update.doing = payload.doing;
        if (payload.done) update.done = payload.done;
        if (payload.wipLimits) {
          if (typeof payload.wipLimits.todo === 'number') update['wipLimits.todo'] = payload.wipLimits.todo;
          if (typeof payload.wipLimits.doing === 'number') update['wipLimits.doing'] = payload.wipLimits.doing;
          if (typeof payload.wipLimits.done === 'number') update['wipLimits.done'] = payload.wipLimits.done;
        }
        await BoardStateModel.updateOne(
          { boardId },
          { $set: update, $setOnInsert: { boardId } },
          { upsert: true }
        ).exec();
      } catch (err) {
        // Solo loguear errores en desarrollo, en producción usar logger estructurado
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error('[Socket] Error guardando estado del tablero:', boardId, err);
        }
      }
    });

    // Chat por tablero
    socket.on('board:chat:message', async (payload: { boardId: string; author?: string; text: string; ts?: number }) => {
      const boardId = payload?.boardId as string | undefined;
      if (!boardId || typeof payload?.text !== 'string' || payload.text.trim() === '') return;
      const message = {
        boardId,
        author: payload.author ?? 'Anónimo',
        text: payload.text,
        ts: typeof payload.ts === 'number' ? payload.ts : Date.now()
      };
      try {
        await MessageModel.create(message);
      } catch {
        // noop: si falla persistencia, aún así difundimos
      }
      io.to(`board:${boardId}`).emit('board:chat:message', message);
    });

    // Typing indicators
    socket.on('board:chat:typing', (payload: { boardId: string; author: string; typing: boolean }) => {
      const boardId = payload?.boardId as string | undefined;
      if (!boardId || typeof payload?.author !== 'string') return;
      socket.to(`board:${boardId}`).emit('board:chat:typing', payload);
    });

    // Logs de deployment en tiempo real
    socket.on('deployment:subscribe', ({ boardId }: { boardId: string }) => {
      if (!boardId) return;
      socket.join(`deployment:${boardId}`);
      // Logging solo en desarrollo
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`[Socket] Cliente suscrito a logs de deployment para board: ${boardId}`);
      }
    });

    socket.on('deployment:unsubscribe', ({ boardId }: { boardId: string }) => {
      if (!boardId) return;
      socket.leave(`deployment:${boardId}`);
    });

    socket.on('disconnect', () => {
      const boardId = membership.boardId;
      if (boardId && membership.user) {
        const set = presenceByBoard.get(boardId);
        if (set) {
          set.delete(membership.user);
          io.to(`board:${boardId}`).emit('board:presence', Array.from(set));
        }
      }
    });
  });

  return io;
}


