import React, { useState } from "react";
import { EyeIcon, EyeOffIcon, MailIcon } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { VistaMark } from "../components/layout/VistaMark";
import { useSupabaseSession } from "../contexts/SupabaseSessionContext";

export function Login() {
  const { client, session, loading, configurationError } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client) return;
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setSubmitting(false);
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
              <form onSubmit={submit} className="mt-10 space-y-5">
                <div className="block text-sm font-medium text-[#26312a]">
                  <label htmlFor="login-email">Email</label>
                  <span className="relative mt-2 block">
                    <input id="login-email" required autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.edu" className="h-12 w-full rounded-full border border-[#bdc5bd] bg-white px-5 pr-12 text-base text-[#17211c] outline-none transition-[border-color,box-shadow] placeholder:text-[#7b847d] focus:border-[#1b6c61] focus:ring-2 focus:ring-[#1b6c61]/20" />
                    <MailIcon aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#7b847d]" strokeWidth={1.8} />
                  </span>
                </div>
                <div className="block text-sm font-medium text-[#26312a]">
                  <label htmlFor="login-password">Password</label>
                  <span className="relative mt-2 block">
                    <input id="login-password" required autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" className="h-12 w-full rounded-full border border-[#bdc5bd] bg-white px-5 pr-12 text-base text-[#17211c] outline-none transition-[border-color,box-shadow] placeholder:text-[#7b847d] focus:border-[#1b6c61] focus:ring-2 focus:ring-[#1b6c61]/20" />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#68736b] transition-colors hover:bg-[#e6efea] hover:text-[#176255] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1b6c61]" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                      {showPassword ? <EyeOffIcon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <EyeIcon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />}
                    </button>
                  </span>
                </div>
                {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
                <Button type="submit" loading={submitting || loading} className="mt-3 h-12 w-full rounded-md !bg-[#1b6c61] !text-white hover:!bg-[#145249]">Sign in to workspace</Button>
              </form>
            )}

            <p className="mt-8 max-w-[33ch] text-sm leading-relaxed text-[#6c756e]">Use the Supabase account linked to your VISTA profile.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
