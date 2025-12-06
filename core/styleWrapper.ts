import openai from './models/openai';

export async function styleWrapper(merged: { text: string }, opts: { xtreetTone?: boolean } = {}) {
  // If XTreet tone requested, ask model to rewrite concisely
  if (!opts.xtreetTone) return merged.text;

  const prompt = `Reescribe el siguiente texto en un tono minimal, frío, cinematográfico y disciplinado. Usa oraciones cortas y mantén el significado:\n\n${merged.text}`;
  try {
    const res = await openai.callModel({ prompt, maxTokens: 300, temperature: 0.35 });
    return res.text;
  } catch (e) {
    // Fallback: return original
    return merged.text;
  }
}

export default { styleWrapper };
