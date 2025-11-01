import mongoose, { Schema, type Document, type Model } from 'mongoose';

interface KanbanCardDoc {
  id: string;
  title: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
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

export interface BoardStateDocument extends Document {
  boardId: string;
  name?: string;
  owner?: string;
  members?: string[];
  todo: KanbanCardDoc[];
  doing: KanbanCardDoc[];
  done: KanbanCardDoc[];
  wipLimits?: { todo: number; doing: number; done: number };
  updatedAt: number;
}

const cardSchema = new Schema<KanbanCardDoc>({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Number },
  updatedAt: { type: Number },
  metadata: { type: Schema.Types.Mixed, default: undefined }
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
  updatedAt: { type: Number, index: true, default: () => Date.now() }
}, { versionKey: false });

export const BoardStateModel: Model<BoardStateDocument> = mongoose.models.BoardState || mongoose.model<BoardStateDocument>('BoardState', boardStateSchema);


