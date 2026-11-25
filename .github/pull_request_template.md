## What changed

<!-- Short description of the change and why. -->

## How it was tested

- [ ] `npm run typecheck` and `npm test` pass locally
- [ ] `scripts/e2e.sh` passes locally (or rely on the **PR acceptance** workflow)
- [ ] UI changes checked in both light and dark mode

The **PR gate** check must be green before merging. It requires:

| Job | What it verifies |
|---|---|
| Typecheck · unit tests · build | Prisma schemas, TypeScript in every workspace, X12 engine + all bad-data scenario tests, both web apps build |
| End-to-end | Full Docker stack: X12 over FTP → validation (TA1/997) → ingestion → JSON/REST to the order app → customer orders back over RabbitMQ, plus traceability |
