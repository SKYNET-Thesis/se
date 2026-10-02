import { usePreventRemove } from "@react-navigation/native";
import { Calendar, ChevronRight } from "lucide-react-native";
import { RefObject, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SkyButton, SkyText } from "../../components/ui";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { useAuth } from "../AuthContext";
import { AuthNotice } from "../components/AuthFormLayout";
import { AuthStepLayout, StepNextButton } from "../components/AuthStepLayout";
import { AuthPickerField, AuthTextField, FieldError, PasswordVisibilityToggle } from "../components/AuthTextField";
import { BirthDatePickerSheet } from "../components/BirthDatePickerSheet";
import { genderLabel, GenderOptions } from "../components/GenderOptions";
import { formatBirthDate } from "../signup/birthDate";
import { DEFAULT_PHONE_COUNTRY, formatPhone, toE164, validatePhone } from "../signup/phone";
import { Gender, SignUpPayload } from "../types";
import {
  validateBirthDate,
  validateDisplayName,
  validateEmail,
  validateGender,
  validatePassword,
  validatePasswordConfirmation
} from "../validation";

type Props = {
  fontsReady: boolean;
  // Leaves Create Account (step 1's back).
  onBack: () => void;
  onLogin: () => void;
};

// The in-memory draft for this sign-up session. Lives only in this screen's
// state: never persisted (no AsyncStorage, no account record), and dropped
// when the user leaves Create Account. `confirmation` is client-only.
type SignUpDraft = {
  email: string;
  password: string;
  confirmation: string;
  displayName: string;
  phone: string;
  birthDate: string | null;
  gender: Gender | null;
};

type FieldKey = keyof SignUpDraft;
type FieldErrors = Partial<Record<FieldKey, string | null>>;

const EMPTY_DRAFT: SignUpDraft = {
  email: "",
  password: "",
  confirmation: "",
  displayName: "",
  phone: "",
  birthDate: null,
  gender: null
};

// One question per step. Each step lists the draft fields it owns, in focus
// order, and how to check them — the controller below stays generic.
const STEPS = [
  { id: "email", question: "Email của bạn là gì?", fields: ["email"] },
  { id: "password", question: "Tạo mật khẩu", fields: ["password", "confirmation"] },
  { id: "name", question: "Bạn tên là gì?", hint: "Tên này sẽ hiển thị trong SkyNex.", fields: ["displayName"] },
  { id: "phone", question: "Số điện thoại của bạn là gì?", fields: ["phone"] },
  { id: "birthDate", question: "Ngày sinh của bạn?", fields: ["birthDate"] },
  { id: "gender", question: "Giới tính của bạn?", fields: ["gender"] },
  { id: "review", question: "Hoàn tất", hint: "Kiểm tra lại thông tin của bạn.", fields: [] }
] as const satisfies readonly { id: string; question: string; hint?: string; fields: readonly FieldKey[] }[];

type StepId = (typeof STEPS)[number]["id"];

const REVIEW_STEP = STEPS.length - 1;

function validateField(field: FieldKey, draft: SignUpDraft): string | null {
  switch (field) {
    case "email":
      return validateEmail(draft.email);
    case "password":
      return validatePassword(draft.password);
    case "confirmation":
      return validatePasswordConfirmation(draft.password, draft.confirmation);
    case "displayName":
      return validateDisplayName(draft.displayName);
    case "phone":
      return validatePhone(DEFAULT_PHONE_COUNTRY, draft.phone);
    case "birthDate":
      return validateBirthDate(draft.birthDate);
    case "gender":
      return validateGender(draft.gender);
  }
}

// Only what a backend would need. Built once, at the final step, after
// every step has validated.
function toPayload(draft: SignUpDraft): SignUpPayload {
  return {
    email: draft.email,
    password: draft.password,
    profile: {
      displayName: draft.displayName,
      phone: toE164(DEFAULT_PHONE_COUNTRY, draft.phone),
      birthDate: draft.birthDate as string,
      gender: draft.gender as Gender
    }
  };
}

// Neutral: not a network error, not "this email is taken" — the account
// service simply isn't connected.
const UNAVAILABLE_MESSAGE =
  "Tạo tài khoản chưa khả dụng. Tính năng này sẽ hoạt động khi dịch vụ tài khoản SkyNex được kết nối.";

// "I want a SkyNex account." A progressive flow inside the one SignUp route:
// one question per screen, internal step state, and a draft that survives
// moving back and forth. Nothing here creates an account, sends an SMS or
// verifies anything until a real backend exists (services/authService.ts).
export function SignUpScreen({ fontsReady, onBack, onLogin }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { signUp } = useAuth();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SignUpDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Fields whose step has been submitted at least once: their errors then
  // update live. Before that, nothing is flagged while someone types.
  const [checked, setChecked] = useState<Set<FieldKey>>(new Set());
  // Set when a step is opened from the review list, so "Tiếp tục" returns
  // straight to the review instead of walking every step again.
  const [returnToReview, setReturnToReview] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refs: Partial<Record<FieldKey, RefObject<TextInput | null>>> = {
    email: useRef<TextInput>(null),
    password: useRef<TextInput>(null),
    confirmation: useRef<TextInput>(null),
    displayName: useRef<TextInput>(null),
    phone: useRef<TextInput>(null)
  };

  const current = STEPS[step];

  const goToStep = (next: number) => {
    Keyboard.dismiss();
    setNotice(null);
    setStep(next);
  };

  // System back (Android button, iOS swipe) walks back through the steps
  // first; only step 1 leaves Create Account. The draft stays meanwhile.
  usePreventRemove(step > 0, () => goToStep(step - 1));

  const handleBack = () => (step > 0 ? goToStep(step - 1) : onBack());

  const update = <K extends FieldKey>(field: K, value: SignUpDraft[K]) => {
    setNotice(null);
    const next = { ...draft, [field]: value };
    setDraft(next);
    // Re-check live only what has been flagged or submitted. A password
    // change also re-checks the confirmation (a mismatch can be fixed from
    // either side).
    setErrors((prevErrors) => {
      const updated = { ...prevErrors };
      const affected: FieldKey[] = field === "password" ? ["password", "confirmation"] : [field];
      for (const key of affected) {
        if (checked.has(key) || prevErrors[key]) updated[key] = validateField(key, next);
      }
      return updated;
    });
  };

  // Leaving a filled-in field may flag it (like Login's email), never an
  // empty one the user hasn't reached yet.
  const checkOnBlur = (field: FieldKey) => {
    const value = draft[field];
    if (typeof value === "string" && value.length > 0) {
      setErrors((prev) => ({ ...prev, [field]: validateField(field, draft) }));
    }
  };

  const handleNext = () => {
    const fields: readonly FieldKey[] = current.fields;
    const stepErrors = Object.fromEntries(fields.map((field) => [field, validateField(field, draft)]));
    setErrors((prev) => ({ ...prev, ...stepErrors }));
    setChecked((prev) => new Set([...prev, ...fields]));

    const firstInvalid = fields.find((field) => stepErrors[field]);
    if (firstInvalid) {
      refs[firstInvalid]?.current?.focus();
      AccessibilityInfo.announceForAccessibility(stepErrors[firstInvalid] as string);
      return;
    }

    if (returnToReview) {
      setReturnToReview(false);
      goToStep(REVIEW_STEP);
    } else {
      goToStep(step + 1);
    }
  };

  const editFromReview = (stepId: StepId) => {
    setReturnToReview(true);
    goToStep(STEPS.findIndex((s) => s.id === stepId));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    // Every step validated on the way here; re-check defensively so an
    // incomplete draft can never reach the boundary.
    const allFields = STEPS.flatMap((s) => s.fields as readonly FieldKey[]);
    const firstInvalid = allFields.find((field) => validateField(field, draft));
    if (firstInvalid) {
      editFromReview(STEPS.find((s) => (s.fields as readonly FieldKey[]).includes(firstInvalid))!.id);
      return;
    }

    setSubmitting(true);
    const result = await signUp(toPayload(draft));
    setSubmitting(false);

    if (!result.ok && result.reason === "unavailable") {
      setNotice(UNAVAILABLE_MESSAGE);
      AccessibilityInfo.announceForAccessibility(UNAVAILABLE_MESSAGE);
    }
  };

  const isReview = step === REVIEW_STEP;

  return (
    <>
      <AuthStepLayout
        action={
          isReview ? (
            <View style={styles.finalAction}>
              <SkyButton fontsReady={fontsReady} loading={submitting} onPress={handleSubmit} size="lg">
                Tạo tài khoản
              </SkyButton>
              {notice ? <AuthNotice fontsReady={fontsReady} message={notice} /> : null}
            </View>
          ) : (
            <StepNextButton onPress={handleNext} />
          )
        }
        bottomLeft={
          step === 0 ? (
            <View style={styles.loginLink}>
              <SkyText fontsReady={fontsReady} tone="secondary">
                Đã có tài khoản?
              </SkyText>
              <Pressable
                accessibilityLabel="Đăng nhập"
                accessibilityRole="button"
                onPress={onLogin}
                style={({ pressed }) => [styles.linkAction, pressed && styles.pressed]}
              >
                <SkyText fontsReady={fontsReady} variant="sectionTitle">
                  Đăng nhập
                </SkyText>
              </Pressable>
            </View>
          ) : undefined
        }
        fontsReady={fontsReady}
        hint={"hint" in current ? current.hint : undefined}
        // Remounts the step's inputs, so each step's autoFocus applies.
        key={current.id}
        onBack={handleBack}
        question={current.question}
        step={step}
        stepCount={STEPS.length}
      >
        {current.id === "email" && (
          <AuthTextField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            autoFocus
            error={errors.email}
            fontsReady={fontsReady}
            inputMode="email"
            keyboardType="email-address"
            label="Email"
            onBlur={() => checkOnBlur("email")}
            onChangeText={(value) => update("email", value)}
            onSubmitEditing={handleNext}
            placeholder="ban@email.com"
            ref={refs.email}
            returnKeyType="next"
            submitBehavior="submit"
            textContentType="username"
            value={draft.email}
          />
        )}

        {current.id === "password" && (
          <View style={styles.fieldGroup}>
            <AuthTextField
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              autoFocus
              error={errors.password}
              fontsReady={fontsReady}
              label="Mật khẩu"
              onChangeText={(value) => update("password", value)}
              onSubmitEditing={() => refs.confirmation?.current?.focus()}
              ref={refs.password}
              returnKeyType="next"
              rightAccessory={
                <PasswordVisibilityToggle
                  onToggle={() => setPasswordVisible((visible) => !visible)}
                  visible={passwordVisible}
                />
              }
              secureTextEntry={!passwordVisible}
              submitBehavior="submit"
              textContentType="newPassword"
              value={draft.password}
            />
            <AuthTextField
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              error={errors.confirmation}
              fontsReady={fontsReady}
              label="Xác nhận mật khẩu"
              onBlur={() => checkOnBlur("confirmation")}
              onChangeText={(value) => update("confirmation", value)}
              onSubmitEditing={handleNext}
              ref={refs.confirmation}
              returnKeyType="next"
              rightAccessory={
                <PasswordVisibilityToggle
                  onToggle={() => setConfirmationVisible((visible) => !visible)}
                  visible={confirmationVisible}
                />
              }
              secureTextEntry={!confirmationVisible}
              submitBehavior="submit"
              textContentType="newPassword"
              value={draft.confirmation}
            />
          </View>
        )}

        {current.id === "name" && (
          <AuthTextField
            autoCapitalize="words"
            autoComplete="name"
            autoFocus
            error={errors.displayName}
            fontsReady={fontsReady}
            label="Tên của bạn"
            onChangeText={(value) => update("displayName", value)}
            onSubmitEditing={handleNext}
            ref={refs.displayName}
            returnKeyType="next"
            submitBehavior="submit"
            textContentType="name"
            value={draft.displayName}
          />
        )}

        {current.id === "phone" && (
          <AuthTextField
            autoComplete="tel"
            autoFocus
            error={errors.phone}
            fontsReady={fontsReady}
            inputMode="tel"
            keyboardType="phone-pad"
            label="Số điện thoại"
            leftAccessory={<CountryPrefix colors={colors} fontsReady={fontsReady} styles={styles} />}
            onBlur={() => checkOnBlur("phone")}
            onChangeText={(value) => update("phone", value)}
            onSubmitEditing={handleNext}
            placeholder="912 345 678"
            ref={refs.phone}
            returnKeyType="next"
            submitBehavior="submit"
            textContentType="telephoneNumber"
            value={draft.phone}
          />
        )}

        {current.id === "birthDate" && (
          <AuthPickerField
            accessibilityHint="Mở lịch để chọn ngày sinh"
            error={errors.birthDate}
            fontsReady={fontsReady}
            icon={Calendar}
            label="Ngày sinh"
            onPress={() => setDatePickerOpen(true)}
            placeholder="Chọn ngày sinh"
            value={draft.birthDate ? formatBirthDate(draft.birthDate) : ""}
          />
        )}

        {current.id === "gender" && (
          <View style={styles.fieldGroup}>
            <GenderOptions fontsReady={fontsReady} onChange={(value) => update("gender", value)} value={draft.gender} />
            <FieldError error={errors.gender} fontsReady={fontsReady} />
          </View>
        )}

        {current.id === "review" && (
          <View style={styles.review}>
            <ReviewRow
              fontsReady={fontsReady}
              label="Email"
              onEdit={() => editFromReview("email")}
              styles={styles}
              colors={colors}
              value={draft.email.trim()}
            />
            <ReviewRow
              fontsReady={fontsReady}
              label="Tên"
              onEdit={() => editFromReview("name")}
              styles={styles}
              colors={colors}
              value={draft.displayName.trim()}
            />
            <ReviewRow
              colors={colors}
              fontsReady={fontsReady}
              label="Số điện thoại"
              onEdit={() => editFromReview("phone")}
              styles={styles}
              value={draft.phone ? formatPhone(DEFAULT_PHONE_COUNTRY, draft.phone) : ""}
            />
            <ReviewRow
              colors={colors}
              fontsReady={fontsReady}
              label="Ngày sinh"
              onEdit={() => editFromReview("birthDate")}
              styles={styles}
              value={draft.birthDate ? formatBirthDate(draft.birthDate) : ""}
            />
            <ReviewRow
              colors={colors}
              fontsReady={fontsReady}
              isLast
              label="Giới tính"
              onEdit={() => editFromReview("gender")}
              styles={styles}
              value={draft.gender ? genderLabel(draft.gender) : ""}
            />
          </View>
        )}
      </AuthStepLayout>

      <BirthDatePickerSheet
        fontsReady={fontsReady}
        onCancel={() => setDatePickerOpen(false)}
        onConfirm={(isoDate) => {
          setDatePickerOpen(false);
          update("birthDate", isoDate);
        }}
        value={draft.birthDate}
        visible={datePickerOpen}
      />
    </>
  );
}

// The dial code inside the phone field. Plain text while there is only one
// country — a selector with a single choice would be a dead control; it
// becomes a button once PHONE_COUNTRIES has more than one entry.
function CountryPrefix({
  colors,
  fontsReady,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View
      accessibilityLabel={`Mã quốc gia ${DEFAULT_PHONE_COUNTRY.dialCode}, ${DEFAULT_PHONE_COUNTRY.name}`}
      accessible
      style={styles.prefix}
    >
      <SkyText fontsReady={fontsReady} variant="cardTitle">
        {DEFAULT_PHONE_COUNTRY.dialCode}
      </SkyText>
      <View style={[styles.prefixDivider, { backgroundColor: colors.border }]} />
    </View>
  );
}

// One line of the final summary; tapping it reopens that step.
function ReviewRow({
  colors,
  fontsReady,
  isLast = false,
  label,
  onEdit,
  styles,
  value
}: {
  label: string;
  value: string;
  onEdit: () => void;
  isLast?: boolean;
  fontsReady: boolean;
  colors: SkyNexColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityHint="Sửa thông tin này"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onEdit}
      style={({ pressed }) => [styles.reviewRow, isLast && styles.reviewRowLast, pressed && styles.pressed]}
    >
      <View style={styles.reviewText}>
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          {label}
        </SkyText>
        <SkyText fontsReady={fontsReady} numberOfLines={1} variant="cardTitle">
          {value}
        </SkyText>
      </View>
      <ChevronRight color={colors.textSecondary} size={18} />
    </Pressable>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    fieldGroup: {
      gap: space.lg
    },
    loginLink: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.xxs
    },
    linkAction: {
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: space.xxs
    },
    prefix: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm,
      marginRight: space.sm
    },
    prefixDivider: {
      height: 20,
      width: 1
    },
    review: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.card,
      overflow: "hidden"
    },
    reviewRow: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: space.sm,
      minHeight: 56,
      paddingHorizontal: layout.cardPadding,
      paddingVertical: space.xs
    },
    reviewRowLast: {
      borderBottomWidth: 0
    },
    reviewText: {
      flex: 1,
      gap: 2
    },
    finalAction: {
      flex: 1,
      gap: space.md
    },
    pressed: {
      opacity: 0.7
    }
  });
}
