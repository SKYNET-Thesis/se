import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningService } from "./learning.service";

type VrState = "NOT_STARTED" | "STARTING" | "READY" | "WAITING_FOR_HEADSET" | "CONNECTED" | "RUNNING" | "STOPPING" | "STOPPED" | "FAILED";
export interface VrSession { id:string; attemptId:string; userId:string; mode:"offline_fake_follower"; state:VrState; operatorUrl:string|null; createdAt:string; updatedAt:string; error:string|null; runtime:Record<string,unknown>|null; reflection?:Record<string,string>; completedAt?:string|null; }

/** Education control-plane boundary. It never receives or proxies XR poses. */
@Injectable()
export class VrLessonService {
  private readonly sessions = new Map<string, VrSession>();
  constructor(private readonly config:ConfigService, private readonly learning:LearningService) {}

  async status(user:AuthenticatedUser, attemptId:string){ await this.ownAttempt(user, attemptId); return this.refresh(this.find(user, attemptId)); }
  async start(user:AuthenticatedUser, attemptId:string){
    await this.ownAttempt(user, attemptId);
    const existing=this.find(user, attemptId); if(existing && !["STOPPED","FAILED"].includes(existing.state)) return this.refresh(existing);
    const session:VrSession={id:randomUUID(),attemptId,userId:user.vistaUserId,mode:"offline_fake_follower",state:"STARTING",operatorUrl:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),error:null,runtime:null}; this.sessions.set(session.id,session);
    try { await this.runtime("/api/tasks/vr-lekiwi","POST",{mode:"dual-arm"}); return await this.refresh(session); }
    catch(error){ session.state="FAILED"; session.error=error instanceof Error?error.message:"Could not start VR runtime."; session.updatedAt=new Date().toISOString(); return session; }
  }
  async stop(user:AuthenticatedUser, sessionId:string){ const session=this.sessions.get(sessionId); if(!session||session.userId!==user.vistaUserId) throw new NotFoundException("VR lesson session was not found."); await this.ownAttempt(user,session.attemptId); session.state="STOPPING"; session.updatedAt=new Date().toISOString(); try { await this.runtime("/api/tasks/stop","POST",{}); session.state="STOPPED"; session.error=null; } catch(error){ session.state="FAILED"; session.error=error instanceof Error?error.message:"Could not stop VR runtime."; } session.updatedAt=new Date().toISOString(); return session; }
  async complete(user:AuthenticatedUser, sessionId:string, reflection:Record<string,unknown>){ const session=this.sessions.get(sessionId); if(!session||session.userId!==user.vistaUserId) throw new NotFoundException("VR lesson session was not found."); await this.ownAttempt(user,session.attemptId); const fields=["movement","clutch","safety"]; if(!fields.every((key)=>typeof reflection[key]==="string"&&(reflection[key] as string).trim())) throw new BadRequestException("Complete all VR reflection answers first."); session.reflection=Object.fromEntries(fields.map((key)=>[key,(reflection[key] as string).trim()])); session.completedAt=new Date().toISOString(); session.updatedAt=session.completedAt; return session; }
  private find(user:AuthenticatedUser,attemptId:string){ return [...this.sessions.values()].find((session)=>session.userId===user.vistaUserId&&session.attemptId===attemptId)??null; }
  private async ownAttempt(user:AuthenticatedUser,attemptId:string){ return this.learning.myAttempt(user,attemptId); }
  private async refresh(session:VrSession|null){ if(!session) return {state:"NOT_STARTED" as const,mode:"offline_fake_follower",operatorUrl:null,error:null}; try { const runtime=await this.runtime("/api/status","GET"); session.runtime=runtime; const task=this.record(runtime.task); const running=task.running===true; const health=typeof task.processHealth==="string"?task.processHealth:""; session.operatorUrl=typeof task.operatorUrl==="string"?task.operatorUrl:null; session.state=!running?"STOPPED":health==="ready"?(session.operatorUrl?"WAITING_FOR_HEADSET":"READY"):"STARTING"; session.error=typeof task.lastError==="string"?task.lastError:null; if(session.error)session.state="FAILED"; session.updatedAt=new Date().toISOString(); return session; } catch(error){ session.state="FAILED";session.error=error instanceof Error?error.message:"VR runtime is unavailable.";session.updatedAt=new Date().toISOString();return session; } }
  private async runtime(path:string,method:"GET"|"POST",body?:Record<string,unknown>):Promise<Record<string,unknown>>{ const base=this.config.get<string>("ROBOT_RUNTIME_BASE_URL")?.replace(/\/$/,""); if(!base)throw new ServiceUnavailableException("VR runtime is not configured."); const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),Number(this.config.get("ROBOT_RUNTIME_TIMEOUT_MS")??5000)); try{const response=await fetch(`${base}${path}`,{method,headers:{Accept:"application/json","Content-Type":"application/json"},body:method==="POST"?JSON.stringify(body??{}):undefined,signal:controller.signal});const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof value.error==="string"?value.error:`VR runtime returned ${response.status}`);return this.record(value);}finally{clearTimeout(timeout);} }
  private record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new BadRequestException("VR runtime returned an invalid response.");return value as Record<string,unknown>;}
}
