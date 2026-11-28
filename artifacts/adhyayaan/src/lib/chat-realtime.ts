export type ChatRoom = { kind: 'mentorship' | 'support-group'; id: string };

export type ChatRealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

type Listener = (event: ChatRealtimeEvent) => void;
type RoomRecord = { room: ChatRoom; count: number };

const listeners = new Set<Listener>();
const desiredRooms = new Map<string, RoomRecord>();
let socket: WebSocket | null = null;
let activeUserId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let everConnected = false;
let stopped = false;

function roomKey(room: ChatRoom) {
  return `${room.kind}:${room.id}`;
}

function emit(event: ChatRealtimeEvent) {
  for (const listener of [...listeners]) listener(event);
}

function send(value: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function closeSocket() {
  const current = socket;
  socket = null;
  if (current && current.readyState < WebSocket.CLOSING) current.close(1000, 'No active chat listeners');
}

function connect() {
  if (stopped || !activeUserId || !listeners.size || socket) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const current = new WebSocket(`${protocol}//${window.location.host}/ws`);
  socket = current;

  current.onopen = () => {
    if (socket !== current) return;
    reconnectAttempts = 0;
    for (const { room } of desiredRooms.values()) {
      current.send(JSON.stringify({ type: 'subscribe', room }));
    }
    emit({ type: 'connection', reconnected: everConnected });
    everConnected = true;
  };

  current.onmessage = (message) => {
    if (socket !== current || typeof message.data !== 'string') return;
    try {
      const event = JSON.parse(message.data) as ChatRealtimeEvent;
      if (event && typeof event.type === 'string') emit(event);
    } catch {
      // Ignore malformed frames; the next valid event can still update the chat.
    }
  };

  current.onclose = () => {
    if (socket !== current) return;
    socket = null;
    if (stopped || !activeUserId || !listeners.size || reconnectTimer) return;
    const delay = Math.min(30_000, 750 * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };
}

function resetForUser(userId: string) {
  if (activeUserId === userId) return;
  activeUserId = userId;
  everConnected = false;
  reconnectAttempts = 0;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  desiredRooms.clear();
  const previous = socket;
  socket = null;
  previous?.close(1000, 'Account changed');
}

export function subscribeChatRealtime(userId: string, listener: Listener, room?: ChatRoom): () => void {
  resetForUser(userId);
  stopped = false;
  listeners.add(listener);
  let key: string | null = null;
  if (room) {
    key = roomKey(room);
    const record = desiredRooms.get(key);
    if (record) record.count += 1;
    else {
      desiredRooms.set(key, { room, count: 1 });
      send({ type: 'subscribe', room });
    }
  }
  connect();

  return () => {
    listeners.delete(listener);
    if (key) {
      const record = desiredRooms.get(key);
      if (record) {
        record.count -= 1;
        if (record.count <= 0) {
          desiredRooms.delete(key);
          send({ type: 'unsubscribe', room: record.room });
        }
      }
    }
    if (!listeners.size) {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      closeSocket();
      activeUserId = null;
      desiredRooms.clear();
    }
  };
}

export function sendChatTyping(room: ChatRoom, typing: boolean) {
  send({ type: 'typing', room, typing });
}

export function markChatRead(room: ChatRoom) {
  send({ type: 'read', room });
}
