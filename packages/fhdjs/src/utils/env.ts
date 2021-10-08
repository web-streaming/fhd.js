export const isBrowser = typeof window !== 'undefined';
export const isFirefox = isBrowser && /firefox/i.test(navigator.userAgent);
export const isAndroid = isBrowser && /android/i.test(navigator.userAgent);
export const isSafari = isBrowser && /Safari/i.test(navigator.userAgent);
export const isChrome = isBrowser && /Chrome/i.test(navigator.userAgent);
export const safariVersion = isSafari ? parseInt(navigator.userAgent.match(/Safari\/(\d+)/i)?.[1] || '0') : 0;
export const chromeVersion = isChrome ? parseInt(navigator.userAgent.match(/Chrome\/(\d+)/i)?.[1] || '0') : 0;
