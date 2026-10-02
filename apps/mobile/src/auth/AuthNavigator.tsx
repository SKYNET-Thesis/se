import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { useAppTheme } from "../ThemeContext";
import { LoginScreen } from "./screens/LoginScreen";
import { SignUpScreen } from "./screens/SignUpScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";

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
          // Every auth screen draws its own chrome: Welcome is full-bleed,
          // and the account forms draw their own "Quay lại" chevron so their
          // keyboard handling owns the whole screen (no native header height
          // to offset). System back / swipe-back still pop this stack.
          headerShown: false
        }}
      >
        <AuthStack.Screen name="Welcome">
          {({ navigation }) => (
            <WelcomeScreen
              fontsReady={fontsReady}
              onLogin={() => navigation.navigate("Login")}
              onSignUp={() => navigation.navigate("SignUp")}
            />
          )}
        </AuthStack.Screen>
        <AuthStack.Screen name="Login">
          {({ navigation }) => (
            <LoginScreen
              fontsReady={fontsReady}
              onBack={() => navigation.goBack()}
              onCreateAccount={() => navigation.navigate("SignUp")}
            />
          )}
        </AuthStack.Screen>
        <AuthStack.Screen name="SignUp">
          {({ navigation }) => (
            <SignUpScreen
              fontsReady={fontsReady}
              onBack={() => navigation.goBack()}
              // popTo, not navigate: returns to a Login already below in the
              // stack (Welcome → Login → SignUp), or replaces SignUp with Login
              // when entered from Welcome — so Login/SignUp never pile up.
              onLogin={() => navigation.popTo("Login")}
            />
          )}
        </AuthStack.Screen>
      </AuthStack.Navigator>
    </NavigationContainer>
  );
}
