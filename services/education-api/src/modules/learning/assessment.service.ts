import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { AssessSubmissionDto } from "./dto/assess-submission.dto";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";
import { CreateReflectionDto } from "./dto/create-reflection.dto";
import { LearningScopeService } from "./learning-scope.service";

interface SubmissionScope { id:string; assignment_id:string; learner_user_id:string; program_id:string; program_version_id:string|null; classroom_id:string; }

@Injectable()
export class AssessmentService {
  constructor(private readonly prisma:PrismaService, private readonly scope:LearningScopeService) {}

  async classroomSubmissions(user:AuthenticatedUser,classroomId:string) {
    await this.scope.assertTeacherClassroomPermission(user,classroomId,["learning.work.review"]);
    return this.prisma.$queryRaw`
      SELECT s.id,s.assignment_id,s.learner_user_id,s.program_id,s.program_version_id,s.status,s.submitted_at,
        a.attempt_number,u.full_name,u.email
      FROM public.learning_submissions s
      JOIN public.learning_assignment_attempts a ON a.program_id=s.program_id AND a.learner_user_id=s.learner_user_id
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
      JOIN public.users u ON u.id=s.learner_user_id
      WHERE ca.classroom_id=${classroomId}::uuid ORDER BY s.submitted_at DESC NULLS LAST`;
  }

  async instructorSubmission(user:AuthenticatedUser,submissionId:string) {
    const submission=await this.submissionScope(submissionId); await this.scope.assertTeacherClassroomPermission(user,submission.classroom_id,["learning.work.review"]);
    return this.detail(submissionId);
  }

  async assessment(user:AuthenticatedUser,submissionId:string) {
    const submission=await this.submissionScope(submissionId); await this.scope.assertTeacherClassroomPermission(user,submission.classroom_id,["learning.work.review"]);
    const rows=await this.prisma.$queryRaw<Record<string, unknown>[]>`SELECT a.id,a.submission_id,a.reviewer_user_id,a.overall_feedback,a.reviewed_at,a.created_at,COALESCE(json_agg(json_build_object('criterionId',s.criterion_id,'awardedPoints',s.awarded_points,'comment',s.comment)) FILTER (WHERE s.criterion_id IS NOT NULL),'[]'::json) AS scores FROM public.learning_assessments a LEFT JOIN public.learning_assessment_scores s ON s.assessment_id=a.id WHERE a.submission_id=${submissionId}::uuid GROUP BY a.id`;
    if(!rows[0]) throw new NotFoundException("Assessment was not found."); return rows[0];
  }

  async instructorFeedback(user:AuthenticatedUser,submissionId:string) {
    const submission=await this.submissionScope(submissionId); await this.scope.assertTeacherClassroomPermission(user,submission.classroom_id,["learning.work.review"]);
    return this.prisma.$queryRaw`SELECT id,submission_id,author_user_id,feedback_type,content,metadata,created_at FROM public.learning_feedback WHERE submission_id=${submissionId}::uuid ORDER BY created_at ASC`;
  }

  async assess(user:AuthenticatedUser,submissionId:string,dto:AssessSubmissionDto) {
    const submission=await this.submissionScope(submissionId);
    await this.scope.assertTeacherClassroomPermission(user,submission.classroom_id,["learning.work.review","learning.assessment.assess"]);
    return this.prisma.$transaction(async tx=>{
      const criteria=await tx.$queryRaw<{id:string;max_points:number}[]>`SELECT id,max_points FROM public.learning_rubric_criteria WHERE assignment_id=${submission.assignment_id}::uuid AND id=ANY(${dto.scores.map(s=>s.criterionId)}::uuid[])`;
      if(criteria.length!==dto.scores.length || new Set(dto.scores.map(s=>s.criterionId)).size!==dto.scores.length) throw new BadRequestException("Scores must reference distinct criteria from this assignment.");
      for(const score of dto.scores){const criterion=criteria.find(c=>c.id===score.criterionId)!;if(score.awardedPoints>Number(criterion.max_points)) throw new BadRequestException("Awarded points exceed the rubric maximum.");}
      const assessments=await tx.$queryRaw<{id:string}[]>`INSERT INTO public.learning_assessments(submission_id,reviewer_user_id,overall_feedback,reviewed_at) VALUES(${submissionId}::uuid,${user.vistaUserId}::uuid,${dto.overallFeedback??null},now()) ON CONFLICT (submission_id) DO UPDATE SET reviewer_user_id=EXCLUDED.reviewer_user_id,overall_feedback=EXCLUDED.overall_feedback,reviewed_at=now() RETURNING id`;
      for(const score of dto.scores) await tx.$executeRaw`INSERT INTO public.learning_assessment_scores(assessment_id,criterion_id,awarded_points,comment) VALUES(${assessments[0].id}::uuid,${score.criterionId}::uuid,${score.awardedPoints},${score.comment??null}) ON CONFLICT (assessment_id,criterion_id) DO UPDATE SET awarded_points=EXCLUDED.awarded_points,comment=EXCLUDED.comment`;
      return this.detail(submissionId,tx);
    });
  }

  async feedback(user:AuthenticatedUser,submissionId:string,dto:CreateFeedbackDto) {
    const submission=await this.submissionScope(submissionId); await this.scope.assertTeacherClassroomPermission(user,submission.classroom_id,["learning.work.review"]);
    const rows=await this.prisma.$queryRaw<{id:string;submission_id:string;author_user_id:string;feedback_type:string;content:string;created_at:Date}[]>`INSERT INTO public.learning_feedback(submission_id,author_user_id,feedback_type,content) VALUES(${submissionId}::uuid,${user.vistaUserId}::uuid,'teacher_feedback',${dto.content}) RETURNING id,submission_id,author_user_id,feedback_type,content,created_at`;
    return rows[0];
  }

  async mySubmissions(user:AuthenticatedUser) {
    return this.prisma.$queryRaw`
      SELECT s.id,s.assignment_id,s.program_id,s.program_version_id,s.status,s.submitted_at
      FROM public.learning_submissions s JOIN public.learning_assignment_attempts a ON a.program_id=s.program_id AND a.learner_user_id=s.learner_user_id
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
      JOIN public.learning_classroom_members cm ON cm.classroom_id=ca.classroom_id AND cm.user_id=s.learner_user_id AND cm.classroom_role='student' AND cm.status='active'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.status='active'
      JOIN public.learning_classrooms c ON c.id=ca.classroom_id AND c.organization_id=m.organization_id
      WHERE s.learner_user_id=${user.vistaUserId}::uuid ORDER BY s.submitted_at DESC NULLS LAST`;
  }

  async myFeedback(user:AuthenticatedUser,submissionId:string) {
    await this.ownSubmission(user,submissionId);
    return this.prisma.$queryRaw`SELECT id,submission_id,author_user_id,feedback_type,content,metadata,created_at FROM public.learning_feedback WHERE submission_id=${submissionId}::uuid ORDER BY created_at ASC`;
  }

  async mySubmission(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.ownSubmission(user, submissionId);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT s.id,s.assignment_id,s.program_id,s.program_version_id,s.submitted_workspace,s.submitted_program,
        s.reflection,s.status,s.submitted_at,
        COALESCE((SELECT json_agg(json_build_object('id',r.id,'promptKey',r.prompt_key,'promptText',r.prompt_text,'responseText',r.response_text,'createdAt',r.created_at) ORDER BY r.created_at)
          FROM public.learning_reflections r WHERE r.submission_id=s.id AND r.learner_user_id=${user.vistaUserId}::uuid),'[]'::json) AS reflections
      FROM public.learning_submissions s WHERE s.id=${submission.id}::uuid`;
    if (!rows[0]) throw new NotFoundException("Submission was not found.");
    return rows[0];
  }

  async myReflections(user: AuthenticatedUser, submissionId: string) {
    await this.ownSubmission(user, submissionId);
    return this.prisma.$queryRaw`
      SELECT id,submission_id,learner_user_id,prompt_key,prompt_text,response_text,created_at
      FROM public.learning_reflections
      WHERE submission_id=${submissionId}::uuid AND learner_user_id=${user.vistaUserId}::uuid
      ORDER BY created_at ASC`;
  }

  async createReflection(user:AuthenticatedUser,submissionId:string,dto:CreateReflectionDto) {
    await this.ownSubmission(user,submissionId);
    const rows=await this.prisma.$queryRaw<{id:string;submission_id:string;learner_user_id:string;prompt_key:string;prompt_text:string;response_text:string|null;created_at:Date}[]>`INSERT INTO public.learning_reflections(submission_id,learner_user_id,prompt_key,prompt_text,response_text) VALUES(${submissionId}::uuid,${user.vistaUserId}::uuid,${dto.promptKey},${dto.promptText},${dto.responseText??null}) RETURNING id,submission_id,learner_user_id,prompt_key,prompt_text,response_text,created_at`;
    return rows[0];
  }

  private async ownSubmission(user:AuthenticatedUser,id:string) {const submission=await this.submissionScope(id);if(submission.learner_user_id!==user.vistaUserId) throw new NotFoundException("Submission was not found.");await this.scope.assertStudentClassroomAccess(user,submission.classroom_id);return submission;}
  private async submissionScope(id:string):Promise<SubmissionScope>{const rows=await this.prisma.$queryRaw<SubmissionScope[]>`SELECT s.id,s.assignment_id,s.learner_user_id,s.program_id,s.program_version_id,ca.classroom_id FROM public.learning_submissions s JOIN public.learning_assignment_attempts a ON a.program_id=s.program_id AND a.learner_user_id=s.learner_user_id JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id WHERE s.id=${id}::uuid`;if(!rows[0])throw new NotFoundException("Submission was not found.");return rows[0];}
  private detail(submissionId:string, db:Pick<PrismaService,"$queryRaw">=this.prisma){return db.$queryRaw`SELECT s.id,s.assignment_id,s.learner_user_id,s.program_id,s.program_version_id,s.submitted_workspace,s.submitted_program,s.reflection,s.status,s.submitted_at,a.id AS assessment_id,a.reviewer_user_id,a.overall_feedback,a.reviewed_at,COALESCE((SELECT json_agg(json_build_object('id',rc.id,'title',rc.title,'description',rc.description,'maxPoints',rc.max_points,'ordinal',rc.ordinal) ORDER BY rc.ordinal) FROM public.learning_rubric_criteria rc WHERE rc.assignment_id=s.assignment_id),'[]'::json) AS rubric_criteria FROM public.learning_submissions s LEFT JOIN public.learning_assessments a ON a.submission_id=s.id WHERE s.id=${submissionId}::uuid`;}
}
