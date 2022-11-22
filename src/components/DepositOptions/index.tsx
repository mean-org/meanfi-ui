import { ArrowLeftOutlined, LoadingOutlined } from '@ant-design/icons';
import { initOnRamp } from '@coinbase/cbpay-js';
import { Button, Col, Modal, Row, Tooltip } from 'antd';
import { openNotification } from 'components/Notifications';
import { MEAN_FINANCE_APP_ALLBRIDGE_URL } from 'constants/common';
import { useWallet } from 'contexts/wallet';
import { environment } from 'environments/environment';
import useScript from 'hooks/useScript';
import { IconCopy, IconInfoTriangle, IconSolana } from 'Icons';
import { appConfig } from 'index';
import { consoleOut, copyText } from 'middleware/ui';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './style.scss';

declare const TransakSDK: any;
let transak: any = undefined;

export const DepositOptions = (props: {
  handleClose: any;
  isVisible: boolean;
}) => {
  const {
    handleClose,
    isVisible,
  } = props;

  const { t } = useTranslation('common');
  const { publicKey, connected } = useWallet();
  const [isCoinbasePayReady, setIsCoinbasePayReady] = useState(false);
  const [isSharingAddress, setIsSharingAddress] = useState(false);

  //#region Init code

  // Load the Transak widget script asynchronously
  const { status } = useScript(`https://global.transak.com/sdk/v1.1/widget.js`);

  // Get App config
  const currentConfig = useMemo(() => appConfig.getConfig(), []);

  //#endregion

  //#region Getters, Actions & Event handlers

  const enableAddressSharing = () => {
    setIsSharingAddress(true);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  };

  const closePanels = () => {
    setIsSharingAddress(false);
  };

  const handleBridgeFromEthereumButtonClick = () => {
    setTimeout(() => {
      window.open(
        MEAN_FINANCE_APP_ALLBRIDGE_URL + '/bridge?from=ETH&to=SOL&asset=USDT',
        '_blank',
        'noreferrer',
      );
    }, 500);
    handleClose();
  };

  const handleBridgeFromPolygonButtonClick = () => {
    setTimeout(() => {
      window.open(
        MEAN_FINANCE_APP_ALLBRIDGE_URL + '/bridge?from=POL&to=SOL&asset=USDT',
        '_blank',
        'noreferrer',
      );
    }, 500);
    handleClose();
  };

  const handleTransakButtonClick = () => {
    setTimeout(() => {
      if (transak) {
        transak.init();
        // To get all the events
        transak.on(transak.ALL_EVENTS, (data: any) => {
          consoleOut('transak event:', data, 'blue');
        });
      }
    }, 300);
    handleClose();
  };

  const handleCoinbaseButtonClick = () => {
    // Nothing else to do for now
    handleClose();
  };

  const onCopyAddress = () => {
    if (publicKey && copyText(publicKey)) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: 'info',
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: 'error',
      });
    }
  };

  const getCoinbaseButtonLabel = () => {
    if (!connected) {
      return t('deposits.coinbase-pay-cta-label');
    } else if (!isCoinbasePayReady) {
      return 'Initializing Coinbase Pay';
    } else {
      return t('deposits.coinbase-pay-cta-label');
    }
  }

  //#endregion

  // Transak initialization
  useEffect(() => {
    if (status === 'ready' && !transak) {
      transak = new TransakSDK.default({
        apiKey: currentConfig?.transakApiKey, // Your API Key
        environment: environment === 'production' ? 'PRODUCTION' : 'STAGING', // STAGING/PRODUCTION
        defaultCryptoCurrency: 'SOL',
        networks: 'SOLANA',
        hideMenu: true,
        walletAddress: publicKey?.toBase58() || '', // Your customer's wallet address
        themeColor: 'B7001C', // App theme color
        // fiatCurrency: 'EUR',
        email: '', // Your customer's email address
        redirectURL: '',
        hostURL: window.location.origin,
        widgetHeight: '634px',
        widgetWidth: '100%',
      });
    }
  }, [currentConfig, publicKey, status]);

  // Coinbase Pay initialization
  useEffect(() => {
    if (!publicKey || !isVisible) {
      return;
    }

    const buttonContainerQuery = '#cbpay-button-container';
    const el = document.querySelector(buttonContainerQuery);
    if (isCoinbasePayReady || !el) {
      return;
    }

    console.log('Calling initOnRamp...');
    initOnRamp({
      appId: currentConfig.coinBaseAppId,
      target: buttonContainerQuery,
      widgetParameters: {
        destinationWallets: [{
          address: publicKey.toBase58(),
          blockchains: ['solana'],
        }],
      },
      onSuccess: () => {
        // handle navigation when user successfully completes the flow
        console.log(`Processing onSuccess!`);
      },
      onExit: () => {
        // handle navigation from dismiss / exit events due to errors
        console.log(`Processing onExit!`);
      },
      onEvent: (event) => {
        // event stream
        console.log(`Processing onEvent ->`, event);
      },
      experienceLoggedIn: 'embedded',
      experienceLoggedOut: 'popup',
    }, () => {
      setIsCoinbasePayReady(true);
      console.log('Coinbase Pay is initialized!');
    });
  }, [currentConfig.coinBaseAppId, isCoinbasePayReady, isVisible, publicKey])

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(
        '.overflow-ellipsis-middle',
      );
      for (const element of ellipsisElements) {
        const e = element as HTMLElement;
        if (e.offsetWidth < e.scrollWidth) {
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    };
  }, []);


  return (
    <Modal
      className="mean-modal simple-modal multi-step"
      title={
        <>
          {isSharingAddress && (
            <div className="back-button ant-modal-close">
              <Tooltip
                placement="bottom"
                title={t('deposits.back-to-deposit-options')}
              >
                <Button
                  type="default"
                  shape="circle"
                  icon={<ArrowLeftOutlined />}
                  onClick={closePanels}
                />
              </Tooltip>
            </div>
          )}
          <div className="modal-title">{t('deposits.modal-title')}</div>
        </>
      }
      footer={null}
      open={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      afterClose={closePanels}
      width={450}
    >
      <div className="deposit-selector">
        <div
          className={
            isSharingAddress ? 'options-list hide' : 'options-list show'
          }
          id="options-list"
        >
          <p>{t('deposits.heading')}:</p>
          {!connected && (
            <p className="fg-error">{t('deposits.not-connected')}!</p>
          )}
          <Row gutter={[24, 24]}>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="ghost"
                shape="round"
                size="middle"
                disabled={!connected}
                onClick={enableAddressSharing}
              >
                <IconSolana className="deposit-partner-icon" />
                {t('deposits.send-from-wallet-cta-label')}
              </Button>
            </Col>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="ghost"
                shape="round"
                size="middle"
                id='cbpay-button-container'
                disabled={!connected || !isCoinbasePayReady}
                onClick={handleCoinbaseButtonClick}
              >
                <img
                  src="/assets/deposit-partners/coinbase.svg"
                  className="deposit-partner-icon"
                  alt={t('deposits.coinbase-pay-cta-label')}
                />
                {getCoinbaseButtonLabel()}
                {connected && !isCoinbasePayReady ? (
                  <div className="loading-container">
                    <LoadingOutlined style={{ fontSize: '24px' }} />
                  </div>
                ) : null}
              </Button>
            </Col>
            <Col span={24}>
              <Tooltip
                placement="bottom"
                title={t('deposits.transak-cta-warning')}
              >
                <Button
                  block
                  className="deposit-option"
                  type="ghost"
                  shape="round"
                  size="middle"
                  disabled={status !== 'ready'}
                  onClick={handleTransakButtonClick}
                >
                  <img
                    src="/assets/deposit-partners/transak.png"
                    className="deposit-partner-icon"
                    alt={t('deposits.transak-cta-label')}
                  />
                  {t('deposits.transak-cta-label')}
                  <IconInfoTriangle className="mean-svg-icons warning" />
                </Button>
              </Tooltip>
            </Col>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="ghost"
                shape="round"
                size="middle"
                onClick={handleBridgeFromEthereumButtonClick}
              >
                <img
                  src="/assets/deposit-partners/eth.png"
                  className="deposit-partner-icon"
                  alt={t('deposits.move-from-ethereum-cta-label')}
                />
                {t('deposits.move-from-ethereum-cta-label')}
              </Button>
            </Col>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="ghost"
                shape="round"
                size="middle"
                onClick={handleBridgeFromPolygonButtonClick}
              >
                <img
                  src="/assets/deposit-partners/polygon.png"
                  className="deposit-partner-icon"
                  alt={t('deposits.move-from-polygon-cta-label')}
                />
                {t('deposits.move-from-polygon-cta-label')}
              </Button>
            </Col>
          </Row>
        </div>
        <div
          className={
            isSharingAddress
              ? 'option-detail-panel p-5 show'
              : 'option-detail-panel hide'
          }
        >
          <div className="text-center">
            <h3 className="font-bold mb-3">
              {t('deposits.send-from-wallet-cta-label')}
            </h3>
            <div className="qr-container bg-white">
              {publicKey && (
                <QRCodeSVG value={publicKey.toBase58()} size={200} />
              )}
            </div>
            <div className="transaction-field medium">
              <div className="transaction-field-row main-row">
                <span className="input-left recipient-field-wrapper">
                  {publicKey && (
                    <span
                      id="address-static-field"
                      className="overflow-ellipsis-middle"
                    >
                      {publicKey.toBase58()}
                    </span>
                  )}
                </span>
                <div className="addon-right simplelink" onClick={onCopyAddress}>
                  <IconCopy className="mean-svg-icons link" />
                </div>
              </div>
            </div>
            <div className="font-light font-size-75 px-4">
              {t('deposits.address-share-disclaimer')}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
