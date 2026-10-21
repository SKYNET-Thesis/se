import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RuntimeService {
  constructor(private readonly config: ConfigService) {}
  async health(){ return this.fetchAllowed("/api/health", false); }
  async status(){ return this.fetchAllowed("/api/status", true); }
  private async fetchAllowed(path:string, status:boolean){
    const base=this.config.get<string>("ROBOT_RUNTIME_BASE_URL")?.replace(/\/$/,"");
    if(!base) return { available:false, state:"not_configured", runtimeReachable:false };
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),Number(this.config.get("ROBOT_RUNTIME_TIMEOUT_MS")??2500));
    try { const response=await fetch(`${base}${path}`,{method:"GET",headers:{Accept:"application/json"},signal:controller.signal});
      if(!response.ok) throw new Error(`runtime returned ${response.status}`);
      const body=await response.json() as Record<string,unknown>;
      return status?this.sanitizeStatus(body):{available:true,state:"reachable",runtimeReachable:true};
    } catch { throw new ServiceUnavailableException({available:false,state:"unavailable",runtimeReachable:false}); }
    finally { clearTimeout(timeout); }
  }
  private sanitizeStatus(value:Record<string,unknown>){
    const backend=this.object(value.backend), task=this.object(value.task), readiness=this.object(value.readiness);
    return {available:true,state:"reachable",runtimeReachable:true,runtime:{name:this.string(backend.name),version:this.string(backend.version),simulated:this.bool(backend.simulated),motionEnabled:this.bool(backend.motionEnabled),latchedMotionLock:this.bool(backend.latchedMotionLock)},readiness,task:{running:this.bool(task.running),implementation:this.string(task.implementation),mode:this.string(task.mode),activeArms:Array.isArray(task.activeArms)?task.activeArms.filter(x=>typeof x==="string"):[],processHealth:this.unknown(task.processHealth),relayHealth:this.unknown(task.relayHealth),lastError:this.string(task.lastError)}};
  }
  private object(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
  private string(v:unknown){return typeof v==="string"?v:null;} private bool(v:unknown){return typeof v==="boolean"?v:null;} private unknown(v:unknown){return v??null;}
}
