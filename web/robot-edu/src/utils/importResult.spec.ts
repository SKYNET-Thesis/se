import { describe, expect, it } from 'vitest';
import { importResultView } from './importResult';

describe('import result presentation', () => {
  it('shows complete success only when nothing failed', () => expect(importResultView({ processed:3, created:3, unchanged:0, failed:0 })).toMatchObject({ tone:'success', title:'Import complete', persistence:true, description:'3 records imported successfully.' }));
  it('shows partial completion without full-success messaging', () => { const view=importResultView({ processed:3, created:2, unchanged:0, failed:1 }); expect(view).toMatchObject({ tone:'partial', title:'Import partially completed', persistence:false }); expect(view.description).not.toContain('imported successfully'); });
  it('shows failure without persistence confirmation when every row failed', () => { const view=importResultView({ processed:3, created:0, unchanged:0, failed:3 }); expect(view).toMatchObject({ tone:'failed', title:'Import failed', persistence:false }); expect(JSON.stringify(view)).not.toContain('Persistence confirmed'); });
});
