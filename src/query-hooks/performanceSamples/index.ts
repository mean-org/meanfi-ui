import { useQuery } from '@tanstack/react-query';
import { FIVE_MINUTES_REFRESH_TIMEOUT } from 'src/app-constants/common';
import { useConnection } from 'src/contexts/connection';
import { isProd } from 'src/middleware/ui';
import getPerformanceSamples from './getPerformanceSamples';

export const getPerformanceSamplesKey = () => ['performance-samples'];

const useGetPerformanceSamples = () => {
  const connection = useConnection();

  return useQuery({
    queryKey: getPerformanceSamplesKey(),
    queryFn: () => getPerformanceSamples(connection),
    enabled: !!connection && isProd(),
    refetchInterval: FIVE_MINUTES_REFRESH_TIMEOUT,
  });
};

export default useGetPerformanceSamples;
