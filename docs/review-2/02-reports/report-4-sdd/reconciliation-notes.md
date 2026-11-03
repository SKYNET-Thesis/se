# Report 4 Reconciliation Notes

The working DOCX/PDF was reconciled on 2026-10-27 against the current
repository documentation and the supplied 23-page `diagramall.drawio.xml`.

Completed in this draft:

- normalized the document to A4;
- removed the generic Java/MVC bean-view-controller-filter-DAO package sketch;
- replaced stale `VISTA_DIAGRAM.pdf` and `aldia.xml` references;
- retained design component names while mapping them to real NestJS module
  responsibilities in the narrative;
- removed the sequence-diagram placeholder name and described the interaction
  as a draft textual sequence;
- rebuilt the ERD appendix with all 12 views: one conceptual, five logical and
  six physical;
- kept Figure 16a (Programs & Assessment) separate from Figure 16b (AI &
  Datasets);
- rendered and visually checked the resulting 30-page A4 PDF.

Still required before FINAL:

- map every proposed state label to the exact persisted value or record an
  explicit planned-state decision;
- finish Prisma/migration verification for physical key, nullability, enum and
  uniqueness claims;
- add approved sequence diagrams if the review panel requires diagrammatic
  rather than textual interaction design;
- add deployment/rollback evidence from an actual staging environment;
- replace any remaining imported visual whose direct Draw.io export differs
  materially from the matching Mermaid reference.
