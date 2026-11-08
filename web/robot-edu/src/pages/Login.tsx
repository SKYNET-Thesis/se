import React, { useState } from 'react';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  MailIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { VistaMark } from '../components/layout/VistaMark';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { identityApi, studentAuthApi } from '../lib/api';

export type StudentMode = 'login' | 'setup' | 'recovery';

export function Login() {
  const { client, session, loading, configurationError } = useSupabaseSession();
  const [loginType, setLoginType] = useState<'email' | 'student'>('email');
  const [studentMode, setStudentMode] = useState<StudentMode>('login');

  const [email, setEmail] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session && !submitting) return <Navigate to="/" replace />;

  const resetFormState = () => {
    setError(null);
    setSuccess(null);
    setPassword('');
    setPasswordConfirmation('');
  };

  const handleTabChange = (type: 'email' | 'student') => {
    setLoginType(type);
    setStudentMode('login');
    resetFormState();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Password Recovery Flow
      if (loginType === 'student' && studentMode === 'recovery') {
        if (password.length < 12) {
          throw new Error('Password must be at least 12 characters.');
        }
        if (password !== passwordConfirmation) {
          throw new Error('The passwords do not match.');
        }

        await studentAuthApi.recover({
          schoolCode: schoolCode.trim(),
          studentCode: studentCode.trim(),
          recoveryCode: recoveryCode.trim(),
          password,
        });

        setStudentMode('login');
        setRecoveryCode('');
        setPassword('');
        setPasswordConfirmation('');
        setSuccess('Your password has been reset. Please sign in with your new password.');
        return;
      }

      let accessToken: string;

      // 2. Email Sign-in Flow
      if (loginType === 'email') {
        const { data, error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        if (!data.session) throw new Error('Sign-in did not return an authenticated session.');
        accessToken = data.session.access_token;
      } else {
        // 3. Student First-Time Setup Flow
        if (studentMode === 'setup') {
          if (password.length < 12) {
            throw new Error('Password must be at least 12 characters.');
          }
          if (password !== passwordConfirmation) {
            throw new Error('The passwords do not match.');
          }

          const authSession = await studentAuthApi.setup({
            schoolCode: schoolCode.trim(),
            studentCode: studentCode.trim(),
            setupCode: setupCode.trim(),
            password,
          });

          const { data, error: sessionError } = await client.auth.setSession({
            access_token: authSession.access_token,
            refresh_token: authSession.refresh_token,
          });
          if (sessionError) throw sessionError;
          if (!data.session) throw new Error('Sign-in did not return an authenticated session.');
          accessToken = data.session.access_token;
        } else {
          // 4. Standard Student Login Flow
          const authSession = await studentAuthApi.login({
            schoolCode: schoolCode.trim(),
            studentCode: studentCode.trim(),
            password,
          });

          const { data, error: sessionError } = await client.auth.setSession({
            access_token: authSession.access_token,
            refresh_token: authSession.refresh_token,
          });
          if (sessionError) throw sessionError;
          if (!data.session) throw new Error('Sign-in did not return an authenticated session.');
          accessToken = data.session.access_token;
        }
      }

      // Verify active roles
      const access = await identityApi.roles(accessToken);
      const activeMemberships = access.memberships.filter((membership) => membership.status === 'active');
      const isStudent = activeMemberships.some((membership) => membership.roleCode === 'student');
      const hasAnyRole = access.systemRoleCodes.includes('system_admin') || activeMemberships.length > 0;

      if (loginType === 'student' && !isStudent) {
        throw new Error('This account has no active student access.');
      }
      if (!hasAnyRole) {
        throw new Error('This account has no active VISTA role.');
      }
    } catch (reason) {
      try {
        await client.auth.signOut();
      } catch {
        // Ignore cleanup failure so original sign-in error is reported to user
      }
      setError(reason instanceof Error ? reason.message : 'Unable to sign in. Please check your credentials and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isNewPassword = loginType === 'student' && (studentMode === 'setup' || studentMode === 'recovery');

  return (
    <main className="min-h-[100dvh] bg-[#e7e8e4] p-3 sm:p-5 lg:p-7">
      <section className="grid min-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-2xl bg-[#fbfbf8] shadow-sm lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,1.06fr)_minmax(420px,.94fr)]">
        {/* Left Visual Brand Panel */}
        <aside className="relative hidden min-h-[680px] overflow-hidden bg-[#15251f] p-8 text-[#f4f6ef] lg:flex lg:flex-col xl:p-11">
          <div className="relative z-10 flex items-center justify-between">
            <VistaMark />
            <span className="text-sm font-medium tracking-wide text-[#c9d5ca]">Learning workspace</span>
          </div>

          <div className="relative z-10 mt-auto max-w-[13ch] pb-12">
            <p className="text-[clamp(3.3rem,6.2vw,6.6rem)] font-semibold leading-[0.86] tracking-[-0.07em] text-white">
              Make next move.
            </p>
            <p className="mt-7 max-w-[30ch] text-base leading-relaxed text-[#c9d5ca]">
              Write programs, test them safely, and turn every attempt into evidence of learning.
            </p>
          </div>

          <div
            className="absolute bottom-[-19vw] left-[-15vw] h-[54vw] w-[54vw] min-h-[600px] min-w-[600px] rounded-full bg-[#1b6c61]"
            aria-hidden
          />
          <div className="absolute bottom-0 right-0 h-[80%] w-[72%] overflow-hidden [clip-path:circle(74%_at_76%_64%)]">
            <img
              src="/images/vista-login-halftone-robot.png"
              alt="Dual-arm educational robot in the VISTA lab"
              className="h-full w-full object-cover object-[52%_52%] mix-blend-screen opacity-90"
            />
          </div>
          <p className="relative z-10 mt-auto max-w-[28ch] text-sm leading-relaxed text-[#dce5dc]">
            A focused environment for programming, schematic experiments, and robot practice.
          </p>
        </aside>

        {/* Right Form Panel */}
        <div className="relative flex min-h-[100dvh] items-center px-6 py-10 sm:px-12 lg:min-h-0 lg:px-[clamp(3rem,6vw,6.5rem)]">
          <div className="absolute left-0 top-0 h-2 w-full bg-[#1b6c61] lg:hidden" aria-hidden />

          <div className="w-full max-w-[380px] mx-auto lg:mx-0">
            {/* Mobile Header */}
            <div className="flex items-center justify-between lg:hidden mb-8">
              <VistaMark />
              <span className="text-sm font-medium text-ink-muted">Learning workspace</span>
            </div>

            {/* Journey Header */}
            <div>
              <p className="text-sm font-medium tracking-wide text-accent">
                {loginType === 'email'
                  ? 'Educator & Staff Access'
                  : studentMode === 'setup'
                  ? 'Account Activation'
                  : studentMode === 'recovery'
                  ? 'Password Recovery'
                  : 'Student Portal'}
              </p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.04em] text-ink">
                {studentMode === 'setup'
                  ? 'Set up account.'
                  : studentMode === 'recovery'
                  ? 'Reset password.'
                  : 'Enter VISTA.'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {studentMode === 'setup'
                  ? 'Enter your school, student, and setup codes to create your password.'
                  : studentMode === 'recovery'
                  ? 'Enter your recovery code to set a new password and regain access.'
                  : 'Sign in to continue your work in the robot lab.'}
              </p>
            </div>

            {configurationError ? (
              <div role="alert" className="mt-6 rounded-lg border border-danger/20 bg-danger-soft p-3.5 text-sm text-danger flex items-start gap-2.5">
                <AlertCircleIcon className="h-5 w-5 shrink-0 mt-0.5 text-danger" aria-hidden />
                <span>{configurationError}</span>
              </div>
            ) : (
              <>
                {/* Method Tabs (Only on Standard Sign-in) */}
                {studentMode === 'login' && (
                  <div className="mt-6 grid grid-cols-2 border-b border-line" role="tablist" aria-label="Sign-in method">
                    <button
                      id="tab-email"
                      type="button"
                      role="tab"
                      aria-selected={loginType === 'email'}
                      aria-controls="panel-email"
                      onClick={() => handleTabChange('email')}
                      className={`pb-3 text-sm transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        loginType === 'email'
                          ? 'border-b-2 border-accent font-semibold text-accent'
                          : 'font-medium text-ink-muted hover:text-ink'
                      }`}
                    >
                      Email
                    </button>
                    <button
                      id="tab-student"
                      type="button"
                      role="tab"
                      aria-selected={loginType === 'student'}
                      aria-controls="panel-student"
                      onClick={() => handleTabChange('student')}
                      className={`pb-3 text-sm transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        loginType === 'student'
                          ? 'border-b-2 border-accent font-semibold text-accent'
                          : 'font-medium text-ink-muted hover:text-ink'
                      }`}
                    >
                      Student Code
                    </button>
                  </div>
                )}

                {/* Status / Error Alerts */}
                {error && (
                  <div
                    role="alert"
                    className="mt-5 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger flex items-start gap-2"
                  >
                    <AlertCircleIcon className="h-4 w-4 shrink-0 mt-0.5 text-danger" aria-hidden />
                    <span className="flex-1">{error}</span>
                  </div>
                )}
                {success && (
                  <div
                    role="status"
                    className="mt-5 rounded-lg border border-ok/20 bg-ok-soft p-3 text-sm text-ok flex items-start gap-2"
                  >
                    <CheckCircle2Icon className="h-4 w-4 shrink-0 mt-0.5 text-ok" aria-hidden />
                    <span className="flex-1">{success}</span>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={submit} className="mt-5 space-y-4">
                  {loginType === 'email' ? (
                    <div>
                      <label htmlFor="login-email" className="block text-sm font-medium text-ink">
                        Email address
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="login-email"
                          required
                          autoComplete="email"
                          type="email"
                          disabled={submitting}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@school.edu"
                          className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 pr-10 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                        />
                        <MailIcon
                          aria-hidden
                          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* School Code */}
                      <div>
                        <label htmlFor="login-school-code" className="block text-sm font-medium text-ink">
                          School code
                        </label>
                        <input
                          id="login-school-code"
                          required
                          autoComplete="organization"
                          disabled={submitting}
                          value={schoolCode}
                          onChange={(e) => setSchoolCode(e.target.value)}
                          placeholder="e.g. VST-SCHOOL"
                          className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 text-sm uppercase text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                        />
                      </div>

                      {/* Student Code */}
                      <div>
                        <label htmlFor="login-student-code" className="block text-sm font-medium text-ink">
                          Student code
                        </label>
                        <input
                          id="login-student-code"
                          required
                          autoComplete="username"
                          disabled={submitting}
                          value={studentCode}
                          onChange={(e) => setStudentCode(e.target.value)}
                          placeholder="e.g. STU-101"
                          className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                        />
                      </div>

                      {/* One-Time Setup Code */}
                      {studentMode === 'setup' && (
                        <div>
                          <label htmlFor="login-setup-code" className="block text-sm font-medium text-ink">
                            One-time setup code
                          </label>
                          <input
                            id="login-setup-code"
                            required
                            autoComplete="one-time-code"
                            disabled={submitting}
                            value={setupCode}
                            onChange={(e) => setSetupCode(e.target.value)}
                            placeholder="Enter 20+ character code from welcome slip"
                            className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 font-mono text-xs sm:text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                          />
                          <p className="mt-1 text-xs text-ink-subtle">Provided on your account welcome slip</p>
                        </div>
                      )}

                      {/* One-Time Recovery Code */}
                      {studentMode === 'recovery' && (
                        <div>
                          <label htmlFor="login-recovery-code" className="block text-sm font-medium text-ink">
                            One-time recovery code
                          </label>
                          <input
                            id="login-recovery-code"
                            required
                            autoComplete="one-time-code"
                            disabled={submitting}
                            value={recoveryCode}
                            onChange={(e) => setRecoveryCode(e.target.value)}
                            placeholder="Enter recovery code from school admin"
                            className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 font-mono text-xs sm:text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                          />
                          <p className="mt-1 text-xs text-ink-subtle">Expires after 30 minutes</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Password Field */}
                  <div>
                    <label htmlFor="login-password" className="block text-sm font-medium text-ink">
                      {isNewPassword ? 'Create new password' : 'Password'}
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="login-password"
                        required
                        minLength={isNewPassword ? 12 : undefined}
                        autoComplete={isNewPassword ? 'new-password' : 'current-password'}
                        type={showPassword ? 'text' : 'password'}
                        disabled={submitting}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={isNewPassword ? 'At least 12 characters' : 'Your password'}
                        className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 pr-10 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-ink rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? (
                          <EyeOffIcon className="h-4 w-4" aria-hidden strokeWidth={1.8} />
                        ) : (
                          <EyeIcon className="h-4 w-4" aria-hidden strokeWidth={1.8} />
                        )}
                      </button>
                    </div>
                    {isNewPassword && (
                      <p className="mt-1 text-xs text-ink-subtle">Must be at least 12 characters</p>
                    )}
                  </div>

                  {/* Password Confirmation Field (for Setup and Recovery) */}
                  {isNewPassword && (
                    <div>
                      <label htmlFor="login-password-confirm" className="block text-sm font-medium text-ink">
                        Confirm password
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="login-password-confirm"
                          required
                          minLength={12}
                          autoComplete="new-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          disabled={submitting}
                          value={passwordConfirmation}
                          onChange={(e) => setPasswordConfirmation(e.target.value)}
                          placeholder="Re-enter your password"
                          className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 pr-10 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-ink rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                          aria-pressed={showConfirmPassword}
                        >
                          {showConfirmPassword ? (
                            <EyeOffIcon className="h-4 w-4" aria-hidden strokeWidth={1.8} />
                          ) : (
                            <EyeIcon className="h-4 w-4" aria-hidden strokeWidth={1.8} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Primary Submit Button */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      loading={submitting || loading}
                      className="h-11 w-full rounded-lg !bg-accent hover:!bg-accent-hover !text-white text-sm font-medium shadow-sm transition-colors"
                    >
                      {studentMode === 'recovery'
                        ? 'Reset password'
                        : studentMode === 'setup'
                        ? 'Activate account & sign in'
                        : 'Sign in'}
                    </Button>
                  </div>
                </form>

                {/* Supporting Navigation Links */}
                <div className="mt-6 flex flex-col items-center gap-3 text-center">
                  {loginType === 'student' && studentMode === 'login' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setStudentMode('setup');
                          resetFormState();
                        }}
                        className="text-sm font-medium text-accent hover:text-accent-hover underline underline-offset-4 transition-colors"
                      >
                        First time here? Set up your account
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStudentMode('recovery');
                          resetFormState();
                        }}
                        className="text-xs text-ink-muted hover:text-ink transition-colors"
                      >
                        Forgot password?
                      </button>
                    </>
                  )}

                  {loginType === 'student' && studentMode !== 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setStudentMode('login');
                        resetFormState();
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover underline underline-offset-4 transition-colors"
                    >
                      <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
                      {studentMode === 'setup'
                        ? 'Already have an active account? Sign in'
                        : 'Remember your password? Back to sign in'}
                    </button>
                  )}

                  {loginType === 'email' && (
                    <p className="text-xs text-ink-subtle">
                      Educators, school admins, and system administrators sign in with their organizational email.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Footer Trust Indicator */}
            <div className="mt-10 border-t border-line/60 pt-4 text-center">
              <p className="text-xs text-ink-subtle">
                Sessions and authentication are securely managed by the VISTA identity platform.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
