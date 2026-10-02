import { useState, useEffect, useCallback } from 'react';
import { Camera } from 'expo-camera';

export function useCameraPermission() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    Camera.getCameraPermissionsAsync()
      .then(({ status }) => {
        if (!cancelled) setHasPermission(status === 'granted');
      })
      .catch(error => {
        console.error('Failed to read camera permission:', error);
        if (!cancelled) setHasPermission(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      return status === 'granted';
    } catch (error) {
      console.error('Failed to request camera permission:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  return { hasPermission, requestPermission, hasCameraPermission: hasPermission === true };
}
