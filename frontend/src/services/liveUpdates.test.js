import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveUpdatesService from './liveUpdates';

/** Records every EventSource created so tests can drive them. */
let instances;

class MockEventSource {
  constructor(url) {
    this.url = url;
    this.closed = false;
    instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  emitRaw(data) {
    this.onmessage?.({ data });
  }

  emitError() {
    this.onerror?.(new Event('error'));
  }
}

const latest = () => instances[instances.length - 1];

beforeEach(() => {
  instances = [];
  global.EventSource = MockEventSource;
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete global.EventSource;
});

describe('connect', () => {
  it('opens a stream against the given url', () => {
    new LiveUpdatesService().connect('/api/events', vi.fn(), vi.fn());

    expect(instances).toHaveLength(1);
    expect(latest().url).toBe('/api/events');
  });

  it('reports connection state on open', () => {
    const onConnectionChange = vi.fn();
    new LiveUpdatesService().connect('/api/events', vi.fn(), onConnectionChange);

    latest().emitOpen();

    expect(onConnectionChange).toHaveBeenCalledWith(true);
  });

  it('parses and forwards message payloads', () => {
    const onEvent = vi.fn();
    new LiveUpdatesService().connect('/api/events', onEvent, vi.fn());

    latest().emitMessage({ type: 'item-created', data: { id: 1 } });

    expect(onEvent).toHaveBeenCalledWith({ type: 'item-created', data: { id: 1 } });
  });

  it('ignores an unparseable frame without tearing down the stream', () => {
    const onEvent = vi.fn();
    new LiveUpdatesService().connect('/api/events', onEvent, vi.fn());

    expect(() => latest().emitRaw('not json')).not.toThrow();
    expect(onEvent).not.toHaveBeenCalled();

    latest().emitMessage({ type: 'item-deleted' });
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('replaces an existing stream rather than leaking it', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());
    const first = latest();

    service.connect('/api/events', vi.fn(), vi.fn());

    expect(first.closed).toBe(true);
    expect(instances).toHaveLength(2);
  });
});

describe('reconnection', () => {
  it('closes the failed stream so the browser does not also retry', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());

    latest().emitError();

    expect(instances[0].closed).toBe(true);
  });

  it('reports disconnection to the caller', () => {
    const onConnectionChange = vi.fn();
    new LiveUpdatesService().connect('/api/events', vi.fn(), onConnectionChange);

    latest().emitError();

    expect(onConnectionChange).toHaveBeenCalledWith(false);
  });

  it('reconnects after a backoff delay', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());

    latest().emitError();
    expect(instances).toHaveLength(1); // not immediate

    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(2);
  });

  it('backs off exponentially up to a 30s ceiling', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());

    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    delays.forEach((delay, index) => {
      latest().emitError();
      vi.advanceTimersByTime(delay - 1);
      expect(instances).toHaveLength(index + 1); // still waiting
      vi.advanceTimersByTime(1);
      expect(instances).toHaveLength(index + 2);
    });
  });

  it('only schedules one reconnect even if errors arrive in a burst', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());

    latest().emitError();
    latest().emitError();
    latest().emitError();

    vi.advanceTimersByTime(60000);

    expect(instances).toHaveLength(2); // exactly one replacement stream
  });

  it('resets the backoff once a connection succeeds', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());

    latest().emitError();
    vi.advanceTimersByTime(1000);
    latest().emitError();
    vi.advanceTimersByTime(2000);

    latest().emitOpen(); // recovered
    latest().emitError();

    vi.advanceTimersByTime(1000); // back to the base delay
    expect(instances).toHaveLength(4);
  });

  it('keeps delivering events after reconnecting', () => {
    const onEvent = vi.fn();
    const service = new LiveUpdatesService();
    service.connect('/api/events', onEvent, vi.fn());

    latest().emitError();
    vi.advanceTimersByTime(1000);
    latest().emitMessage({ type: 'item-created' });

    expect(onEvent).toHaveBeenCalledWith({ type: 'item-created' });
  });
});

describe('disconnect', () => {
  it('closes the stream and reports disconnection', () => {
    const onConnectionChange = vi.fn();
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), onConnectionChange);

    service.disconnect();

    expect(latest().closed).toBe(true);
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
  });

  it('cancels a pending reconnect', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());

    latest().emitError();
    service.disconnect();
    vi.advanceTimersByTime(60000);

    expect(instances).toHaveLength(1); // no zombie reconnect
  });

  it('does not reconnect after an error that arrives post-disconnect', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());
    const stream = latest();

    service.disconnect();
    stream.emitError?.();
    vi.advanceTimersByTime(60000);

    expect(instances).toHaveLength(1);
  });

  it('is safe to call twice', () => {
    const service = new LiveUpdatesService();
    service.connect('/api/events', vi.fn(), vi.fn());

    service.disconnect();
    expect(() => service.disconnect()).not.toThrow();
  });
});
