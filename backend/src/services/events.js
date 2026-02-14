import { EventEmitter } from 'events';

/**
 * Central event broadcasting service for real-time updates
 * Manages SSE client connections and broadcasts change events
 */
class ChangeEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
  }

  /**
   * Register a new SSE client connection
   * @param {Response} res - Express response object configured for SSE
   */
  addClient(res) {
    this.clients.add(res);
    console.log(`SSE client connected. Total clients: ${this.clients.size}`);
  }

  /**
   * Unregister an SSE client connection
   * @param {Response} res - Express response object
   */
  removeClient(res) {
    this.clients.delete(res);
    console.log(`SSE client disconnected. Total clients: ${this.clients.size}`);
  }

  /**
   * Broadcast an event to all connected SSE clients
   * @param {Object} event - Event object with type and data
   */
  broadcast(event) {
    const data = JSON.stringify(event);

    this.clients.forEach((client) => {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (error) {
        console.error('Error sending SSE event to client:', error);
        this.removeClient(client);
      }
    });
  }

  /**
   * Emit a change event to all connected clients
   * @param {string} type - Event type (e.g., 'item-created', 'item-updated')
   * @param {Object} data - Event payload
   * @param {string} [changeId] - Optional changeId for echo prevention
   */
  emitChange(type, data, changeId = null) {
    const event = {
      type,
      data,
      changeId,
      timestamp: new Date().toISOString()
    };

    this.broadcast(event);
    console.log(`Broadcasted ${type} event to ${this.clients.size} clients`);
  }
}

// Create singleton instance
const eventEmitter = new ChangeEventEmitter();

export default eventEmitter;
