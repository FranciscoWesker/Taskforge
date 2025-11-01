import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface MessageDocument extends Document {
  boardId: string;
  author: string;
  text: string;
  ts: number; // epoch ms
}

const messageSchema = new Schema<MessageDocument>({
  boardId: { type: String, index: true, required: true },
  author: { type: String, required: true },
  text: { type: String, required: true },
  ts: { type: Number, index: true, required: true }
}, { versionKey: false });

export const MessageModel: Model<MessageDocument> = mongoose.models.Message || mongoose.model<MessageDocument>('Message', messageSchema);


