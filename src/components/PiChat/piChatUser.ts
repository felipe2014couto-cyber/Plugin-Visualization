import { PiChatUserIdentity } from './types';

const SESSION_USER_KEY = 'pims_pichat_user_id';

function generateSessionId(): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `user_${Date.now()}_${rand}`;
}

export function getPiChatUserId(): PiChatUserIdentity {
  if (typeof window === 'undefined') {
    return { userId: 'anonymous_user', source: 'session' };
  }

  try {
    const win = window as any;

    // 1. Tentar contextSrv global ou injetado
    if (win.contextSrv?.user?.login && win.contextSrv.user.login !== 'anonymous') {
      return { userId: String(win.contextSrv.user.login).trim(), source: 'grafana' };
    }
    if (win.contextSrv?.user?.email) {
      return { userId: String(win.contextSrv.user.email).trim(), source: 'grafana' };
    }

    // 2. Tentar grafanaBootData
    if (win.grafanaBootData?.user?.login && win.grafanaBootData.user.login !== 'anonymous') {
      return { userId: String(win.grafanaBootData.user.login).trim(), source: 'grafana' };
    }
    if (win.grafanaBootData?.user?.email) {
      return { userId: String(win.grafanaBootData.user.email).trim(), source: 'grafana' };
    }
  } catch {
    // Ignora erros de acesso ao contexto Grafana
  }

  // 3. Fallback para sessionStorage
  try {
    const existingSessionId = window.sessionStorage.getItem(SESSION_USER_KEY);
    if (existingSessionId && existingSessionId.trim().length > 0) {
      return { userId: existingSessionId.trim(), source: 'session' };
    }

    const newId = generateSessionId();
    window.sessionStorage.setItem(SESSION_USER_KEY, newId);
    return { userId: newId, source: 'session' };
  } catch {
    return { userId: generateSessionId(), source: 'session' };
  }
}
