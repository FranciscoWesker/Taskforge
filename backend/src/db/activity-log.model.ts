import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ActivityAction =
  | 'card_created'
  | 'card_updated'
  | 'card_deleted'
  | 'card_moved'
  | 'card_assigned'
  | 'card_unassigned'
  | 'card_priority_changed'
  | 'card_due_date_set'
  | 'card_due_date_removed'
  | 'card_label_added'
  | 'card_label_removed'
  | 'card_checklist_item_added'
  | 'card_checklist_item_completed'
  | 'card_checklist_item_deleted'
  | 'label_created'
  | 'label_updated'
  | 'label_deleted'
  | 'board_renamed'
  | 'board_member_added'
  | 'board_member_removed'
  | 'board_wip_limit_changed'
  | 'comment_added'
  | 'comment_updated'
  | 'comment_deleted';

export interface ActivityLogDocument extends Document {
  boardId: string;
  userId: string; // Email del usuario
  action: ActivityAction;
  entityType: 'card' | 'label' | 'board' | 'comment' | 'checklist';
  entityId?: string; // ID de la entidad (cardId, labelId, etc.)
  details?: {
    cardTitle?: string;
    cardId?: string;
    fromList?: 'todo' | 'doing' | 'done';
    toList?: 'todo' | 'doing' | 'done';
    field?: string; // Campo que cambió (priority, assignee, dueDate, etc.)
    oldValue?: unknown;
    newValue?: unknown;
    labelName?: string;
    labelColor?: string;
    memberEmail?: string;
    commentText?: string;
    checklistItemText?: string;
    wipLimits?: { todo?: number; doing?: number; done?: number };
    boardName?: string;
  };
  timestamp: number;
}

const activityLogSchema = new Schema<ActivityLogDocument>({
  boardId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  action: { type: String, required: true, index: true },
  entityType: { type: String, required: true, enum: ['card', 'label', 'board', 'comment', 'checklist'] },
  entityId: { type: String, index: true },
  details: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Number, required: true, index: true }
}, { versionKey: false });

// Índice compuesto para búsquedas eficientes
activityLogSchema.index({ boardId: 1, timestamp: -1 });
activityLogSchema.index({ boardId: 1, action: 1, timestamp: -1 });
activityLogSchema.index({ boardId: 1, entityType: 1, entityId: 1, timestamp: -1 });

export const ActivityLogModel: Model<ActivityLogDocument> =
  mongoose.models.ActivityLog || mongoose.model<ActivityLogDocument>('ActivityLog', activityLogSchema);

