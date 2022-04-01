export const IconLoading = (props: {className: string; style?: React.CSSProperties;}) => {
    return (
        <svg className={props.className} style={props.style} width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(20 50)">
                <circle cx="0" cy="0" r="6" fill="currentColor">
                    <animateTransform attributeName="transform" type="scale" begin="-0.30000000000000004s" calcMode="spline" keySplines="0.3 0 0.7 1;0.3 0 0.7 1" values="0;1;0" keyTimes="0;0.5;1" dur="0.8s" repeatCount="indefinite"></animateTransform>
                </circle>
            </g>
            <g transform="translate(40 50)">
                <circle cx="0" cy="0" r="6" fill="currentColor">
                    <animateTransform attributeName="transform" type="scale" begin="-0.2s" calcMode="spline" keySplines="0.3 0 0.7 1;0.3 0 0.7 1" values="0;1;0" keyTimes="0;0.5;1" dur="0.8s" repeatCount="indefinite"></animateTransform>
                </circle>
            </g>
            <g transform="translate(60 50)">
                <circle cx="0" cy="0" r="6" fill="currentColor">
                    <animateTransform attributeName="transform" type="scale" begin="-0.1s" calcMode="spline" keySplines="0.3 0 0.7 1;0.3 0 0.7 1" values="0;1;0" keyTimes="0;0.5;1" dur="0.8s" repeatCount="indefinite"></animateTransform>
                </circle>
            </g>
            <g transform="translate(80 50)">
                <circle cx="0" cy="0" r="6" fill="currentColor">
                    <animateTransform attributeName="transform" type="scale" begin="0s" calcMode="spline" keySplines="0.3 0 0.7 1;0.3 0 0.7 1" values="0;1;0" keyTimes="0;0.5;1" dur="0.8s" repeatCount="indefinite"></animateTransform>
                </circle>
            </g>
        </svg>
    );
};
