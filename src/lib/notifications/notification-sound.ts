import type { NotificationSound } from "@/lib/notifications/notification-system";

export const NOTIFICATION_SOUND_STORAGE_KEY = "gc.notifications.sound.v1";

let interactionArmed = false;
let audioContext: AudioContext | null = null;
let soundPreference = true;
const playedIds = new Set<string>();
const playedOrder: string[] = [];

function rememberPlayed(id: string) {
  if (playedIds.has(id)) return;
  playedIds.add(id);
  playedOrder.push(id);
  while (playedOrder.length > 100) {
    const expired = playedOrder.shift();
    if (expired) playedIds.delete(expired);
  }
}

export function notificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return soundPreference;
  try {
    const stored = window.localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY);
    if (stored !== null) soundPreference = stored !== "disabled";
  } catch {
    // Private or locked-down browsing can deny storage; keep the in-memory choice.
  }
  return soundPreference;
}

export function setNotificationSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  soundPreference = enabled;
  try {
    window.localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, enabled ? "enabled" : "disabled");
  } catch {
    // The current session still honors the preference through soundPreference.
  }
  window.dispatchEvent(new CustomEvent("gc:notification-sound", { detail: { enabled } }));
}

/** Sound remains locked until a genuine pointer or keyboard interaction. */
export function installNotificationSoundUnlock(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const arm = () => {
    interactionArmed = true;
    window.removeEventListener("pointerdown", arm, true);
    window.removeEventListener("keydown", arm, true);
  };
  window.addEventListener("pointerdown", arm, { capture: true, once: true });
  window.addEventListener("keydown", arm, { capture: true, once: true });
  return () => {
    window.removeEventListener("pointerdown", arm, true);
    window.removeEventListener("keydown", arm, true);
  };
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

export async function playNotificationSound(args: {
  id: string;
  policy: NotificationSound;
  actorId: string | null;
  currentUserId: string;
}): Promise<boolean> {
  if (
    args.policy === "none" ||
    !interactionArmed ||
    !notificationSoundEnabled() ||
    args.actorId === args.currentUserId ||
    playedIds.has(args.id)
  ) {
    return false;
  }

  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state === "suspended") await context.resume();
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    gain.connect(context.destination);

    const frequencies =
      args.policy === "warning"
        ? [392, 330]
        : args.policy === "important"
          ? [523.25, 659.25]
          : [493.88];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.075);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.075);
      oscillator.stop(now + 0.24 + index * 0.075);
    });
    rememberPlayed(args.id);
    return true;
  } catch {
    return false;
  }
}
