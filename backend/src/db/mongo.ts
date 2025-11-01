import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer: MongoMemoryServer | null = null;

export async function connectMongo(uri: string): Promise<void> {
  let effectiveUri = uri;
  const useMemory = process.env.USE_MEM_MONGO === 'true';
  if (useMemory) {
    // eslint-disable-next-line no-console
    console.log('Iniciando MongoDB en memoria...');
    try {
      memoryServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'taskforge',
        },
      });
      effectiveUri = memoryServer.getUri();
      // eslint-disable-next-line no-console
      console.log(`MongoDB en memoria iniciado: ${effectiveUri}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error iniciando MongoDB en memoria:', err);
      throw err;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Conectando a MongoDB: ${effectiveUri}`);
  await mongoose.connect(effectiveUri);
  // eslint-disable-next-line no-console
  console.log('MongoDB conectado exitosamente');
}


