/**
 * Stand-in for `react-native-worklets` under Jest.
 *
 * Reanimated's own Jest mock still imports the real reanimated, which loads
 * worklets, and worklets installs native unpackers during module initialisation
 * — something that throws under Jest because there is no native runtime.
 *
 * These are every identifier reanimated reads from worklets while its modules
 * are being evaluated (taken from its own imports), and none of them need to do
 * anything for the animation layer to render.
 */

/** Called with a worklet body that reanimated would run on the UI runtime. */
export const runOnUISync = () => {};

export const scheduleOnUI = () => {};

export const scheduleOnRN = () => {};

export const toggleSlowAnimationsOnUIRuntime = () => {};

export const UIRuntimeId = 0;

export const RuntimeKind = { RN: 0, Reanimated: 1, UI: 2 } as const;

export const isWorkletFunction = () => false;

/**
 * Maps a JS object to the serializable handle that stands in for it on the UI
 * runtime. Reanimated reads and writes this map at module scope, so it has to
 * behave like a real one.
 */
export const serializableMappingCache = new Map();

/** Identity: passing a value through unchanged is the correct no-op here. */
export const createSerializable = <T,>(value: T): T => value;

export const makeShareable = <T,>(value: T): T => value;

export const createShareable = <T,>(value: T): T => value;

export const createSynchronizable = <T,>(value: T): T => value;

export const createWorkletRuntimeFromWorklets = () => 0;

export const executeOnUIRuntimeSyncFromWorklets = () => undefined;

export const getUIRuntimeHolder = () => undefined;

export const getUISchedulerHolder = () => undefined;

export const isWorkletFunctionFromWorklets = () => false;

export const runOnJSFromWorklets = <T,>(fn: (...args: never[]) => T) => fn;

export const runOnRuntimeFromWorklets = () => undefined;

export const runOnUIFromWorklets = () => undefined;

/** Turbo module handle, absent because there is no native side under Jest. */
export const WorkletsModule = undefined;
