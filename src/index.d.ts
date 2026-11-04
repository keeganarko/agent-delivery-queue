export type MessageState =
  | "queued"
  | "previewed"
  | "held"
  | "released"
  | "delivered"
  | "seen"
  | "replied"
  | "cancelled";

export declare const STATES: readonly MessageState[];

export interface MessageSnapshot<T = unknown> {
  id: string;
  payload: T;
  state: MessageState;
  enqueuedAt: number;
}

export declare class DeliveryQueue<T = unknown> {
  constructor(options?: { capacity?: number });
  readonly capacity: number;
  readonly size: number;
  readonly typing: boolean;
  enqueue(payload: T): string;
  setTyping(isTyping: boolean): void;
  preview(): MessageSnapshot<T>[];
  deliverNext(handler: (payload: T) => void): MessageSnapshot<T> | null;
  markSeen(id: string): MessageSnapshot<T>;
  markReplied(id: string): MessageSnapshot<T>;
  cancel(id: string): MessageSnapshot<T>;
  get(id: string): MessageSnapshot<T> | undefined;
  list(): MessageSnapshot<T>[];
  onChange(fn: (snapshot: MessageSnapshot<T>) => void): () => boolean;
}
