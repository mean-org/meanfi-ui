import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export const useEnableFetchingOldStreams = () => {
  const location = useLocation();

  return useMemo(() => {
    return (
      location.pathname === '/streaming/summary' ||
      location.pathname.startsWith('/streaming/streaming-accounts') ||
      location.pathname.startsWith('/streaming/incoming') ||
      location.pathname.startsWith('/streaming/outgoing')
    );
  }, [location.pathname]);
};
