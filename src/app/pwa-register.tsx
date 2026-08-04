'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && !('workbox' in window)) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('Service worker registered successfully:', reg.scope);
          })
          .catch((err) => {
            console.warn('Service worker registration failed:', err);
          });
      });
    }
  }, []);

  return null;
}
