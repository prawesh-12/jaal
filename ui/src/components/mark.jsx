/*
  Jaal means net. Four accounts caught in one mesh, which is the whole idea:
  no single account looks wrong, the edges between them do.
*/
export function Mark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="var(--color-primary)" strokeWidth="1.1" strokeLinecap="round" opacity="0.5">
        <path d="M6 6 H18 M6 18 H18 M6 6 V18 M18 6 V18" />
        <path d="M6 6 L18 18 M18 6 L6 18" />
      </g>
      <g fill="var(--color-primary)">
        <circle cx="6" cy="6" r="1.9" />
        <circle cx="18" cy="6" r="1.9" />
        <circle cx="6" cy="18" r="1.9" />
        <circle cx="18" cy="18" r="1.9" />
      </g>
      <circle cx="12" cy="12" r="2.4" fill="var(--color-mark-1)" />
    </svg>
  );
}
