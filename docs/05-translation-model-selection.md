# Translation model selection (NVIDIA NIM)

_Empirical benchmark, 2026-07-06/07. Goal: pick the best model for Arabic
translation on the NVIDIA free tier — quality + speed + instruction-compliance._

## Method

Same system prompt as production (`translate.js`): translate a JSON array of
English segments into Arabic, return a **raw JSON array** (no fences/commentary),
فصحى وسطى, no tashkeel, keep technical terms in Latin. Measured wall-clock
latency and whether the output parsed to an array of the correct length. Two
representative samples (AI-agents prose, transformer prose), multiple runs.

## Candidates (exact NVIDIA IDs)

`deepseek-ai/deepseek-v4-flash`, `deepseek-ai/deepseek-v4-pro`,
`minimaxai/minimax-m3`, `moonshotai/kimi-k2.6`, `z-ai/glm-5.2`.

## Results

| Model | Correctness | Latency | Instruction-compliance | Notes |
|---|---|---|---|---|
| **z-ai/glm-5.2** ✅ | 3/3 every clean run | **3.6–7 s (fastest stable)** | **Excellent** — raw JSON, no fences/notes | Winner |
| deepseek-ai/deepseek-v4-pro | 3/3 | 5–18 s (variable) | Good — sometimes wraps in ```json | Fallback |
| deepseek-ai/deepseek-v4-flash | rate-limited | — | — | Free-tier worker saturated (48/48) |
| minimaxai/minimax-m3 | unavailable | — | — | "DEGRADED function" |
| moonshotai/kimi-k2.6 | poor | 9 s+ | Bad — adds commentary / degenerates | — |

## Decision

- **Primary: `z-ai/glm-5.2`.** Best balance: excellent فصحى quality, keeps
  technical terms in Latin, fastest stable latency, and — decisively — returns a
  clean raw JSON array, which our parser needs for reliability.
- **Fallback: `deepseek-ai/deepseek-v4-pro`** (equal quality, slower).

## Free-tier instability → built-in robustness

The NVIDIA free tier intermittently returns 503 (ResourceExhausted), 400
(DEGRADED), latency spikes, or malformed/empty arrays. `translate.js` therefore:
retries transient failures (5xx/429/exhausted/parse) up to 3× per model with
backoff, then falls back to the secondary model. Endpoint/model/key are
configurable in settings.

## End-to-end verification

`translateHtml()` was run headlessly (jsdom) against the live NVIDIA API: a real
HTML article → glm-5.2 → reassembled HTML in ~5 s, structure preserved (tags
intact), Arabic RTL output, technical terms kept Latin. Confirmed working.
