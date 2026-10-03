import {
  DarkTheme,
  NavigationContainer,
  NavigationContainerRef,
  NavigatorScreenParams
} from "@react-navigation/native";
import {
  BottomTabBar,
  BottomTabNavigationProp,
  BottomTabScreenProps,
  createBottomTabNavigator
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, NativeStackScreenProps } from "@react-navigation/native-stack";
import { Bot, Camera, Hand, LayoutGrid, Settings as SettingsIcon } from "lucide-react-native";
import { RefObject, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import { CalibrateScreen } from "../screens/CalibrateScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { ConnectScreen } from "../screens/ConnectScreen";
import { HomeRoute, HomeScreen } from "../screens/HomeScreen";
import { PhoneTeleopScreen } from "../screens/PhoneTeleopScreen";
import { RobotHubRoute, RobotHubScreen } from "../screens/RobotHubScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { StatusScreen } from "../screens/StatusScreen";
import { TaskDetailScreen } from "../screens/TaskDetailScreen";
import { TasksScreen } from "../screens/TasksScreen";
import { TeleopScreen } from "../screens/TeleopScreen";
import { font, radius, spacing, type, ThemeColors } from "../theme";
import { useAppTheme } from "../ThemeContext";
import { SkyNexTabLabels, SkyNexTabs } from "./navigationContract";

enableScreens();

// The Robot tab. RobotHub is its root; the rest keep their technical names
// and are also entered directly from Home / Skill Detail.
type ControlStackParamList = {
  RobotHub: undefined;
  // `from: "hub"` / `"teleop"` means Back returns to that screen; without it
  // Back keeps its original Home destination for entries from Home / Skill
  // Detail.
  Connect: { from?: "hub" | "teleop" | "phone-teleop" } | undefined;
  Calibrate: { from?: "home" | "connect" } | undefined;
  Teleop: { from?: "home" | "connect" } | undefined;
  PhoneTeleop: { from?: "home" } | undefined;
  // Same StatusScreen Home pushes on its own stack, here reached from the hub.
  Status: undefined;
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
  navigationRef: RefObject<NavigationContainerRef<RootTabParamList> | null>;
  // Same activation callback the floating E-STOP calls — threaded only as
  // far as Phone Teleop's fullscreen view, a native Modal that covers the
  // whole app (the floating E-STOP included) and so carries its own.
  // Not a new state source: App.tsx still owns `emergencyStopped` alone.
  onEmergencyStop: () => void;
  // The real tab bar height, for the floating E-STOP's safe drag region.
  onTabBarHeightChange: (height: number) => void;
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
  onEmergencyStop,
  onTabBarHeightChange,
  reduceMotion
}: AppNavigatorProps) {
  const { colors: themeColors } = useAppTheme();
  const navigationTheme = useNavigationTheme(themeColors);
  const insets = useSafeAreaInsets();

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Tab.Navigator
        initialRouteName="Home"
        // The stock tab bar, measured: its real height (0 while hidden under
        // the keyboard) bounds the floating E-STOP's drag region.
        tabBar={(props) => (
          <View onLayout={(event) => onTabBarHeightChange(event.nativeEvent.layout.height)}>
            <BottomTabBar {...props} />
          </View>
        )}
        screenOptions={({ route }) => ({
          headerShown: false,
          lazy: true,
          // The one top-inset rule: every screen starts below the status
          // bar, except the Skills tab, whose library hero runs edge to edge
          // (its stack re-applies the inset to everything else it pushes).
          sceneStyle: { paddingTop: route.name === SkyNexTabs.SKILLS ? 0 : insets.top },
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
        <Tab.Screen name={SkyNexTabs.HOME} options={{ tabBarLabel: SkyNexTabLabels.HOME }}>
          {() => (
            <HomeStackScreen
              emergencyStopped={emergencyStopped}
              fontsReady={fontsReady}
              reduceMotion={reduceMotion}
            />
          )}
        </Tab.Screen>

        <Tab.Screen name={SkyNexTabs.SKILLS} options={{ tabBarLabel: SkyNexTabLabels.SKILLS }}>
          {() => <TasksStackScreen emergencyStopped={emergencyStopped} fontsReady={fontsReady} />}
        </Tab.Screen>

        <Tab.Screen name={SkyNexTabs.ROBOT} options={{ tabBarLabel: SkyNexTabLabels.ROBOT }}>
          {() => (
            <ControlStackScreen
              emergencyStopped={emergencyStopped}
              fontsReady={fontsReady}
              onEmergencyStop={onEmergencyStop}
              reduceMotion={reduceMotion}
            />
          )}
        </Tab.Screen>

        <Tab.Screen name={SkyNexTabs.VISION} options={{ tabBarLabel: SkyNexTabLabels.VISION }}>
          {(props) => <CameraTabScreen {...props} fontsReady={fontsReady} />}
        </Tab.Screen>

        <Tab.Screen name={SkyNexTabs.PROFILE} options={{ tabBarLabel: SkyNexTabLabels.PROFILE }}>
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
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onBack={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("HomeMain");
            }}
            // `from: "home"` makes Calibrate's back return to the Home tab,
            // whose stack still has this detail on top.
            onCalibrate={() =>
              navigation
                .getParent<BottomTabNavigationProp<RootTabParamList>>()
                ?.navigate("Control", { screen: "Calibrate", initial: false, params: { from: "home" } })
            }
            onConnect={() =>
              navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Control", { screen: "Connect", initial: false })
            }
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
        parent?.navigate("Control", { screen: "Connect", initial: false });
        break;
      case "calibrate":
        parent?.navigate("Control", { screen: "Calibrate", initial: false, params: { from: "home" } });
        break;
      case "teleop":
        parent?.navigate("Control", { screen: "Teleop", initial: false, params: { from: "home" } });
        break;
      case "phone-teleop":
        parent?.navigate("Control", { screen: "PhoneTeleop", initial: false, params: { from: "home" } });
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
      onOpenAccount={() => navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Settings")}
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

function TasksStackScreen({ emergencyStopped, fontsReady }: Pick<AppNavigatorProps, "emergencyStopped" | "fontsReady">) {
  const { colors: themeColors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <TaskStack.Navigator
      initialRouteName="TasksList"
      screenOptions={{
        contentStyle: { backgroundColor: themeColors.background, paddingTop: insets.top },
        headerShown: false
      }}
    >
      {/* Edge to edge: the library hero runs behind the status bar. */}
      <TaskStack.Screen name="TasksList" options={{ contentStyle: { backgroundColor: themeColors.background } }}>
        {({ navigation }: NativeStackScreenProps<TaskStackParamList, "TasksList">) => (
          <TasksScreen
            fontsReady={fontsReady}
            onOpenTask={(taskId) => navigation.navigate("TaskDetail", { taskId })}
          />
        )}
      </TaskStack.Screen>

      <TaskStack.Screen name="TaskDetail">
        {({ navigation, route }: NativeStackScreenProps<TaskStackParamList, "TaskDetail">) => (
          <TaskDetailScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onBack={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("TasksList");
            }}
            onCalibrate={() =>
              navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Control", { screen: "Calibrate", initial: false })
            }
            onConnect={() =>
              navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Control", { screen: "Connect", initial: false })
            }
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
  // Back to the Home tab for screens entered from Home, leaving the Robot
  // tab on its hub — otherwise the next Robot-tab tap lands back in a stale
  // controller instead of the hub.
  const returnHome = (navigation: NativeStackScreenProps<ControlStackParamList>["navigation"]) => {
    navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate("Home");
    navigation.popToTop();
  };

  return (
    <ControlStack.Navigator
      initialRouteName="RobotHub"
      screenOptions={{
        contentStyle: { backgroundColor: themeColors.background },
        headerShown: false
      }}
    >
      <ControlStack.Screen name="RobotHub">
        {({ navigation }: NativeStackScreenProps<ControlStackParamList, "RobotHub">) => (
          <RobotHubScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onOpenRoute={(route: RobotHubRoute) => {
              switch (route) {
                case "connect":
                  navigation.navigate("Connect", { from: "hub" });
                  break;
                case "calibrate":
                  navigation.navigate("Calibrate");
                  break;
                case "teleop":
                  navigation.navigate("Teleop");
                  break;
                case "phone-teleop":
                  navigation.navigate("PhoneTeleop");
                  break;
                case "status":
                  navigation.navigate("Status");
                  break;
              }
            }}
          />
        )}
      </ControlStack.Screen>

      <ControlStack.Screen name="Connect">
        {({ navigation, route }: NativeStackScreenProps<ControlStackParamList, "Connect">) => (
          <ConnectScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onBack={() => {
              if (route.params?.from && navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              returnHome(navigation);
            }}
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
                returnHome(navigation);
                return;
              }
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("RobotHub");
            }}
          />
        )}
      </ControlStack.Screen>

      <ControlStack.Screen name="Teleop">
        {({ navigation, route }: NativeStackScreenProps<ControlStackParamList, "Teleop">) => (
          <TeleopScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onCalibrate={() => navigation.navigate("Calibrate")}
            onConnect={() => navigation.navigate("Connect", { from: "teleop" })}
            onBack={() => {
              if (route.params?.from === "home") {
                returnHome(navigation);
                return;
              }
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("RobotHub");
            }}
          />
        )}
      </ControlStack.Screen>

      <ControlStack.Screen name="PhoneTeleop">
        {({ navigation, route }: NativeStackScreenProps<ControlStackParamList, "PhoneTeleop">) => (
          <PhoneTeleopScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onCalibrate={() => navigation.navigate("Calibrate")}
            onConnect={() => navigation.navigate("Connect", { from: "phone-teleop" })}
            onEmergencyStop={onEmergencyStop}
            onBack={() => {
              if (route.params?.from === "home") {
                returnHome(navigation);
                return;
              }
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("RobotHub");
            }}
          />
        )}
      </ControlStack.Screen>

      <ControlStack.Screen name="Status">
        {({ navigation }: NativeStackScreenProps<ControlStackParamList, "Status">) => (
          <StatusScreen
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onBack={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate("RobotHub");
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
      onOpenManual={() => navigation.navigate("Control", { screen: "Teleop", initial: false })}
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
