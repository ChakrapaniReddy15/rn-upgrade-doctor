/**
 * Known libraries table. Data only; checks read it from here.
 * Only entries confirmed from the libraries' own READMEs, npm pages or official announcements.
 */

export interface LibraryAdvice {
  /** Why the library is a problem on upgrade. */
  reason: string;
  /** What to use instead. */
  replacement: string;
}

export const LIBRARY_ADVICE: Record<string, LibraryAdvice> = {
  '@react-native-community/async-storage': {
    reason: 'Old package name, no longer published.',
    replacement: '@react-native-async-storage/async-storage',
  },
  '@react-native-community/cameraroll': {
    reason: 'Old package name, no longer published.',
    replacement: '@react-native-camera-roll/camera-roll',
  },
  '@react-native-community/viewpager': {
    reason: 'Old package name, no longer published.',
    replacement: 'react-native-pager-view',
  },
  '@react-native-community/masked-view': {
    reason: 'Old package name, no longer published.',
    replacement: '@react-native-masked-view/masked-view',
  },
  'react-native-camera': {
    reason: 'Deprecated by its maintainers.',
    replacement: 'react-native-vision-camera',
  },
  'react-native-appearance': {
    reason: 'Built into React Native since 0.62.',
    replacement: 'the Appearance API from react-native',
  },
  'react-native-code-push': {
    reason: 'Visual Studio App Center, which CodePush depends on, was retired on 31 March 2025.',
    replacement: 'expo-updates or a self-hosted CodePush server',
  },
  'react-native-fast-image': {
    reason: 'The original package is unmaintained.',
    replacement: '@d11/react-native-fast-image (maintained fork) or expo-image',
  },
  'react-native-splash-screen': {
    reason: 'Unmaintained.',
    replacement: 'react-native-bootsplash',
  },
  'react-native-vector-icons': {
    reason: 'Deprecated: the package moved to one package per icon family.',
    replacement: '@react-native-vector-icons/<family> packages (see the project MIGRATION.md)',
  },
  'metro-react-native-babel-preset': {
    reason: 'Deprecated by the React Native team.',
    replacement: '@react-native/babel-preset',
  },
  '@types/react-native': {
    reason: 'Deprecated stub: react-native ships its own TypeScript types.',
    replacement: 'nothing; remove it',
  },
  'redux-devtools-extension': {
    reason: 'Deprecated: the package moved.',
    replacement: '@redux-devtools/extension',
  },
};

/**
 * Native library file names (.so) shipped by React Native itself or the NDK.
 * Matched before the node_modules search, which cannot see libraries that come from Maven.
 */
export const REACT_NATIVE_CORE_LIBS: Array<string | RegExp> = [
  'libreactnative.so',
  'libhermes.so',
  'libhermesvm.so',
  'libhermestooling.so',
  'libjsi.so',
  'libfbjni.so',
  'libyoga.so',
  'libfolly_runtime.so',
  'libglog.so',
  'libjsctooling.so',
  'libjscexecutor.so',
  'libjsc.so',
  'libturbomodulejsijni.so',
  'libfabricjni.so',
  'libappmodules.so',
  /^libreact_/,
  /^librrc_/,
  /^libjsinspector/,
];

/** The NDK C++ runtime, packaged by whichever native library needs it (usually React Native). */
export const NDK_LIBS: string[] = ['libc++_shared.so'];

/** Fresco, the image library React Native depends on for Android (pulled from Maven, not node_modules). */
export const FRESCO_LIBS: string[] = ['libimagepipeline.so', 'libnative-filters.so', 'libnative-imagetranscoder.so'];

/** Library file names of popular packages whose names do not match a CMake target in node_modules. */
export const KNOWN_SO_PACKAGES: Record<string, string> = {
  'libreanimated.so': 'react-native-reanimated',
  'libworklets.so': 'react-native-worklets',
  'libreactnativemmkv.so': 'react-native-mmkv',
  'libmmkv.so': 'react-native-mmkv',
  'libvisioncamera.so': 'react-native-vision-camera',
  'librnscreens.so': 'react-native-screens',
  'librnskia.so': '@shopify/react-native-skia',
  'libgesturehandler.so': 'react-native-gesture-handler',
  'libsentry.so': '@sentry/react-native',
  'libsentry-android.so': '@sentry/react-native',
};
