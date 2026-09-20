import {
  DarkTheme,
  NavigationContainer,
  NavigationContainerRef,
  NavigatorScreenParams
} from "@react-navigation/native";
import {
  BottomTabNavigationProp,
  BottomTabScreenProps,
  createBottomTabNavigator
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, NativeStackScreenProps } from "@react-navigation/native-stack";
import { Bot, Camera, Hand, LayoutGrid, Settings as SettingsIcon } from "lucide-react-native";
import { RefObject, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { enableScreens } from "react-native-screens";
import { CalibrateScreen } from "../screens/CalibrateScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { ConnectScreen } from "../screens/ConnectScreen";
import { HomeRoute, HomeScreen } from "../screens/HomeScreen";
import { PhoneTeleopScreen } from "../screens/PhoneTeleopScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { StatusScreen } from "../screens/StatusScreen";
import { TaskDetailScreen } from "../screens/TaskDetailScreen";
import { TasksScreen } from "../screens/TasksScreen";
import { TeleopScreen } from "../screens/TeleopScreen";
import { font, radius, spacing, type, ThemeColors } from "../theme";
import { useAppTheme } from "../ThemeContext";

enableScreens();

type ControlStackParamList = {
  Connect: undefined;
  Calibrate: { from?: "home" | "connect" } | undefined;
  Teleop: { from?: "home" | "connect" } | undefined;
  PhoneTeleop: { from?: "home" } | undefined;
};

type TaskStackParamList = {
  TasksList: undefined;
  TaskDetail: { taskId: string };
};

// Home gets its own tiny stack (mirroring TaskStack) so a task opened from a
// Home featured card pushes onto Home's own history instead of reaching into
// the Tasks tab's stack. That cross-tab reach used to leave a stray
// TaskDetail sitting on top of the Tasks tab's stack forever (tab navigators
// preserve each tab's nested state across switches), so the next time
// someone opened the Tasks tab they'd land back on that stale detail screen
// instead of the list — and its params still said `from: "home"`, so its
// Back button kept returning to Home even when reached that way. Giving each
// tab its own stack means plain navigation.goBack() is always correct: it
// pops within whichever stack actually did the pushing.
type HomeStackParamList = {
  HomeMain: undefined;
  TaskDetail: { taskId: string };
  // Robot-context entry point (Home → SO-ARM101 → Trạng thái). Deliberately
  // not a bottom tab — see RootTabParamList's comment.
  Status: undefined;
};

export type RootTabParamList = {
  Home: undefined;
  Tasks: NavigatorScreenParams<TaskStackParamList> | undefined;
  Control: NavigatorScreenParams<ControlStackParamList> | undefined;
  Camera: undefined;
  // Account management lives inside Settings (Account section), not as its
  // own tab or profile system — see SettingsScreen.tsx. StatusScreen is
  // reached via HomeStack's "Status" route (Home → SO-ARM101 → Trạng thái),
  // not as its own bottom tab.
  Settings: undefined;
};

type AppNavigatorProps = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  reduceMotion: boolean;
  // Lets GlobalChrome (mounted once, above this whole navigator) know the
  // deepest active route name so it can show Home's product-first header
  // (avatar, no wordmark) only on Home's own screen — not on a TaskDetail
  // pushed from Home, which already has its own header via the hero.
  onActiveRouteChange?: (routeName: string | undefined) => void;
  // Owned by App.tsx (via useNavigationContainerRef) so the Home avatar's
  // "open Settings > Tài khoản" shortcut can imperatively navigate from
  // GlobalChrome, which is mounted above this whole navigator and has no
  // navigation prop of its own.
  navigationRef: RefObject<NavigationContainerRef<RootTabParamList> | null>;
  // Same activation callback GlobalChrome's own E-STOP button calls —
  // threaded only as far as Phone Teleop's fullscreen overlay, which is the
  // one surface that visually covers GlobalChrome and would otherwise leave
  // a user with no E-STOP control while potentially driving the robot live.
  // Not a new state source: App.tsx still owns `emergencyStopped` alone.
  onEmergencyStop: () => void;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const ControlStack = createNativeStackNavigator<ControlStackParamList>();
const TaskStack = createNativeStackNavigator<TaskStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

const tabIcons = {
  Home: Bot,
  Tasks: LayoutGrid,
  Control: Hand,
  Camera,
  Settings: SettingsIcon
} satisfies Record<keyof RootTabParamList, typeof Bot>;

// React Navigation's own theme controls the default background/border
// painted behind screens that don't set their own (and the native-stack
// transition backdrop). Built per-render from the app theme so bottom-nav
// and every nested stack's transition backdrop follow Light/Dark; each
// screen also still paints its own explicit theme-aware background on top.
function useNavigationTheme(themeColors: ThemeColors) {
  return useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: themeColors.background,
        border: themeColors.border,
        card: themeColors.surface,
        notification: themeColors.danger,
        primary: themeColors.accent,
        text: themeColors.textPrimary
      }
    }),
    [themeColors]
  );
}

export function AppNavigator({
  emergencyStopped,
  fontsReady,
  navigationRef,
  onActiveRouteChange,
  onEmergencyStop,
  reduceMotion
}: AppNavigatorProps) {
  const { colors: themeColors } = useAppTheme();
  const navigationTheme = useNavigationTheme(themeColors);
  const reportActiveRoute = () => onActiveRouteChange?.(navigationRef.current?.getCurrentRoute()?.name);

  return (
    <NavigationContainer
      onReady={reportActiveRoute}
      onStateChange={reportActiveRoute}
      ref={navigationRef}
      theme={navigationTheme}
    >
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          headerShown: false,
          lazy: true,
          // Bare lime reads almost invisibly on Light's near-white tab bar
          // (~1.3:1) — accentStrong is the same lime family, deepened only
          // enough on Light to clear contrast; on Dark it equals accent
          // exactly, so the active tab tint is pixel-unchanged there.
          tabBarActiveTintColor: themeColors.accentStrong,
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ focused }) => {
            const Icon = tabIcons[route.name];
            return (
              <View
                style={[
                  styles.tabIconWrap,
                  focused && {
                    backgroundColor: themeColors.surfaceSecondary,
                    borderColor: themeColors.accentStrong
                  }
                ]}
              >
                <Icon color={focused ? themeColors.accentStrong : themeColors.textSecondary} size={19} />
              </View>
            );
          },
          tabBarInactiveTintColor: themeColors.textSecondary,
          tabBarItemStyle: {
            borderRadius: 0,
            paddingVertical: spacing.xxs
          },
          tabBarLabelStyle: {
            ...type.small,
            ...font("display", fontsReady)
          },
          tabBarStyle: {
            backgroundColor: themeColors.surface,
            borderTopColor: themeColors.border,
            borderTopWidth: 1,
            minHeight: 64,
            paddingBottom: spacing.xs,
            paddingTop: spacing.xs
          }
        })}
      >
        <Tab.Screen name="Home" options={{ tabBarLabel: "Trang chủ" }}>
          {() => (
            <HomeStackScreen
              emergencyStopped={emergencyStopped}
              fontsReady={fontsReady}
              reduceMotion={reduceMotion}
            />
          )}
        </Tab.Screen>

        <Tab.Screen name="Tasks" options={{ tabBarLabel: "Tác vụ" }}>
          {() => <TasksStackScreen fontsReady={fontsReady} />}
        </Tab.Screen>

        <Tab.Screen name="Control" options={{ tabBarLabel: "Điều khiển" }}>
          {() => (
            <ControlStackScreen
              emergencyStopped={emergencyStopped}
              fontsReady={fontsReady}
              onEmergencyStop={onEmergencyStop}
              reduceMotion={reduceMotion}
            />
          )}
        </Tab.Screen>

        <Tab.Screen name="Camera" options={{ tabBarLabel: "Camera" }}>
          {(props) => <CameraTabScreen {...props} fontsReady={fontsReady} />}
        </Tab.Screen>

        <Tab.Screen name="Settings" options={{ tabBarLabel: "Cài đặt" }}>
          {() => <SettingsScreen fontsReady={fontsReady} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// Home's own stack: HomeMain is the dashboard, TaskDetail is pushed locally
// when a featured task card is opened. See the HomeStackParamList comment
// above for why this exists instead of reaching into the Tasks tab's stack.
function HomeStackScreen({
  emergencyStopped,
  fontsReady,
  reduceMotion
}: Pick<AppNavigatorProps, "emergencyStopped" | "fontsReady" | "reduceMotion">) {
  const { colors: themeColors } = useAppTheme();

  return (
    <HomeStack.Navigator
      initialRouteName="HomeMain"
      screenOptions={{
        contentStyle: { backgroundColor: themeColors.background },
        headerShown: false
      }}
    >
      <HomeStack.Screen name="HomeMain">
        {({ navigation }: NativeStackScreenProps<HomeStackParamList, "HomeMain">) => (
          <HomeMainScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            navigation={navigation}
            reduceMotion={reduceMotion}
          />
        )}
      </HomeStack.Screen>

      <HomeStack.Screen name="TaskDetail">
        {({ navigation, route }: NativeStackScreenProps<HomeStackParamList, "TaskDetail">) => (
          <TaskDetailScreen
            fontsReady={fontsReady}
            onBack={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("HomeMain");
            }}
            taskId={route.params.taskId}
          />
        )}
      </HomeStack.Screen>

      <HomeStack.Screen name="Status">
        {({ navigation }: NativeStackScreenProps<HomeStackParamList, "Status">) => (
          <StatusScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onBack={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("HomeMain");
            }}
          />
        )}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  );
}

function HomeMainScreen({
  emergencyStopped,
  fontsReady,
  navigation,
  reduceMotion
}: {
  navigation: NativeStackScreenProps<HomeStackParamList, "HomeMain">["navigation"];
} & Pick<AppNavigatorProps, "emergencyStopped" | "fontsReady" | "reduceMotion">) {
  const handleOpenRoute = (route: HomeRoute) => {
    const parent = navigation.getParent<BottomTabNavigationProp<RootTabParamList>>();
    switch (route) {
      case "connect":
        parent?.navigate("Control", { screen: "Connect" });
        break;
      case "calibrate":
        parent?.navigate("Control", { screen: "Calibrate", params: { from: "home" } });
        break;
      case "teleop":
        parent?.navigate("Control", { screen: "Teleop", params: { from: "home" } });
        break;
      case "phone-teleop":
        parent?.navigate("Control", { screen: "PhoneTeleop", params: { from: "home" } });
        break;
      case "camera":
        parent?.navigate("Camera");
        break;
    }
  };

  return (
    <HomeScreen
      emergencyStopped={emergencyStopped}
      fontsReady={fontsReady}
      onOpenTask={(taskId) => navigation.navigate("TaskDetail", { taskId })}
      onOpenRoute={handleOpenRoute}
      onOpenStatus={() => navigation.navigate("Status")}
      onOpenTasksLibrary={() =>
        navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Tasks", { screen: "TasksList" })
      }
      reduceMotion={reduceMotion}
    />
  );
}

function TasksStackScreen({ fontsReady }: Pick<AppNavigatorProps, "fontsReady">) {
  const { colors: themeColors } = useAppTheme();

  return (
    <TaskStack.Navigator
      initialRouteName="TasksList"
      screenOptions={{
        contentStyle: { backgroundColor: themeColors.background },
        headerShown: false
      }}
    >
      <TaskStack.Screen name="TasksList">
        {({ navigation }: NativeStackScreenProps<TaskStackParamList, "TasksList">) => (
          <TasksScreen
            fontsReady={fontsReady}
            onBack={() => navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Home")}
            onOpenTask={(taskId) => navigation.navigate("TaskDetail", { taskId })}
          />
        )}
      </TaskStack.Screen>

      <TaskStack.Screen name="TaskDetail">
        {({ navigation, route }: NativeStackScreenProps<TaskStackParamList, "TaskDetail">) => (
          <TaskDetailScreen
            fontsReady={fontsReady}
            onBack={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("TasksList");
            }}
            taskId={route.params.taskId}
          />
        )}
      </TaskStack.Screen>
    </TaskStack.Navigator>
  );
}

function ControlStackScreen({
  emergencyStopped,
  fontsReady,
  onEmergencyStop,
  reduceMotion
}: Pick<AppNavigatorProps, "emergencyStopped" | "fontsReady" | "onEmergencyStop" | "reduceMotion">) {
  const { colors: themeColors } = useAppTheme();

  return (
    <ControlStack.Navigator
      initialRouteName="Connect"
      screenOptions={{
        contentStyle: { backgroundColor: themeColors.background },
        headerShown: false
      }}
    >
      <ControlStack.Screen name="Connect">
        {({ navigation }: NativeStackScreenProps<ControlStackParamList, "Connect">) => (
          <ConnectScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onBack={() => navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Home")}
            onContinue={() => navigation.navigate("Calibrate", { from: "connect" })}
            onOpenTeleop={() => navigation.navigate("Teleop", { from: "connect" })}
            reduceMotion={reduceMotion}
          />
        )}
      </ControlStack.Screen>

      <ControlStack.Screen name="Calibrate">
        {({ navigation, route }: NativeStackScreenProps<ControlStackParamList, "Calibrate">) => (
          <CalibrateScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onBack={() => {
              if (route.params?.from === "home") {
                navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Home");
                return;
              }
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("Connect");
            }}
          />
        )}
      </ControlStack.Screen>

      <ControlStack.Screen name="Teleop">
        {({ navigation, route }: NativeStackScreenProps<ControlStackParamList, "Teleop">) => (
          <TeleopScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onBack={() => {
              if (route.params?.from === "home") {
                navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Home");
                return;
              }
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("Connect");
            }}
          />
        )}
      </ControlStack.Screen>

      <ControlStack.Screen name="PhoneTeleop">
        {({ navigation, route }: NativeStackScreenProps<ControlStackParamList, "PhoneTeleop">) => (
          <PhoneTeleopScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onEmergencyStop={onEmergencyStop}
            onBack={() => {
              if (route.params?.from === "home") {
                navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Home");
                return;
              }
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("Connect");
            }}
          />
        )}
      </ControlStack.Screen>
    </ControlStack.Navigator>
  );
}

function CameraTabScreen({
  fontsReady,
  navigation
}: BottomTabScreenProps<RootTabParamList, "Camera"> & Pick<AppNavigatorProps, "fontsReady">) {
  return (
    <CameraScreen
      fontsReady={fontsReady}
      onBack={() => navigation.navigate("Home")}
      onOpenManual={() => navigation.navigate("Control", { screen: "Teleop" })}
    />
  );
}

const styles = StyleSheet.create({
  // Layout-only — color (background/border) for the focused state is applied
  // inline from the theme, since this StyleSheet is created once at module
  // load, before any theme is known.
  tabIconWrap: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs
  }
});
