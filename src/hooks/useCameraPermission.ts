import { useState, useEffect, useCallback, useRef } from 'react';
import { Camera } from 'expo-camera';
import { getItemAsync, setItemAsync } from 'expo-secure-store';

/**
 * Key used to persist the camera permission decision across app restarts.
 */
const CAMERA_PERMISSION_KEY = 'truelabels_camera_permission';

/**
 * Hook to manage camera permission state.
 *
 * On first launch, requests camera permission once and caches the result.
 * Subsequent launches read from cache so the user is never asked again unless
 * they explicitly change the permission in system settings.
 */
export function useCameraPermission() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const hasInitialized = useRef(false);

  // Load cached permission decision on mount
  useEffect(() => {
    let cancelled = false;

    async function loadCachedPermission() {
      try {
        const stored = await getItemAsync(CAMERA_PERMISSION_KEY);
        if (!cancelled && stored !== null) {
          setHasPermission(stored === 'granted');
        } else if (!cancelled) {
          // No cached decision yet — will be resolved when requestPermission runs
          setHasPermission(null);
        }
      } catch {
        // Ignore storage errors; we'll just prompt again
        if (!cancelled) setHasPermission(null);
      }
    }

    loadCachedPermission();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      const granted = status === 'granted';
      setHasPermission(granted);

      // Cache the decision so we never ask again unless the user changes it
      try {
        await setItemAsync(CAMERA_PERMISSION_KEY, status);
      } catch {
        // Ignore storage errors — permission still works, just won't persist
      }

      return granted;
    } catch (error) {
      console.error('Failed to request camera permission:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  // Request permission once when mount if we haven't decided yet
  useEffect(() => {
    if (hasInitialized.current) return;

    (async () => {
      try {
        const { status } = await Camera.requestCameraPermissionsAsync();
        const granted = status === 'granted';
        setHasPermission(granted);
        try {
          await setItemAsync(CAMERA_PERMISSION_KEY, status);
        } catch {
          // Ignore storage errors
        }
      } catch {
        setHasPermission(false);
      }
    })();

    hasInitialized.current = true;
  }, [hasPermission]);

  return {
    hasPermission,
    requestPermission,
    hasCameraPermission: hasPermission === true,
  };
}
