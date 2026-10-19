import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.redesignededge.app',
  appName: 'Redesigned Edge AI',
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [],
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#f6f1e7',
  },
};

export default config;
