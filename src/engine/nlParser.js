/**
 * nlParser.js
 *
 * Parses natural language discount rules.
 * Supports a local regex-based heuristic parser for immediate offline usage,
 * and a true Google Gemini LLM parser when an API key is available.
 */

/**
 * Parsed Discount Rule shape:
 * {
 *   ruleId: string,
 *   scope: "brand" | "platform" | "cart",
 *   appliesTo: string,
 *   type: "percentage" | "flat",
 *   value: number,
 *   stackable: boolean,
 *   minCartValue: number | null
 * }
 *
 * Ambiguity output shape:
 * {
 *   error: true,
 *   ambiguityReason: string
 * }
 */

export function parseRuleLocally(input) {
  const text = input.trim();
  const lowerText = text.toLowerCase();

  let scope = null;
  let appliesTo = '';
  let type = null;
  let value = null;
  let stackable = false;
  let minCartValue = null;

  // Check stackability
  if (lowerText.includes('stackable') || lowerText.includes('stack with') || lowerText.includes('on top')) {
    stackable = true;
  }

  // Parse value and type
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const flatMatch = text.match(/Rs\.?\s*([\d,]+)/i) || text.match(/(\d+(?:\.\d+)?)\s*(?:rupees|rs|flat)/i);

  if (pctMatch) {
    type = 'percentage';
    value = parseFloat(pctMatch[1]);
  } else if (flatMatch) {
    type = 'flat';
    value = parseFloat(flatMatch[1].replace(/,/g, ''));
  }

  // Validate value presence
  if (!value) {
    return {
      error: true,
      ambiguityReason: "Could not find a valid discount value (e.g., '10%' or 'Rs.150')."
    };
  }

  // Parse scope
  if (lowerText.includes('cart value') || lowerText.includes('cart total') || lowerText.includes('order value') || lowerText.includes('if cart total') || lowerText.includes('if cart value')) {
    scope = 'cart';
    const thresholdMatch = lowerText.match(/(?:more than|above|over|>=|exceeds)\s*(?:rs\.?\s*)?([\d,]+)/i) || lowerText.match(/(?:min|minimum|threshold)\s*(?:of\s*)?(?:rs\.?\s*)?([\d,]+)/i);
    if (thresholdMatch) {
      minCartValue = parseFloat(thresholdMatch[1].replace(/,/g, ''));
    } else {
      return {
        error: true,
        ambiguityReason: "Cart discount detected, but could not determine the threshold value (e.g. 'more than Rs.5,000')."
      };
    }
  } else {
    // Brand or platform scope
    const brandMatch = text.match(/(?:for|on|all)\s+([A-Za-z\s]+?)\s+brand/i) || text.match(/brand\s+([A-Za-z\s]+)/i);
    const platformMatch = text.match(/(?:on|for)\s+([A-Za-z\s]+?)\s+(?:items|platform|site|marketplace)/i);

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
      // Search for known keywords
      const knownBrands = ['Natura Casa', 'LivSpace Pro', 'Nordic Basics'];
      const knownPlatforms = ['Amazon India', 'Flipkart', 'Noon'];

      const foundBrand = knownBrands.find(b => lowerText.includes(b.toLowerCase()));
      const foundPlatform = knownPlatforms.find(p => lowerText.includes(p.toLowerCase()));

      if (foundBrand) {
        scope = 'brand';
        appliesTo = foundBrand;
      } else if (foundPlatform) {
        scope = 'platform';
        appliesTo = foundPlatform;
      } else {
        return {
          error: true,
          ambiguityReason: "Could not determine the scope (e.g., which brand or platform this applies to, or if it is a cart-level rule)."
        };
      }
    }
  }

  return {
    ruleId: 'NL-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
    scope,
    appliesTo,
    type,
    value,
    stackable,
    minCartValue
  };
}

export async function parseRuleWithLLM(input, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
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

Here are examples:
1. Input: "20% off for Natura Casa brand, stackable with other offers"
   Output: {"scope": "brand", "appliesTo": "Natura Casa", "type": "percentage", "value": 20, "stackable": true, "minCartValue": null, "ambiguityReason": null}

2. Input: "Rs.100 flat discount on all Flipkart items"
   Output: {"scope": "platform", "appliesTo": "Flipkart", "type": "flat", "value": 100, "stackable": false, "minCartValue": null, "ambiguityReason": null}

3. Input: "10% off if cart value is more than Rs.5,000"
   Output: {"scope": "cart", "appliesTo": null, "type": "percentage", "value": 10, "stackable": false, "minCartValue": 5000, "ambiguityReason": null}

4. Input: "Give a discount for big orders"
   Output: {"scope": null, "appliesTo": null, "type": null, "value": null, "stackable": false, "minCartValue": null, "ambiguityReason": "The rule is too ambiguous: it does not specify the discount value (e.g., 10%) or the threshold cart value (e.g., Rs.5,000). Please be more specific."}
`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemPrompt },
          { text: `Input text to parse: "${input}"` }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          scope: { type: "STRING", enum: ["brand", "platform", "cart"] },
          appliesTo: { type: "STRING" },
          type: { type: "STRING", enum: ["percentage", "flat"] },
          value: { type: "NUMBER" },
          stackable: { type: "BOOLEAN" },
          minCartValue: { type: "NUMBER" },
          ambiguityReason: { type: "STRING" }
        }
      }
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const textContent = json.candidates[0].content.parts[0].text;
  const parsed = JSON.parse(textContent);

  if (parsed.ambiguityReason) {
    return {
      error: true,
      ambiguityReason: parsed.ambiguityReason
    };
  }

  return {
    ruleId: 'NL-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
    scope: parsed.scope,
    appliesTo: parsed.appliesTo || '',
    type: parsed.type,
    value: parsed.value,
    stackable: parsed.stackable || false,
    minCartValue: parsed.minCartValue || null
  };
}
