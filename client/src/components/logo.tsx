export function BuffettLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Buffett Bracket"
    >
      {/* sun */}
      <circle cx="32" cy="28" r="14" fill="hsl(36 92% 55%)" />
      {/* horizon line */}
      <rect x="6" y="40" width="52" height="2" rx="1" fill="hsl(184 65% 30%)" />
      {/* palm trunk */}
      <path d="M44 56 Q42 48 46 40" stroke="hsl(195 40% 15%)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* palm fronds */}
      <path d="M46 40 Q40 36 36 38 M46 40 Q52 36 56 38 M46 40 Q44 34 40 32 M46 40 Q48 34 52 32" stroke="hsl(145 50% 30%)" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* wave */}
      <path d="M6 50 Q14 47 22 50 T38 50 T58 50" stroke="hsl(184 65% 30%)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
