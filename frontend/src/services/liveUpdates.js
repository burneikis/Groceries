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

    // Clean up existing connection
    if (this.eventSource) {
      this.disconnect();
    }

    console.log('[LiveUpdates] Connecting to SSE endpoint:', url);

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        console.log('[LiveUpdates] Connected');
        this.reconnectAttempts = 0; // Reset reconnect counter
        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[LiveUpdates] Received event:', data.type);
          if (this.onEvent) {
            this.onEvent(data);
          }
        } catch (error) {
          console.error('[LiveUpdates] Error parsing event data:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('[LiveUpdates] Connection error:', error);
        if (this.onConnectionChange) {
          this.onConnectionChange(false);
        }

        // EventSource automatically reconnects, but we add exponential backoff
        this.scheduleReconnect(url);
      };
    } catch (error) {
      console.error('[LiveUpdates] Failed to create EventSource:', error);
      this.scheduleReconnect(url);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   * @param {string} url - SSE endpoint URL
   */
  scheduleReconnect(url) {
    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Calculate delay with exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`[LiveUpdates] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect(url, this.onEvent, this.onConnectionChange);
    }, delay);
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect() {
    console.log('[LiveUpdates] Disconnecting');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.onConnectionChange) {
      this.onConnectionChange(false);
    }

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
