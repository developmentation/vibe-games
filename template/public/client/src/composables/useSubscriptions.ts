import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type {
  NotificationSubscription,
  CreateSubscriptionPayload,
} from '@/types/subscription'

export interface UseSubscriptionsReturn {
  items: Ref<NotificationSubscription[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: () => Promise<void>
  subscribe: (
    payload: CreateSubscriptionPayload,
  ) => Promise<NotificationSubscription | null>
  unsubscribe: (id: string) => Promise<boolean>
}

/**
 * Composable wrapping the authenticated subscriptions API.
 */
export function useSubscriptions(): UseSubscriptionsReturn {
  const items = ref<NotificationSubscription[]>([]) as Ref<NotificationSubscription[]>
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ data: NotificationSubscription[] }>('/v1/subscriptions')
      items.value = res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function subscribe(
    payload: CreateSubscriptionPayload,
  ): Promise<NotificationSubscription | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.post<{ data: NotificationSubscription }>(
        '/v1/subscriptions',
        payload,
      )
      items.value = [res.data.data, ...items.value]
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function unsubscribe(id: string): Promise<boolean> {
    error.value = null
    try {
      await api.delete(`/v1/subscriptions/${id}`)
      items.value = items.value.filter((s) => s.pk_notification_subscription !== id)
      return true
    } catch (err) {
      error.value = parseApiError(err).message
      return false
    }
  }

  return { items, loading, error, refresh, subscribe, unsubscribe }
}
