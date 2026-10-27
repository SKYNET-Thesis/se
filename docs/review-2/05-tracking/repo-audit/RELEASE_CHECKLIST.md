# Review 2 release checklist

- [ ] PR CI: web/API/Prisma/runtime/CHECKIK/mobile/Compose checks green
- [ ] WF-01 allocation + denial rehearsed
- [ ] WF-02 draft→publish→attempt→version→submission rehearsed
- [ ] WF-03 symbolic and fake-follower software path rehearsed
- [ ] WF-04 evidence→assessment→feedback→reflection rehearsed
- [ ] Authorization denials captured without secrets
- [ ] Runtime private; browser never calls runtime/CHECKIK
- [ ] Say “Physical-execution software path verified using Fake Follower”
- [ ] Do not claim real hardware verification
- [ ] No live DB reset/migration, AWS deploy or paid action
- [ ] Known limits: real hardware and C3/Dataset/Model provenance absent; formal education FR IDs pending
- [ ] Baseline rollback reference: `8aac863`
- [ ] Review-2 tag awaits explicit approval

## Repeatable demo evidence

| Flow | Main/exception | Evidence | Local/test cleanup |
|---|---|---|---|
| WF-01 | allocate; deny cross-org/not-entitled | single allocation + provenance | disposable DB/transaction |
| WF-02 | publish/submit; hide draft/deny forged scope | delivery, attempt, exact ProgramVersion, submission | fixture rows only |
| WF-03 | symbolic then fake follower; deny unsafe/unallocated | result, experiment, session, events, provenance | stop fake; fixture rows only |
| WF-04 | teacher assesses, student reflects; deny student review | submission-rooted evidence | transaction rollback |

Use commands in `VERIFICATION_REPORT.md`. Never clean/reset a remote URL.
