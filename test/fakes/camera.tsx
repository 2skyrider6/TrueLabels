/**
 * Camera and OCR fakes for widget tests.
 *
 * The camera cannot be driven from a unit test, so the two native pieces the
 * screens depend on are replaced with controllable fakes. A test sets `camera`
 * or `ocr`, drives the flow with the exported helpers, and asserts on the
 * rendered screen. Nothing here sleeps: capture and recognition resolve
 * immediately, so every assertion runs against a settled tree.
 */

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface CameraHarness {
  /** What `getCameraPermissionsAsync` reports. */
  current: PermissionStatus;
  /** What `requestCameraPermissionsAsync` resolves to. */
  nextRequest: PermissionStatus;
  /** Holds the status read open, so the screen's pending state can be observed. */
  readDeferred: boolean;
  /** Rejects the status read, for a broken permission service. */
  readThrows: boolean;
  /** Rejects the permission request. */
  requestThrows: boolean;
  /** What `takePictureAsync` returns. */
  captureUri: string;
  captureThrows: boolean;
  captureReturnsNothing: boolean;
  /** Barcode payloads delivered through `onBarcodeScanned`. */
  barcodeEvents: { type: string; data: string }[];
  /** How many times a picture was requested. */
  captureCount: number;
  /** Options passed to the last `takePictureAsync` call. */
  captureOptions: unknown;
  /** How many times the permission prompt was requested. */
  requestCount: number;
  /** Whether `onCameraReady` has fired. */
  ready: boolean;
}

export const camera: CameraHarness = {
  current: 'undetermined',
  nextRequest: 'granted',
  readDeferred: false,
  readThrows: false,
  requestThrows: false,
  captureUri: 'file:///cache/Camera/scan.jpg',
  captureThrows: false,
  captureReturnsNothing: false,
  barcodeEvents: [],
  captureCount: 0,
  captureOptions: null,
  ready: false,
  requestCount: 0,
};

export function resetCamera(over: Partial<CameraHarness> = {}): void {
  Object.assign(camera, {
    current: 'undetermined',
    nextRequest: 'granted',
    readDeferred: false,
    readThrows: false,
    requestThrows: false,
    captureUri: 'file:///cache/Camera/scan.jpg',
    captureThrows: false,
    captureReturnsNothing: false,
    barcodeEvents: [],
    captureCount: 0,
    captureOptions: null,
    ready: false,
    requestCount: 0,
  });
  Object.assign(camera, over);
}

/** Releases a held permission read. */
let releaseRead: (() => void) | null = null;

export function releaseCameraRead(): void {
  releaseRead?.();
  releaseRead = null;
}

/**
 * The mounted fake camera, if any. A screen mounts at most one, so a single slot
 * is enough.
 *
 * The component is held rather than its handlers: a handler captured on mount
 * closes over the state of that first render, so `onBarcodeScanned` would still see
 * `cameraReady: false` after the screen set it and every scan would be ignored.
 * Reading the props off the live instance delivers the event to the current
 * handler instead.
 */
export const mountedCamera: { component?: MountedCamera } = {};

interface MountedCamera {
  props: {
    onBarcodeScanned?: (event: { type: string; data: string }) => void;
    onCameraReady?: () => void;
  };
}

/** Delivers a scanned barcode to the mounted camera view. */
export function emitBarcode(data: string, type = 'ean13'): void {
  camera.barcodeEvents.push({ type, data });
  if (!camera.ready) return;
  mountedCamera.component?.props.onBarcodeScanned?.({ type, data });
}

/** Fires `onCameraReady`, which is what unblocks the scanner overlay. */
export function markCameraReady(): void {
  camera.ready = true;
  mountedCamera.component?.props.onCameraReady?.();
}

export function installFakeCamera(): void {
  jest.doMock('expo-camera', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text, View } = require('react-native');

    type AnyProps = Record<string, unknown>;

    class CameraView extends React.Component<AnyProps> {
      static displayName = 'CameraView';

      takePictureAsync = async (options: unknown) => {
        camera.captureCount += 1;
        camera.captureOptions = options;

        if (camera.captureThrows) throw new Error('camera busy');
        if (camera.captureReturnsNothing) return undefined;
        return { uri: camera.captureUri };
      };

      componentDidMount() {
        mountedCamera.component = this as unknown as MountedCamera;
      }

      componentWillUnmount() {
        delete mountedCamera.component;
      }

      render() {
        return (
          <View testID="camera-view">
            <Text>camera preview</Text>
          </View>
        );
      }
    }

    return {
      __esModule: true,
      CameraView,
      Camera: {
        getCameraPermissionsAsync: async () => {
          if (camera.readThrows) throw new Error('permission service unavailable');
          if (camera.readDeferred) {
            await new Promise<void>(resolve => {
              releaseRead = resolve;
            });
          }
          return { status: camera.current };
        },
        requestCameraPermissionsAsync: async () => {
          camera.requestCount += 1;
          if (camera.requestThrows) throw new Error('permission request failed');
          camera.current = camera.nextRequest;
          return { status: camera.current };
        },
      },
    };
  });
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

export interface OcrHarness {
  /** What `isSupported` reports. */
  supported: boolean;
  /** Text the recogniser returns. */
  text: string;
  /** Reject the recognition with this message, or null to resolve. */
  throws: string | null;
  /** Make the native module itself unavailable, as in Expo Go. */
  moduleMissing: boolean;
  /** How many times recognition was attempted. */
  calls: number;
}

export const ocr: OcrHarness = {
  supported: true,
  text: '',
  throws: null,
  moduleMissing: false,
  calls: 0,
};

export function resetOcr(over: Partial<OcrHarness> = {}): void {
  Object.assign(ocr, {
    supported: true,
    text: '',
    throws: null,
    moduleMissing: false,
    calls: 0,
  });
  Object.assign(ocr, over);
}

export function installFakeOcr(): void {
  jest.doMock('expo-mlkit-ocr', () => ({
    __esModule: true,
    isSupported: () => {
      if (ocr.moduleMissing) throw new Error('native module not found');
      return ocr.supported;
    },
    recognizeText: async () => {
      ocr.calls += 1;
      if (ocr.throws) throw new Error(ocr.throws);
      return { text: ocr.text };
    },
  }));
}