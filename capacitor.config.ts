import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nextleveldigitalmedia.phatbot',
  appName: 'PHATBOT',
  webDir: 'ios-shell',
  server: {
    url: 'https://app.phatbotfit.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
};

export default config;
