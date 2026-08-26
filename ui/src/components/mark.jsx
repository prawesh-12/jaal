/*
  Jaal means net. Four accounts caught in one mesh, which is the whole idea:
  no single account looks wrong, the edges between them do.
*/
export function Mark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1" opacity="0.45">
        <path d="M6 6 H18 M6 18 H18 M6 6 V18 M18 6 V18 M6 6 L18 18 M18 6 L6 18" />
      </g>
      <g fill="currentColor">
        <circle cx="6" cy="6" r="1.7" />
        <circle cx="18" cy="6" r="1.7" />
        <circle cx="6" cy="18" r="1.7" />
        <circle cx="18" cy="18" r="1.7" />
        <circle cx="12" cy="12" r="2.1" />
      </g>
    </svg>
  );
}
