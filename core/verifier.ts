import { evaluate } from 'mathjs';

// Verifier (DeepSeek stub): basic heuristics for code and math
export async function verifier(merged: { text: string; parts: string[] }) {
  const corrections: Array<{ type: string; message: string }> = [];
  let correctedText = merged.text;

  // Math check: find simple inline expressions like 2+2 or 3*4
  const mathMatches = merged.text.match(/\b\d+[+\-*/]\d+\b/g);
  if (mathMatches) {
    for (const expr of mathMatches) {
      try {
        const val = evaluate(expr);
        correctedText = correctedText.replace(expr, String(val));
      } catch (e: any) {
        corrections.push({ type: 'math', message: `Could not evaluate ${expr}` });
      }
    }
  }

  // Code check: naive check for unclosed code fences
  const fences = (merged.text.match(/```/g) || []).length;
  if (fences % 2 !== 0) {
    corrections.push({ type: 'code', message: 'Unbalanced code fence detected' });
    correctedText = correctedText + '\n\n```\n// end fence added by verifier\n```';
  }

  return { correctedText, corrections };
}

export default { verifier };
