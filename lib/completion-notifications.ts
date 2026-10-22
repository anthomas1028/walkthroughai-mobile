import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_BASE_URL, apiFetch } from './api';

// A new native build is required. Keep ordinary builds and Expo Go unchanged.
export const completionAlertsSupported = Platform.OS !== 'web' &&
  Constants.executionEnvironment !== 'storeClient' &&
  Constants.expoConfig?.extra?.completionNotifications === true;

export async function setCompletionAlert(jobId: string, enabled: boolean, existingToken?: string) {
  if (!completionAlertsSupported) throw new Error('Completion alerts require the updated test build.');
  let token = existingToken;
  if (enabled) {
    token = await requestCompletionToken();
  }
  if (!token) return '';
  const response = await apiFetch(`${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/completion-notification`, {
    method: enabled ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Could not update the completion alert. Analysis will continue.');
  return token;
}

export async function requestCompletionToken() {
  if (!completionAlertsSupported) throw new Error("Completion alerts require the updated test build.");
  const Notifications = await import("expo-notifications");
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('analysis', {
      name: 'Analysis completion', importance: Notifications.AndroidImportance.DEFAULT,
    });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) throw new Error('Notifications are off. Enable Walkthrough AI notifications in iPhone Settings, then try again.');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) throw new Error('This build is missing its notification project configuration.');
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
