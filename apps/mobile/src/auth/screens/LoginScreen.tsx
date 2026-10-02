import { useRef, useState } from "react";
import { AccessibilityInfo, TextInput, View } from "react-native";
import { SkyButton } from "../../components/ui";
import { useAuth } from "../AuthContext";
import { AuthFormLayout, authFormStyles, AuthNotice } from "../components/AuthFormLayout";
import { AuthTextField, PasswordVisibilityToggle } from "../components/AuthTextField";
import { validateEmail, validatePassword } from "../validation";

type Props = {
  fontsReady: boolean;
  onBack: () => void;
  onCreateAccount: () => void;
};

type FieldErrors = { email: string | null; password: string | null };

const NO_ERRORS: FieldErrors = { email: null, password: null };

// Shown when the form is valid but account sign-in cannot happen yet. Not a
// failure, and nothing about the password — the account service simply
// isn't connected. Points to the path that does work today.
const UNAVAILABLE_MESSAGE =
  "Đăng nhập bằng tài khoản chưa khả dụng. Bạn có thể quay lại và chọn “Tiếp tục không cần tài khoản”.";

// "How do I access my existing account?" Nothing here can sign anyone in
// until a real account backend exists (see services/authService.ts).
export function LoginScreen({ fontsReady, onBack, onCreateAccount }: Props) {
  const { signInWithEmail } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  // Errors appear after a submit attempt (or leaving a filled-in email
  // field), never while someone is still typing their first characters.
  // Once shown, they update live so a fixed field clears immediately.
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setNotice(null);
    if (attempted || errors.email) setErrors((prev) => ({ ...prev, email: validateEmail(value) }));
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setNotice(null);
    if (attempted || errors.password) setErrors((prev) => ({ ...prev, password: validatePassword(value) }));
  };

  const handleEmailBlur = () => {
    if (email.trim().length > 0) setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setAttempted(true);

    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    if (next.email || next.password) {
      setNotice(null);
      (next.email ? emailRef : passwordRef).current?.focus();
      AccessibilityInfo.announceForAccessibility((next.email ?? next.password) as string);
      return;
    }

    // Real async sign-in later: inputs lock and the button shows progress
    // for as long as the request actually takes. Today the service answers
    // at once, so no spinner is ever faked.
    setSubmitting(true);
    const result = await signInWithEmail(email, password);
    setSubmitting(false);

    if (!result.ok && result.reason === "unavailable") {
      setNotice(UNAVAILABLE_MESSAGE);
      AccessibilityInfo.announceForAccessibility(UNAVAILABLE_MESSAGE);
    }
  };

  return (
    <AuthFormLayout
      fontsReady={fontsReady}
      footerActionLabel="Tạo tài khoản"
      footerPrompt="Chưa có tài khoản?"
      onBack={onBack}
      onFooterAction={onCreateAccount}
      subtitle="Đăng nhập để tiếp tục với SkyNex."
      title="Chào mừng trở lại"
    >
      <View style={authFormStyles.form}>
        <AuthTextField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!submitting}
          error={errors.email}
          fontsReady={fontsReady}
          inputMode="email"
          keyboardType="email-address"
          label="Email"
          onBlur={handleEmailBlur}
          onChangeText={handleEmailChange}
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="ban@email.com"
          ref={emailRef}
          returnKeyType="next"
          submitBehavior="submit"
          textContentType="username"
          value={email}
        />
        <AuthTextField
          autoCapitalize="none"
          autoComplete="current-password"
          autoCorrect={false}
          editable={!submitting}
          error={errors.password}
          fontsReady={fontsReady}
          label="Mật khẩu"
          onChangeText={handlePasswordChange}
          onSubmitEditing={handleSubmit}
          ref={passwordRef}
          returnKeyType="done"
          rightAccessory={
            <PasswordVisibilityToggle
              disabled={submitting}
              onToggle={() => setPasswordVisible((visible) => !visible)}
              visible={passwordVisible}
            />
          }
          secureTextEntry={!passwordVisible}
          textContentType="password"
          value={password}
        />
        {/* "Quên mật khẩu?" belongs here, right-aligned under the password
            field — added only once a real reset flow exists. */}
      </View>

      <View style={authFormStyles.actions}>
        <SkyButton fontsReady={fontsReady} loading={submitting} onPress={handleSubmit} size="lg">
          Đăng nhập
        </SkyButton>
        {notice ? <AuthNotice fontsReady={fontsReady} message={notice} /> : null}
      </View>
    </AuthFormLayout>
  );
}
