import type { CapacitorConfig } from '@capacitor/cli';

const previewHost = 'phatbot-app-git-feature-athlete-mobile-shell-next-level11.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.nextleveldigitalmedia.phatbot',
  appName: 'PHATBOT',
  webDir: 'ios-shell',
  server: {
    url: `https://${previewHost}`,
    allowNavigation: ['*.vercel.app'],
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
};

export default config;
