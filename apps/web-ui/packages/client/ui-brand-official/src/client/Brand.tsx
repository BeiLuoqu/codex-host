import { useId } from "react";
import type { SidebarBrandMarkOwnerProps } from "@deepseek-ai/dsh-client-ui-sidebar/client";

/**
 * CodexHost application mark: the open host ring and core square on its rounded plate.
 * @param props - Host-supplied mark presentation.
 * @returns the CodexHost mark.
 */
export function CodexHostMark({
  size,
  className,
}: SidebarBrandMarkOwnerProps & { className?: string }) {
  const id = useId().replaceAll(":", "");
  const plate = `${id}-codexhost-plate`;
  const ink = `${id}-codexhost-ink`;
  const shadow = `${id}-codexhost-shadow`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="CodexHost"
      data-codexhost-mark="app-icon"
    >
      <defs>
        <linearGradient id={plate} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fafafa" />
          <stop offset="1" stopColor="#ededed" />
        </linearGradient>
        <linearGradient id={ink} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#363638" />
          <stop offset="1" stopColor="#222224" />
        </linearGradient>
        <filter id={shadow} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.8" floodColor="#000" floodOpacity="0.22" />
        </filter>
      </defs>
      <rect
        x="4.4"
        y="4.4"
        width="55.1"
        height="55.1"
        rx="12"
        fill={`url(#${plate})`}
        filter={`url(#${shadow})`}
      />
      <g transform="translate(32.8 32.2) scale(1.2) translate(-32.8 -32.2)" fill={`url(#${ink})`}>
        <path
          d="M 46.392 22.651 A 16.67 16.67 0 1 0 46.392 41.869 L 42.592 39.189 A 12.02 12.02 0 1 1 42.592 25.331 Z"
          stroke={`url(#${ink})`}
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <rect x="26.85" y="26.05" width="12.1" height="12.1" rx="3" />
      </g>
    </svg>
  );
}

/**
 * CodexHost wordmark shown beside the sidebar mark.
 * @returns the product name.
 */
export function CodexHostName() {
  return (
    <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
      CodexHost
    </span>
  );
}
