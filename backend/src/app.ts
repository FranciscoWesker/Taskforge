import express from 'express';
import type { Application } from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { MessageModel } from './db/message.model';
import { BoardStateModel } from './db/board-state.model';
import { IntegrationModel } from './db/integration.model';
import { isMongoConnected } from './db/mongo';
import { emitToBoard, emitDeploymentLog, emitDeploymentStatus } from './socket/bus';
import { corsMiddleware } from './middleware/cors';
import { getAllowedOrigins } from './utils/cors-config';
import { parseTaskReferences, extractCardId, matchesTaskReference } from './utils/task-reference-parser';
import {
  verifyGitHubWebhook,
  parseGitHubWebhook,
  getGitHubCIStatus,
  createGitHubWebhook,
  deleteGitHubWebhook,
  getGitHubRepo,
  getGitHubBranches,
  getGitHubUserRepos,
  getGitHubUser
} from './services/github.service';
import { randomBytes } from 'crypto';
import { logger } from './utils/logger';
import {
  isValidEmail,
  validateBoardName,
  validateCardTitle,
  validateCardDescription,
  isValidBoardId,
  isValidCardId,
  validateWipLimits,
  validateBranchMapping
} from './utils/validation';
import { requireBoardAccess, requireBoardOwner, requireIntegrationAccess } from './middleware/authorization';

dotenv.config();

/**
 * Whitelist de hosts permitidos para webhooks.
 * Solo se aceptan hosts que estén explícitamente en esta lista.
 * Esto previene ataques de redirección maliciosa (SSRF, Open Redirect).
 */
const ALLOWED_WEBHOOK_HOSTS: string[] = [
  'taskforge-ufzf.onrender.com',
  // Agregar otros hosts válidos aquí si es necesario
  // Ejemplo: 'taskforge-backend.onrender.com',
];

/**
 * Valida de forma segura si un host es un dominio válido de Render.
 * 
 * Esta función implementa una defensa en profundidad:
 * 1. Verifica contra una whitelist explícita de hosts permitidos
 * 2. Si no está en la whitelist, valida el patrón de dominio de Render
 * 
 * Esto previene ataques como:
 * - malicious.com?onrender.com
 * - onrender.com.evil.com  
 * - evil.com@onrender.com
 * - onrender.com/malicious
 * 
 * @param host - El host a validar (puede ser string o undefined)
 * @returns true si el host es válido, false en caso contrario
 */
function isValidRenderHost(host: string | undefined): host is string {
  if (!host || typeof host !== 'string') {
    return false;
  }
  
  // Remover puerto si existe (ej: "host.onrender.com:443" -> "host.onrender.com")
  const hostWithoutPort = host.split(':')[0].trim().toLowerCase();
  
  // Verificar primero contra la whitelist (más seguro)
  if (ALLOWED_WEBHOOK_HOSTS.includes(hostWithoutPort)) {
    return true;
  }
  
  // Si no está en la whitelist, validar patrón de dominio Render como fallback
  // Patrón estricto: debe terminar EXACTAMENTE con .onrender.com
  // - Debe comenzar con letra o número
  // - Puede contener letras, números y guiones en el medio
  // - NO puede comenzar ni terminar con guión
  // - Debe terminar exactamente con .onrender.com (sin caracteres después)
  const renderHostPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.onrender\.com$/;
  
  return renderHostPattern.test(hostWithoutPort);
}

/**
 * Rate limiters para diferentes tipos de endpoints.
 * Protege la API contra abuso y saturación.
 */

// Rate limiter general para endpoints de lectura (GET)
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por 15 minutos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Demasiadas solicitudes. Intenta más tarde.' },
  skip: (req) => req.path === '/health' || req.path === '/' // No limitar health check y root
});

// Rate limiter estricto para endpoints de escritura (POST, PUT, DELETE, PATCH)
const writeApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // 50 requests por 15 minutos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Demasiadas solicitudes de escritura. Intenta más tarde.' }
});

// Rate limiter para endpoints de autenticación/integraciones (más estricto)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 requests por 15 minutos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Demasiados intentos. Intenta más tarde.' }
});

// Rate limiter para webhooks (ya existente, más permisivo para webhooks legítimos)
const githubWebhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // 100 webhooks por minuto por IP (GitHub puede enviar muchos eventos)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Rate limit exceeded for webhook endpoint' },
  skipSuccessfulRequests: true // No contar requests exitosos para webhooks
});

export function createApp(): Application {
  const app = express();
  
  // IMPORTANTE: Configurar trust proxy para Render (está detrás de un load balancer)
  // Esto permite que Express rate limit identifique correctamente las IPs reales de los usuarios
  // y evita el error ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
  app.set('trust proxy', true);
  
  // Aplicar middleware CORS personalizado ANTES de otros middlewares
  // Esto asegura que CORS se aplique incluso en rutas no manejadas
  app.use(corsMiddleware);
  
  // Aplicar rate limiting general a todas las rutas API (excepto health y root)
  app.use('/api', generalApiLimiter);
  
  app.use(express.json());
  
  // Middleware de logging estructurado
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, 'HTTP', {
      ip: req.ip,
      userAgent: req.get('user-agent')?.substring(0, 100)
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Página informativa en raíz del backend (evitar bucles de redirección)
  app.get('/', (_req, res) => {
    const target = process.env.CLIENT_ORIGIN ?? '';
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Taskforge API</title></head><body>` +
        `<h1>Taskforge API</h1>` +
        (target ? `<p>Frontend: <a href="${target}">${target}</a></p>` : `<p>Health: <a href="/health">/health</a></p>`) +
        `</body></html>`
      );
  });
  // Evitar 404/redirección para favicon
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  // IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros
  /**
   * Listar tableros del usuario (owner o member).
   * GET /api/boards?owner=email@example.com
   * 
   * Requisitos:
   * - owner: email válido (opcional, query parameter)
   * - Si se proporciona owner, solo retorna tableros donde el usuario es owner o member
   */
  app.get('/api/boards', generalApiLimiter, async (req, res) => {
    try {
      const owner = typeof req.query.owner === 'string' ? req.query.owner : undefined;
      
      // Validar email si se proporciona
      if (owner && !isValidEmail(owner)) {
        return res.status(400).json({ error: 'bad_request', message: 'Email de owner inválido' });
      }
      
      const query: any = {};
      if (owner) {
        const normalizedOwner = owner.toLowerCase().trim();
        query.$or = [
          { owner: normalizedOwner },
          { members: normalizedOwner }
        ];
      }
      
      const docs = await BoardStateModel.find(query)
        .select('boardId name owner members updatedAt todo doing done')
        .sort({ updatedAt: -1 })
        .lean();
      
      const boards = docs.map(doc => ({
        boardId: doc.boardId,
        name: doc.name,
        owner: doc.owner,
        members: doc.members || [],
        updatedAt: doc.updatedAt,
        todoCount: (doc.todo as any[])?.length || 0,
        doingCount: (doc.doing as any[])?.length || 0,
        doneCount: (doc.done as any[])?.length || 0
      }));
      
      logger.debug(`Listando tableros`, 'Board', { owner, count: boards.length });
      
      res.json(boards);
    } catch (err) {
      logger.error('Error listando tableros', err, 'Board', { owner: req.query.owner as string });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Crear tablero.
   * POST /api/boards
   * Body: { name?: string, owner: string }
   * 
   * Requisitos:
   * - owner: email válido (requerido)
   * - name: string opcional (3-100 caracteres, alfanumérico con espacios/guiones)
   */
  app.post('/api/boards', writeApiLimiter, async (req, res) => {
    try {
      // Verificar conexión a MongoDB antes de proceder
      if (!isMongoConnected()) {
        logger.error('MongoDB no está conectado', undefined, 'Board');
        return res.status(503).json({ 
          error: 'service_unavailable', 
          message: 'Base de datos no disponible. Por favor, intenta nuevamente en unos momentos.' 
        });
      }
      
      const { name, owner } = req.body as { name?: unknown; owner?: unknown };
      
      // Validar owner (email requerido)
      if (!owner || typeof owner !== 'string' || !isValidEmail(owner)) {
        return res.status(400).json({ error: 'bad_request', message: 'Email de propietario inválido' });
      }
      
      // Validar y sanitizar nombre
      const validatedName = name ? validateBoardName(name) : null;
      if (name !== undefined && name !== null && validatedName === null) {
        return res.status(400).json({ error: 'bad_request', message: 'Nombre de tablero inválido (3-100 caracteres, alfanumérico)' });
      }
      
      const boardId = randomUUID();
      const doc = await BoardStateModel.create({
        boardId,
        name: validatedName || undefined,
        owner: owner.toLowerCase().trim(),
        members: [],
        todo: [],
        doing: [],
        done: [],
        wipLimits: { todo: 99, doing: 3, done: 99 },
        updatedAt: Date.now()
      });
      
      logger.info(`Tablero creado: ${boardId}`, 'Board', { boardId, owner: doc.owner, name: doc.name });
      
      res.status(201).json({
        boardId: doc.boardId,
        name: doc.name,
        owner: doc.owner,
        members: doc.members || [],
        updatedAt: doc.updatedAt
      });
    } catch (err: any) {
      // Manejar errores específicos de MongoDB
      if (err.name === 'MongoError' || err.name === 'MongooseError') {
        logger.error('Error de MongoDB al crear tablero', err, 'Board');
        return res.status(503).json({ 
          error: 'database_error', 
          message: 'Error de base de datos. Por favor, intenta nuevamente.' 
        });
      }
      logger.error('Error creando tablero', err, 'Board');
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Historial de chat por tablero.
   * GET /api/boards/:boardId/messages?limit=50
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - limit: número entre 1 y 200 (opcional, default: 50)
   * - Usuario debe tener acceso al tablero (owner o member)
   */
  app.get('/api/boards/:boardId/messages', generalApiLimiter, requireBoardAccess, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const limitRaw = req.query.limit ? Number(req.query.limit) : 50;
      const limit = Math.max(1, Math.min(Math.floor(limitRaw), 200));
      
      const docs = await MessageModel
        .find({ boardId })
        .sort({ ts: -1 })
        .limit(limit)
        .lean();
      
      // Devolver en orden ascendente para UI
      const messages = [...docs].reverse();
      
      logger.debug(`Mensajes obtenidos del tablero: ${boardId}`, 'Chat', { boardId, count: messages.length });
      
      res.json(messages);
    } catch (err) {
      logger.error('Error obteniendo mensajes', err, 'Chat', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Estado Kanban por tablero.
   * GET /api/boards/:boardId/kanban
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - Si el tablero no existe, retorna estado vacío por defecto
   * - Usuario debe tener acceso al tablero (owner o member)
   */
  app.get('/api/boards/:boardId/kanban', generalApiLimiter, requireBoardAccess, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const state = await BoardStateModel.findOne({ boardId }).lean();
      
      if (!state) {
        // Retornar estado vacío por defecto si no existe
        const defaultState = {
          boardId,
          name: undefined,
          todo: [],
          doing: [],
          done: [],
          wipLimits: { todo: 99, doing: 3, done: 99 },
          updatedAt: Date.now()
        };
        logger.debug(`Tablero no encontrado, retornando estado vacío: ${boardId}`, 'Board', { boardId });
        return res.json(defaultState);
      }
      
      logger.debug(`Estado Kanban obtenido: ${boardId}`, 'Board', { 
        boardId, 
        todoCount: (state.todo as any[])?.length || 0,
        doingCount: (state.doing as any[])?.length || 0,
        doneCount: (state.done as any[])?.length || 0
      });
      
      res.json(state);
    } catch (err) {
      logger.error('Error obteniendo kanban', err, 'Board', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Crear tarjeta en lista.
   * POST /api/boards/:boardId/cards
   * Body: { list: 'todo'|'doing'|'done', title: string, description?: string }
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - list: 'todo'|'doing'|'done' (requerido)
   * - title: string no vacío, máx 200 caracteres (requerido)
   * - description: string opcional, máx 5000 caracteres
   * - Usuario debe tener acceso al tablero (owner o member)
   */
  app.post('/api/boards/:boardId/cards', writeApiLimiter, requireBoardAccess, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const { list, title, description, metadata } = req.body as { 
        list?: unknown; 
        title?: unknown; 
        description?: unknown;
        metadata?: unknown;
      };
      
      // Validar list
      if (!list || !['todo', 'doing', 'done'].includes(list as string)) {
        return res.status(400).json({ error: 'bad_request', message: 'list debe ser: todo, doing o done' });
      }
      
      // Validar y sanitizar title
      const validatedTitle = validateCardTitle(title);
      if (!validatedTitle) {
        return res.status(400).json({ error: 'bad_request', message: 'Título inválido (1-200 caracteres requeridos)' });
      }
      
      // Validar y sanitizar description
      const validatedDescription = validateCardDescription(description);
      if (validatedDescription === null && description !== undefined && description !== null) {
        return res.status(400).json({ error: 'bad_request', message: 'Descripción inválida (máx 5000 caracteres)' });
      }
      
      const card: any = {
        id: randomUUID(),
        title: validatedTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...(validatedDescription !== null && { description: validatedDescription })
      };
      
      // Agregar metadata de Git si se proporciona
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        card.metadata = metadata;
      }
      
      const updated = await BoardStateModel.findOneAndUpdate(
        { boardId },
        { 
          $push: { [list as string]: card }, 
          $setOnInsert: { boardId, wipLimits: { todo: 99, doing: 3, done: 99 } }, 
          $set: { updatedAt: Date.now() } 
        },
        { new: true, upsert: true }
      ).lean();
      
      logger.info(`Tarjeta creada: ${card.id}`, 'Card', { boardId, cardId: card.id, list });
      
      emitToBoard(boardId, 'kanban:update', { boardId, todo: updated?.todo, doing: updated?.doing, done: updated?.done });
      res.status(201).json({ card, state: updated });
    } catch (err) {
      logger.error('Error creando tarjeta', err, 'Card', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Eliminar tarjeta.
   * DELETE /api/boards/:boardId/cards/:cardId
   * Query: ?list=todo|doing|done (opcional)
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - cardId: ID de tarjeta válido (requerido)
   * - Usuario debe tener acceso al tablero (owner o member)
   */
  app.delete('/api/boards/:boardId/cards/:cardId', writeApiLimiter, requireBoardAccess, async (req, res) => {
    try {
      const { boardId, cardId } = req.params as { boardId: string; cardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      if (!isValidCardId(cardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'cardId inválido' });
      }
      
      const list = typeof req.query.list === 'string' ? req.query.list : undefined;
      const pullAny = list && ['todo','doing','done'].includes(list)
        ? { [list]: { id: cardId } }
        : { todo: { id: cardId }, doing: { id: cardId }, done: { id: cardId } };
      
      const updated = await BoardStateModel.findOneAndUpdate(
        { boardId },
        { $pull: pullAny, $set: { updatedAt: Date.now() } },
        { new: true }
      ).lean();
      
      logger.info(`Tarjeta eliminada: ${cardId}`, 'Card', { boardId, cardId, list });
      
      emitToBoard(boardId, 'kanban:update', { boardId, todo: updated?.todo, doing: updated?.doing, done: updated?.done });
      res.json({ ok: true });
    } catch (err) {
      logger.error('Error eliminando tarjeta', err, 'Card', { boardId: req.params.boardId, cardId: req.params.cardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Editar tarjeta (título/description).
   * PATCH /api/boards/:boardId/cards/:cardId
   * Body: { title?: string, description?: string }
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - cardId: ID de tarjeta válido (requerido)
   * - title: string opcional, máx 200 caracteres
   * - description: string opcional, máx 5000 caracteres
   * - Usuario debe tener acceso al tablero (owner o member)
   */
  app.patch('/api/boards/:boardId/cards/:cardId', writeApiLimiter, requireBoardAccess, async (req, res) => {
    try {
      const { boardId, cardId } = req.params as { boardId: string; cardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      if (!isValidCardId(cardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'cardId inválido' });
      }
      
      const { title, description, metadata } = req.body as { title?: unknown; description?: unknown; metadata?: unknown };
      
      // Validar y sanitizar title si se proporciona
      let validatedTitle: string | null = null;
      if (title !== undefined && title !== null) {
        validatedTitle = validateCardTitle(title);
        if (validatedTitle === null) {
          return res.status(400).json({ error: 'bad_request', message: 'Título inválido (1-200 caracteres requeridos)' });
        }
      }
      
      // Validar y sanitizar description si se proporciona
      let validatedDescription: string | null = null;
      if (description !== undefined && description !== null) {
        validatedDescription = validateCardDescription(description);
        if (validatedDescription === null && description !== undefined && description !== null) {
          return res.status(400).json({ error: 'bad_request', message: 'Descripción inválida (máx 5000 caracteres)' });
        }
      }
      
      // Si no se proporciona nada para actualizar
      if (validatedTitle === null && validatedDescription === null && metadata === undefined) {
        return res.status(400).json({ error: 'bad_request', message: 'Debe proporcionar al menos title, description o metadata' });
      }
      
      const doc = await BoardStateModel.findOne({ boardId });
      if (!doc) {
        return res.status(404).json({ error: 'not_found', message: 'Tablero no encontrado' });
      }
      
      let updated = false;
      const apply = (arr: any[]) => {
        const idx = arr.findIndex((c: any) => c.id === cardId);
        if (idx >= 0) {
          if (validatedTitle !== null) {
            arr[idx].title = validatedTitle;
          }
          if (validatedDescription !== null) {
            arr[idx].description = validatedDescription;
          } else if (description === null) {
            // Si description es null explícitamente, eliminarlo
            delete arr[idx].description;
          }
          // Actualizar metadata de Git si se proporciona
          if (metadata !== undefined) {
            if (metadata === null) {
              // Si metadata es null explícitamente, eliminarlo
              delete arr[idx].metadata;
            } else if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
              // Merge con metadata existente o reemplazar
              arr[idx].metadata = { ...(arr[idx].metadata || {}), ...metadata };
            }
          }
          // Actualizar updatedAt
          arr[idx].updatedAt = Date.now();
          updated = true;
        }
      };
      
      apply(doc.todo as any[]);
      apply(doc.doing as any[]);
      apply(doc.done as any[]);
      
      if (!updated) {
        return res.status(404).json({ error: 'not_found', message: 'Tarjeta no encontrada' });
      }
      
      doc.updatedAt = Date.now();
      await doc.save();
      
      logger.info(`Tarjeta editada: ${cardId}`, 'Card', { boardId, cardId, hasTitle: validatedTitle !== null, hasDescription: validatedDescription !== null });
      
      emitToBoard(boardId, 'kanban:update', { boardId, todo: doc.todo, doing: doc.doing, done: doc.done });
      res.json({ ok: true });
    } catch (err) {
      logger.error('Error editando tarjeta', err, 'Card', { boardId: req.params.boardId, cardId: req.params.cardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Mover tarjeta entre listas y reordenar.
   * PATCH /api/boards/:boardId/cards/:cardId/move
   * Body: { fromList: 'todo'|'doing'|'done', toList: 'todo'|'doing'|'done', toIndex: number }
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - cardId: ID de tarjeta válido (requerido)
   * - fromList, toList: 'todo'|'doing'|'done' (requeridos)
   * - toIndex: número >= 0 (requerido)
   * - Usuario debe tener acceso al tablero (owner o member)
   */
  app.patch('/api/boards/:boardId/cards/:cardId/move', writeApiLimiter, requireBoardAccess, async (req, res) => {
    try {
      const { boardId, cardId } = req.params as { boardId: string; cardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      if (!isValidCardId(cardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'cardId inválido' });
      }
      
      const { fromList, toList, toIndex } = req.body as { 
        fromList?: unknown; 
        toList?: unknown; 
        toIndex?: unknown 
      };
      
      const validLists = ['todo', 'doing', 'done'];
      
      if (!fromList || !validLists.includes(fromList as string)) {
        return res.status(400).json({ error: 'bad_request', message: 'fromList debe ser: todo, doing o done' });
      }
      
      if (!toList || !validLists.includes(toList as string)) {
        return res.status(400).json({ error: 'bad_request', message: 'toList debe ser: todo, doing o done' });
      }
      
      if (typeof toIndex !== 'number' || !Number.isFinite(toIndex) || toIndex < 0) {
        return res.status(400).json({ error: 'bad_request', message: 'toIndex debe ser un número >= 0' });
      }
      
      const doc = await BoardStateModel.findOne({ boardId });
      if (!doc) {
        return res.status(404).json({ error: 'not_found', message: 'Tablero no encontrado' });
      }
      
      const src = (doc as any)[fromList as string] as Array<any>;
      const dst = (doc as any)[toList as string] as Array<any>;
      
      if (!Array.isArray(src) || !Array.isArray(dst)) {
        return res.status(500).json({ error: 'internal_error', message: 'Estructura de datos inválida' });
      }
      
      const idx = src.findIndex((c: any) => c.id === cardId);
      if (idx < 0) {
        return res.status(404).json({ error: 'not_found', message: 'Tarjeta no encontrada en la lista origen' });
      }
      
      const [card] = src.splice(idx, 1);
      const insertAt = Math.max(0, Math.min(Math.floor(toIndex as number), dst.length));
      dst.splice(insertAt, 0, card);
      
      doc.updatedAt = Date.now();
      await doc.save();
      
      logger.info(`Tarjeta movida: ${cardId}`, 'Card', { boardId, cardId, fromList, toList, toIndex: insertAt });
      
      emitToBoard(boardId, 'kanban:update', { boardId, todo: doc.todo, doing: doc.doing, done: doc.done });
      res.json({ ok: true });
    } catch (err) {
      logger.error('Error moviendo tarjeta', err, 'Card', { boardId: req.params.boardId, cardId: req.params.cardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Establecer límites WIP del tablero.
   * PATCH /api/boards/:boardId/wip
   * Body: { todo?: number, doing?: number, done?: number }
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - todo, doing, done: números entre 1 y 999 (opcionales pero al menos uno requerido)
   * - Usuario debe ser dueño del tablero
   */
  app.patch('/api/boards/:boardId/wip', writeApiLimiter, requireBoardOwner, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const { todo, doing, done } = req.body as { todo?: unknown; doing?: unknown; done?: unknown };
      
      // Construir objeto de límites WIP
      const wipLimits: { todo?: number; doing?: number; done?: number } = {};
      
      if (todo !== undefined) {
        const todoNum = typeof todo === 'number' && Number.isFinite(todo) ? Math.floor(todo) : -1;
        if (todoNum < 1 || todoNum > 999) {
          return res.status(400).json({ error: 'bad_request', message: 'todo debe ser un número entre 1 y 999' });
        }
        wipLimits.todo = todoNum;
      }
      
      if (doing !== undefined) {
        const doingNum = typeof doing === 'number' && Number.isFinite(doing) ? Math.floor(doing) : -1;
        if (doingNum < 1 || doingNum > 999) {
          return res.status(400).json({ error: 'bad_request', message: 'doing debe ser un número entre 1 y 999' });
        }
        wipLimits.doing = doingNum;
      }
      
      if (done !== undefined) {
        const doneNum = typeof done === 'number' && Number.isFinite(done) ? Math.floor(done) : -1;
        if (doneNum < 1 || doneNum > 999) {
          return res.status(400).json({ error: 'bad_request', message: 'done debe ser un número entre 1 y 999' });
        }
        wipLimits.done = doneNum;
      }
      
      // Validar que se proporcione al menos un límite
      if (Object.keys(wipLimits).length === 0) {
        return res.status(400).json({ error: 'bad_request', message: 'Debe proporcionar al menos un límite WIP' });
      }
      
      // Obtener límites actuales para preservar los que no se actualizan
      const currentBoard = await BoardStateModel.findOne({ boardId }).lean();
      const currentLimits = currentBoard?.wipLimits || { todo: 99, doing: 3, done: 99 };
      
      const finalLimits = {
        todo: wipLimits.todo ?? currentLimits.todo ?? 99,
        doing: wipLimits.doing ?? currentLimits.doing ?? 3,
        done: wipLimits.done ?? currentLimits.done ?? 99
      };
      
      if (!validateWipLimits(finalLimits)) {
        return res.status(400).json({ error: 'bad_request', message: 'Límites WIP inválidos' });
      }
      
      const doc = await BoardStateModel.findOneAndUpdate(
        { boardId },
        { 
          $set: { 
            'wipLimits.todo': finalLimits.todo, 
            'wipLimits.doing': finalLimits.doing, 
            'wipLimits.done': finalLimits.done, 
            updatedAt: Date.now() 
          }, 
          $setOnInsert: { boardId, wipLimits: finalLimits } 
        },
        { new: true, upsert: true }
      ).lean();
      
      logger.info(`Límites WIP actualizados: ${boardId}`, 'Board', { boardId, wipLimits: finalLimits });
      
      emitToBoard(boardId, 'kanban:update', { boardId, wipLimits: doc?.wipLimits });
      res.json({ ok: true, wipLimits: doc?.wipLimits });
    } catch (err) {
      logger.error('Error actualizando WIP', err, 'Board', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });


  /**
   * Eliminar tablero.
   * DELETE /api/boards/:boardId
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - Usuario debe ser dueño del tablero
   */
  app.delete('/api/boards/:boardId', writeApiLimiter, requireBoardOwner, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const result = await BoardStateModel.deleteOne({ boardId });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'not_found', message: 'Tablero no encontrado' });
      }
      
      // También eliminar mensajes e integraciones asociadas
      await MessageModel.deleteMany({ boardId }).catch(() => {});
      await IntegrationModel.deleteMany({ boardId }).catch(() => {});
      
      logger.info(`Tablero eliminado: ${boardId}`, 'Board', { boardId });
      
      res.json({ ok: true });
    } catch (err) {
      logger.error('Error eliminando tablero', err, 'Board', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Compartir tablero (agregar miembro).
   * POST /api/boards/:boardId/share
   * Body: { email: string }
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - email: email válido (requerido)
   * - Usuario debe ser dueño del tablero
   */
  app.post('/api/boards/:boardId/share', writeApiLimiter, requireBoardOwner, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const { email } = req.body as { email?: unknown };
      
      // Validar email
      if (!email || typeof email !== 'string' || !isValidEmail(email)) {
        return res.status(400).json({ error: 'bad_request', message: 'Email inválido' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      const doc = await BoardStateModel.findOne({ boardId });
      if (!doc) {
        return res.status(404).json({ error: 'not_found', message: 'Tablero no encontrado' });
      }
      
      // Verificar que no sea el dueño
      if (doc.owner === normalizedEmail) {
        return res.status(400).json({ error: 'bad_request', message: 'El dueño ya tiene acceso al tablero' });
      }
      
      const members = doc.members || [];
      if (members.includes(normalizedEmail)) {
        return res.status(400).json({ error: 'already_member', message: 'Este usuario ya tiene acceso al tablero' });
      }
      
      // Límite de miembros (50 máximo)
      if (members.length >= 50) {
        return res.status(400).json({ error: 'bad_request', message: 'Se alcanzó el límite de miembros (50)' });
      }
      
      members.push(normalizedEmail);
      doc.members = members;
      doc.updatedAt = Date.now();
      await doc.save();
      
      logger.info(`Miembro agregado al tablero: ${boardId}`, 'Board', { boardId, email: normalizedEmail });
      
      res.json({ ok: true, members: doc.members });
    } catch (err) {
      logger.error('Error compartiendo tablero', err, 'Board', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Eliminar miembro compartido.
   * DELETE /api/boards/:boardId/share
   * Body: { email: string }
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - email: email válido (requerido)
   * - Usuario debe ser dueño del tablero
   */
  app.delete('/api/boards/:boardId/share', writeApiLimiter, requireBoardOwner, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const { email } = req.body as { email?: unknown };
      
      if (!email || typeof email !== 'string' || !isValidEmail(email)) {
        return res.status(400).json({ error: 'bad_request', message: 'Email inválido' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      const doc = await BoardStateModel.findOne({ boardId });
      if (!doc) {
        return res.status(404).json({ error: 'not_found', message: 'Tablero no encontrado' });
      }
      
      const members = (doc.members || []).filter((m: string) => m !== normalizedEmail);
      
      // Si no cambió, el miembro no estaba en la lista
      if (members.length === (doc.members || []).length) {
        return res.status(404).json({ error: 'not_found', message: 'Miembro no encontrado en el tablero' });
      }
      
      doc.members = members;
      doc.updatedAt = Date.now();
      await doc.save();
      
      logger.info(`Miembro eliminado del tablero: ${boardId}`, 'Board', { boardId, email: normalizedEmail });
      
      res.json({ ok: true, members: doc.members });
    } catch (err) {
      logger.error('Error eliminando miembro', err, 'Board', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Obtener metadata del tablero (nombre, owner, members).
   * GET /api/boards/:boardId
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - Usuario debe tener acceso al tablero (owner o member)
   */
  app.get('/api/boards/:boardId', generalApiLimiter, requireBoardAccess, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const doc = await BoardStateModel.findOne({ boardId }).lean();
      
      if (!doc) {
        return res.status(404).json({ error: 'not_found', message: 'Tablero no encontrado' });
      }
      
      res.json({ 
        boardId, 
        name: doc.name, 
        owner: doc.owner, 
        members: doc.members || [] 
      });
    } catch (err) {
      logger.error('Error obteniendo metadata de tablero', err, 'Board', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Obtener estado completo del tablero Kanban (nombre, tarjetas, límites WIP).
   * GET /api/boards/:boardId/kanban
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - Usuario debe tener acceso al tablero (owner o member)
   */
  app.get('/api/boards/:boardId/kanban', generalApiLimiter, requireBoardAccess, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const doc = await BoardStateModel.findOne({ boardId }).lean();
      
      if (!doc) {
        return res.status(404).json({ error: 'not_found', message: 'Tablero no encontrado' });
      }
      
      res.json({
        boardId,
        name: doc.name,
        todo: doc.todo || [],
        doing: doc.doing || [],
        done: doc.done || [],
        wipLimits: doc.wipLimits || { todo: 99, doing: 3, done: 99 }
      });
    } catch (err) {
      logger.error('Error obteniendo estado Kanban', err, 'Board', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  /**
   * Actualizar nombre del tablero.
   * PUT /api/boards/:boardId
   * Body: { name: string }
   * 
   * Requisitos:
   * - boardId: UUID válido (requerido)
   * - name: string válido (3-100 caracteres, alfanumérico con espacios/guiones)
   * - Usuario debe ser dueño del tablero
   */
  app.put('/api/boards/:boardId', writeApiLimiter, requireBoardOwner, async (req, res) => {
    try {
      const { boardId } = req.params as { boardId: string };
      
      if (!isValidBoardId(boardId)) {
        return res.status(400).json({ error: 'bad_request', message: 'boardId inválido' });
      }
      
      const { name } = req.body as { name?: unknown };
      
      // Validar y sanitizar nombre
      const validatedName = name ? validateBoardName(name) : null;
      if (!validatedName) {
        return res.status(400).json({ error: 'bad_request', message: 'Nombre de tablero inválido (3-100 caracteres, alfanumérico)' });
      }
      
      const doc = await BoardStateModel.findOneAndUpdate(
        { boardId },
        { $set: { name: validatedName, updatedAt: Date.now() }, $setOnInsert: { boardId } },
        { new: true, upsert: true }
      ).lean();
      
      logger.info(`Nombre de tablero actualizado: ${boardId}`, 'Board', { boardId, name: validatedName });
      
      emitToBoard(boardId, 'kanban:update', { boardId, name: doc?.name });
      res.json({ ok: true, name: doc?.name });
    } catch (err) {
      logger.error('Error actualizando nombre de tablero', err, 'Board', { boardId: req.params.boardId });
      res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
    }
  });

  // ==================== INTEGRACIONES GIT ====================
  
  // Verificar token de GitHub y obtener información del usuario
  app.post('/api/integrations/github/verify-token', authLimiter, async (req, res) => {
    try {
      const { accessToken } = req.body as { accessToken?: string };
      
      if (!accessToken || typeof accessToken !== 'string') {
        return res.status(400).json({ error: 'missing_token', message: 'Token de acceso requerido' });
      }

      const user = await getGitHubUser(accessToken);
      if (!user) {
        return res.status(401).json({ error: 'invalid_token', message: 'Token inválido o sin permisos' });
      }

      res.json({ user });
    } catch (err) {
      console.error('Error verificando token de GitHub', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Listar repositorios del usuario autenticado
  app.post('/api/integrations/github/repos', authLimiter, async (req, res) => {
    try {
      const { accessToken, type } = req.body as { accessToken?: string; type?: 'all' | 'owner' | 'member' };
      
      if (!accessToken || typeof accessToken !== 'string') {
        return res.status(400).json({ error: 'missing_token', message: 'Token de acceso requerido' });
      }

      const repos = await getGitHubUserRepos(accessToken, type || 'all');
      res.json({ repos });
    } catch (err) {
      console.error('Error obteniendo repositorios de GitHub', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });
  
  // Listar integraciones de un tablero
  app.get('/api/boards/:boardId/integrations', generalApiLimiter, async (req, res) => {
    try {
      const { boardId } = req.params;
      const integrations = await IntegrationModel.find({ boardId })
        .select('integrationId provider repoOwner repoName branchMapping autoCreateCards autoCloseCards createdAt')
        .sort({ createdAt: -1 })
        .lean();
      res.json(integrations);
    } catch (err) {
      console.error('Error listando integraciones', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Conectar repositorio GitHub
  app.post('/api/boards/:boardId/integrations/github', authLimiter, async (req, res) => {
    try {
      const { boardId } = req.params;
      const { fullName, accessToken } = req.body as { fullName?: string; accessToken?: string };
      
      if (!fullName || !accessToken) {
        return res.status(400).json({ error: 'missing_fields', message: 'fullName (formato: owner/repo) y accessToken son requeridos' });
      }

      // Parsear fullName en owner y repo
      const parts = fullName.split('/');
      if (parts.length !== 2) {
        return res.status(400).json({ error: 'invalid_format', message: 'El formato debe ser: owner/repo' });
      }
      const [owner, repo] = parts;
      const validGitHubName = /^[a-zA-Z0-9._-]+$/;
      if (!validGitHubName.test(owner) || !validGitHubName.test(repo) || owner.length > 100 || repo.length > 100) {
        return res.status(400).json({ error: 'invalid_name', message: 'El nombre de usuario/organización o repositorio contiene caracteres inválidos.' });
      }

      // Verificar acceso al repositorio
      const repoInfo = await getGitHubRepo(owner, repo, accessToken);
      if (!repoInfo) {
        // Intentar obtener más detalles del error
        const user = await getGitHubUser(accessToken);
        if (!user) {
          return res.status(401).json({ error: 'invalid_token', message: 'Token inválido. Verifica que tenga los permisos necesarios (repo, admin:repo_hook)' });
        }
        return res.status(404).json({ error: 'repo_not_found', message: `No se pudo acceder al repositorio "${fullName}". Verifica que el repositorio exista y que tengas permisos de acceso.` });
      }

      // Generar secreto para webhook
      const webhookSecret = randomBytes(32).toString('hex');
      
      // Construir URL del webhook - usar BACKEND_URL si está disponible, sino inferir desde el host de la request
      let backendUrl = process.env.BACKEND_URL;
      
      if (!backendUrl) {
        // Intentar obtener desde headers de la request (útil cuando Render hace proxy)
        const host = req.headers.host;
        const protocol = req.protocol || (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || 'https';
        
        // Validación segura usando función dedicada que previene ataques SSRF/Open Redirect
        if (isValidRenderHost(host)) {
          backendUrl = `${protocol}://${host}`;
        } else {
          // Fallback seguro: usar la URL conocida del backend en Render desde variable de entorno
          // o la URL hardcodeada como último recurso
          backendUrl = process.env.BACKEND_URL || 'https://taskforge-ufzf.onrender.com';
        }
      }
      
      const webhookUrl = `${backendUrl}/webhooks/github`;
      
      console.log(`[DEBUG] Creando webhook con URL: ${webhookUrl}`);
      console.log(`[DEBUG] BACKEND_URL: ${process.env.BACKEND_URL || 'no definido'}`);
      console.log(`[DEBUG] CLIENT_ORIGIN: ${process.env.CLIENT_ORIGIN || 'no definido'}`);
      console.log(`[DEBUG] Request host: ${req.headers.host || 'no definido'}`);

      // Verificar permisos del token antes de crear webhook
      const user = await getGitHubUser(accessToken);
      if (!user) {
        return res.status(401).json({ error: 'invalid_token', message: 'Token inválido. Verifica que tenga los permisos necesarios (repo, admin:repo_hook)' });
      }

      // Crear webhook en GitHub
      const webhookResult = await createGitHubWebhook(owner, repo, webhookUrl, webhookSecret, accessToken);
      
      // Verificar si hubo error
      if ('error' in webhookResult) {
        console.error('Error al crear webhook:', webhookResult.error, webhookResult.details);
        return res.status(500).json({ 
          error: 'webhook_creation_failed', 
          message: webhookResult.error,
          details: process.env.NODE_ENV === 'development' ? webhookResult.details : undefined,
          webhookUrl: process.env.NODE_ENV === 'development' ? webhookUrl : undefined
        });
      }

      const webhook = webhookResult;

      // Crear integración en DB
      const integrationId = randomUUID();
      const integration = await IntegrationModel.create({
        integrationId,
        boardId,
        provider: 'github',
        repoOwner: owner,
        repoName: repo,
        accessToken, // TODO: cifrar en producción
        webhookSecret,
        webhookUrl,
        webhookId: String(webhook.id),
        branchMapping: [],
        autoCreateCards: true,
        autoCloseCards: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      res.json({
        integrationId: integration.integrationId,
        provider: integration.provider,
        repoOwner: integration.repoOwner,
        repoName: integration.repoName,
        webhookUrl: integration.webhookUrl,
        createdAt: integration.createdAt
      });
    } catch (err) {
      console.error('Error creando integración GitHub', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Obtener ramas de un repositorio conectado
  app.get('/api/integrations/:integrationId/branches', generalApiLimiter, async (req, res) => {
    try {
      const { integrationId } = req.params;
      const integration = await IntegrationModel.findOne({ integrationId }).lean();
      
      if (!integration) {
        return res.status(404).json({ error: 'integration_not_found' });
      }

      if (integration.provider === 'github' && integration.accessToken) {
        const branches = await getGitHubBranches(
          integration.repoOwner,
          integration.repoName,
          integration.accessToken
        );
        res.json({ branches });
      } else {
        res.json({ branches: [] });
      }
    } catch (err) {
      console.error('Error obteniendo ramas', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Actualizar mapeo de ramas de una integración
  app.put('/api/integrations/:integrationId/branch-mapping', writeApiLimiter, async (req, res) => {
    try {
      const { integrationId } = req.params;
      const { branchMapping } = req.body as { branchMapping?: { branch: string; column: 'todo' | 'doing' | 'done' }[] };
      
      if (!Array.isArray(branchMapping)) {
        return res.status(400).json({ error: 'bad_request', message: 'branchMapping debe ser un array' });
      }

      // Validar que todas las columnas sean válidas
      const validColumns = ['todo', 'doing', 'done'];
      for (const mapping of branchMapping) {
        if (!validColumns.includes(mapping.column)) {
          return res.status(400).json({ error: 'bad_request', message: `Columna inválida: ${mapping.column}` });
        }
        if (!mapping.branch || typeof mapping.branch !== 'string') {
          return res.status(400).json({ error: 'bad_request', message: 'Cada mapeo debe tener una rama válida' });
        }
      }

      const integration = await IntegrationModel.findOneAndUpdate(
        { integrationId },
        { 
          $set: { 
            branchMapping,
            updatedAt: Date.now()
          } 
        },
        { new: true }
      ).lean();

      if (!integration) {
        return res.status(404).json({ error: 'integration_not_found' });
      }

      res.json({
        integrationId: integration.integrationId,
        branchMapping: integration.branchMapping
      });
    } catch (err) {
      console.error('Error actualizando mapeo de ramas', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Actualizar configuración de una integración (autoCreateCards, autoCloseCards)
  app.put('/api/integrations/:integrationId/config', writeApiLimiter, async (req, res) => {
    try {
      const { integrationId } = req.params;
      const { autoCreateCards, autoCloseCards } = req.body as { 
        autoCreateCards?: boolean; 
        autoCloseCards?: boolean;
      };

      const update: any = { updatedAt: Date.now() };
      if (typeof autoCreateCards === 'boolean') update.autoCreateCards = autoCreateCards;
      if (typeof autoCloseCards === 'boolean') update.autoCloseCards = autoCloseCards;

      const integration = await IntegrationModel.findOneAndUpdate(
        { integrationId },
        { $set: update },
        { new: true }
      ).lean();

      if (!integration) {
        return res.status(404).json({ error: 'integration_not_found' });
      }

      res.json({
        integrationId: integration.integrationId,
        autoCreateCards: integration.autoCreateCards,
        autoCloseCards: integration.autoCloseCards
      });
    } catch (err) {
      console.error('Error actualizando configuración', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Eliminar integración
  app.delete('/api/integrations/:integrationId', writeApiLimiter, async (req, res) => {
    try {
      const { integrationId } = req.params;
      const integration = await IntegrationModel.findOne({ integrationId }).lean();
      
      if (!integration) {
        return res.status(404).json({ error: 'integration_not_found' });
      }

      // Eliminar webhook del proveedor
      if (integration.provider === 'github' && integration.webhookId && integration.accessToken) {
        await deleteGitHubWebhook(
          integration.repoOwner,
          integration.repoName,
          Number(integration.webhookId),
          integration.accessToken
        );
      }

      await IntegrationModel.deleteOne({ integrationId });
      res.json({ success: true });
    } catch (err) {
      console.error('Error eliminando integración', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Webhook de GitHub - DEBE usar express.raw para verificar firma
  app.post('/webhooks/github', githubWebhookRateLimiter, express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const event = req.headers['x-github-event'] as string | undefined;
      const deliveryId = req.headers['x-github-delivery'] as string | undefined;

      if (!event || !deliveryId) {
        return res.status(400).json({ error: 'missing_headers' });
      }

      const payload = JSON.parse(req.body.toString());
      const { repository } = payload as any;
      
      if (!repository) {
        return res.status(400).json({ error: 'missing_repository' });
      }
      // Validate repoOwner and repoName are simple strings
      const repoOwner = typeof repository.owner?.login === "string"
        ? repository.owner.login
        : (typeof repository.full_name === "string" ? repository.full_name.split('/')[0] : undefined);
      const repoName = typeof repository.name === "string" ? repository.name : undefined;
      if (!repoOwner || !repoName) {
        return res.status(400).json({ error: "invalid_repository_fields" });
      }

      // Buscar integración por repositorio
      const integration = await IntegrationModel.findOne({
        provider: 'github',
        repoOwner: repoOwner,
        repoName: repoName
      }).lean();

      if (!integration) {
        return res.status(404).json({ error: 'integration_not_found' });
      }

      // Verificar firma del webhook
      if (!verifyGitHubWebhook(req.body, signature, integration.webhookSecret || '')) {
        return res.status(401).json({ error: 'invalid_signature' });
      }

      // Parsear evento
      const parsed = parseGitHubWebhook(event, payload);
      
      // Procesar evento según tipo
      const boardDoc = await BoardStateModel.findOne({ boardId: integration.boardId }).lean();
      if (!boardDoc) {
        return res.status(404).json({ error: 'board_not_found' });
      }

      let updated = false;

      if (parsed.type === 'push' && parsed.commit && integration.autoCreateCards) {
        // Emitir log de deployment
        emitDeploymentLog(integration.boardId, {
          level: 'info',
          message: `Push recibido en ${parsed.branch || 'main'}: ${parsed.commit.message.split('\n')[0].substring(0, 50)}`,
          timestamp: Date.now(),
          context: parsed.commit.sha.substring(0, 7)
        });

        // Parsear referencias de tareas en el mensaje del commit
        const taskRefs = parseTaskReferences(
          parsed.commit.message,
          'commit',
          parsed.commit.html_url,
          parsed.commit.sha
        );

        // Buscar tarjetas existentes que coincidan con las referencias
        const existingCards: any[] = [];
        for (const list of [boardDoc.todo, boardDoc.doing, boardDoc.done]) {
          if (Array.isArray(list)) {
            existingCards.push(...list);
          }
        }

        // Actualizar tarjetas existentes con referencia al commit
        for (const ref of taskRefs) {
          const matchingCard = existingCards.find(card => matchesTaskReference(card.id, ref));
          if (matchingCard) {
            // Agregar referencia al commit en la tarjeta existente
            const referencedIn = (matchingCard.metadata?.referencedIn || []) as any[];
            if (!referencedIn.find((r: any) => r.sha === parsed.commit?.sha)) {
              referencedIn.push({
                type: 'commit',
                sha: parsed.commit.sha,
                url: parsed.commit.html_url,
                message: parsed.commit.message.split('\n')[0].substring(0, 100),
                context: ref.context,
                timestamp: Date.now(),
              });

              // Actualizar la tarjeta en la columna correspondiente
              const cardColumn = 
                (boardDoc.todo as any[])?.find((c: any) => c.id === matchingCard.id) ? 'todo' :
                (boardDoc.doing as any[])?.find((c: any) => c.id === matchingCard.id) ? 'doing' :
                (boardDoc.done as any[])?.find((c: any) => c.id === matchingCard.id) ? 'done' : null;

              if (cardColumn) {
                // Usar arrayFilters para actualizar el elemento correcto en el array
                await BoardStateModel.updateOne(
                  { boardId: integration.boardId },
                  {
                    $set: {
                      [`${cardColumn}.$[elem].metadata.referencedIn`]: referencedIn,
                      [`${cardColumn}.$[elem].updatedAt`]: Date.now(),
                      updatedAt: Date.now()
                    }
                  },
                  {
                    arrayFilters: [{ 'elem.id': matchingCard.id }]
                  }
                );
                updated = true;
              }
            }
          }
        }

        // Crear tarjeta desde commit si no hay referencias o si es un commit nuevo
        if (taskRefs.length === 0 || !taskRefs.some(ref => existingCards.some(card => matchesTaskReference(card.id, ref)))) {
          const cardId = randomUUID();
          const title = `Commit: ${parsed.commit.message.split('\n')[0].substring(0, 50)}`;
          const description = `Branch: ${parsed.branch || 'main'}\nSHA: ${parsed.commit.sha.substring(0, 7)}\n\n${parsed.commit.message}`;
          
          // Obtener estado CI/CD
          const ciStatuses = await getGitHubCIStatus(
            integration.repoOwner,
            integration.repoName,
            parsed.commit.sha,
            integration.accessToken || ''
          );

          const card = {
            id: cardId,
            title,
            description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {
              type: 'commit',
              sha: parsed.commit.sha,
              branch: parsed.branch,
              url: parsed.commit.html_url,
              ciStatus: ciStatuses.length > 0 ? ciStatuses[0] : undefined
            }
          };

          // Determinar columna según branch mapping o default
          let targetColumn: 'todo' | 'doing' | 'done' = 'todo';
          if (integration.branchMapping && parsed.branch) {
            const mapping = integration.branchMapping.find((m: any) => m.branch === parsed.branch);
            if (mapping) targetColumn = mapping.column;
          }

          await BoardStateModel.updateOne(
            { boardId: integration.boardId },
            {
              $push: { [targetColumn]: card },
              $set: { updatedAt: Date.now() }
            }
          );
          updated = true;
        }
      }

      if (parsed.type === 'pull_request' && parsed.pullRequest && integration.autoCreateCards) {
        // Parsear referencias de tareas en el título y body del PR
        const prText = `${parsed.pullRequest.title}\n${parsed.pullRequest.body || ''}`;
        const taskRefs = parseTaskReferences(
          prText,
          'pull_request',
          parsed.pullRequest.html_url,
          parsed.pullRequest.head.sha
        );

        // Buscar tarjetas existentes que coincidan con las referencias
        const existingCards: any[] = [];
        for (const list of [boardDoc.todo, boardDoc.doing, boardDoc.done]) {
          if (Array.isArray(list)) {
            existingCards.push(...list);
          }
        }

        // Actualizar tarjetas existentes con referencia al PR
        for (const ref of taskRefs) {
          const matchingCard = existingCards.find(card => matchesTaskReference(card.id, ref));
          if (matchingCard) {
            // Agregar referencia al PR en la tarjeta existente
            const referencedIn = (matchingCard.metadata?.referencedIn || []) as any[];
            if (!referencedIn.find((r: any) => r.type === 'pull_request' && r.number === parsed.pullRequest?.number)) {
              referencedIn.push({
                type: 'pull_request',
                number: parsed.pullRequest.number,
                url: parsed.pullRequest.html_url,
                title: parsed.pullRequest.title,
                context: ref.context,
                timestamp: Date.now(),
              });

              // Actualizar la tarjeta en la columna correspondiente
              const cardColumn = 
                (boardDoc.todo as any[])?.find((c: any) => c.id === matchingCard.id) ? 'todo' :
                (boardDoc.doing as any[])?.find((c: any) => c.id === matchingCard.id) ? 'doing' :
                (boardDoc.done as any[])?.find((c: any) => c.id === matchingCard.id) ? 'done' : null;

              if (cardColumn) {
                // Usar arrayFilters para actualizar el elemento correcto en el array
                await BoardStateModel.updateOne(
                  { boardId: integration.boardId },
                  {
                    $set: {
                      [`${cardColumn}.$[elem].metadata.referencedIn`]: referencedIn,
                      [`${cardColumn}.$[elem].updatedAt`]: Date.now(),
                      updatedAt: Date.now()
                    }
                  },
                  {
                    arrayFilters: [{ 'elem.id': matchingCard.id }]
                  }
                );
                updated = true;
              }
            }
          }
        }

        // Crear o actualizar tarjeta desde PR
        const cardId = `pr-${parsed.pullRequest.number}`;
        const title = `PR #${parsed.pullRequest.number}: ${parsed.pullRequest.title}`;
        const description = `Branch: ${parsed.pullRequest.head.ref} → ${parsed.pullRequest.base.ref}\nEstado: ${parsed.pullRequest.state}\n${parsed.pullRequest.body || ''}`;

        let targetColumn: 'todo' | 'doing' | 'done' = 'todo';
        if (parsed.pullRequest.state === 'merged' || parsed.pullRequest.state === 'closed') {
          targetColumn = 'done';
        } else if (parsed.pullRequest.state === 'open') {
          targetColumn = 'doing';
        }

        // Buscar si ya existe la tarjeta
        const existingCard = [
          ...(boardDoc.todo as any[]),
          ...(boardDoc.doing as any[]),
          ...(boardDoc.done as any[])
        ].find((c: any) => c.id === cardId);

        const card = {
          id: cardId,
          title,
          description,
          createdAt: existingCard?.createdAt || Date.now(),
          updatedAt: Date.now(),
          metadata: {
            type: 'pull_request',
            number: parsed.pullRequest.number,
            state: parsed.pullRequest.state,
            branch: parsed.pullRequest.head.ref,
            url: parsed.pullRequest.html_url
          }
        };

        if (existingCard) {
          // Actualizar tarjeta existente
          await BoardStateModel.updateOne(
            { boardId: integration.boardId },
            {
              $pull: { todo: { id: cardId }, doing: { id: cardId }, done: { id: cardId } },
              $push: { [targetColumn]: card },
              $set: { updatedAt: Date.now() }
            }
          );
        } else {
          // Crear nueva tarjeta
          await BoardStateModel.updateOne(
            { boardId: integration.boardId },
            {
              $push: { [targetColumn]: card },
              $set: { updatedAt: Date.now() }
            }
          );
        }
        updated = true;
      }

      if (parsed.type === 'status' && parsed.ciStatus && parsed.commit) {
        // Emitir log y estado de deployment
        const statusState = parsed.ciStatus.state === 'success' ? 'success' : 
                           parsed.ciStatus.state === 'failure' ? 'failure' :
                           parsed.ciStatus.state === 'pending' ? 'running' : 'pending';
        
        emitDeploymentStatus(integration.boardId, {
          state: statusState,
          pipeline: parsed.ciStatus.context,
          version: parsed.commit.sha.substring(0, 7),
          timestamp: Date.now()
        });

        emitDeploymentLog(integration.boardId, {
          level: parsed.ciStatus.state === 'success' ? 'success' : 
                 parsed.ciStatus.state === 'failure' ? 'error' :
                 parsed.ciStatus.state === 'pending' ? 'info' : 'info',
          message: `CI/CD ${parsed.ciStatus.context}: ${parsed.ciStatus.description || parsed.ciStatus.state}`,
          timestamp: Date.now(),
          context: parsed.commit.sha.substring(0, 7)
        });

        // Actualizar badge CI/CD en tarjetas existentes
        const cards = [
          ...(boardDoc.todo as any[]),
          ...(boardDoc.doing as any[]),
          ...(boardDoc.done as any[])
        ];

        for (const card of cards) {
          if (card.metadata?.sha === parsed.commit?.sha) {
            // Actualizar estado CI
            const updatedCard = {
              ...card,
              metadata: {
                ...card.metadata,
                ciStatus: parsed.ciStatus
              }
            };
            
            // Determinar columna actual
            let currentColumn: 'todo' | 'doing' | 'done' = 'todo';
            if ((boardDoc.todo as any[]).find((c: any) => c.id === card.id)) currentColumn = 'todo';
            else if ((boardDoc.doing as any[]).find((c: any) => c.id === card.id)) currentColumn = 'doing';
            else if ((boardDoc.done as any[]).find((c: any) => c.id === card.id)) currentColumn = 'done';

            // Mover a done si CI es exitoso y está configurado
            if (parsed.ciStatus.state === 'success' && integration.autoCloseCards && currentColumn !== 'done') {
              // Actualizar tarjeta antes de moverla
              updatedCard.updatedAt = Date.now();
              await BoardStateModel.updateOne(
                { boardId: integration.boardId },
                {
                  $pull: { [currentColumn]: { id: card.id } },
                  $push: { done: updatedCard },
                  $set: { updatedAt: Date.now() }
                }
              );
            } else {
              // Solo actualizar metadata usando arrayFilters
              await BoardStateModel.updateOne(
                { boardId: integration.boardId },
                {
                  $set: {
                    [`${currentColumn}.$[elem].metadata`]: updatedCard.metadata,
                    [`${currentColumn}.$[elem].updatedAt`]: Date.now(),
                    updatedAt: Date.now()
                  }
                },
                {
                  arrayFilters: [{ 'elem.id': card.id }]
                }
              );
            }
            updated = true;
            break;
          }
        }
      }

      if (updated) {
        // Emitir actualización en tiempo real
        const updatedBoard = await BoardStateModel.findOne({ boardId: integration.boardId }).lean();
        if (updatedBoard) {
          emitToBoard(integration.boardId, 'kanban:update', {
            boardId: integration.boardId,
            todo: updatedBoard.todo,
            doing: updatedBoard.doing,
            done: updatedBoard.done
          });
        }
      }

      res.status(200).json({ received: true, processed: updated });
    } catch (err) {
      console.error('Error procesando webhook de GitHub', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

      // Manejo de errores 404 - CORS ya está aplicado por el middleware
      // IMPORTANTE: Este handler debe ir DESPUÉS de todas las rutas
      app.use((req, res) => {
        // Aplicar CORS manualmente en caso de que el middleware no se haya ejecutado
        // Esto es crítico porque el middleware CORS ya debería haber establecido los headers
        // pero en caso de errores, asegurarnos de que siempre estén presentes
        const origin = req.headers.origin;
        if (origin) {
          try {
            const allowedOrigins = getAllowedOrigins();
            if (allowedOrigins.includes(origin)) {
              res.setHeader('Access-Control-Allow-Origin', origin);
              res.setHeader('Access-Control-Allow-Credentials', 'true');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            }
          } catch (error) {
            // Si hay error obteniendo orígenes, solo loguear
            // eslint-disable-next-line no-console
            console.warn('[CORS] Error aplicando CORS en 404:', error);
          }
        }
        // eslint-disable-next-line no-console
        console.log(`[404] Ruta no encontrada: ${req.method} ${req.path}`);
        res.status(404).json({ error: 'not_found', message: 'Ruta no encontrada' });
      });

      // Middleware de manejo de errores - Asegurar CORS en todos los errores
      app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        // Aplicar CORS manualmente incluso en errores
        const origin = req.headers.origin;
        if (origin) {
          try {
            const allowedOrigins = getAllowedOrigins();
            if (allowedOrigins.includes(origin)) {
              res.setHeader('Access-Control-Allow-Origin', origin);
              res.setHeader('Access-Control-Allow-Credentials', 'true');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('[CORS] Error aplicando CORS en error handler:', error);
          }
        }
        // eslint-disable-next-line no-console
        console.error('Error no manejado:', err);
        res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
  });

  return app;
}


