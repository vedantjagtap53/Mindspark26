# payoff-ai: RAG + LLM layer (PRD v2, section 7.3)

Stack: LangChain + Gemini API. LLM code lives in `rag/llm/`, retrieval in `rag/kb/`.

## Parts
1. Scaffold, config, Gemini clients, input contract (`SimulationContext`)  <- done
2. Knowledge base: product notes, policy draft, glossary; ingestion, Chroma store, retriever  <- done
3. Explainer chain: prompt, structured output, guardrails, number-grounding check  <- done
4. Chat: grounded follow-ups, history, out-of-scope handling  <- done
5. API endpoints (`explain`, `chat`), tests and eval  <- done

## Setup
    pip install -r requirements.txt
    cp .env.example .env            # add GOOGLE_API_KEY
    python -m rag.llm.smoke         # Gemini connectivity
    python -m rag.kb.build --rebuild  # build the vector index (rebuild after editing docs)
    pytest                          # offline, uses fake embeddings
    python -m rag.llm.demo          # explainer on a sample (needs key + built index)
    python -m rag.llm.chat_demo     # terminal chat on the sample
    uvicorn rag.api.app:app --port 8001   # AI service
    python -m rag.eval.run          # live eval (needs key + index)

## Knowledge base
Markdown files under `rag/knowledge/` with frontmatter (`product`: ELN|DCD|CPN|all, `doc_type`: product_note|policy|glossary).
`policy/suitability_policy.md` is a DRAFT from the PRD rules; replace with the real policy text.

## Explainer
`from rag.llm.explainer import Explainer` (not re-exported from `rag.llm` to avoid an import cycle).
`Explainer().explain(ctx)` returns an `Explanation` with `checks_passed`, `ungrounded_numbers`, `guardrail_violations`.

## Chat
`from rag.llm.chat import Chatbot`; `Chatbot().answer(ctx, question, history)` returns a `ChatAnswer`.
Stateless: the API sends the last few turns each request. Out-of-scope gets a fixed decline; a failed check returns a fixed fallback, never the unchecked text.

## API (stateless; the backend sends the full SimulationContext each time)
| Endpoint | Body | Returns |
|---|---|---|
| GET /health | - | status, model |
| GET /ready | - | index chunk count (503 if empty) |
| POST /explain | SimulationContext | Explanation |
| POST /chat | {context, question, history[]} | ChatAnswer |

Set `SERVICE_API_KEY` to require `X-API-Key`. `/explain` returns 200 with `checks_passed=false` if the
checks still fail after the retry; the backend should not show those sections unchecked.
502 = LLM failure; 422 = invalid input (tenor range, barrier, Mode A/B consistency).

## Eval
`rag/eval/cases.py` has 5 simulations (ELN A/B, DCD B, CPN A/B) and 11 chat questions.
`python -m rag.eval.run --min-pass 0.9` exits 1 below the threshold.
