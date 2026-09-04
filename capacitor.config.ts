import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nextleveldigitalmedia.phatbot',
  appName: 'PHATBOT',
  webDir: 'ios-shell',
  server: {
    url: 'https://phatbot-app.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
};

export default config;
