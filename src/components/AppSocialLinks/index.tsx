import {
    IconDiscord,
    IconFacebook,
    IconGithub,
    IconInstagram,
    IconLinkedin,
    IconMedium,
    IconTelegram,
    IconTwitter,
    IconWhatsapp
} from 'Icons';
import { SocialMediaEntry } from 'models/accounts';
import { SocialNetwork } from 'models/enums';

export const AppSocialLinks = (props: {
    appSocialLinks?: SocialMediaEntry[];
}) => {
    const { appSocialLinks } = props;

    const getIconByNetworkId = (social: SocialMediaEntry) => {
        switch (social.network) {
            case SocialNetwork.Discord:
                return (<IconDiscord className="mean-svg-icons" />);
            case SocialNetwork.Facebook:
                return (<IconFacebook className="mean-svg-icons" />);
            case SocialNetwork.Github:
                return (<IconGithub className="mean-svg-icons" />);
            case SocialNetwork.Instagram:
                return (<IconInstagram className="mean-svg-icons" />);
            case SocialNetwork.Linkedin:
                return (<IconLinkedin className="mean-svg-icons" />);
            case SocialNetwork.Medium:
                return (<IconMedium className="mean-svg-icons" />);
            case SocialNetwork.Telegram:
                return (<IconTelegram className="mean-svg-icons" />);
            case SocialNetwork.Twitter:
                return (<IconTwitter className="mean-svg-icons" />);
            case SocialNetwork.Whatsapp:
                return (<IconWhatsapp className="mean-svg-icons" />);
            default:
                return null;
        }
    }

    return (
        <div className="social-links">
            {appSocialLinks ? appSocialLinks.map(social => {
                return (
                    <div key={social.network} className="link">
                        <a className="simplelink" target="_blank" rel="noopener noreferrer" href={social.linkUrl}>
                            {getIconByNetworkId(social)}
                        </a>
                    </div>
                );
            }) : null}
        </div>
    );
}
