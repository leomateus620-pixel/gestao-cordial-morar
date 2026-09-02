/**
 * Configuração pública do Firebase (client/web push).
 * Todos os valores são publicáveis; a service account fica APENAS no servidor.
 */
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
};

/**
 * Config web do Firebase é publicável (fica exposta no bundle por design).
 * Mantemos defaults do projeto gestao-cordial-morar e permitimos override por env.
 */
const DEFAULTS = {
  apiKey: "AIzaSyBBgS3P2esoIoW5fddb8CwOozlg9NItjYY",
  authDomain: "gestao-cordial-morar.firebaseapp.com",
  projectId: "gestao-cordial-morar",
  messagingSenderId: "588791348287",
  appId: "1:588791348287:web:3a2a6d63b7ab40f3350c8a",
  vapidKey:
    "BFSbDljh2c-nfKM3woanB0mFaLnWAr_w3P4mhcSQ5Y7EjQPmiyZfFne5L8JEHl4pCFbeoy4Z6cUZisA47AprGJc",
} as const;

export const FIREBASE_VAPID_KEY =
  import.meta.env['VITE_FIREBASE_VAPID_KEY'] || DEFAULTS.vapidKey;

export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const config: FirebaseWebConfig = {
    apiKey: import.meta.env['VITE_FIREBASE_API_KEY'] || DEFAULTS.apiKey,
    authDomain: import.meta.env['VITE_FIREBASE_AUTH_DOMAIN'] || DEFAULTS.authDomain,
    projectId: import.meta.env['VITE_FIREBASE_PROJECT_ID'] || DEFAULTS.projectId,
    messagingSenderId:
      import.meta.env['VITE_FIREBASE_MESSAGING_SENDER_ID'] || DEFAULTS.messagingSenderId,
    appId: import.meta.env['VITE_FIREBASE_APP_ID'] || DEFAULTS.appId,
  };
  const complete = Object.values(config).every((value) => value.length > 0);
  return complete && FIREBASE_VAPID_KEY.length > 0 ? config : null;
}


export function isPushConfigured(): boolean {
  return getFirebaseWebConfig() !== null;
}
