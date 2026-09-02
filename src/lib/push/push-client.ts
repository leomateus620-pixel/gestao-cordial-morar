import { initializeApp, getApps, getApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { FIREBASE_VAPID_KEY, getFirebaseWebConfig } from "@/lib/push/firebase-config";

export type PushStatus =
  | "registered"
  | "not-configured"
  | "unsupported"
  | "open-in-new-tab"
  | "denied"
  | "error";

export type PushResult = { status: PushStatus; message?: string };

function messagingInstance(config: Record<string, string>) {
  const app = getApps().length ? getApp() : initializeApp(config);
  return getMessaging(app);
}

/** Solicita permissão, obtém o token FCM e grava em `user_push_tokens` (RLS: só o próprio usuário). */
export async function enablePush(): Promise<PushResult> {
  const config = getFirebaseWebConfig();
  if (!config) return { status: "not-configured" };
  if (typeof window === "undefined") return { status: "unsupported" };
  if (!("Notification" in window) || !(await isSupported())) return { status: "unsupported" };
  if (window.top !== window.self) return { status: "open-in-new-tab" };

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied" };

  try {
    const query = new URLSearchParams(config).toString();
    const serviceWorkerRegistration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${query}`,
    );
    const token = await getToken(messagingInstance(config), {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration,
    });
    if (!token) return { status: "denied" };

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return { status: "error", message: "Sessão expirada" };

    const { error } = await supabase.from("user_push_tokens").upsert(
      {
        user_id: userId,
        token,
        user_agent: navigator.userAgent.slice(0, 300),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) return { status: "error", message: error.message };
    return { status: "registered" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Falha no push" };
  }
}

/** Opt-out: remove o token deste dispositivo (o sino in-app continua funcionando). */
export async function disablePush(): Promise<void> {
  const config = getFirebaseWebConfig();
  if (!config || typeof window === "undefined") return;
  try {
    if (!(await isSupported())) return;
    const messaging = messagingInstance(config);
    const token = await getToken(messaging, { vapidKey: FIREBASE_VAPID_KEY }).catch(() => null);
    if (token) {
      await supabase.from("user_push_tokens").delete().eq("token", token);
      await deleteToken(messaging).catch(() => undefined);
    }
  } catch {
    // silencioso: opt-out não pode quebrar a UI
  }
}

/** Mensagem recebida com o app aberto (o sino já mostra; evitamos duplicar UI). */
export async function onForegroundPush(handler: () => void): Promise<() => void> {
  const config = getFirebaseWebConfig();
  if (!config || typeof window === "undefined") return () => undefined;
  if (!(await isSupported())) return () => undefined;
  return onMessage(messagingInstance(config), () => handler());
}
