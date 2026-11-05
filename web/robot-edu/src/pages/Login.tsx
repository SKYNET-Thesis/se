import React, { useState } from "react";
import { EyeIcon, EyeOffIcon, MailIcon } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { VistaMark } from "../components/layout/VistaMark";
import { useSupabaseSession } from "../contexts/SupabaseSessionContext";
import { identityApi, studentAuthApi } from "../lib/api";

export function Login() {
  const { client, session, loading, configurationError } = useSupabaseSession();
  const [loginType, setLoginType] = useState<"email" | "student">("email");
  const [firstLogin, setFirstLogin] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [email, setEmail] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session && !submitting) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (loginType === "student" && recovering) {
        if (password !== passwordConfirmation) throw new Error("The passwords do not match.");
        await studentAuthApi.recover({ schoolCode, studentCode, recoveryCode, password });
        setRecovering(false);
        setFirstLogin(false);
        setRecoveryCode("");
        setPassword("");
        setPasswordConfirmation("");
        setSuccess("Password reset. Sign in with your new password.");
        return;
      }
      let accessToken: string;
      if (loginType === "email") {
        const { data, error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        if (!data.session) throw new Error("Sign-in did not return an authenticated session.");
        accessToken = data.session.access_token;
      } else {
        if (firstLogin && password !== passwordConfirmation) throw new Error("The passwords do not match.");
        const authSession = firstLogin
          ? await studentAuthApi.setup({ schoolCode, studentCode, setupCode, password })
          : await studentAuthApi.login({ schoolCode, studentCode, password });
        const { data, error: sessionError } = await client.auth.setSession({ access_token: authSession.access_token, refresh_token: authSession.refresh_token });
        if (sessionError) throw sessionError;
        if (!data.session) throw new Error("Sign-in did not return an authenticated session.");
        accessToken = data.session.access_token;
      }

      const access = await identityApi.roles(accessToken);
      const activeMemberships = access.memberships.filter(membership => membership.status === "active");
      const isStudent = activeMemberships.some(membership => membership.roleCode === "student");
      const hasAnyRole = access.systemRoleCodes.includes("system_admin") || activeMemberships.length > 0;
      if (loginType === "student" && !isStudent) throw new Error("This account has no active student access.");
      if (!hasAnyRole) throw new Error("This account has no active VISTA role.");
    } catch (reason) {
      try { await client.auth.signOut(); } catch { void 0; }
      setError(reason instanceof Error ? reason.message : "Unable to sign in. Please check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#e7e8e4] p-3 sm:p-5 lg:p-7">
      <section className="grid min-h-[calc(100dvh-1.5rem)] overflow-hidden bg-[#fbfbf8] lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,1.06fr)_minmax(420px,.94fr)]">
        <aside className="relative hidden min-h-[680px] overflow-hidden bg-[#15251f] p-8 text-[#f4f6ef] lg:flex lg:flex-col xl:p-11">
          <div className="relative z-10 flex items-center justify-between">
            <VistaMark />
            <span className="text-sm text-[#c9d5ca]">Learning workspace</span>
          </div>

          <div className="relative z-10 mt-auto max-w-[13ch] pb-12">
            <p className="text-[clamp(3.3rem,6.2vw,6.6rem)] font-semibold leading-[0.86] tracking-[-0.07em] text-white">Make next move.</p>
            <p className="mt-7 max-w-[30ch] text-base leading-relaxed text-[#c9d5ca]">Write programs, test them safely, and turn every attempt into evidence of learning.</p>
          </div>

          <div className="absolute bottom-[-19vw] left-[-15vw] h-[54vw] w-[54vw] min-h-[600px] min-w-[600px] rounded-full bg-[#1b6c61]" aria-hidden />
          <div className="absolute bottom-0 right-0 h-[80%] w-[72%] overflow-hidden [clip-path:circle(74%_at_76%_64%)]">
            <img src="/images/vista-login-halftone-robot.png" alt="Dual-arm educational robot in the VISTA lab" className="h-full w-full object-cover object-[52%_52%] mix-blend-screen opacity-90" />
          </div>
          <p className="relative z-10 mt-auto max-w-[28ch] text-sm leading-relaxed text-[#dce5dc]">A focused environment for programming, schematic experiments, and robot practice.</p>
        </aside>

        <div className="relative flex min-h-[100dvh] items-center px-6 py-10 sm:px-12 lg:min-h-0 lg:px-[clamp(3rem,7vw,7.5rem)]">
          <div className="absolute left-0 top-0 h-2 w-full bg-[#1b6c61] lg:hidden" aria-hidden />
          <div className="w-full max-w-[360px]">
            <div className="flex items-center justify-between lg:hidden">
              <VistaMark />
              <span className="text-sm text-[#59615c]">Learning workspace</span>
            </div>
            <p className="mt-12 text-base font-medium text-[#1b6c61] lg:mt-0">Welcome back</p>
            <h1 className="mt-3 text-[clamp(3rem,5vw,4.6rem)] font-semibold leading-[0.88] tracking-[-0.065em] text-[#17211c]">Enter VISTA.</h1>
            <p className="mt-5 max-w-[32ch] text-base leading-relaxed text-[#59615c]">Sign in to continue your work in the robot lab.</p>

            {configurationError ? (
              <p role="alert" className="mt-7 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{configurationError}</p>
            ) : (
              <>
                <div className="mt-8 grid grid-cols-2 border-b border-[#bdc5bd]" role="group" aria-label="Sign-in method">
                  <button type="button" aria-pressed={loginType === "email"} onClick={() => { setLoginType("email"); setFirstLogin(false); setRecovering(false); setError(null); setSuccess(null); }} className={loginType === "email" ? "border-b-2 border-[#1b6c61] px-3 py-3 text-sm font-semibold text-[#176255]" : "px-3 py-3 text-sm font-medium text-[#68736b] hover:text-[#17211c]"}>Email</button>
                  <button type="button" aria-pressed={loginType === "student"} onClick={() => { setLoginType("student"); setRecovering(false); setError(null); setSuccess(null); }} className={loginType === "student" ? "border-b-2 border-[#1b6c61] px-3 py-3 text-sm font-semibold text-[#176255]" : "px-3 py-3 text-sm font-medium text-[#68736b] hover:text-[#17211c]"}>Student codes</button>
                </div>
                {loginType === "student" && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-[#59615c]">{recovering ? "Password recovery" : firstLogin ? "First-time setup" : "Student sign in"}</span>{recovering ? <button type="button" onClick={() => { setRecovering(false); setRecoveryCode(""); setPassword(""); setPasswordConfirmation(""); setError(null); }} className="font-semibold text-[#176255] underline underline-offset-4">Back to sign in</button> : <div className="flex gap-4"><button type="button" onClick={() => { setFirstLogin(value => !value); setError(null); setSuccess(null); }} className="font-semibold text-[#176255] underline underline-offset-4">{firstLogin ? "Back to sign in" : "Set up account"}</button>{!firstLogin && <button type="button" onClick={() => { setRecovering(true); setError(null); setSuccess(null); }} className="font-semibold text-[#176255] underline underline-offset-4">Forgot password?</button>}</div>}</div>}
                {recovering && <p className="mt-3 text-sm leading-relaxed text-[#59615c]">Ask your school administrator for a recovery code. Each code works once and expires after 30 minutes.</p>}
                {success && <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">{success}</p>}
                <form onSubmit={submit} className="mt-5 space-y-5">
                {loginType === "email" ? <div className="block text-sm font-medium text-[#26312a]">
                  <label htmlFor="login-email">Email</label>
                  <span className="relative mt-2 block">
                    <input id="login-email" required autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.edu" className="h-12 w-full rounded-full border border-[#bdc5bd] bg-white px-5 pr-12 text-base text-[#17211c] outline-none transition-[border-color,box-shadow] placeholder:text-[#7b847d] focus:border-[#1b6c61] focus:ring-2 focus:ring-[#1b6c61]/20" />
                    <MailIcon aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#7b847d]" strokeWidth={1.8} />
                  </span>
                </div> : <>
                  <label className="block text-sm font-medium text-[#26312a]">School code<input required autoComplete="organization" value={schoolCode} onChange={event => setSchoolCode(event.target.value)} placeholder="VST-..." className="mt-2 h-12 w-full rounded-full border border-[#bdc5bd] bg-white px-5 text-base text-[#17211c] outline-none focus:border-[#1b6c61] focus:ring-2 focus:ring-[#1b6c61]/20" /></label>
                  <label className="block text-sm font-medium text-[#26312a]">Student code<input required autoComplete="username" value={studentCode} onChange={event => setStudentCode(event.target.value)} placeholder="Your student code" className="mt-2 h-12 w-full rounded-full border border-[#bdc5bd] bg-white px-5 text-base text-[#17211c] outline-none focus:border-[#1b6c61] focus:ring-2 focus:ring-[#1b6c61]/20" /></label>
                  {(firstLogin || recovering) && <label className="block text-sm font-medium text-[#26312a]">{firstLogin ? "One-time setup code" : "Recovery code"}<input required autoComplete="one-time-code" value={firstLogin ? setupCode : recoveryCode} onChange={event => firstLogin ? setSetupCode(event.target.value) : setRecoveryCode(event.target.value)} className="mt-2 h-12 w-full rounded-full border border-[#bdc5bd] bg-white px-5 font-mono text-base text-[#17211c] outline-none focus:border-[#1b6c61] focus:ring-2 focus:ring-[#1b6c61]/20" /></label>}
                </>}
                <div className="block text-sm font-medium text-[#26312a]">
                  <label htmlFor="login-password">Password</label>
                  <span className="relative mt-2 block">
                    <input id="login-password" required minLength={loginType === "student" && (firstLogin || recovering) ? 12 : undefined} autoComplete={firstLogin || recovering ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={firstLogin || recovering ? "Create a password (12+ characters)" : "Your password"} className="h-12 w-full rounded-full border border-[#bdc5bd] bg-white px-5 pr-12 text-base text-[#17211c] outline-none transition-[border-color,box-shadow] placeholder:text-[#7b847d] focus:border-[#1b6c61] focus:ring-2 focus:ring-[#1b6c61]/20" />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#68736b] transition-colors hover:bg-[#e6efea] hover:text-[#176255] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1b6c61]" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                      {showPassword ? <EyeOffIcon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <EyeIcon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />}
                    </button>
                  </span>
                </div>
                {loginType === "student" && (firstLogin || recovering) && <label className="block text-sm font-medium text-[#26312a]">Confirm password<input required minLength={12} autoComplete="new-password" type="password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} className="mt-2 h-12 w-full rounded-full border border-[#bdc5bd] bg-white px-5 text-base text-[#17211c] outline-none focus:border-[#1b6c61] focus:ring-2 focus:ring-[#1b6c61]/20" /></label>}
                {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
                <Button type="submit" loading={submitting || loading} className="mt-3 h-12 w-full rounded-md !bg-[#1b6c61] !text-white hover:!bg-[#145249]">{recovering ? "Reset password" : firstLogin ? "Set password and continue" : "Sign in to workspace"}</Button>
                </form>
              </>
            )}

            <p className="mt-8 max-w-[33ch] text-sm leading-relaxed text-[#6c756e]">Passwords and sessions are securely managed by the VISTA identity provider.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
