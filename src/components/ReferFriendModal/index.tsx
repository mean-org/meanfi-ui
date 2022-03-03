import React, { useEffect, useState } from 'react';
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import "./style.less";
import { IconCopy, IconFacebook, IconLinkedin, IconTelegram, IconTwitter, IconWhatsapp } from '../../Icons';
import { notify } from '../../utils/notifications';
import { copyText } from '../../utils/ui';
import {
  FacebookShareButton,
  LinkedinShareButton,
  TelegramShareButton,
  TwitterShareButton,
  WhatsappShareButton,
} from "react-share";
import { useWallet } from '../../contexts/wallet';
import { appConfig } from '../..';

export const ReferFriendModal = (props: {
  handleClose: any;
  isVisible: boolean;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [referralLink, setReferralLink] = useState('');

  useEffect(() => {
    if (!referralLink && publicKey) {
      const newLink = `${appConfig.getConfig().appUrl}?ref=${publicKey.toBase58()}`;
      setReferralLink(newLink);
    }
  }, [
    publicKey,
    referralLink
  ]);

  const onCopyReferralLink = () => {
    if (referralLink && copyText(referralLink)) {
      notify({
        description: t('notifications.referral-link-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.referral-link-not-copied-message'),
        type: "error"
      });
    }
  }

  return (
    <Modal
        className="mean-modal simple-modal"
        title={<div className="modal-title">{t('referrals.modal-title')}</div>}
        footer={null}
        visible={props.isVisible}
        onCancel={props.handleClose}
        width={450}>
        <div className="transaction-progress refer-friend-wrapper">
            <div className="refer-friend-image">
                <img src="/assets/giftbox.svg" alt="" />
                {/* {referrals > 0 && (
                  <span className="badge orange-red referrals-badge">{referrals}</span>
                )} */}
            </div>
            <h4 className="refer-friend-hint">{t('referrals.refer-friend-hint')}</h4>
            <div className="transaction-field">
              <div className="transaction-field-row main-row">
                <span className="input-left recipient-field-wrapper">
                  <span className="referral-link text-monospace">{referralLink}</span>
                </span>
                <div className="addon-right simplelink" onClick={onCopyReferralLink}>
                  <IconCopy className="mean-svg-icons" />
                </div>
              </div>
            </div>
            <div className="flex-row align-items-center">
              <span className="ml-2">{t('referrals.share-to')}</span>
              <FacebookShareButton
                url={referralLink}
                quote={t('referrals.modal-title')}
                className="share-button">
                <IconFacebook className="mean-svg-icons" />
              </FacebookShareButton>
              <TwitterShareButton
                url={referralLink}
                title={t('referrals.modal-title')}
                className="share-button">
                <IconTwitter className="mean-svg-icons" />
              </TwitterShareButton>
              <TelegramShareButton
                url={referralLink}
                title={t('referrals.modal-title')}
                className="share-button">
                <IconTelegram className="mean-svg-icons" />
              </TelegramShareButton>
              <WhatsappShareButton
                url={referralLink}
                title={t('referrals.modal-title')}
                separator=":: "
                className="share-button">
                <IconWhatsapp className="mean-svg-icons" />
              </WhatsappShareButton>
              <LinkedinShareButton
                url={referralLink}
                className="share-button">
                <IconLinkedin className="mean-svg-icons" />
              </LinkedinShareButton>
            </div>
            {/* <div className="text-center mt-1">
              <a className="simplelink underline-on-hover"
                  target="_blank" rel="noopener noreferrer"
                  href="https://docs.meanfi.com/governance/mean-token/tge-and-airdrop">{t('referrals.see-rules')}
              </a>
            </div> */}
        </div>
    </Modal>
  );
};
