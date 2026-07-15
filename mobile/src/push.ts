import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

// Show notifications while the app is foregrounded too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Notification data the server attaches for deep-linking (lib/push.ts). */
export interface PushData {
  kind?: string;
  callId?: string;
  callerPhone?: string | null;
}

export const CALLBACK_ACTION = "callback";

/** Register the "call" category so emergency/booking pushes with a caller
 *  number get a Call back button right on the notification. */
export async function registerNotificationActions(): Promise<void> {
  await Notifications.setNotificationCategoryAsync("call", [
    { identifier: CALLBACK_ACTION, buttonTitle: "Call back", options: { opensAppToForeground: true } },
  ]).catch(() => {});
}

/** Ask for permission and return this device's Expo push token (or null). */
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null; // push tokens aren't issued on simulators

  let granted = (await Notifications.getPermissionsAsync()).granted;
  if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId || undefined;
  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch {
    return null;
  }
}
