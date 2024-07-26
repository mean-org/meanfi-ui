import { useTranslation } from 'react-i18next';

export const PageLoadingView = (props: { message?: string; addWrapper?: boolean }) => {
  const { message, addWrapper } = props;
  const { t } = useTranslation('common');

  const loader = (
    <div className='loading-screen-container flex-center'>
      <div className='flex-column flex-center'>
        <div className='loader-container'>
          <div className='app-loading'>
            <div className='logo' style={{ display: 'none' }}>
              <svg
                role='img'
                aria-label='Vectorial logo image'
                xmlns='http://www.w3.org/2000/svg'
                width='100%'
                height='100%'
                viewBox='0 0 1000 1000'
                fillRule='evenodd'
                clipRule='evenodd'
              >
                <path
                  className='lettermark'
                  d='m621.92,327.07c-48.28,0-91.71,20.71-121.92,53.72-30.21-33.01-73.65-53.72-121.92-53.72-91.25,0-165.22,73.97-165.22,165.22v180.65h86.62v-180.81c0-43.41,35.19-78.6,78.6-78.6s78.6,35.19,78.6,78.6v180.81h86.64v-180.81c0-43.41,35.19-78.6,78.6-78.6s78.6,35.19,78.6,78.6v180.81h86.62v-180.65c0-91.25-73.97-165.22-165.22-165.22Z'
                  fill='currentColor'
                  strokeWidth='0px'
                  transform='translate(0 -32)'
                />
              </svg>
            </div>
            <svg role='img' aria-label='Animated ring' className='spinner' viewBox='25 25 50 50'>
              <circle className='path' cx='50' cy='50' r='20' fill='none' strokeWidth='2' strokeMiterlimit='10' />
            </svg>
          </div>
        </div>
        <p className='loader-message'>{message || t('general.loading')}</p>
      </div>
    </div>
  );

  return <>{addWrapper ? <div className='container main-container'>{loader}</div> : loader}</>;
};
