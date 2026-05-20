import { ref, onMounted } from 'vue'

// ---------------------------------------------------------------------------
// Install Prompt
// ---------------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const installPromptEvent = ref<BeforeInstallPromptEvent | null>(null)
const isInstallable = ref(false)
const isInstalled = ref(false)

// Capture the event at module load time — it fires before components mount.
// The refs above are reactive, so any component reading them will update.
if (typeof window !== 'undefined') {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    isInstalled.value = true
  }

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Don't call preventDefault() — let Chrome show its native install banner.
    // Store the event so our custom Install button can also trigger the prompt.
    installPromptEvent.value = e as BeforeInstallPromptEvent
    isInstallable.value = true
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    isInstallable.value = false
    installPromptEvent.value = null
  })
}

export function usePwaInstall() {
  async function promptInstall(): Promise<boolean> {
    if (!installPromptEvent.value) return false
    await installPromptEvent.value.prompt()
    const { outcome } = await installPromptEvent.value.userChoice
    if (outcome === 'accepted') {
      isInstallable.value = false
      installPromptEvent.value = null
    }
    return outcome === 'accepted'
  }

  function dismissInstall(): void {
    isInstallable.value = false
  }

  return { isInstallable, isInstalled, promptInstall, dismissInstall }
}

// ---------------------------------------------------------------------------
// Update Prompt (Service Worker)
// ---------------------------------------------------------------------------

const needRefresh = ref(false)
const offlineReady = ref(false)
let updateSw: ((reloadPage?: boolean) => Promise<void>) | null = null

export function usePwaUpdate() {
  async function initSw() {
    if (!('serviceWorker' in navigator)) return

    try {
      const { registerSW } = await import('virtual:pwa-register')
      updateSw = registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
          if (registration) {
            registration.update()
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'visible') {
                registration.update()
              }
            })
          }
        },
        onNeedRefresh() {
          needRefresh.value = true
        },
        onOfflineReady() {
          offlineReady.value = true
        },
      })
    } catch {
      // vite-plugin-pwa not available (dev mode without SW)
    }
  }

  async function updateApp(): Promise<void> {
    if (updateSw) {
      await updateSw(true)
    }
  }

  function dismissUpdate(): void {
    needRefresh.value = false
  }

  onMounted(() => {
    initSw()
  })

  return { needRefresh, offlineReady, updateApp, dismissUpdate }
}
