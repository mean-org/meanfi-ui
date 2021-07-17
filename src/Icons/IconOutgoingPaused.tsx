export const IconOutgoingPaused = (props: {className: string}) => {
    return (
        <svg className={props.className} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter colorInterpolationFilters="auto" id="a">
                <feColorMatrix in="SourceGraphic" values="0 0 0 0 0.878431 0 0 0 0 0.125490 0 0 0 0 0.125490 0 0 0 1.000000 0"/>
                </filter>
                <filter x="-60%" y="-60%" width="220%" height="220%" filterUnits="objectBoundingBox" id="b">
                <feOffset dy="2" in="SourceAlpha" result="shadowOffsetOuter1"/>
                <feGaussianBlur stdDeviation="2" in="shadowOffsetOuter1" result="shadowBlurOuter1"/>
                <feColorMatrix values="0 0 0 0 1   0 0 0 0 1   0 0 0 0 1  0 0 0 0.5 0" in="shadowBlurOuter1" result="shadowMatrixOuter1"/>
                <feMerge>
                    <feMergeNode in="shadowMatrixOuter1"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
                </filter>
                <filter colorInterpolationFilters="auto" id="c">
                <feColorMatrix in="SourceGraphic" values="0 0 0 0 0.000000 0 0 0 0 0.000000 0 0 0 0 0.000000 0 0 0 1.000000 0"/>
                </filter>
                <path id="d" d="M0 0h10v10H0z"/>
            </defs>
            <g fill="none" fillRule="evenodd">
                <g transform="translate(1 3)">
                <rect stroke="#E02020" fill="#FFF" width="20" height="20" rx="2"/>
                <g filter="url(#a)">
                    <g filter="url(#b)">
                    <g fill="#000">
                        <path d="M8.948 13.856a1.243 1.243 0 01-1.239-1.135 30.93 30.93 0 01-.089-4.037l-.21-.015-1.242-.09a1.05 1.05 0 01-.808-1.613c.913-1.43 2.587-3.03 3.965-4.02.403-.29.946-.29 1.35 0 1.378.99 3.052 2.59 3.965 4.02a1.05 1.05 0 01-.808 1.612l-1.241.09-.211.016a30.931 30.931 0 01-.09 4.037 1.243 1.243 0 01-1.238 1.135H8.948zm-.047-5.72a29.687 29.687 0 00.053 4.47h2.092c.13-1.487.148-2.981.053-4.47a.625.625 0 01.593-.664c.27-.014.539-.03.808-.05l.901-.066a12.13 12.13 0 00-2.958-3.037L10 4l-.443.318A12.13 12.13 0 006.6 7.356l.901.066c.27.02.539.036.808.05a.625.625 0 01.593.663z"/>
                        <path d="M4.792 14.167a.625.625 0 00-1.25 0v1.666c0 .806.653 1.459 1.458 1.459h10c.805 0 1.458-.653 1.458-1.459v-1.666a.625.625 0 00-1.25 0v1.666a.208.208 0 01-.208.209H5a.208.208 0 01-.208-.209v-1.666z" fillRule="nonzero"/>
                    </g>
                    </g>
                </g>
                </g>
                <g transform="translate(14)">
                <circle fill="#FFF" cx="5" cy="5" r="5"/>
                <g filter="url(#c)">
                    <mask id="e" fill="#fff">
                    <use xlinkHref="#d"/>
                    </mask>
                    <path d="M5 .833A4.168 4.168 0 00.833 5C.833 7.3 2.7 9.167 5 9.167S9.167 7.3 9.167 5 7.3.833 5 .833c-1.533 0-1.533 0 0 0zm-.417 5.834H3.75V3.333h.833v3.334zm.834 0h.833V3.333h-.833v3.334z" fill="#2E3A59" mask="url(#e)"/>
                </g>
                </g>
            </g>
        </svg>
    );
};