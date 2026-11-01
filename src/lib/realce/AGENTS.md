# Realce (src/lib/realce)

- Independent test area: never read or write property_*, galleries, Drive, watermark or site queues from here — why: this phase must not touch live property media.
- Provider calls live only in `provider.server.ts` behind `ImageEditProvider`; UI and worker never call a vendor directly — why: providers can be swapped or compared later.
- Item status transitions are server-only (RPCs realce_enqueue/realce_claim/realce_save_preset/realce_fail_preset/realce_redo); clients may only update `selected`/`decision` — why: prevents duplicated paid edits and forged results.
- An AI item whose lease expires while `processando` becomes `incerto` and is never resent automatically; only 429/5xx before processing retry (max 3) — why: avoid duplicate charges.
- The preset runs in the browser and is always labelled "Preset · sem IA"; never present it or the original as an AI edit.
- Files live in private bucket `realce` at `<user>/<test>/{original,work,result}/…`; access only via short signed URLs. Work/result copies are re-encoded (no EXIF/GPS); originals are kept byte-for-byte.
