import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { font, type } from "../theme";
import { useAppTheme } from "../ThemeContext";
import { AuthPlaceholderScreen } from "./screens/AuthPlaceholderScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";

// Route names are the FINAL ones; only the screen behind SignUp is still a
// temporary placeholder.
export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  SignUp: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

// The account-access flow, entirely separate from the main app's
// AppNavigator (its own container, no tabs, no GlobalChrome / E-STOP).
// AppEntry mounts it only in the "auth" phase, so leaving it — e.g.
// "Tiếp tục không cần tài khoản" — unmounts the whole stack: back can never
// return here from the app. Welcome is the root, so system back on it
// follows platform behavior (exits on Android) and onboarding, which isn't
// part of this stack, can't be reached.
export function AuthNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { colors, mode } = useAppTheme();
  const navigationTheme = useMemo(() => {
    const base = mode === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        border: colors.border,
        card: colors.background,
        primary: colors.accentStrong,
        text: colors.textPrimary
      }
    };
  }, [colors, mode]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <AuthStack.Navigator
        initialRouteName="Welcome"
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          // Chevron only. Never the previous route's name — "Welcome" is an
          // internal English route name, not UI copy; the Vietnamese title
          // still names the control for screen readers.
          headerBackButtonDisplayMode: "minimal",
          headerBackTitle: "Quay lại",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontFamily: font("display", fontsReady).fontFamily,
            fontSize: type.bodyStrong.fontSize,
            fontWeight: type.bodyStrong.fontWeight
          }
        }}
      >
        <AuthStack.Screen name="Welcome" options={{ headerShown: false }}>
          {({ navigation }) => (
            <WelcomeScreen
              fontsReady={fontsReady}
              onLogin={() => navigation.navigate("Login")}
              onSignUp={() => navigation.navigate("SignUp")}
            />
          )}
        </AuthStack.Screen>
        {/* Draws its own back control so the keyboard handling can own the
            whole screen (no native header height to offset). */}
        <AuthStack.Screen name="Login" options={{ headerShown: false }}>
          {({ navigation }) => (
            <LoginScreen
              fontsReady={fontsReady}
              onBack={() => navigation.goBack()}
              onCreateAccount={() => navigation.navigate("SignUp")}
            />
          )}
        </AuthStack.Screen>
        <AuthStack.Screen name="SignUp" options={{ title: "Tạo tài khoản" }}>
          {() => <AuthPlaceholderScreen fontsReady={fontsReady} />}
        </AuthStack.Screen>
      </AuthStack.Navigator>
    </NavigationContainer>
  );
}
