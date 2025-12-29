import logger from '../../logger';
import type { CallModelPayload, ModelResponse } from '@/types';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1';

export async function callModel(
  payload: CallModelPayload
): Promise<ModelResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const {
    prompt,
    model,
    maxTokens = 512,
    temperature = 0.7
  } = payload;

  const url = `${GEMINI_ENDPOINT}/models/${model}:generateContent`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  };

  logger.info({
    event: 'gemini_request',
    model,
    endpoint: url
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();

  if (!res.ok) {
    logger.error({
      event: 'gemini_error',
      status: res.status,
      response: json
    });
    throw new Error(JSON.stringify(json));
  }

  const text =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return {
    text,
    tokensUsed: json?.usageMetadata?.totalTokenCount ?? 0,
    meta: json?.usageMetadata
  };
}
