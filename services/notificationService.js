import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Unified Notification Service for Web (Electron) and Native (iOS/Android).
 */

// Configure Android channel
if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
    });
}

/**
 * Request notification permissions on all platforms.
 */
export async function requestNotificationPermissions() {
    if (Platform.OS === 'web') {
        if (!('Notification' in window)) {
            console.warn('This browser does not support desktop notifications');
            return false;
        }
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    } else {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        return finalStatus === 'granted';
    }
}

/**
 * Send a notification immediately.
 * @param {string} title 
 * @param {string} body 
 */
export async function sendNotification(title, body) {
    console.log(`[Notification] ${title}: ${body}`);

    if (Platform.OS === 'web') {
        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/icon.png' });
        }
    } else {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
                priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: null, // Immediate
        });
    }
}
