import express from 'express';
import eventEmitter from '../services/events.js';

const router = express.Router();

/**
 * SSE endpoint for real-time updates
 * GET /api/events
 *
 * Establishes a Server-Sent Events connection that pushes change notifications
 * to the client when data is modified by other users.
 */
router.get('/', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Handle CORS if needed
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection confirmation
  res.write(': connected\n\n');

  // Register this client
  eventEmitter.addClient(res);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      clearInterval(heartbeatInterval);
      eventEmitter.removeClient(res);
    }
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    eventEmitter.removeClient(res);
    res.end();
  });

  // Handle errors
  res.on('error', (error) => {
    console.error('SSE connection error:', error);
    clearInterval(heartbeatInterval);
    eventEmitter.removeClient(res);
  });
});

export default router;
