import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface CardCommentDocument extends Document {
  cardId: string;
  boardId: string;
  author: string;
  text: string;
  ts: number; // epoch ms
  edited?: boolean;
  editedAt?: number;
}

const cardCommentSchema = new Schema<CardCommentDocument>({
  cardId: { type: String, index: true, required: true },
  boardId: { type: String, index: true, required: true },
  author: { type: String, required: true },
  text: { type: String, required: true },
  ts: { type: Number, index: true, required: true },
  edited: { type: Boolean, default: false },
  editedAt: { type: Number }
}, { versionKey: false });

// Índice compuesto para búsquedas rápidas por tarjeta
cardCommentSchema.index({ cardId: 1, ts: 1 });

export const CardCommentModel: Model<CardCommentDocument> = 
  mongoose.models.CardComment || 
  mongoose.model<CardCommentDocument>('CardComment', cardCommentSchema);

