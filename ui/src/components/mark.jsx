/*
  Jaal means net. Four nodes caught in one mesh, which is the whole idea:
  no single account looks wrong, the edges between them do.
*/
export function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g stroke="var(--color-accent)" strokeWidth="1.25" opacity="0.55">
        <path d="M8 9 L24 9 M8 23 L24 23 M8 9 L8 23 M24 9 L24 23" />
        <path d="M8 9 L24 23 M24 9 L8 23" />
        <path d="M16 4 L16 28 M4 16 L28 16" opacity="0.35" />
      </g>
      <g fill="var(--color-accent)">
        <circle cx="8" cy="9" r="2.1" />
        <circle cx="24" cy="9" r="2.1" />
        <circle cx="8" cy="23" r="2.1" />
        <circle cx="24" cy="23" r="2.1" />
      </g>
      <circle cx="16" cy="16" r="2.6" fill="var(--color-pos)" />
    </svg>
  );
}
