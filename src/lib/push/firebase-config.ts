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

export const FIREBASE_VAPID_KEY = import.meta.env['VITE_FIREBASE_VAPID_KEY'] ?? "";

export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const config: FirebaseWebConfig = {
    apiKey: import.meta.env['VITE_FIREBASE_API_KEY'] ?? "",
    authDomain: import.meta.env['VITE_FIREBASE_AUTH_DOMAIN'] ?? "",
    projectId: import.meta.env['VITE_FIREBASE_PROJECT_ID'] ?? "",
    messagingSenderId: import.meta.env['VITE_FIREBASE_MESSAGING_SENDER_ID'] ?? "",
    appId: import.meta.env['VITE_FIREBASE_APP_ID'] ?? "",
  };
  const complete = Object.values(config).every((value) => value.length > 0);
  return complete && FIREBASE_VAPID_KEY.length > 0 ? config : null;
}

export function isPushConfigured(): boolean {
  return getFirebaseWebConfig() !== null;
}
