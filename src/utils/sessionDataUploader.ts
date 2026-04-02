import type { Message } from '../types/message.js';

export function createSessionTurnUploader():
  | ((messages: Message[]) => void | Promise<void>)
  | null {
  return null;
}
