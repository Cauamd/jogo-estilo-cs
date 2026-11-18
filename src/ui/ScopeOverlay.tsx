import { useEffect, useRef } from "react";
import type { Game } from "../core/Game";

/** The central aperture is transparent: it reveals the SAME camera used by raycasting. */
export function ScopeOverlay({ game }: { game: Game | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!game) return;
    game.scopeElement = ref.current;
    return () => {
      game.scopeElement = null;
    };
  }, [game]);
  return (
    <div
      ref={ref}
      className="scope-overlay"
      aria-label="Luneta SPECTRE S1"
      aria-hidden="true"
    >
      <div className="scope-aperture">
        <svg
          viewBox="0 0 1000 1000"
          className="scope-reticle"
          aria-hidden="true"
        >
          <circle
            cx="500"
            cy="500"
            r="491"
            fill="none"
            stroke="#acc4bb"
            strokeWidth="1"
            opacity=".4"
          />
          <g stroke="#112227" strokeWidth="1.6" fill="none">
            <path d="M0 500H483M517 500H1000M500 0V483M500 517V1000" />
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <g key={n}>
                <path
                  d={`M${500 - n * 36} 494v12M${500 + n * 36} 494v12M494 ${500 + n * 36}h12M494 ${500 - n * 36}h12`}
                />
              </g>
            ))}
            <path
              d="M480 572h40m-52 36h64m-76 36h88m-100 36h112"
              opacity=".55"
            />
          </g>
          <g fill="#ed9874">
            <circle cx="500" cy="500" r="2.1" />
            <path d="m495 506 5-4 5 4-5-1Z" />
          </g>
          <g fontFamily="monospace" fontSize="11" fill="#12292c" opacity=".8">
            <text x="516" y="578">
              2
            </text>
            <text x="530" y="614">
              4
            </text>
            <text x="540" y="650">
              6
            </text>
            <text x="445" y="835">
              S1 / MRAD
            </text>
          </g>
        </svg>
      </div>
      <div className="scope-caption">
        SPECTRE S1 <span>ÓPTICA 3×</span>
      </div>
    </div>
  );
}
