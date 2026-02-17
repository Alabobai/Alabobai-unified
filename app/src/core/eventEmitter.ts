/**
 * Type-Safe Event Emitter
 *
 * A strongly-typed event emitter for internal communication
 * between reliability systems.
 */

export type EventMap = { [key: string]: unknown }

export type EventCallback<T> = (data: T) => void

export class EventEmitter<Events extends EventMap> {
  private listeners: Map<keyof Events, Set<EventCallback<unknown>>> = new Map()
  private onceListeners: Map<keyof Events, Set<EventCallback<unknown>>> = new Map()

  /**
   * Subscribe to an event
   */
  on<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>)

    // Return unsubscribe function
    return () => this.off(event, callback)
  }

  /**
   * Subscribe to an event once
   */
  once<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set())
    }
    this.onceListeners.get(event)!.add(callback as EventCallback<unknown>)

    return () => {
      this.onceListeners.get(event)?.delete(callback as EventCallback<unknown>)
    }
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): void {
    this.listeners.get(event)?.delete(callback as EventCallback<unknown>)
    this.onceListeners.get(event)?.delete(callback as EventCallback<unknown>)
  }

  /**
   * Emit an event
   */
  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    // Call regular listeners
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in event listener for ${String(event)}:`, error)
      }
    })

    // Call once listeners and remove them
    const onceCallbacks = this.onceListeners.get(event)
    if (onceCallbacks) {
      onceCallbacks.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in once listener for ${String(event)}:`, error)
        }
      })
      this.onceListeners.delete(event)
    }
  }

  /**
   * Remove all listeners for an event or all events
   */
  removeAllListeners<K extends keyof Events>(event?: K): void {
    if (event) {
      this.listeners.delete(event)
      this.onceListeners.delete(event)
    } else {
      this.listeners.clear()
      this.onceListeners.clear()
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof Events>(event: K): number {
    const regular = this.listeners.get(event)?.size ?? 0
    const once = this.onceListeners.get(event)?.size ?? 0
    return regular + once
  }

  /**
   * Wait for an event (returns a promise)
   */
  waitFor<K extends keyof Events>(
    event: K,
    timeout?: number
  ): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.once(event, (data) => {
        if (timeoutId) clearTimeout(timeoutId)
        resolve(data)
      })

      const timeoutId = timeout
        ? setTimeout(() => {
            unsubscribe()
            reject(new Error(`Timeout waiting for event: ${String(event)}`))
          }, timeout)
        : null
    })
  }
}

/**
 * Global event bus for cross-system communication
 */
export interface GlobalEvents extends EventMap {
  // Task events
  'task:created': { taskId: string; name: string }
  'task:started': { taskId: string }
  'task:completed': { taskId: string; success: boolean }
  'task:failed': { taskId: string; error: string }

  // User events
  'user:action': { action: string; data?: unknown }
  'user:preference': { key: string; value: unknown }

  // System events
  'system:error': { error: Error; context?: string }
  'system:warning': { message: string; context?: string }
  'system:info': { message: string }

  // Cost events
  'cost:update': { taskId?: string; amount: number; total: number }
  'cost:limit_warning': { used: number; limit: number; percent: number }
  'cost:limit_exceeded': { used: number; limit: number }

  // Memory events
  'memory:stored': { key: string; type: string }
  'memory:recalled': { query: string; resultCount: number }
  'memory:pruned': { count: number }

  // Checkpoint events
  'checkpoint:saved': { id: string; taskId: string }
  'checkpoint:loaded': { id: string; taskId: string }
  'checkpoint:deleted': { id: string }

  // Index signature for EventMap compatibility
  [key: string]: unknown
}

export const globalEventBus = new EventEmitter<GlobalEvents>()
