/**
 * Servicio para interactuar con Google Generative AI (Gemini).
 * Proporciona funcionalidades de IA generativa realmente útiles para TaskForge.
 * 
 * Funcionalidades implementadas:
 * - Detección de dependencias entre tareas
 * - Detección de cuellos de botella
 * - Generación automática de checklists inteligentes
 * - Detección de tareas duplicadas/similares
 * - Mejora de descripciones de tareas
 * - Resumen de conversaciones de chat (útil para conversaciones largas)
 * - Análisis mejorado de tareas con sugerencias específicas
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Inicializar el cliente de Gemini
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

/**
 * Verifica si el servicio de IA está configurado y disponible.
 */
export function isAIServiceAvailable(): boolean {
  return genAI !== null && !!process.env.GEMINI_API_KEY;
}

/**
 * Genera texto usando Gemini basado en un prompt.
 */
async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
  if (!genAI) {
    throw new Error('Servicio de IA no configurado. GEMINI_API_KEY no está disponible.');
  }

  try {
    // Modelos disponibles en v1beta (según documentación oficial):
    // - 'gemini-1.5-flash-002' (rápido, recomendado)
    // - 'gemini-1.5-pro-002' (más potente, más lento)
    // Usar gemini-1.5-flash-002 que es compatible con la API v1beta
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash-002',
      systemInstruction: systemInstruction || 'Eres un asistente útil para gestión de proyectos. Proporcionas respuestas concisas y prácticas.'
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (error: any) {
    throw new Error(`Error generando contenido: ${error.message}`);
  }
}

/**
 * Detecta dependencias entre tareas basado en sus títulos y descripciones.
 * Identifica qué tareas necesitan completarse antes que otras.
 */
export interface DetectDependenciesOptions {
  newTask: { title: string; description?: string };
  existingTasks: Array<{ id: string; title: string; description?: string; list: 'todo' | 'doing' | 'done' }>;
}

export interface TaskDependency {
  taskId: string;
  title: string;
  relationship: 'depends_on' | 'blocked_by' | 'related_to';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export async function detectTaskDependencies(
  options: DetectDependenciesOptions
): Promise<TaskDependency[]> {
  const { newTask, existingTasks } = options;

  if (existingTasks.length === 0) {
    return [];
  }

  const tasksList = existingTasks
    .map((t, idx) => `${idx + 1}. [${t.list}] "${t.title}"${t.description ? ` - ${t.description}` : ''}`)
    .join('\n');

  let prompt = `Analiza las siguientes tareas y determina si la nueva tarea tiene dependencias con alguna existente.\n\n`;
  prompt += `Nueva tarea: "${newTask.title}"${newTask.description ? `\nDescripción: ${newTask.description}` : ''}\n\n`;
  prompt += `Tareas existentes:\n${tasksList}\n\n`;
  prompt += `Para cada tarea existente, determina:\n`;
  prompt += `- "depends_on": La nueva tarea requiere que esta se complete primero\n`;
  prompt += `- "blocked_by": Esta tarea está bloqueando la nueva tarea\n`;
  prompt += `- "related_to": Están relacionadas pero no hay dependencia clara\n\n`;
  prompt += `Responde SOLO en formato JSON array con: [{ "taskId": "número", "title": "...", "relationship": "depends_on|blocked_by|related_to", "confidence": "high|medium|low", "reason": "explicación breve" }]`;
  prompt += `Solo incluye relaciones con confianza "high" o "medium".`;

  const response = await generateText(
    prompt,
    'Eres un experto en gestión de proyectos que identifica dependencias entre tareas. Analizas títulos y descripciones para encontrar relaciones lógicas.'
  );

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as any[];
      const dependencies: TaskDependency[] = [];
      
      for (const item of parsed) {
        const taskIndex = parseInt(item.taskId || item.index || '0') - 1;
        if (taskIndex >= 0 && taskIndex < existingTasks.length) {
          const task = existingTasks[taskIndex];
          dependencies.push({
            taskId: task.id,
            title: task.title,
            relationship: item.relationship || 'related_to',
            confidence: item.confidence || 'medium',
            reason: item.reason || 'Relación detectada'
          });
        }
      }
      
      return dependencies.filter(d => d.confidence !== 'low');
    }
  } catch (error) {
    console.error('Error parseando dependencias:', error);
  }

  return [];
}

/**
 * Detecta cuellos de botella: tareas que llevan mucho tiempo en la misma columna.
 */
export interface DetectBottlenecksOptions {
  cards: Array<{
    id: string;
    title: string;
    list: 'todo' | 'doing' | 'done';
    createdAt?: number;
    updatedAt?: number;
  }>;
  thresholdDays?: number; // Días máximos antes de considerarse cuello de botella
}

export interface Bottleneck {
  cardId: string;
  title: string;
  list: 'todo' | 'doing' | 'done';
  daysStuck: number;
  severity: 'critical' | 'warning' | 'info';
  suggestion?: string;
}

export async function detectBottlenecks(
  options: DetectBottlenecksOptions
): Promise<Bottleneck[]> {
  const { cards, thresholdDays = 7 } = options;
  const now = Date.now();
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const bottlenecks: Bottleneck[] = [];

  for (const card of cards) {
    if (card.list === 'done') continue; // No analizar tareas completadas

    const referenceDate = card.updatedAt || card.createdAt || now;
    const daysStuck = Math.floor((now - referenceDate) / (24 * 60 * 60 * 1000));

    if (daysStuck >= thresholdDays) {
      const severity: 'critical' | 'warning' | 'info' = 
        daysStuck >= thresholdDays * 2 ? 'critical' :
        daysStuck >= thresholdDays * 1.5 ? 'warning' : 'info';

      // Generar sugerencia específica
      let suggestion = '';
      try {
        const suggestionPrompt = `Una tarea "${card.title}" lleva ${daysStuck} días en la columna "${card.list}". Genera UNA sugerencia práctica y específica para desbloquearla (máximo 100 caracteres).`;
        suggestion = await generateText(
          suggestionPrompt,
          'Eres un experto en gestión de proyectos que ayuda a desbloquear tareas estancadas.'
        );
        suggestion = suggestion.trim().slice(0, 100);
      } catch (error) {
        suggestion = daysStuck >= thresholdDays * 2 
          ? 'Tarea críticamente estancada - considerar dividir o reasignar'
          : 'Revisar dependencias o dividir en subtareas';
      }

      bottlenecks.push({
        cardId: card.id,
        title: card.title,
        list: card.list,
        daysStuck,
        severity,
        suggestion
      });
    }
  }

  return bottlenecks.sort((a, b) => b.daysStuck - a.daysStuck);
}

/**
 * Genera un checklist inteligente basado en el tipo de tarea.
 */
export interface GenerateChecklistOptions {
  title: string;
  description?: string;
  taskType?: string; // 'development', 'design', 'testing', 'deployment', etc.
}

export interface ChecklistItem {
  text: string;
  category?: string; // 'setup', 'implementation', 'testing', 'validation', etc.
}

export async function generateChecklist(
  options: GenerateChecklistOptions
): Promise<ChecklistItem[]> {
  const { title, description, taskType } = options;

  let prompt = `Genera un checklist práctico y específico para la siguiente tarea de gestión de proyectos.\n\n`;
  prompt += `Tarea: "${title}"\n`;
  if (description) {
    prompt += `Descripción: ${description}\n`;
  }
  if (taskType) {
    prompt += `Tipo: ${taskType}\n`;
  }
  prompt += `\nGenera 5-8 pasos específicos y accionables.`;
  prompt += `Para tareas de desarrollo, incluye: setup, implementación, pruebas, documentación, revisión.`;
  prompt += `\n\nResponde SOLO en formato JSON array: [{ "text": "paso del checklist", "category": "setup|implementation|testing|validation|documentation" }]`;

  const response = await generateText(
    prompt,
    'Eres un experto en gestión de proyectos que crea checklists específicos y accionables. Generas pasos prácticos, no genéricos.'
  );

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as any[];
      return parsed
        .filter(item => item.text)
        .map(item => ({
          text: item.text.trim(),
          category: item.category || 'implementation'
        }))
        .slice(0, 8);
    }
  } catch (error) {
    console.error('Error parseando checklist:', error);
  }

  // Checklist básico por defecto
  return [
    { text: 'Definir criterios de aceptación', category: 'validation' },
    { text: 'Implementar funcionalidad', category: 'implementation' },
    { text: 'Realizar pruebas', category: 'testing' },
    { text: 'Documentar cambios', category: 'documentation' }
  ];
}

/**
 * Detecta tareas duplicadas o muy similares.
 */
export interface DetectDuplicateTasksOptions {
  newTask: { title: string; description?: string };
  existingTasks: Array<{ id: string; title: string; description?: string }>;
}

export interface DuplicateTask {
  taskId: string;
  title: string;
  similarity: 'exact' | 'very_high' | 'high';
  reason: string;
}

export async function detectDuplicateTasks(
  options: DetectDuplicateTasksOptions
): Promise<DuplicateTask[]> {
  const { newTask, existingTasks } = options;

  if (existingTasks.length === 0) {
    return [];
  }

  const tasksList = existingTasks
    .map((t, idx) => `${idx + 1}. "${t.title}"${t.description ? ` - ${t.description}` : ''}`)
    .join('\n');

  let prompt = `Compara la nueva tarea con las existentes y determina si hay duplicados o tareas muy similares.\n\n`;
  prompt += `Nueva tarea: "${newTask.title}"${newTask.description ? `\nDescripción: ${newTask.description}` : ''}\n\n`;
  prompt += `Tareas existentes:\n${tasksList}\n\n`;
  prompt += `Para cada tarea, determina la similitud:\n`;
  prompt += `- "exact": Es esencialmente la misma tarea\n`;
  prompt += `- "very_high": Muy similar, probable duplicado\n`;
  prompt += `- "high": Similar pero con diferencias significativas\n\n`;
  prompt += `Responde SOLO en formato JSON array: [{ "taskId": "número", "title": "...", "similarity": "exact|very_high|high", "reason": "por qué es similar" }]`;
  prompt += `Solo incluye similitudes "exact" o "very_high".`;

  const response = await generateText(
    prompt,
    'Eres un experto en gestión de proyectos que identifica tareas duplicadas. Comparas títulos y descripciones con precisión.'
  );

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as any[];
      const duplicates: DuplicateTask[] = [];
      
      for (const item of parsed) {
        const taskIndex = parseInt(item.taskId || item.index || '0') - 1;
        if (taskIndex >= 0 && taskIndex < existingTasks.length) {
          const task = existingTasks[taskIndex];
          duplicates.push({
            taskId: task.id,
            title: task.title,
            similarity: item.similarity || 'high',
            reason: item.reason || 'Tarea similar detectada'
          });
        }
      }
      
      return duplicates.filter(d => d.similarity !== 'high');
    }
  } catch (error) {
    console.error('Error parseando duplicados:', error);
  }

  return [];
}

/**
 * Genera un resumen de una conversación de chat.
 */
export interface SummarizeChatOptions {
  messages: Array<{ user: string; text: string; timestamp?: Date }>;
  maxLength?: number;
}

export async function summarizeChat(options: SummarizeChatOptions): Promise<string> {
  const { messages, maxLength = 200 } = options;

  if (messages.length === 0) {
    return 'No hay mensajes para resumir.';
  }

  const chatContext = messages
    .map(msg => `${msg.user}: ${msg.text}`)
    .join('\n');

  const prompt = `Resume la siguiente conversación de chat de un tablero de gestión de proyectos en máximo ${maxLength} caracteres. Destaca los puntos clave, decisiones tomadas y próximos pasos. Conversación:\n\n${chatContext}`;

  const summary = await generateText(
    prompt,
    'Eres un asistente que resume conversaciones de manera concisa y clara.'
  );

  return summary.trim();
}

/**
 * Analiza una tarea y sugiere mejoras específicas (mejor que solo prioridad genérica).
 */
export interface AnalyzeTaskOptions {
  title: string;
  description?: string;
  context?: string; // Contexto adicional del proyecto
  existingTasks?: Array<{ title: string; description?: string }>; // Para contexto del proyecto
}

export interface TaskAnalysis {
  priority: 'low' | 'medium' | 'high';
  estimatedTime?: string;
  improvementSuggestions: string[]; // Sugerencias específicas para mejorar la tarea
  missingInfo: string[]; // Información que falta en la descripción
  recommendedLabels?: string[]; // Etiquetas sugeridas basadas en el contenido
}

export async function analyzeTask(options: AnalyzeTaskOptions): Promise<TaskAnalysis> {
  const { title, description, context, existingTasks } = options;

  let prompt = `Analiza la siguiente tarea de gestión de proyectos de manera crítica y práctica.\n\n`;
  prompt += `Tarea: "${title}"\n`;
  if (description) {
    prompt += `Descripción actual: ${description}\n`;
  } else {
    prompt += `Descripción: (ninguna)\n`;
  }
  if (context) {
    prompt += `Contexto del proyecto: ${context}\n`;
  }
  if (existingTasks && existingTasks.length > 0) {
    prompt += `\nOtras tareas del proyecto: ${existingTasks.slice(0, 5).map(t => `"${t.title}"`).join(', ')}\n`;
  }
  prompt += `\nProporciona:\n`;
  prompt += `1. Prioridad (low, medium, high) basada en impacto y urgencia\n`;
  prompt += `2. Tiempo estimado aproximado (ej: "2-3 días", "1 semana")\n`;
  prompt += `3. Información FALTANTE en la descripción (qué detalles específicos faltan)\n`;
  prompt += `4. 2-3 sugerencias ESPECÍFICAS para mejorar la tarea (no genéricas)\n`;
  prompt += `5. Etiquetas sugeridas basadas en el tipo de trabajo\n\n`;
  prompt += `Responde en formato JSON: { "priority": "...", "estimatedTime": "...", "missingInfo": [...], "improvementSuggestions": [...], "recommendedLabels": [...] }`;

  const response = await generateText(
    prompt,
    'Eres un experto crítico en gestión de proyectos. Analizas tareas de manera práctica y específica, identificando qué falta y cómo mejorar.'
  );

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        priority: parsed.priority || 'medium',
        estimatedTime: parsed.estimatedTime,
        improvementSuggestions: Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : [],
        missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
        recommendedLabels: Array.isArray(parsed.recommendedLabels) ? parsed.recommendedLabels : []
      };
    }
  } catch (error) {
    console.error('Error parseando análisis:', error);
  }

  // Análisis básico por defecto
  const missingInfo: string[] = [];
  if (!description || description.trim().length < 20) {
    missingInfo.push('Descripción detallada de qué se debe hacer');
  }
  if (!description?.includes('criterio') && !description?.includes('aceptación')) {
    missingInfo.push('Criterios de aceptación claros');
  }

  return {
    priority: 'medium',
    improvementSuggestions: [
      description && description.length > 20 
        ? 'Agregar criterios de aceptación específicos'
        : 'Agregar descripción detallada con pasos concretos',
      'Definir dependencias con otras tareas'
    ],
    missingInfo,
    recommendedLabels: []
  };
}

/**
 * Mejora una descripción existente identificando qué falta (mejor que generar desde cero).
 */
export interface ImproveDescriptionOptions {
  title: string;
  currentDescription?: string;
  context?: string;
}

export interface DescriptionImprovement {
  improvedDescription: string;
  missingElements: string[];
  suggestions: string[];
}

export async function improveDescription(
  options: ImproveDescriptionOptions
): Promise<DescriptionImprovement> {
  const { title, currentDescription, context } = options;

  let prompt = `Analiza y mejora la descripción de esta tarea identificando QUÉ FALTA, no generando todo desde cero.\n\n`;
  prompt += `Tarea: "${title}"\n`;
  if (currentDescription) {
    prompt += `Descripción actual: ${currentDescription}\n`;
  } else {
    prompt += `Descripción: (vacía o muy breve)\n`;
  }
  if (context) {
    prompt += `Contexto: ${context}\n`;
  }
  prompt += `\n1. Identifica QUÉ información FALTA (criterios de aceptación, pasos específicos, dependencias, etc.)\n`;
  prompt += `2. Genera una descripción MEJORADA que incluya lo actual MÁS lo que falta\n`;
  prompt += `3. Lista los elementos que se agregaron\n\n`;
  prompt += `Responde en formato JSON: { "improvedDescription": "...", "missingElements": [...], "suggestions": [...] }`;

  const response = await generateText(
    prompt,
    'Eres un experto que mejora descripciones de tareas agregando información faltante específica y práctica.'
  );

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        improvedDescription: parsed.improvedDescription || currentDescription || '',
        missingElements: Array.isArray(parsed.missingElements) ? parsed.missingElements : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };
    }
  } catch (error) {
    console.error('Error parseando mejora:', error);
  }

  // Mejora básica por defecto
  const baseDescription = currentDescription || `Implementar: ${title}`;
  return {
    improvedDescription: `${baseDescription}\n\nCriterios de aceptación:\n- [Por definir]\n\nPasos:\n1. [Por definir]`,
    missingElements: ['Criterios de aceptación', 'Pasos específicos'],
    suggestions: ['Define criterios de aceptación medibles', 'Lista los pasos concretos a seguir']
  };
}

