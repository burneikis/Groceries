import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import eventEmitter from './events.js';

/** Minimal stand-in for an Express response held open for SSE. */
const fakeClient = () => ({ writes: [], write(chunk) { this.writes.push(chunk); } });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  eventEmitter.clients.clear();
  vi.restoreAllMocks();
});

describe('client registry', () => {
  it('tracks added and removed clients', () => {
    const client = fakeClient();

    eventEmitter.addClient(client);
    expect(eventEmitter.clients.size).toBe(1);

    eventEmitter.removeClient(client);
    expect(eventEmitter.clients.size).toBe(0);
  });

  it('does not count the same client twice', () => {
    const client = fakeClient();
    eventEmitter.addClient(client);
    eventEmitter.addClient(client);

    expect(eventEmitter.clients.size).toBe(1);
  });
});

describe('emitChange', () => {
  it('writes a well-formed SSE frame to every client', () => {
    const a = fakeClient();
    const b = fakeClient();
    eventEmitter.addClient(a);
    eventEmitter.addClient(b);

    eventEmitter.emitChange('item-created', { id: 1 }, 'change-1');

    for (const client of [a, b]) {
      expect(client.writes).toHaveLength(1);
      expect(client.writes[0].startsWith('data: ')).toBe(true);
      expect(client.writes[0].endsWith('\n\n')).toBe(true);
    }
  });

  it('includes type, data, changeId and a timestamp in the payload', () => {
    const client = fakeClient();
    eventEmitter.addClient(client);

    eventEmitter.emitChange('item-updated', { id: 7, name: 'Milk' }, 'abc');
    const payload = JSON.parse(client.writes[0].replace(/^data: /, '').trim());

    expect(payload).toMatchObject({
      type: 'item-updated',
      data: { id: 7, name: 'Milk' },
      changeId: 'abc',
    });
    expect(Date.parse(payload.timestamp)).not.toBeNaN();
  });

  it('defaults changeId to null when not supplied', () => {
    const client = fakeClient();
    eventEmitter.addClient(client);

    eventEmitter.emitChange('item-deleted', { id: 1 });
    const payload = JSON.parse(client.writes[0].replace(/^data: /, '').trim());

    expect(payload.changeId).toBeNull();
  });

  it('drops a client whose write throws instead of failing the request', () => {
    const healthy = fakeClient();
    const broken = { write: () => { throw new Error('socket closed'); } };
    eventEmitter.addClient(broken);
    eventEmitter.addClient(healthy);

    expect(() => eventEmitter.emitChange('item-created', { id: 1 })).not.toThrow();

    expect(eventEmitter.clients.has(broken)).toBe(false);
    expect(healthy.writes).toHaveLength(1); // healthy client still received it
  });

  it('is a no-op when nobody is listening', () => {
    expect(() => eventEmitter.emitChange('item-created', { id: 1 })).not.toThrow();
  });

  it('serializes data containing newlines without breaking the frame', () => {
    const client = fakeClient();
    eventEmitter.addClient(client);

    eventEmitter.emitChange('item-created', { name: 'line1\nline2' });

    // Exactly one frame terminator: the payload's newline must be escaped.
    expect(client.writes[0].match(/\n\n/g)).toHaveLength(1);
    const payload = JSON.parse(client.writes[0].replace(/^data: /, '').trim());
    expect(payload.data.name).toBe('line1\nline2');
  });
});
