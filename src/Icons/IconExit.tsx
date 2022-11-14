import { CSSProperties } from 'react';

export const IconExit = (props: {
  className: string;
  style?: CSSProperties;
}) => {
  return (
    <svg
      className={props.className}
      style={props.style}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 18.25a.75.75 0 010 1.5H5A1.75 1.75 0 013.25 18V6c0-.966.783-1.75 1.75-1.75h6a.75.75 0 010 1.5H5a.25.25 0 00-.25.25v12c0 .138.112.25.25.25h6z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.497 14.365a1.25 1.25 0 01-1.25-1.25v-2.24c0-.691.56-1.25 1.25-1.25h4.613l.02-.221.054-.555a1.226 1.226 0 011.751-.988 15.052 15.052 0 014.368 3.164l.099.103a1.254 1.254 0 010 1.734l-.099.103a15.052 15.052 0 01-4.368 3.164 1.227 1.227 0 01-1.751-.988l-.054-.556a14.973 14.973 0 01-.02-.22H8.497zm5.308-1.5a.751.751 0 01.748.704c.019.29.042.581.07.871l.016.162a13.566 13.566 0 003.516-2.607 13.595 13.595 0 00-3.516-2.607l-.016.162c-.028.29-.051.581-.07.871a.75.75 0 01-.748.704H8.747v1.74h5.058z"
        fill="currentColor"
      />
    </svg>
  );
};
