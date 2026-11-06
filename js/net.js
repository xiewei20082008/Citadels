// Thin PeerJS wrapper (WebRTC data channels; free public signalling).
// The host is authoritative; peers only send actions and receive their own redacted view.

const SRC = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.2/peerjs.min.js';
const PREFIX = 'citadels3d-v1-';
let loading = null;

function loadPeer() {
  return (loading ||= new Promise((res, rej) => {
    if (window.Peer) return res(window.Peer);
    const s = document.createElement('script');
    s.src = SRC;
    s.onload = () => res(window.Peer);
    s.onerror = () => { loading = null; rej(new Error('net')); };
    document.head.appendChild(s);
  }));
}

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

// Host: resolves with the Peer once the room id is claimed.
export async function hostRoom(code, { onOpen, onData, onClose }) {
  const Peer = await loadPeer();
  return new Promise((res, rej) => {
    const peer = new Peer(PREFIX + code, { debug: 0 });
    let opened = false;
    peer.on('open', () => { opened = true; res(peer); });
    peer.on('error', e => { if (!opened) { peer.destroy(); rej(e); } else console.warn('[net]', e.type); });
    peer.on('connection', conn => {
      conn.on('open', () => onOpen(conn));
      conn.on('data', d => onData(conn, d));
      conn.on('close', () => onClose(conn));
      conn.on('error', () => onClose(conn));
    });
  });
}

// Peer: resolves with {peer, conn} once connected to the host.
export async function joinRoom(code, { onData, onClose }) {
  const Peer = await loadPeer();
  return new Promise((res, rej) => {
    const peer = new Peer({ debug: 0 });
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; peer.destroy(); rej({ type: 'timeout' }); } }, 15000);
    peer.on('error', e => { if (!done) { done = true; clearTimeout(timer); peer.destroy(); rej(e); } });
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => { done = true; clearTimeout(timer); res({ peer, conn }); });
      conn.on('data', onData);
      conn.on('close', () => { if (done) onClose(); });
    });
  });
}

export const send = (conn, msg) => { try { conn?.open && conn.send(msg); } catch { /* dropped */ } };
