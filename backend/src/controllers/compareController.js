const { GoogleGenAI, Type } = require('@google/genai');

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Gemini models, tried in order
const MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

// In-memory cache to avoid redundant API calls
const compareCache = new Map();
const MAX_CACHE_SIZE = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Schema matching the frontend's renderResults()
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    winnerBadge: {
      type: Type.OBJECT,
      properties: {
        winnerName: { type: Type.STRING },
        winnerChoice: { type: Type.STRING, enum: ['Product A', 'Product B', 'Tie'] },
        reason: { type: Type.STRING },
      },
      required: ['winnerName', 'winnerChoice', 'reason'],
    },
    overallRating: {
      type: Type.OBJECT,
      properties: {
        scoreA: { type: Type.NUMBER },
        scoreB: { type: Type.NUMBER },
      },
      required: ['scoreA', 'scoreB'],
    },
    aiSummary: { type: Type.STRING },
    prosCons: {
      type: Type.OBJECT,
      properties: {
        productA: {
          type: Type.OBJECT,
          properties: {
            pros: { type: Type.ARRAY, items: { type: Type.STRING } },
            cons: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['pros', 'cons'],
        },
        productB: {
          type: Type.OBJECT,
          properties: {
            pros: { type: Type.ARRAY, items: { type: Type.STRING } },
            cons: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['pros', 'cons'],
        },
      },
      required: ['productA', 'productB'],
    },
    bestFor: {
      type: Type.OBJECT,
      properties: {
        productA: { type: Type.ARRAY, items: { type: Type.STRING } },
        productB: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['productA', 'productB'],
    },
    aiRecommendation: { type: Type.STRING },
    comparisonTable: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          feature: { type: Type.STRING },
          product1: { type: Type.STRING },
          product2: { type: Type.STRING },
        },
        required: ['feature', 'product1', 'product2'],
      },
    },
  },
  required: [
    'winnerBadge',
    'overallRating',
    'aiSummary',
    'prosCons',
    'bestFor',
    'aiRecommendation',
    'comparisonTable',
  ],
};

async function callGeminiWithFallback(prompt) {
  let lastError = null;

  for (const modelName of MODELS) {
    try {
      console.log(`[Gemini Request] Attempting with model: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        },
      });

      const text = response.text;
      if (!text) throw new SyntaxError('Empty response from model');
      return JSON.parse(text);
    } catch (err) {
      lastError = err;
      const msg = err?.message || '';
      const status = err?.status;

      const isRateLimit = status === 429 || /429/.test(msg);
      const isNotFound = status === 404 || /not found/i.test(msg);
      const isTemporary =
        status === 500 || status === 503 || /503|overloaded|unavailable/i.test(msg);
      const isBadOutput = err instanceof SyntaxError;

      if (isRateLimit || isTemporary) {
        console.warn(`⚠️ ${modelName} busy (${status || 'error'}). Trying next model...`);
        await sleep(1500);
      } else if (isNotFound || isBadOutput) {
        console.warn(
          `⚠️ ${modelName} unusable (${isNotFound ? 'not found' : 'bad output'}). Trying next model...`
        );
      } else {
        // Non-recoverable error (e.g. invalid API key, invalid request)
        throw err;
      }
    }
  }

  throw lastError;
}

// Order-sensitive key: A-vs-B and B-vs-A must NOT share a cache entry,
// because the result stores scoreA / productA / "Product A" by position.
function getCacheKey(itemA, itemB, category, purpose) {
  return [itemA, itemB, category || '', purpose || '']
    .map((s) => String(s).toLowerCase().trim())
    .join('::');
}

async function compare(req, res) {
  try {
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY missing in environment variables.' });
    }

    const { productA, productB, category, purpose, forceRefresh } = req.body || {};

    if (!productA || !productB) {
      return res.status(400).json({ error: 'productA and productB are required.' });
    }

    const cacheKey = getCacheKey(productA, productB, category, purpose);
    if (!forceRefresh && compareCache.has(cacheKey)) {
      console.log(`⚡ [Cache Hit] "${productA}" vs "${productB}"`);
      return res.json(compareCache.get(cacheKey));
    }

    const userPrompt = `
You are an expert unbiased shopping assistant comparing two products.

Product 1 (Product A): ${productA}
Product 2 (Product B): ${productB}
Category: ${category || 'General'}
User Purpose: ${purpose || 'General Use'}

INSTRUCTIONS:
1. Provide accurate specs, ratings out of 5.0 (e.g., 4.4, 4.7), pricing in INR (₹) or standard value, pros/cons, and target audiences.
2. For rating stars in the comparison table, use star emojis (e.g. ⭐⭐⭐⭐⭐ or ⭐⭐⭐⭐).
3. Evaluate both products neutrally without positional bias.
`.trim();

    const data = await callGeminiWithFallback(userPrompt);

    if (compareCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = compareCache.keys().next().value;
      compareCache.delete(oldestKey);
    }
    compareCache.set(cacheKey, data);

    return res.json(data);
  } catch (err) {
    console.error('Gemini API Error:', err?.message || err);

    const isRateLimit = err?.status === 429 || /429/.test(err?.message || '');
    if (isRateLimit) {
      return res.status(429).json({
        error: 'All Gemini API models hit rate limits. Please wait 30-60 seconds before trying again.',
      });
    }

    return res.status(500).json({
      error: `Failed to generate comparison: ${err?.message || 'unknown error'}`,
    });
  }
}

module.exports = { compare };