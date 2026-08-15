import Anthropic from '@anthropic-ai/sdk';

/**
 * Every model call in this app goes through here, and here only lives in the
 * Worker. If you ever find yourself typing ANTHROPIC_API_KEY anywhere near
 * src/, stop — see handoff §0.1.
 */
export function makeClient(env) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured on this Worker.');
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

/** Pull the concatenated text out of a Messages response. */
export function textOf(response) {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Ask for JSON that conforms to a schema. Structured outputs constrain the
 * response format at the API level, so we get valid JSON without prompt
 * pleading or regex extraction.
 *
 * Schema rules: every object needs `additionalProperties: false` and a
 * `required` listing every property.
 */
export async function askForJson(client, { model, maxTokens, system, messages, schema, thinking, effort }) {
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: {
      format: { type: 'json_schema', schema },
      ...(effort ? { effort } : {}),
    },
  };
  if (thinking) params.thinking = thinking;

  const response = await client.messages.create(params);

  if (response.stop_reason === 'refusal') {
    throw new Error('model_refusal');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('max_tokens_truncated');
  }

  return JSON.parse(textOf(response));
}
