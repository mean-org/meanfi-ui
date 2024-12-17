const isStartDateFuture = (date: string): boolean => {
  const now = new Date().toUTCString();
  const nowUtc = new Date(now);
  const comparedDate = new Date(date);
  const dateWithoutOffset = new Date(comparedDate.getTime() - comparedDate.getTimezoneOffset() * 60000);
  if (dateWithoutOffset > nowUtc) {
    return true;
  }
  return false;
};

export default isStartDateFuture;
