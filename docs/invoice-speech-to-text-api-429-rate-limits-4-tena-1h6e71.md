# Invoice Speech-to-Text API 429 Rate Limits — 4 Tenant Cost Boundaries

TL;DR: Put each tenant's invoice-audio jobs behind a durable queue, charge usage from measured audio duration, and treat a 429 response as an admission-control signal. Honor a valid `Retry-After` value; otherwise apply capped exponential backoff with jitter. The least complex useful design is one worker pool, one per-tenant ledger, and four controls: fair admission, delayed retries, idempotent completion, and bounded evidence retention.

The bill is mostly driven by work admitted, not HTTP request count. Track audio seconds accepted, attempted, and completed per tenant before tuning concurrency. A ten-minute recording retried three times represents far more processing exposure than three ten-second clips, even though both produce three attempts. That distinction is what makes cost explainable to a fintech customer and keeps one noisy tenant from consuming the shared retry budget.

Count seconds first.

## How should a speech-to-text API queue handle 429 rate limits?

HTTP 429 means the client sent too many requests in a given amount of time. The response may include `Retry-After`, which can be either a delay in seconds or an HTTP date. It does not prove that the audio is invalid, and it does not grant permission to retry immediately from every worker.

Parse both header forms. If the date is already in the past, use zero as the server-supplied delay, then still pass the job through the local scheduler. If the header is absent or malformed, calculate a capped exponential delay and add random jitter. Jitter matters because identical workers otherwise wake together and recreate the same burst.

Do not sleep while holding a worker slot. Persist `next_attempt_at`, release the slot, and let a delayed-job scheduler make the item eligible later. Tiny detail, large effect. A process restart then preserves the wait, while an in-memory sleep loses both the schedule and a clean audit trail.

Release the slot.

## Meter the dominant term before raising concurrency

For supplier-invoice extraction, the useful ledger joins tenant identity, source object, measured audio duration, attempt number, response class, and final extraction state. Keep the raw provider response out of the cost key. Retries can change transport metadata without changing the business job.

| Ledger field | Why it exists | Retention choice |
|---|---|---|
| `tenant_id` and `job_id` | Attribute spend and deduplicate completion | Keep with the financial audit record |
| `audio_seconds` | Measure admitted and completed work | Keep the numeric measurement |
| `attempt_count` and status class | Explain retry amplification | Keep aggregate attempt facts |
| Raw audio | Reproduce recognition disputes | Delete on a short, declared schedule |
| Full transcript | Support field-level review | Retain only as policy and consent permit |

This ledger exposes the ratio that matters: attempted audio seconds divided by completed audio seconds, grouped by tenant. It is an operational ratio, not a vendor price claim. If it rises, first inspect retry scheduling, duplicate submission, and poison jobs. More concurrency can make all three worse.

Compliance changes the shape of the queue. Invoice recordings and transcripts can contain names, account details, tax identifiers, and addresses. Encrypt queued object references, restrict tenant access at every read, and define deletion independently for raw audio, transcript text, extracted fields, and aggregate usage. Consider a concrete month-end batch: tenant A submits 60 recordings of ten minutes each, tenant B submits 600 clips of one minute each, and both represent 600 audio minutes. Request counts differ by 10 times, but admitted duration does not. If tenant B's clips each retry once while tenant A's files finish on the first attempt, the ledger must show 1,200 attempted minutes for B and 600 for A. These are illustrative queue inputs, not benchmark results or price estimates; their purpose is to expose why request-based cost allocation fails. Keeping everything forever makes debugging easier, especially when a supplier disputes a name or amount. It also enlarges the disclosure surface, so I would retain aggregate attempt facts longer than the raw recordings and make that loss of replayability explicit in the tenant policy.

That is a real trade-off.

## Four controls in one focused worker

The example below leaves transport and durable storage behind generic interfaces. It parses standard `Retry-After` values, uses full jitter when the server gives no usable delay, and records audio seconds on every attempt. In production, `schedule` must commit the delayed job durably rather than rely on the current process.

```python
import email.utils
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol


@dataclass(frozen=True)
class Job:
    job_id: str
    tenant_id: str
    object_key: str
    audio_seconds: float
    attempt: int = 0


class RateLimited(Exception):
    def __init__(self, retry_after: str | None):
        self.retry_after = retry_after


class Runtime(Protocol):
    async def transcribe(self, object_key: str) -> str: ...


class Store(Protocol):
    async def record_attempt(self, job: Job, outcome: str) -> None: ...
    async def schedule(self, job: Job, delay_seconds: float) -> None: ...
    async def complete_once(self, job: Job, transcript: str) -> None: ...


def retry_after_seconds(value: str | None, now: datetime) -> float | None:
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            parsed = email.utils.parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return max(0.0, (parsed - now).total_seconds())


def fallback_delay(attempt: int, cap_seconds: float = 300.0) -> float:
    ceiling = min(cap_seconds, 2.0 ** min(attempt, 8))
    return random.uniform(0.0, ceiling)


async def handle(job: Job, runtime: Runtime, store: Store) -> None:
    try:
        transcript = await runtime.transcribe(job.object_key)
    except RateLimited as error:
        await store.record_attempt(job, "rate_limited")
        server_delay = retry_after_seconds(
            error.retry_after, datetime.now(timezone.utc)
        )
        delay = server_delay if server_delay is not None else fallback_delay(job.attempt)
        retry = Job(
            job_id=job.job_id,
            tenant_id=job.tenant_id,
            object_key=job.object_key,
            audio_seconds=job.audio_seconds,
            attempt=job.attempt + 1,
        )
        await store.schedule(retry, delay)
        return

    await store.record_attempt(job, "completed")
    await store.complete_once(job, transcript)
```

The four controls are visible in the boundaries rather than hidden in a client wrapper. The queue decides when work is admitted. The delayed scheduler owns retries. `complete_once` makes duplicate delivery harmless at the business boundary. The attempt ledger assigns work to a tenant.

Set a finite attempt ceiling and a maximum job age around this worker. A recording that repeatedly fails must move to review with its reason intact; otherwise it can circulate forever, distort tenant costs, and delay fresh invoices. Retries apply to transient capacity responses. Authentication failures, unsupported media, and deterministic validation errors need classification, not backoff.

No infinite retries.

## Fair queues make cost visible

A single FIFO queue looks neutral but is not fair under a burst. One tenant uploading a large month-end batch can occupy every ready slot while another tenant's small set of invoices waits. Use per-tenant ready queues with weighted round-robin or deficit scheduling, plus a global concurrency ceiling. Keep delayed 429 jobs outside ready queues until their eligibility time.

Fairness is measurable.

Batching deserves care. Grouping many business jobs into one opaque submission can reduce request overhead, but it couples their retry and audit fate. If one batch is rejected, every contained minute may be attempted again. Prefer batches with bounded total audio duration, one tenant, compatible retention policy, and stable item identifiers. Record cost at item level even when transport happens at batch level.

Backpressure should reach intake. Once queued audio seconds or oldest-job age crosses an explicit tenant threshold, reject or defer new intake predictably instead of accepting an unbounded backlog. For OTP delivery, a late message is often useless; invoice transcription is less urgent, but stale work still damages reconciliation deadlines. The queue needs a service objective, not infinite patience.

Observe four time series by tenant: queued audio seconds, oldest eligible job age, 429 attempt rate, and attempted-to-completed audio ratio. Keep cardinality under control by putting job IDs in traces or logs rather than metric labels. Alerting only on HTTP errors misses a queue that is technically succeeding but falling further behind.

## Retain less, accept the diagnostic cost

The deliberate stopping point is raw evidence. After the declared review window, delete source audio and unnecessary full transcripts while retaining extracted invoice fields, consent or provenance records required by policy, duration measurements, attempt outcomes, and deletion evidence. The exact schedule depends on legal obligations and the tenant contract; there is no universal number.

This costs something when recognition is disputed. Without raw audio, an engineer cannot replay a historical job against a corrected decoder or prove which syllable produced a supplier name. The compensating controls are field-level confidence, a human-review result, immutable model and configuration identifiers, and a short quarantine window for contested jobs. Do not pretend those controls recreate deleted evidence. They make the trade-off explicit.

The final decision rule is plain: raise concurrency only when tenant fairness is intact, delayed retries are draining, and attempted audio is close to completed audio. Otherwise, improve admission and classification first. A faster retry loop is usually a faster way to make the bill harder to explain.

## Further reading

- RFC 6585, Additional HTTP Status Codes: https://www.rfc-editor.org/rfc/rfc6585
- RFC 9110, HTTP Semantics (`Retry-After`): https://www.rfc-editor.org/rfc/rfc9110
- AWS Architecture Blog, Exponential Backoff and Jitter: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- NIST Privacy Framework: https://www.nist.gov/privacy-framework
- OpenTelemetry, Managing high cardinality: https://opentelemetry.io/docs/concepts/advanced/high-cardinality/
