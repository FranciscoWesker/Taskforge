/**
 * Utilidades para parsear y vincular referencias de tareas en commits, PRs y comentarios.
 * Detecta patrones como #123, task-123, TASK-123, etc. y los vincula a tarjetas existentes.
 */

export interface TaskReference {
  id: string; // ID de la tarea referenciada (ej: "123")
  prefix?: string; // Prefijo opcional (ej: "task", "TASK")
  fullMatch: string; // Texto completo que coincide (ej: "#123", "task-123")
  context: string; // Contexto donde se encontró (commit message, PR body, comment)
  sourceType: 'commit' | 'pull_request' | 'comment';
  sourceUrl?: string; // URL del commit, PR o comentario
  sourceSha?: string; // SHA del commit (si aplica)
}

/**
 * Patrones comunes para referencias de tareas:
 * - #123 (estilo GitHub issue)
 * - task-123, TASK-123 (estilo JIRA)
 * - TASK#123 (estilo mixto)
 */
const TASK_REFERENCE_PATTERNS = [
  /#(\d+)/g, // #123
  /(?:task|TASK|Task)[- ]?#?(\d+)/gi, // task-123, TASK-123, task #123
  /\[task[:\s](\d+)\]/gi, // [task: 123]
  /\(task[:\s](\d+)\)/gi, // (task: 123)
];

/**
 * Parsea referencias de tareas en un texto.
 * Retorna todas las referencias encontradas con su contexto.
 */
export function parseTaskReferences(
  text: string,
  sourceType: TaskReference['sourceType'],
  sourceUrl?: string,
  sourceSha?: string
): TaskReference[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const references: TaskReference[] = [];
  const seen = new Set<string>(); // Evitar duplicados

  for (const pattern of TASK_REFERENCE_PATTERNS) {
    let match;
    // Reset lastIndex para que el patrón global funcione correctamente
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      const taskId = match[1];
      const fullMatch = match[0];
      const uniqueKey = `${sourceType}-${taskId}-${match.index}`;

      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);

        // Extraer contexto: línea donde se encontró la referencia
        const lines = text.split('\n');
        const lineIndex = text.substring(0, match.index).split('\n').length - 1;
        const contextLine = lines[lineIndex] || '';
        const context = contextLine.trim().substring(0, 150); // Máximo 150 caracteres

        // Determinar prefijo
        const prefixMatch = fullMatch.match(/^(task|TASK|Task)/i);
        const prefix = prefixMatch ? prefixMatch[1] : undefined;

        references.push({
          id: taskId,
          prefix,
          fullMatch,
          context,
          sourceType,
          sourceUrl,
          sourceSha,
        });
      }
    }
  }

  return references;
}

/**
 * Extrae el ID de la tarjeta desde su ID o título.
 * Soporta formatos como:
 * - "card-123" -> "123"
 * - "pr-456" -> "456"
 * - "123" -> "123"
 */
export function extractCardId(cardIdOrTitle: string): string | null {
  if (!cardIdOrTitle) return null;

  // Si el ID contiene un guión, extraer la parte numérica
  const match = cardIdOrTitle.match(/(?:card-|pr-|task-|#)?(\d+)/i);
  return match ? match[1] : cardIdOrTitle;
}

/**
 * Verifica si un ID de tarjeta coincide con una referencia de tarea.
 */
export function matchesTaskReference(cardId: string, reference: TaskReference): boolean {
  const cardIdNum = extractCardId(cardId);
  return cardIdNum === reference.id;
}

/**
 * Formatea una referencia de tarea para mostrar en la UI.
 */
export function formatTaskReference(reference: TaskReference): string {
  if (reference.prefix) {
    return `${reference.prefix}-${reference.id}`;
  }
  return `#${reference.id}`;
}

