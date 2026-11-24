import { SESSION_KEY } from './config.js';
import { englishText } from './format.js';

export const SESSION_EVENT = 'eco-watch-session';

export function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw);
    if (!session || !session.bbox || !session.scenes || !session.scenes.before || !session.scenes.after) {
      return null;
    }
    if (session.area) {
      session.area = englishText(session.area, 'Custom area');
    }
    if (session.placeQuery) {
      session.placeQuery = englishText(session.placeQuery);
    }
    return session;
  } catch (error) {
    return null;
  }
}

export function writeSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: session }));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: null }));
}

export function subscribeToSession(callback) {
  window.addEventListener(SESSION_EVENT, callback);
  return () => window.removeEventListener(SESSION_EVENT, callback);
}
