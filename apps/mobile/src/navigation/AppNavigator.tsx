import { DarkTheme, NavigationContainer, NavigatorScreenParams } from "@react-navigation/native";
import {
  BottomTabNavigationProp,
  BottomTabScreenProps,
  createBottomTabNavigator
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, NativeStackScreenProps } from "@react-navigation/native-stack";
import { Activity, Bot, Camera, Hand } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { enableScreens } from "react-native-screens";
import { CalibrateScreen } from "../screens/CalibrateScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { ConnectScreen } from "../screens/ConnectScreen";
import { HomeRoute, HomeScreen } from "../screens/HomeScreen";
import { StatusScreen } from "../screens/StatusScreen";
import { TeleopScreen } from "../screens/TeleopScreen";
import { colors, font, radius, spacing, type } from "../theme";

enableScreens();

type ControlStackParamList = {
  Connect: undefined;
  Calibrate: { from?: "home" | "connect" } | undefined;
  Teleop: { from?: "home" | "connect" } | undefined;
};

type RootTabParamList = {
  Home: undefined;
  Control: NavigatorScreenParams<ControlStackParamList> | undefined;
  Camera: undefined;
  Status: undefined;
};

type AppNavigatorProps = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  reduceMotion: boolean;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const ControlStack = createNativeStackNavigator<ControlStackParamList>();

const tabIcons = {
  Home: Bot,
  Control: Hand,
  Camera,
  Status: Activity
} satisfies Record<keyof RootTabParamList, typeof Bot>;

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    border: colors.border,
    card: colors.surface,
    notification: colors.danger,
    primary: colors.accent,
    text: colors.textHi
  }
};

export function AppNavigator({ emergencyStopped, fontsReady, reduceMotion }: AppNavigatorProps) {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          headerShown: false,
          lazy: true,
          tabBarActiveTintColor: colors.accent,
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ focused }) => {
            const Icon = tabIcons[route.name];
            return (
              <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
                <Icon color={focused ? colors.accent : colors.textLo} size={19} />
              </View>
            );
          },
          tabBarInactiveTintColor: colors.textLo,
          tabBarItemStyle: {
            borderRadius: 0,
            paddingVertical: spacing.xxs
          },
          tabBarLabelStyle: {
            ...type.small,
            ...font("display", fontsReady)
          },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            minHeight: 64,
            paddingBottom: spacing.xs,
            paddingTop: spacing.xs
          }
        })}
      >
        <Tab.Screen name="Home" options={{ tabBarLabel: "Trang chủ" }}>
          {(props) => (
            <HomeTabScreen
              {...props}
              emergencyStopped={emergencyStopped}
              fontsReady={fontsReady}
              reduceMotion={reduceMotion}
            />
          )}
        </Tab.Screen>

        <Tab.Screen name="Control" options={{ tabBarLabel: "Điều khiển" }}>
          {() => (
            <ControlStackScreen
              emergencyStopped={emergencyStopped}
              fontsReady={fontsReady}
              reduceMotion={reduceMotion}
            />
          )}
        </Tab.Screen>

        <Tab.Screen name="Camera" options={{ tabBarLabel: "Camera" }}>
          {(props) => <CameraTabScreen {...props} />}
        </Tab.Screen>

        <Tab.Screen name="Status" options={{ tabBarLabel: "Trạng thái" }}>
          {(props) => (
            <StatusTabScreen
              {...props}
              emergencyStopped={emergencyStopped}
              fontsReady={fontsReady}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function HomeTabScreen({
  emergencyStopped,
  fontsReady,
  navigation,
  reduceMotion
}: BottomTabScreenProps<RootTabParamList, "Home"> & AppNavigatorProps) {
  const handleOpenRoute = (route: HomeRoute) => {
    switch (route) {
      case "connect":
        navigation.navigate("Control", { screen: "Connect" });
        break;
      case "calibrate":
        navigation.navigate("Control", { screen: "Calibrate", params: { from: "home" } });
        break;
      case "teleop":
        navigation.navigate("Control", { screen: "Teleop", params: { from: "home" } });
        break;
      case "camera":
        navigation.navigate("Camera");
        break;
    }
  };

  return (
    <HomeScreen
      emergencyStopped={emergencyStopped}
      fontsReady={fontsReady}
      onOpenRoute={handleOpenRoute}
      reduceMotion={reduceMotion}
    />
  );
}

function ControlStackScreen({ emergencyStopped, fontsReady, reduceMotion }: AppNavigatorProps) {
  return (
    <ControlStack.Navigator
      initialRouteName="Connect"
      screenOptions={{
        contentStyle: { backgroundColor: colors.bg },
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
    </ControlStack.Navigator>
  );
}

function CameraTabScreen({ navigation }: BottomTabScreenProps<RootTabParamList, "Camera">) {
  return (
    <CameraScreen
      onBack={() => navigation.navigate("Home")}
      onOpenManual={() => navigation.navigate("Control", { screen: "Teleop" })}
    />
  );
}

function StatusTabScreen({
  emergencyStopped,
  fontsReady,
  navigation
}: BottomTabScreenProps<RootTabParamList, "Status"> & Pick<AppNavigatorProps, "emergencyStopped" | "fontsReady">) {
  return (
    <StatusScreen
      emergencyStopped={emergencyStopped}
      fontsReady={fontsReady}
      onBack={() => navigation.navigate("Home")}
    />
  );
}

const styles = StyleSheet.create({
  tabIconWrap: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs
  },
  tabIconWrapActive: {
    backgroundColor: colors.surface2,
    borderColor: colors.accent
  }
});
