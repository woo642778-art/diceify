export const PWA_UPDATE_READY_EVENT_V55 = "dicetree:pwa-update-ready";

function announceUpdateReady() {
  window.dispatchEvent(new Event(PWA_UPDATE_READY_EVENT_V55));
}

export function registerServiceWorkerV55() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    const scopeUrl = new URL(import.meta.env.BASE_URL, window.location.href);
    void navigator.serviceWorker.register(new URL("sw.js", scopeUrl).pathname, { scope: scopeUrl.pathname }).then((registration) => {
      const announceIfWaiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller) announceUpdateReady();
      };
      announceIfWaiting();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) announceUpdateReady();
        });
      });
    }).catch(() => undefined);
  }, { once: true });
}

export async function applyServiceWorkerUpdateV55(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const scopeUrl = new URL(import.meta.env.BASE_URL, window.location.href);
  const registration = await navigator.serviceWorker.getRegistration(scopeUrl.pathname);
  if (!registration?.waiting) return false;
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}
