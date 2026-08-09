# Corpus index — the retrieval layer for a whole-knowledge harvest (single source of truth)

> Reads `${memory.store}` from `.claude/stack.md` (written by the `onboard` skill). This file owns
> the corpus-on-disk layout, the vector-store prerequisite, and the retrieval contract. Other skills,
> agents, commands, and loops **reference it — never restate it**.

A sweep of an entire backlog and an entire documentation space produces far more knowledge than any
context window holds. The corpus on disk solves *storage*. It does not solve *retrieval*: nothing
downstream can answer "what do we already know about X?" by reading ten thousand shards. That is what
the vector store is for.

## The four tiers

| Tier | Tool | Holds | Answers |
|---|---|---|---|
| **Corpus** (required) | files under `.claude/sdlc/corpus/` | Every swept record, verbatim and complete | "Give me the exact text of page 4471 / issue PROJ-88" |
| **Vector index** (required at scale) | `${memory.store}` — **qdrant** or **pgvector** | Chunk embeddings + metadata pointing at corpus paths | "Which of the ten thousand records bear on *this* requirement?" |
| **Graph** (recommended) | **graphify** (`${knowledge.graph}`) | Entities and edges across the corpus, clustered into communities | "What is connected to this, and what cluster does it belong to?" |
| **Vault** (optional, human-facing) | **obsidian** (`${knowledge.vault}`) | Linked Markdown mirror of the corpus + generated docs | "Let a human browse and edit what we harvested" |

The corpus is the source of truth; the index is the way in. Chunks are never the citation — always
resolve a hit back to its corpus path and quote from there, so a stale or partial embedding can never
put words into a requirement.

Vector search and the graph answer **different questions**, and neither substitutes for the other:
embeddings find things that *read* alike; the graph finds things that are *related* even when they
share no vocabulary — the ticket that never names the service it breaks. On a whole-knowledge harvest
the graph is also what surfaces the god nodes: the handful of pages and issues everything else hangs
off. Run both when graphify is available; vector search alone when it is not.

### Store options (`${memory.store}`)

| Store | Use when | Setup |
|---|---|---|
| **qdrant** | Default. Standalone, fastest to stand up, rich payload filtering | `docker run -d --name qdrant -p 6333:6333 -v "$(pwd)/.qdrant:/qdrant/storage" qdrant/qdrant` |
| **pgvector** | The project already runs Postgres (incl. Supabase) and you want one ops/backup story | `CREATE EXTENSION vector;` then an embeddings table with an HNSW index |

Both satisfy the prerequisite — pick per the project, not per habit. With pgvector, keep the harvest in
its **own schema** (e.g. `sdlc`), never mixed into application tables: the corpus is disposable and
regenerable, application data is not. If the project's database is shared or managed, the
`shared-database-discipline` plugin's rules apply to that schema like any other.

### Graph layer (graphify)

When graphify is available, build the graph **from the corpus, after indexing** — same inputs, so the
graph and the index can never disagree. Use it in the PRD phase to find the cluster a requirement
belongs to, to detect orphan requirements nothing else references, and to rank sources by centrality
so the document is anchored on the pages that actually matter rather than the ones retrieval happened
to surface first. Graphify writes its own output (`graphify-out/`); record that path in the run report
rather than copying it into the corpus.

Graphify is **recommended, not blocking** — its absence costs insight, not correctness. Say once that
it was unavailable, then continue.

### Vault mirror (obsidian)

When `${knowledge.vault}` names an Obsidian vault, mirror the harvest into it: one note per
requirement / decision / open question, wiki-linked (`[[PROJ-123]]`, `[[page-4471]]`) back to its
sources, plus the PRD and dev plan as notes. This is the human review surface — the corpus is
machine-shaped, and nobody reviews YAML shards. Write into a dated subfolder so a re-harvest never
clobbers a human's edits, and never delete or overwrite vault notes the pipeline did not create.

Optional and non-blocking; skip silently when unset.

## Vector store: required for a *complete* large harvest, never a blocker

**Thresholds.** Compute the corpus size after the sweeps report their totals:

- **< 300 records total** (issues + pages): the index is optional. Skip it and read the corpus
  directly; say so in the run report.
- **≥ 300 records**: the index is **required**. Without it, the PRD phase is sampling a corpus it
  cannot see — which produces a confident document built on whichever shards happened to be read.

**When the index is required and `${memory.store}` is `none`, warn and continue in degraded mode.**
Say it up front — before spending an hour on extraction — not in the closing summary:

> **No vector store is configured, so this harvest will be incomplete.** The sweep found `<N>`
> records — far more than fits in context. Without semantic retrieval, requirement extraction reads a
> prioritized subset of the corpus (canonical + current pages, requirement-kind issues, everything
> the sweep flagged as decision-bearing) rather than all of it. **Expect gaps, and expect them to be
> invisible in the output** — a sampled corpus produces a document that looks just as confident as a
> complete one.
>
> Everything swept is saved to `.claude/sdlc/corpus/` and is reused — installing a store and re-running
> resumes from the index step and re-sweeps nothing.
>
> Install one of the supported stores:
>
> ```bash
> # Qdrant (default — standalone, nothing else required)
> docker run -d --name qdrant -p 6333:6333 -p 6334:6334 \
>   -v "$(pwd)/.qdrant:/qdrant/storage" qdrant/qdrant
> ```
>
> ```sql
> -- pgvector (if this project already runs Postgres/Supabase)
> CREATE EXTENSION IF NOT EXISTS vector;
> ```
>
> Then set `memory.store` to `qdrant` or `pgvector` in `.claude/stack.md` (re-run `onboard`, or edit
> the **Vector memory / knowledge store** section), and re-run this pipeline.

Then proceed under the **degraded retrieval rule**, and record it:

```yaml
outcome: incomplete
missing: [vector-store]
degraded: "requirements extracted from a prioritized subset of <N> records, not the full corpus"
resume_from: index
```

Degraded retrieval is not free-for-all sampling — it is a stated, reproducible priority order:
`canonical` + `current` pages first, then requirement-kind and decision-bearing issues, then the rest
until the budget is gone. **Report how many records were actually read against the total**, so the gap
has a number rather than a caveat. Every requirement extracted this way still carries its citation;
what is unknown is what was never reached, and that is exactly what the count communicates.

## Collection layout

One collection per project per corpus generation, named from `${memory.collectionNaming}` when set,
else `sdlc-<project-slug>`. Never share a collection across projects: issue keys and page ids are
unique only within their own tracker/space, and a shared collection cross-contaminates retrieval with
another project's requirements.

Each chunk carries, at minimum:

```yaml
payload:
  source_type: issue | page
  source_id: "PROJ-123" | "4471"
  corpus_path: ".claude/sdlc/corpus/docs/<slug>/page-0043.yaml"   # the resolvable citation
  title: "..."
  doc_kind: "..." | null          # pages
  kind: "..." | null              # issues
  authority: canonical | draft | superseded | null
  freshness: current | aging | stale | null
  updated: "..."
  ancestors: []                   # pages: the ancestor path; issues: parent/epic chain
  chunk_index: 0
```

`authority` and `freshness` in the payload are not decoration — they are how the PRD phase weights a
hit. A `superseded`/`stale` page and a `canonical`/`current` page saying opposite things is the single
most common way a harvested PRD goes wrong, and the payload is what lets the conflict be *detected*
rather than silently resolved by retrieval order.

## Chunking

- Chunk by **semantic unit** first: an issue's description, each substantive comment, a page section
  under its heading. Never split a Gherkin block, an acceptance-criteria list, or a table across
  chunks — those are the units requirements are read from.
- Target ~1000 tokens with ~100 overlap for prose that has no natural boundary.
- Prefix every chunk's embedded text with its title and ancestor path. A chunk that reads
  "must be under 200ms" is useless; "Checkout > Performance > must be under 200ms" is retrievable.
- Skip `empty_shells` and `index`-kind pages — they add noise and retrieve above real content.

## Indexing is incremental and resumable

Track indexed records in `.claude/sdlc/state/index-cursor.json` (source id → content hash). On re-run,
embed only new or changed records. A re-sweep that re-embeds an unchanged corpus is pure cost, and on
a large knowledge base it is the most expensive mistake in the pipeline.

## Retrieval contract (how downstream phases use it)

Every phase that needs corpus knowledge queries the index rather than reading shards:

1. Query with the **requirement or question**, not with keywords.
2. Retrieve generously (top ~30), then **resolve each hit to its `corpus_path` and read the real
   record** before using it.
3. Prefer `canonical` + `current` on conflict — and **report the conflict** rather than silently
   picking a side. Contradictions between sources are findings the PRD must carry, not noise to
   suppress.
4. Cite `source_id` on every extracted requirement. An uncited requirement in the PRD is a
   hallucination that nobody can check.

When `${memory.store}` is configured, `memory-first` / `memory-validator` govern *how* you talk to the
store; this file governs *what* goes in it and *when* it is mandatory.
