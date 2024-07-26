import { useQuery } from '@tanstack/react-query';
import { FIVE_MINUTES_REFRESH_TIMEOUT } from 'app-constants/common';
import { useConnection } from 'contexts/connection';
import getPerformanceSamples from './getPerformanceSamples';

export const getPerformanceSamplesKey = () => ['/performance-samples'];

const useGetPerformanceSamples = () => {
  const connection = useConnection();

  const { data } = useQuery({
    queryKey: getPerformanceSamplesKey(),
    queryFn: () => getPerformanceSamples(connection),
    enabled: !!connection,
    refetchInterval: FIVE_MINUTES_REFRESH_TIMEOUT,
  });

  return {
    tpsAvg: data,
  };
};

export default useGetPerformanceSamples;
