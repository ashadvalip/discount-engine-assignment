/**
 * nlParser.js
 *
 * Parses natural language discount rules.
 * Supports a local regex-based heuristic parser for immediate offline usage,
 * and a Google Gemini 2.5 Flash LLM parser with strict JSON schema validation
 * when an API key is available.
 */

/**
 * Validates any parsed rule object (from either LLM or local regex) before
 * allowing it into the discount engine.
 *
 * @param {Object} rule
 * @returns {string | null} Error message if invalid, or null if valid.
 */
function validateParsedRule(rule) {
  const validScopes = ['brand', 'platform', 'cart'];
  const validTypes = ['percentage', 'flat'];

  if (!rule || typeof rule !== 'object') {
    return 'Parser returned an empty or malformed rule object.';
  }
  if (!validScopes.includes(rule.scope)) {
    return 'Rule scope must be "brand", "platform", or "cart".';
  }
  if (!validTypes.includes(rule.type)) {
    return 'Discount type must be "percentage" or "flat".';
  }
  if (typeof rule.value !== 'number' || Number.isNaN(rule.value) || rule.value <= 0) {
    return 'Discount value must be a positive number.';
  }
  if (rule.type === 'percentage' && rule.value > 100) {
    return 'Percentage discount cannot exceed 100%.';
  }
  if ((rule.scope === 'brand' || rule.scope === 'platform') && !String(rule.appliesTo || '').trim()) {
    return `Missing target ${rule.scope} name.`;
  }
  if (rule.scope === 'cart') {
    if (
      typeof rule.minCartValue !== 'number' ||
      Number.isNaN(rule.minCartValue) ||
      rule.minCartValue <= 0
    ) {
      return 'Cart-level rules require a positive minimum cart value threshold (e.g., Rs.5,000).';
    }
  }
  return null;
}

/**
 * Generates a unique rule ID for natural-language rules.
 */
function generateRuleId() {
  return 'NL-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

/**
 * Deterministic offline regex parser for natural language discount rules.
 */
export function parseRuleLocally(input) {
  const text = String(input || '').trim();
  if (!text) {
    return {
      error: true,
      ambiguityReason: 'Please enter a discount rule description.'
    };
  }

  const lowerText = text.toLowerCase();

  let scope = null;
  let appliesTo = '';
  let type = null;
  let value = null;
  let stackable = false;
  let minCartValue = null;

  // Check stackability
  if (
    lowerText.includes('stackable') ||
    lowerText.includes('stack with') ||
    lowerText.includes('on top')
  ) {
    stackable = true;
  }

  // Parse value and type
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const flatMatch =
    text.match(/(?:rs\.?|₹)\s*([\d,]+(?:\.\d+)?)/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*(?:rupees|rs|flat)/i);

  if (pctMatch) {
    type = 'percentage';
    value = parseFloat(pctMatch[1]);
  } else if (flatMatch) {
    type = 'flat';
    value = parseFloat(flatMatch[1].replace(/,/g, ''));
  }

  if (!value || value <= 0) {
    return {
      error: true,
      ambiguityReason: "Could not find a valid discount value (e.g., '10%' or 'Rs.150')."
    };
  }

  // Parse scope
  if (
    lowerText.includes('cart value') ||
    lowerText.includes('cart total') ||
    lowerText.includes('order value') ||
    lowerText.includes('entire cart') ||
    lowerText.includes('if cart')
  ) {
    scope = 'cart';
    const thresholdMatch =
      lowerText.match(
        /(?:more than|greater than|above|over|>=|exceeds|exceeding|at least)\s*(?:rs\.?\s*|₹\s*)?([\d,]+)/i
      ) ||
      lowerText.match(/(?:min|minimum|threshold)\s*(?:of\s*)?(?:rs\.?\s*|₹\s*)?([\d,]+)/i);

    if (thresholdMatch) {
      minCartValue = parseFloat(thresholdMatch[1].replace(/,/g, ''));
    } else {
      return {
        error: true,
        ambiguityReason:
          "Cart discount detected, but could not determine the threshold value (e.g., 'more than Rs.5,000')."
      };
    }
  } else {
    // Brand or platform scope
    const brandMatch =
      text.match(/(?:for|on|all)\s+([A-Za-z0-9\s]+?)\s+brand/i) ||
      text.match(/brand\s+([A-Za-z0-9\s]+)/i);
    const platformMatch = text.match(
      /(?:on|for|all)\s+([A-Za-z0-9\s]+?)\s+(?:items|products|platform|site|marketplace)/i
    );

    if (brandMatch) {
      scope = 'brand';
      appliesTo = brandMatch[1].trim();
    } else if (platformMatch) {
      scope = 'platform';
      appliesTo = platformMatch[1].trim();
      if (appliesTo.toLowerCase() === 'amazon') {
        appliesTo = 'Amazon India';
      }
    } else {
      const knownBrands = ['Natura Casa', 'LivSpace Pro', 'Nordic Basics'];
      const knownPlatforms = ['Amazon India', 'Flipkart', 'Noon'];

      const foundBrand = knownBrands.find((b) => lowerText.includes(b.toLowerCase()));
      const foundPlatform = knownPlatforms.find((p) => lowerText.includes(p.toLowerCase()));

      if (foundBrand) {
        scope = 'brand';
        appliesTo = foundBrand;
      } else if (foundPlatform) {
        scope = 'platform';
        appliesTo = foundPlatform;
      } else {
        return {
          error: true,
          ambiguityReason:
            'Could not determine the scope (specify a brand, a platform, or a minimum cart value).'
        };
      }
    }
  }

  const candidate = {
    ruleId: generateRuleId(),
    scope,
    appliesTo: scope === 'cart' ? '' : appliesTo,
    type,
    value,
    stackable,
    minCartValue: scope === 'cart' ? minCartValue : null
  };

  const validationError = validateParsedRule(candidate);
  if (validationError) {
    return {
      error: true,
      ambiguityReason: validationError
    };
  }

  return candidate;
}

/**
 * Parses a plain English discount rule using Google Gemini 2.5 Flash
 * with structured JSON output and runtime validation.
 */
export async function parseRuleWithLLM(input, apiKey) {
  const cleanInput = String(input || '').trim();
  if (!cleanInput) {
    return {
      error: true,
      ambiguityReason: 'Please enter a discount rule description.'
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    apiKey.trim()
  )}`;

  const systemPrompt = `You are an AI assistant that parses plain English e-commerce discount rules into a structured JSON format.
Analyze the input text carefully.

Output JSON conforming to the following structure:
{
  "scope": "brand" | "platform" | "cart",
  "appliesTo": "Name of Brand or Platform" | null,
  "type": "percentage" | "flat",
  "value": number (percentage or flat amount in Rs),
  "stackable": boolean,
  "minCartValue": number | null (minimum cart value required, only if scope is cart),
  "ambiguityReason": string | null (if the rule is ambiguous, incomplete, or lacks a value/threshold, explain why. Otherwise, null)
}

Guidelines:
- "scope" must be either "brand", "platform", or "cart".
- "appliesTo" is the brand/platform name (e.g., "Natura Casa", "Flipkart", "Amazon India"). For cart scope, it must be null.
- "type" must be "percentage" (for rules like "10% off") or "flat" (for rules like "Rs.100 off").
- "value" is a positive number.
- "stackable" is true if the text indicates it can stack with other offers/rules, false otherwise.
- "minCartValue" is a positive number representing the threshold cart value (in Rs) for "cart" scope rules.
- If the rule is vague (e.g. "Give a discount for big orders" which doesn't specify a value or a threshold), set "ambiguityReason" to a friendly explanation of what is missing. Do not populate the other fields if ambiguous.

Examples:
1. Input: "20% off for Natura Casa brand, stackable with other offers"
   Output: {"scope": "brand", "appliesTo": "Natura Casa", "type": "percentage", "value": 20, "stackable": true, "minCartValue": null, "ambiguityReason": null}

2. Input: "Rs.100 flat discount on all Flipkart items"
   Output: {"scope": "platform", "appliesTo": "Flipkart", "type": "flat", "value": 100, "stackable": false, "minCartValue": null, "ambiguityReason": null}

3. Input: "10% off if cart value is more than Rs.5,000"
   Output: {"scope": "cart", "appliesTo": null, "type": "percentage", "value": 10, "stackable": false, "minCartValue": 5000, "ambiguityReason": null}

4. Input: "Give a discount for big orders"
   Output: {"scope": null, "appliesTo": null, "type": null, "value": null, "stackable": false, "minCartValue": null, "ambiguityReason": "The rule is too ambiguous: it does not specify the discount value (e.g., 10%) or the threshold cart value (e.g., Rs.5,000). Please be more specific."}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt },
          { text: `Input text to parse: "${cleanInput}"` }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          scope: { type: 'STRING', enum: ['brand', 'platform', 'cart'] },
          appliesTo: { type: 'STRING' },
          type: { type: 'STRING', enum: ['percentage', 'flat'] },
          value: { type: 'NUMBER' },
          stackable: { type: 'BOOLEAN' },
          minCartValue: { type: 'NUMBER' },
          ambiguityReason: { type: 'STRING' }
        }
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const textContent = json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('Gemini API returned an empty response.');
  }

  let parsed;
  try {
    parsed = JSON.parse(textContent);
  } catch {
    throw new Error('Failed to parse JSON returned by Gemini API.');
  }

  if (parsed.ambiguityReason) {
    return {
      error: true,
      ambiguityReason: parsed.ambiguityReason
    };
  }

  const candidate = {
    ruleId: generateRuleId(),
    scope: parsed.scope,
    appliesTo: parsed.scope === 'cart' ? '' : String(parsed.appliesTo || '').trim(),
    type: parsed.type,
    value: parsed.value,
    stackable: Boolean(parsed.stackable),
    minCartValue: parsed.scope === 'cart' ? parsed.minCartValue : null
  };

  const validationError = validateParsedRule(candidate);
  if (validationError) {
    return {
      error: true,
      ambiguityReason: `Invalid rule returned by LLM: ${validationError}`
    };
  }

  return candidate;
}