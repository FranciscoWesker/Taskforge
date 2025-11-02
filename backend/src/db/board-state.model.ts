import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number; // Timestamp cuando se completó
}

interface KanbanCardDoc {
  id: string;
  title: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  labels?: string[]; // IDs de labels del tablero
  assignee?: string; // Email del usuario asignado
  dueDate?: number; // Fecha de vencimiento en epoch ms
  checklist?: ChecklistItem[]; // Lista de items del checklist
  metadata?: {
    type?: 'commit' | 'pull_request' | 'branch';
    sha?: string;
    branch?: string;
    number?: number;
    state?: string;
    url?: string;
    ciStatus?: {
      state: 'pending' | 'success' | 'failure' | 'error' | 'cancelled';
      context: string;
      description: string;
      target_url: string | null;
    };
    referencedIn?: Array<{
      type: 'commit' | 'pull_request' | 'comment';
      sha?: string;
      number?: number;
      url?: string;
      message?: string;
      title?: string;
      context?: string;
      timestamp?: number;
    }>;
  };
}

export interface BoardLabel {
  id: string;
  name: string;
  color: string; // Color en formato hex (#rrggbb)
  createdAt: number;
}

export interface BoardStateDocument extends Document {
  boardId: string;
  name?: string;
  owner?: string;
  members?: string[];
  todo: KanbanCardDoc[];
  doing: KanbanCardDoc[];
  done: KanbanCardDoc[];
  wipLimits?: { todo: number; doing: number; done: number };
  labels?: BoardLabel[]; // Labels disponibles en el tablero
  updatedAt: number;
}

const checklistItemSchema = new Schema<ChecklistItem>({
  id: { type: String, required: true },
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Number, required: true },
  completedAt: { type: Number }
}, { _id: false });

const cardSchema = new Schema<KanbanCardDoc>({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Number },
  updatedAt: { type: Number },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'] },
  labels: { type: [String], default: [] }, // IDs de labels del tablero
  assignee: { type: String }, // Email del usuario asignado
  dueDate: { type: Number }, // Fecha de vencimiento en epoch ms
  checklist: { type: [checklistItemSchema], default: [] }, // Lista de items del checklist
  metadata: { type: Schema.Types.Mixed, default: undefined }
}, { _id: false });

const labelSchema = new Schema<BoardLabel>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  color: { type: String, required: true },
  createdAt: { type: Number, required: true }
}, { _id: false });

const boardStateSchema = new Schema<BoardStateDocument>({
  boardId: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: undefined },
  owner: { type: String, index: true },
  members: { type: [String], default: [] },
  todo: { type: [cardSchema], default: [] },
  doing: { type: [cardSchema], default: [] },
  done: { type: [cardSchema], default: [] },
  wipLimits: { type: Object, default: undefined },
  labels: { type: [labelSchema], default: [] }, // Labels disponibles en el tablero
  updatedAt: { type: Number, index: true, default: () => Date.now() }
}, { versionKey: false });

export const BoardStateModel: Model<BoardStateDocument> = mongoose.models.BoardState || mongoose.model<BoardStateDocument>('BoardState', boardStateSchema);


