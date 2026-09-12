import { relativePins } from "../lib/geo";
import type { Sighting } from "../types";

export function SightingMap({ sightings }: { sightings: Sighting[] }) {
  const pins = relativePins(sightings);
  if (pins.length === 0) return null;
  const newest = pins[pins.length - 1]?.sighting.id;

  return (
    <div className="overflow-hidden rounded-xl bg-muted/70 shadow-[var(--shadow-border)]">
      <svg
        viewBox="0 0 320 150"
        className="block h-36 w-full"
        aria-label="Relative locations of past sightings"
      >
        <rect width="320" height="150" fill="var(--color-muted)" />
        <path
          d="M0 38h320M0 75h320M0 112h320M80 0v150M160 0v150M240 0v150"
          stroke="var(--color-border)"
          strokeWidth="1"
        />
        {pins.length > 1
          ? pins.slice(1).map((pin) => {
              const origin = pins[0];
              if (!origin) return null;
              return (
                <line
                  key={`l-${pin.sighting.id}`}
                  x1={origin.x}
                  y1={origin.y}
                  x2={pin.x}
                  y2={pin.y}
                  stroke="var(--color-primary)"
                  strokeOpacity="0.28"
                  strokeWidth="1.5"
                />
              );
            })
          : null}
        {pins.map((pin) => {
          const latest = pin.sighting.id === newest;
          return (
            <circle
              key={pin.sighting.id}
              cx={pin.x}
              cy={pin.y}
              r={latest ? 6 : 4.5}
              fill={latest ? "var(--color-primary)" : "var(--color-leather)"}
              fillOpacity={latest ? 1 : 0.55}
            />
          );
        })}
      </svg>
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Relative pins from recorded GPS. Sage is the most recent fix.
      </p>
    </div>
  );
}
