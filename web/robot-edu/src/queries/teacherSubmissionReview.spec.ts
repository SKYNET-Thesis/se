import { describe,expect,it } from 'vitest';
import { buildAssessmentScores, evaluationPresentation } from './teacherSubmissionReview';

describe('teacher submission evidence presentation',()=>{
  it('shows persisted pass and fail only',()=>{expect(evaluationPresentation({verdict:'passed'})).toEqual({label:'PASS',tone:'pass'});expect(evaluationPresentation({verdict:'failed'})).toEqual({label:'FAIL',tone:'fail'});});
  it('shows incomplete rather than inventing a verdict',()=>{expect(evaluationPresentation(null)).toEqual({label:'Evaluation not completed',tone:'incomplete'});});
  it('requires explicit bounded scores for every rubric criterion',()=>{const criteria=[{id:'c1',maxPoints:5},{id:'c2',maxPoints:'10'}];expect(buildAssessmentScores(criteria,{c1:'',c2:'4'},{})).toBeNull();expect(buildAssessmentScores(criteria,{c1:'6',c2:'4'},{})).toBeNull();expect(buildAssessmentScores(criteria,{c1:'5',c2:'4'},{c1:'Good'})).toEqual([{criterionId:'c1',awardedPoints:5,comment:'Good'},{criterionId:'c2',awardedPoints:4,comment:undefined}]);});
});
