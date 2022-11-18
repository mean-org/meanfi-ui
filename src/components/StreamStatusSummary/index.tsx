import { StreamInfo } from '@mean-dao/money-streaming';
import { Stream, STREAM_STATUS } from '@mean-dao/msp';
import { getStreamStatusResume } from 'middleware/streams';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export const StreamStatusSummary = (props: {
  stream: Stream | StreamInfo;
}) => {
  const { stream } = props;
  const { t } = useTranslation('common');

  const getTimeRemaining = useCallback((time: string) => {
    if (time) {
      const countDownDate = new Date(time).getTime();
      const now = new Date().getTime();
      const timeleft = countDownDate - now;

      const seconds = Math.floor((timeleft % (1000 * 60)) / 1000);
      const minutes = Math.floor((timeleft % (1000 * 60 * 60)) / (1000 * 60));
      const hours = Math.floor(
        (timeleft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const days = Math.floor(timeleft / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(days / 7);
      const months = Math.floor(days / 30);
      const years = Math.floor(days / 365);

      if (
        years === 0 &&
        months === 0 &&
        weeks === 0 &&
        days === 0 &&
        hours === 0 &&
        minutes === 0 &&
        seconds === 0
      ) {
        return <span>out of funds</span>;
      } else if (
        years === 0 &&
        months === 0 &&
        weeks === 0 &&
        days === 0 &&
        hours === 0 &&
        minutes === 0 &&
        seconds <= 60
      ) {
        return <span className="fg-warning">less than a minute left</span>;
      } else if (
        years === 0 &&
        months === 0 &&
        weeks === 0 &&
        days === 0 &&
        hours === 0 &&
        minutes <= 60
      ) {
        return (
          <span className="fg-warning">{`only ${minutes} ${
            minutes > 1 ? 'minutes' : 'minute'
          } left`}</span>
        );
      } else if (
        years === 0 &&
        months === 0 &&
        weeks === 0 &&
        days === 0 &&
        hours <= 24
      ) {
        return (
          <span className="fg-warning">{`only ${hours} ${
            hours > 1 ? 'hours' : 'hour'
          } left`}</span>
        );
      } else if (
        years === 0 &&
        months === 0 &&
        weeks === 0 &&
        days > 1 &&
        days <= 7
      ) {
        return <span>{`${days} ${days > 1 ? 'days' : 'day'} left`}</span>;
      } else if (years === 0 && months === 0 && days > 7 && days <= 30) {
        return <span>{`${weeks} ${weeks > 1 ? 'weeks' : 'week'} left`}</span>;
      } else if (years === 0 && days > 30 && days <= 365) {
        return <span>{`${months} ${months > 1 ? 'months' : 'month'} left`}</span>;
      } else if (days > 365) {
        return <span>{`${years} ${years > 1 ? 'years' : 'year'} left`}</span>;
      } else {
        return null;
      }
    }
    return null;
  }, []);

  const streamStatusSubtitle = (item: Stream | StreamInfo) => {
    if (!item) {
      return null;
    }

    if (item.version >= 2 && (item as Stream).status === STREAM_STATUS.Running) {
      return getTimeRemaining((item as Stream).estimatedDepletionDate);
    }
    return <span>{getStreamStatusResume(item, t)}</span>;
  }


  return streamStatusSubtitle(stream);
}
