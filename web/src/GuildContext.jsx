import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useGuild = () => useContext(Ctx);

const COOKIE_NAME = 'parley-guild';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

function readSavedGuildId() {
  try {
    const match = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE_NAME}=`));
    return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : null;
  } catch { return null; }
}

function saveGuildId(id) {
  try {
    document.cookie = id
      ? `${COOKIE_NAME}=${encodeURIComponent(id)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`
      : `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch { /* cookies can be unavailable */ }
}

export function GuildProvider({ children }) {
  const [guilds, setGuilds] = useState([]);
  const [guildId, setGuildIdState] = useState(null);
  const [error, setError] = useState(null);

  const setGuildId = useCallback((id) => {
    setGuildIdState(id);
    saveGuildId(id);
  }, []);

  useEffect(() => {
    api.guilds()
      .then((g) => {
        setGuilds(g);
        setGuildIdState((cur) => {
          if (cur) return cur;
          // Restore the last selected server, unless it is no longer available.
          const saved = readSavedGuildId();
          return g.some((x) => x.id === saved) ? saved : g[0]?.id || null;
        });
      })
      .catch((err) => { setGuilds([]); setError(err?.message ?? 'Failed to load guilds'); });
  }, []);
  return <Ctx.Provider value={{ guilds, guildId, setGuildId, error }}>{children}</Ctx.Provider>;
}
