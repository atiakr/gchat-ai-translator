import type { TranslateRequest } from '../engine/types';

/** 대상 언어 코드 → 프롬프트에 적을 영어 이름. 모르는 코드는 코드 그대로. */
const LANGUAGE_NAMES: Record<string, string> = {
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export interface PromptOptions {
  /** 구조화 출력 없이 프롬프트만으로 JSON 을 요구하는 폴백 모드. */
  jsonInPrompt?: boolean;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

/** 모델이 돌려줘야 하는 출력의 JSON 스키마(strict 호환: 모든 필드 required, 추가 속성 금지). */
export function buildOutputSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The id of the input item, copied verbatim.' },
            detected_lang: {
              type: 'string',
              description:
                'ISO 639-1 lowercase code of the source language (e.g. en, ja, zh-CN). "und" if unknown.',
            },
            same_language: {
              type: 'boolean',
              description: 'true when the source language equals the target language.',
            },
            translation: { type: 'string', description: 'The translated text.' },
          },
          required: ['id', 'detected_lang', 'same_language', 'translation'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };
}

export function buildSystemPrompt(request: TranslateRequest, options: PromptOptions = {}): string {
  const target = `${languageName(request.targetLang)} (${request.targetLang})`;
  const lines: string[] = [
    `You are a translation engine for chat messages. Translate each message into ${target}.`,
    '',
    'Rules:',
    '- Translate each message independently; messages are unrelated to one another.',
    '- Write natural, conversational text that fits a chat context. Keep the tone and register of the original.',
    '- Do NOT translate or alter URLs (links), @mentions, code blocks, or inline code. Keep them exactly as they are.',
    '- Output only the translation. No explanations, notes, or comments.',
    '- Detect the language of each original message and report it as an ISO 639-1 lowercase code in detected_lang (use zh-CN / zh-TW for Chinese variants, "und" if unknown).',
    `- Set same_language to true when the original is already written in ${target}.`,
  ];
  if (request.mode === 'outgoing') {
    lines.push(
      '- Always return a translation, even when same_language is true (rewrite it naturally in the target language).',
    );
  } else {
    lines.push(
      '- When same_language is true, translation may be an empty string or the original text.',
    );
  }
  const instructions = request.instructions.trim();
  if (instructions) {
    lines.push('', 'Additional instructions from the user:', instructions);
  }
  lines.push(
    '',
    'Output format: a JSON object { "items": [ { "id", "detected_lang", "same_language", "translation" } ] }',
    'with exactly one entry per input item, in the same order, with the same ids.',
  );
  if (options.jsonInPrompt) {
    lines.push(
      'Respond with only the JSON object. No markdown code fences, no text before or after it.',
    );
  }
  return lines.join('\n');
}

export function buildUserPrompt(request: TranslateRequest): string {
  const payload = { items: request.items.map(({ id, text }) => ({ id, text })) };
  return `Translate these messages:\n${JSON.stringify(payload)}`;
}

export function buildPrompt(request: TranslateRequest, options: PromptOptions = {}): BuiltPrompt {
  return {
    system: buildSystemPrompt(request, options),
    user: buildUserPrompt(request),
    schema: buildOutputSchema(),
  };
}
