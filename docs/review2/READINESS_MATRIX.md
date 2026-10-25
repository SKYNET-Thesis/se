# Review 2 readiness matrix

| Component | Requirement | Implementation | Test | Evidence | Status | Blocker | Impact |
|---|---|---|---|---|---|---|---|
| WF-01 | classroom authorization | allocation service/UI | API/web | persisted projection | VERIFIED | none | demoable |
| WF-02 | learning delivery | draft/publish/attempt/version/submission | API/web | authoritative state | VERIFIED | none | demoable |
| WF-03 symbolic | no-motion evaluation | submission evaluation | API/web | result | VERIFIED | none | demoable |
| WF-03 physical software | guarded orchestration | API→runtime→CHECKIK fake follower | API + runtime + adapter | prior host E2E provenance | VERIFIED | hardware excluded | software only |
| WF-04 | evidence/review | assessment/feedback/reflection | API/web | submission-rooted evidence | VERIFIED | optional C3 absent | demoable |
| Real hardware | physical follower | not exercised | none | none | NOT TESTED | safety/hardware sign-off | never claim |
| CI | executable gates | real jobs | local commands | remote run pending | PARTIAL | PR CI | gate required |
| Network | private runtime | Compose `expose: 8015` | compose config | no host port | VERIFIED | none | safe default |
