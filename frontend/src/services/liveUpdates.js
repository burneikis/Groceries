/**
 * LiveUpdatesService manages the Server-Sent Events (SSE) connection
 * for real-time synchronization of changes across multiple clients.
 */
class LiveUpdatesService {
  constructor() {
    this.eventSource = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000; // 30 seconds
    this.baseReconnectDelay = 1000; // 1 second
    this.onConnectionChange = null;
    this.onEvent = null;
    this.url = null;
    this.closed = false;
  }

  /**
   * Connect to the SSE endpoint
   * @param {string} url - SSE endpoint URL
   * @param {Function} onEvent - Callback for incoming events
   * @param {Function} onConnectionChange - Callback for connection state changes
   */
  connect(url, onEvent, onConnectionChange) {
    this.onEvent = onEvent;
    this.onConnectionChange = onConnectionChange;
    this.url = url;
    this.closed = false;

    this.teardown();

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this.onConnectionChange?.(true);
      };

      this.eventSource.onmessage = (event) => {
        try {
          this.onEvent?.(JSON.parse(event.data));
        } catch (error) {
          console.error('[LiveUpdates] Error parsing event data:', error);
        }
      };

      this.eventSource.onerror = () => {
        this.onConnectionChange?.(false);
        // The browser would retry on its own, which combined with our backoff
        // produced overlapping connections. Close it and own the retry.
        this.teardown();
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[LiveUpdates] Failed to create EventSource:', error);
      this.scheduleReconnect();
    }
  }

  /** Close the current EventSource and cancel any pending reconnect. */
  teardown() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.onopen = null;
      this.eventSource.onmessage = null;
      this.eventSource.onerror = null;
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Schedule a reconnect with exponential backoff: 1s, 2s, 4s ... 30s max.
   */
  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;

    const delay = Math.min(
      this.baseReconnectDelay * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect(this.url, this.onEvent, this.onConnectionChange);
    }, delay);
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect() {
    this.closed = true;
    this.teardown();
    this.onConnectionChange?.(false);
    this.reconnectAttempts = 0;
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  isConnected() {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}

export default LiveUpdatesService;
