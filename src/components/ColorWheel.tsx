import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";

/*
  Accent colour picker.

  Backed by react-colorful (~2.8 KB) — saturation/value square + hue slider.
  Replaced a hand-rolled hue-ring + SV-square implementation that rendered
  poorly at small sizes (the SV square's stacked transparent gradient washed
  out, making the picker look broken).

  We preserve the hex / R / G / B fields and live preview swatch around the
  picker so users can type or paste exact values. The picker itself is
  restyled via .react-colorful overrides in styles.css to match Glassfin's
  glass language (rounded corners, accent-tinted thumb, generous spacing).
*/

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb | null {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function ColorWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // Local hex state so the user can type partial values in the field without
  // the parent firing onChange on every keystroke. We commit to the parent
  // when the value parses cleanly.
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const rgb = hexToRgb(value) ?? { r: 0, g: 0, b: 0 };

  function commit(hex: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      onChange(hex.toLowerCase());
    }
  }

  return (
    <div className="color-wheel">
      <div className="color-wheel-picker-wrap">
        <HexColorPicker color={value} onChange={commit} />
      </div>

      <div className="color-wheel-readout">
        <div className="color-wheel-preview" style={{ background: value }} aria-hidden="true" />
        <div className="color-wheel-fields">
          <label>
            <span>Hex</span>
            <input
              type="text"
              value={draft}
              onChange={(event) => {
                const raw = event.target.value.trim();
                setDraft(raw);
                commit(raw);
              }}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <div className="color-wheel-rgb">
            {(["r", "g", "b"] as const).map((channel) => (
              <label key={channel}>
                <span>{channel.toUpperCase()}</span>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[channel]}
                  onChange={(event) => {
                    const v = Math.max(0, Math.min(255, Number(event.target.value) || 0));
                    const next = rgbToHex({ ...rgb, [channel]: v });
                    onChange(next);
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ColorWheel;
