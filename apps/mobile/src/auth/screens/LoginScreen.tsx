import { ChevronLeft, Info } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyButton, SkyText } from "../../components/ui";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { useAuth } from "../AuthContext";
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

// Wide phones and tablets keep a comfortable form measure instead of
// stretching fields edge to edge.
const FORM_MAX_WIDTH = 480;

// "How do I access my existing account?" — focus and trust after Welcome's
// emotion: no visual stage, no logo, one strong title, a calm form and one
// dominant action. Nothing here can sign anyone in until a real account
// backend exists (see services/authService.ts).
export function LoginScreen({ fontsReady, onBack, onCreateAccount }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.md, paddingTop: insets.top + space.xs }
        ]}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {/* Same back affordance the app uses elsewhere (TaskDetail): a
              44pt chevron, announced in Vietnamese. Pops this auth stack. */}
          <Pressable
            accessibilityLabel="Quay lại"
            accessibilityRole="button"
            hitSlop={4}
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <ChevronLeft color={colors.textPrimary} size={24} />
          </Pressable>

          <View style={styles.intro}>
            <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
              Chào mừng trở lại
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary">
              Đăng nhập để tiếp tục với SkyNex.
            </SkyText>
          </View>

          <View style={styles.form}>
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

          <View style={styles.actions}>
            <SkyButton fontsReady={fontsReady} loading={submitting} onPress={handleSubmit} size="lg">
              Đăng nhập
            </SkyButton>

            {notice ? (
              <View accessibilityLiveRegion="polite" style={styles.notice}>
                <Info color={colors.textSecondary} size={18} />
                <SkyText fontsReady={fontsReady} style={styles.noticeText} tone="secondary" variant="caption">
                  {notice}
                </SkyText>
              </View>
            ) : null}
          </View>

          {/* Social providers go here once they are real: a "hoặc" divider,
              then "Tiếp tục với Google" / "Tiếp tục với Apple" as secondary
              SkyButtons. Nothing is rendered until then. */}
        </View>

        {/* Pushed to the bottom on tall screens; follows the form on short
            ones (the content scrolls rather than overlapping). */}
        <View style={[styles.column, styles.footer]}>
          <SkyText fontsReady={fontsReady} tone="secondary">
            Chưa có tài khoản?
          </SkyText>
          <Pressable
            accessibilityLabel="Tạo tài khoản"
            accessibilityRole="button"
            onPress={onCreateAccount}
            style={({ pressed }) => [styles.footerAction, pressed && styles.pressed]}
          >
            <SkyText fontsReady={fontsReady} variant="sectionTitle">
              Tạo tài khoản
            </SkyText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      flexGrow: 1,
      justifyContent: "space-between",
      paddingHorizontal: layout.screenGutter
    },
    column: {
      alignSelf: "center",
      maxWidth: FORM_MAX_WIDTH,
      width: "100%"
    },
    // Optically aligned with the text below it: the chevron's glyph, not its
    // 44pt box, sits on the gutter.
    back: {
      alignItems: "center",
      height: 44,
      justifyContent: "center",
      marginLeft: -space.sm,
      width: 44
    },
    intro: {
      gap: space.xs,
      marginBottom: space.xxl,
      marginTop: space.xxl
    },
    form: {
      gap: space.lg
    },
    actions: {
      gap: space.md,
      marginTop: space.xxl
    },
    // Calm and neutral on purpose: this is information, not an error.
    notice: {
      alignItems: "flex-start",
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.card,
      flexDirection: "row",
      gap: space.sm,
      padding: layout.cardPadding
    },
    noticeText: {
      flexShrink: 1
    },
    footer: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.xxs,
      justifyContent: "center",
      marginTop: space.xxl
    },
    footerAction: {
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: space.xxs
    },
    pressed: {
      opacity: 0.7
    }
  });
}
