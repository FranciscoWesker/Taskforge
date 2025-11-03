/**
 * Servicio para interactuar con las funcionalidades de IA generativa realmente útiles.
 * Consume los endpoints del backend que utilizan Google Generative AI (Gemini).
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './env';

export interface TaskDependency {
  taskId: string;
  title: string;
  relationship: 'depends_on' | 'blocked_by' | 'related_to';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface DetectDependenciesRequest {
  newTask: { title: string; description?: string };
  existingTasks: Array<{ id: string; title: string; description?: string; list: 'todo' | 'doing' | 'done' }>;
}

export interface DetectDependenciesResponse {
  dependencies: TaskDependency[];
}

export interface Bottleneck {
  cardId: string;
  title: string;
  list: 'todo' | 'doing' | 'done';
  daysStuck: number;
  severity: 'critical' | 'warning' | 'info';
  suggestion?: string;
}

export interface DetectBottlenecksRequest {
  cards: Array<{ id: string; title: string; list: 'todo' | 'doing' | 'done'; createdAt?: number; updatedAt?: number }>;
  thresholdDays?: number;
}

export interface DetectBottlenecksResponse {
  bottlenecks: Bottleneck[];
}

export interface ChecklistItem {
  text: string;
  category?: string;
}

export interface GenerateChecklistRequest {
  title: string;
  description?: string;
  taskType?: string;
}

export interface GenerateChecklistResponse {
  checklist: ChecklistItem[];
}

export interface DuplicateTask {
  taskId: string;
  title: string;
  similarity: 'exact' | 'very_high' | 'high';
  reason: string;
}

export interface DetectDuplicatesRequest {
  newTask: { title: string; description?: string };
  existingTasks: Array<{ id: string; title: string; description?: string }>;
}

export interface DetectDuplicatesResponse {
  duplicates: DuplicateTask[];
}

export interface SummarizeChatRequest {
  messages: Array<{ user: string; text: string; timestamp?: string }>;
  maxLength?: number;
}

export interface SummarizeChatResponse {
  summary: string;
}

export interface AnalyzeTaskRequest {
  title: string;
  description?: string;
  context?: string;
  existingTasks?: Array<{ title: string; description?: string }>;
}

export interface TaskAnalysis {
  priority: 'low' | 'medium' | 'high';
  estimatedTime?: string;
  improvementSuggestions: string[];
  missingInfo: string[];
  recommendedLabels?: string[];
}

export interface ImproveDescriptionRequest {
  title: string;
  currentDescription?: string;
  context?: string;
}

export interface DescriptionImprovement {
  improvedDescription: string;
  missingElements: string[];
  suggestions: string[];
}


@Injectable({ providedIn: 'root' })
export class AIService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = API_BASE;

  /**
   * Verifica si el servicio de IA está disponible.
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ available: boolean }>(`${this.apiBase}/api/ai/status`)
      );
      return response.available;
    } catch (error) {
      console.warn('[AI] Error verificando disponibilidad:', error);
      return false;
    }
  }

  /**
   * Detecta dependencias entre una nueva tarea y las existentes.
   */
  async detectDependencies(request: DetectDependenciesRequest): Promise<TaskDependency[]> {
    try {
      const response = await firstValueFrom(
        this.http.post<DetectDependenciesResponse>(`${this.apiBase}/api/ai/detect-dependencies`, request)
      );
      return response.dependencies;
    } catch (error: any) {
      console.error('[AI] Error detectando dependencias:', error);
      throw new Error(error.error?.message || 'Error detectando dependencias');
    }
  }

  /**
   * Detecta cuellos de botella en el tablero.
   */
  async detectBottlenecks(request: DetectBottlenecksRequest): Promise<Bottleneck[]> {
    try {
      const response = await firstValueFrom(
        this.http.post<DetectBottlenecksResponse>(`${this.apiBase}/api/ai/detect-bottlenecks`, request)
      );
      return response.bottlenecks;
    } catch (error: any) {
      console.error('[AI] Error detectando cuellos de botella:', error);
      throw new Error(error.error?.message || 'Error detectando cuellos de botella');
    }
  }

  /**
   * Genera un checklist inteligente para una tarea.
   */
  async generateChecklist(request: GenerateChecklistRequest): Promise<ChecklistItem[]> {
    try {
      const response = await firstValueFrom(
        this.http.post<GenerateChecklistResponse>(`${this.apiBase}/api/ai/generate-checklist`, request)
      );
      return response.checklist;
    } catch (error: any) {
      console.error('[AI] Error generando checklist:', error);
      throw new Error(error.error?.message || 'Error generando checklist');
    }
  }

  /**
   * Detecta tareas duplicadas o similares.
   */
  async detectDuplicates(request: DetectDuplicatesRequest): Promise<DuplicateTask[]> {
    try {
      const response = await firstValueFrom(
        this.http.post<DetectDuplicatesResponse>(`${this.apiBase}/api/ai/detect-duplicates`, request)
      );
      return response.duplicates;
    } catch (error: any) {
      console.error('[AI] Error detectando duplicados:', error);
      throw new Error(error.error?.message || 'Error detectando tareas duplicadas');
    }
  }

  /**
   * Resume una conversación de chat.
   */
  async summarizeChat(request: SummarizeChatRequest): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<SummarizeChatResponse>(`${this.apiBase}/api/ai/summarize-chat`, request)
      );
      return response.summary;
    } catch (error: any) {
      console.error('[AI] Error resumiendo chat:', error);
      throw new Error(error.error?.message || 'Error generando resumen del chat');
    }
  }

  /**
   * Analiza una tarea y sugiere mejoras.
   */
  async analyzeTask(request: AnalyzeTaskRequest): Promise<TaskAnalysis> {
    try {
      return await firstValueFrom(
        this.http.post<TaskAnalysis>(`${this.apiBase}/api/ai/analyze-task`, request)
      );
    } catch (error: any) {
      console.error('[AI] Error analizando tarea:', error);
      throw new Error(error.error?.message || 'Error analizando la tarea');
    }
  }

  /**
   * Mejora una descripción existente identificando qué falta.
   */
  async improveDescription(request: ImproveDescriptionRequest): Promise<DescriptionImprovement> {
    try {
      return await firstValueFrom(
        this.http.post<DescriptionImprovement>(
          `${this.apiBase}/api/ai/improve-description`,
          request
        )
      );
    } catch (error: any) {
      console.error('[AI] Error mejorando descripción:', error);
      throw new Error(error.error?.message || 'Error mejorando descripción');
    }
  }
}
