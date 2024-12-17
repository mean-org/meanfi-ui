import type { QueryClient } from '@tanstack/react-query';
import React from 'react';
import { ONE_MINUTE_REFRESH_TIMEOUT } from 'src/app-constants';

interface QueryClientStatItem {
  timestamp: number;
  queryKey: string;
}

interface QueryClientStatsContextValues {
  lastMinute: QueryClientStatItem[];
  historicalStats: QueryClientStatItem[];
}

const defaultCtxValues: QueryClientStatsContextValues = {
  lastMinute: [],
  historicalStats: [],
};

export const QueryClientStatsContext = React.createContext(defaultCtxValues);

interface ProviderProps {
  queryClient: QueryClient;
  children: React.ReactNode;
}

export const QueryClientStatsProvider: React.FC<ProviderProps> = ({ queryClient, children }) => {
  const [lastMinute, setLastMinute] = React.useState<QueryClientStatItem[]>([]);
  const [historicalStats, setHistoricalStats] = React.useState<QueryClientStatItem[]>([]);

  const doReport = React.useCallback((message: string, data: QueryClientStatItem[]) => {
    const groupsByQueryKey: Array<{ group: QueryClientStatItem[] }> = [];
    // Group stats by queryKey
    for (const stat of data) {
      const group = groupsByQueryKey.find(g => g.group[0].queryKey === stat.queryKey);
      if (group) {
        group.group.push(stat);
      } else {
        groupsByQueryKey.push({ group: [stat] });
      }
    }

    // Sort the groups in descending order by the number of requests
    const sortedGroups = groupsByQueryKey.sort((a, b) => b.group.length - a.group.length);

    // Get the three most requested queryKey
    const topThree = sortedGroups.slice(0, 5);

    console.info(`%c${message}`, 'color:orange');
    const logTable = topThree.map(group => {
      return {
        requests: group.group.length,
        queryKey: group.group[0].queryKey,
      };
    });
    console.table(logTable);
  }, []);

  // Accumulate requests in the last minute
  React.useEffect(() => {
    queryClient.getQueryCache().subscribe(event => {
      if (event.type !== 'updated') {
        return;
      }

      const query = event.query;
      const eventValue: QueryClientStatItem = {
        timestamp: Date.now(),
        queryKey: query.queryKey.join(','),
      };

      // Update the last minute stats
      const lastMinuteStats = [...lastMinute];
      lastMinuteStats.push(eventValue);
      setLastMinute(lastMinuteStats);
    });
  }, [queryClient, lastMinute]);

  // Store last minute of data aggregated to the historical stats but keeping only last 10 minutes
  // and report the most requested queries
  React.useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      // Get a snapshot of the current stats
      const history: QueryClientStatItem[] = [...historicalStats];
      // Add the current minute stats to the historical array
      const aggregated = history.concat(lastMinute);

      // Prune the historical array to keep only recent data
      const purgedList = aggregated.filter(stat => now - stat.timestamp < 10 * ONE_MINUTE_REFRESH_TIMEOUT); // Keep last 10 minutes

      // Update the historical stats
      setHistoricalStats(purgedList);

      // Reset lastMinute stats for the next time window
      setLastMinute([]);
    }, ONE_MINUTE_REFRESH_TIMEOUT);

    return () => clearInterval(interval);
  }, [lastMinute, historicalStats]);

  React.useEffect(() => {
    doReport('Top most requested queries in the last 10 minute window', historicalStats);
  }, [historicalStats, doReport]);

  return (
    <QueryClientStatsContext.Provider value={{ lastMinute, historicalStats }}>
      {children}
    </QueryClientStatsContext.Provider>
  );
};

export const useQueryClientStats = () => React.useContext(QueryClientStatsContext);
