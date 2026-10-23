export type ImportResultCounts = { processed:number; created:number; unchanged:number; failed:number };
export function importResultView(result: ImportResultCounts) {
  const saved = result.created + result.unchanged;
  if (result.failed === 0) return { tone:'success' as const, title:'Import complete', persistence:true, description:`${result.processed} record${result.processed === 1 ? '' : 's'} imported successfully.` };
  if (saved > 0) return { tone:'partial' as const, title:'Import partially completed', persistence:false, description:`${saved} of ${result.processed} records were imported. ${result.failed} could not be imported.` };
  return { tone:'failed' as const, title:'Import failed', persistence:false, description:`We couldn't import these records. No records were created.` };
}
