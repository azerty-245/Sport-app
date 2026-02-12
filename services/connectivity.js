import * as Network from 'expo-network';
import { useEffect, useState } from 'react';

/**
 * Hook to monitor network connectivity status.
 */
export function useConnectivity() {
    const [isConnected, setIsConnected] = useState(true);

    useEffect(() => {
        async function checkInitial() {
            try {
                const state = await Network.getNetworkStateAsync();
                setIsConnected(state.isConnected !== false);
            } catch (e) {
                console.warn('Connectivity check failed', e);
            }
        }

        checkInitial();

        // In a real app we'd use NetInfo from @react-native-community/netinfo 
        // but for Expo SDK base, we check periodically or at focus
        const interval = setInterval(async () => {
            try {
                const state = await Network.getNetworkStateAsync();
                if (state.isConnected !== isConnected) {
                    setIsConnected(state.isConnected !== false);
                }
            } catch (e) { }
        }, 5000);

        return () => clearInterval(interval);
    }, [isConnected]);

    return isConnected;
}
