import mongoose, { Schema, Document } from 'mongoose';

/**
 * Modelo para almacenar integraciones con repositorios Git (GitHub/GitLab/Bitbucket).
 * Cada integración conecta un tablero con un repositorio específico.
 */
export interface IntegrationDocument extends Document {
  integrationId: string;
  boardId: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  repoOwner: string;
  repoName: string;
  accessToken?: string; // Token OAuth almacenado cifrado (TODO: cifrar en producción)
  webhookSecret?: string;
  webhookUrl?: string;
  webhookId?: string; // ID del webhook en el proveedor
  branchMapping?: {
    branch: string;
    column: 'todo' | 'doing' | 'done';
  }[];
  autoCreateCards: boolean; // Crear tarjetas automáticamente desde commits/PRs
  autoCloseCards: boolean; // Cerrar tarjetas cuando se hace merge
  createdAt: number;
  updatedAt: number;
}

const integrationSchema = new Schema<IntegrationDocument>({
  integrationId: { type: String, required: true, unique: true, index: true },
  boardId: { type: String, required: true, index: true },
  provider: { type: String, required: true, enum: ['github', 'gitlab', 'bitbucket'] },
  repoOwner: { type: String, required: true },
  repoName: { type: String, required: true },
  accessToken: { type: String, default: undefined },
  webhookSecret: { type: String, default: undefined },
  webhookUrl: { type: String, default: undefined },
  webhookId: { type: String, default: undefined },
  branchMapping: { type: [Schema.Types.Mixed], default: [] },
  autoCreateCards: { type: Boolean, default: true },
  autoCloseCards: { type: Boolean, default: true },
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now(), index: true }
}, { versionKey: false });

export const IntegrationModel = mongoose.model<IntegrationDocument>('Integration', integrationSchema);

