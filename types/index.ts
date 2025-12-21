export type Category =
  | 'creative'
  | 'emotional'
  | 'code'
  | 'vision'
  | 'current'
  | 'math'
  | 'branding'
  | 'efficiency'
  | 'informative'
  | 'other'
  | 'fast';

export interface MessageRequest {
  userId?: string;
  text: string;
  stream?: boolean;
  meta?: any;
}

export interface ModelResponse {
  text: string;
  tokensUsed?: number;
  meta?: any;
}

export interface CallModelPayload {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  model?: string;
}

export * from './rex';
