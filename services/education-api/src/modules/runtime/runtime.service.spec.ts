import { ServiceUnavailableException } from "@nestjs/common";
import { RuntimeService } from "./runtime.service";
describe("RuntimeService read-only adapter",()=>{
 const config={get:jest.fn()}; const service=new RuntimeService(config as never);
 beforeEach(()=>{config.get.mockImplementation((key:string)=>key==="ROBOT_RUNTIME_BASE_URL"?"http://runtime.test":key==="ROBOT_RUNTIME_TIMEOUT_MS"?100:undefined);});
 it("maps only sanitized status fields",async()=>{(global.fetch as jest.Mock)=jest.fn().mockResolvedValue({ok:true,json:async()=>({backend:{name:"checkik",version:"1",motionEnabled:false,secret:"x"},readiness:{ready:false},task:{running:false,activeArms:["left"],operatorUrl:"secret"}})});const result=await service.status();expect(result).toMatchObject({available:true,runtimeReachable:true,runtime:{name:"checkik",motionEnabled:false},task:{activeArms:["left"]}});expect(JSON.stringify(result)).not.toContain("secret");});
 it("reports not configured without a network call",async()=>{config.get.mockReturnValue(undefined);(global.fetch as jest.Mock)=jest.fn();await expect(service.health()).resolves.toEqual({available:false,state:"not_configured",runtimeReachable:false});expect(global.fetch).not.toHaveBeenCalled();});
 it("maps runtime connection errors to unavailable",async()=>{(global.fetch as jest.Mock)=jest.fn().mockRejectedValue(new Error("offline"));await expect(service.health()).rejects.toBeInstanceOf(ServiceUnavailableException);});
});
