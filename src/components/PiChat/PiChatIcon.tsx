import React from 'react';

export interface PiChatIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const PiChatIcon: React.FC<PiChatIconProps> = ({ size = 20, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {/* Antenna */}
    <path d="M12 2v3" />
    <circle cx="12" cy="2" r="1" fill="currentColor" />

    {/* Robot Head Body */}
    <rect x="4" y="6" width="16" height="13" rx="3" ry="3" />

    {/* Ears */}
    <path d="M2 11v3" />
    <path d="M22 11v3" />

    {/* Eyes */}
    <circle cx="9" cy="11" r="1.25" fill="currentColor" />
    <circle cx="15" cy="11" r="1.25" fill="currentColor" />

    {/* Mouth / Smile */}
    <path d="M9 15h6" />
  </svg>
);

export default PiChatIcon;
