import { useEffect, useRef, useState } from "react";

/*
  Lightroom/Photoshop-style colour picker.

    [outer hue ring]
    [    SV square    ]   ← saturation × value, recoloured to active hue

  Pointer-driven: clicking/dragging the hue ring sets H; clicking/dragging
  the SV square sets S and V. Numeric R/G/B + hex inputs round-trip cleanly
  via the same hsvFromHex / hexFromHsv pair, so no path is lossy except the
  final 0–255 quantisation.

  We render the wheel + SV square with CSS gradients (conic for hue,
  layered linear-gradients for SV). No canvas, no external dependency —
  works on all modern browsers and respects the user's reduce-motion pref
  via inheritance.
*/

const WHEEL_SIZE = 240;
const RING_THICKNESS = 24;
const SV_SIZE = 130;

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv | null {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: hue, s, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const hh = (h / 60) % 6;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  const fmt = (n: number) =>
    Math.max(0, Math.min(255, Math.round((n + m) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${fmt(r)}${fmt(g)}${fmt(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function ColorWheel({
  value,
  onChange,
}: {
  /** Hex string. Falsy → wheel renders in a "no colour selected" state. */
  value: string | null;
  /** Fires on every pointer move during a drag and on each commit. Hex string. */
  onChange: (hex: string) => void;
}) {
  // Local HSV — the source of truth while dragging. We sync from props on
  // mount and whenever props change externally (preset clicks, hex input).
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value ?? "#4f9bff") ?? { h: 215, s: 0.7, v: 1 });

  useEffect(() => {
    if (!value) return;
    const next = hexToHsv(value);
    if (!next) return;
    // Avoid clobbering local state when the parent's hex equals what we
    // just emitted. setState bails out on === objects but not deep-equal,
    // so compare scalar fields with a small epsilon.
    if (
      Math.abs(next.h - hsv.h) < 0.5 &&
      Math.abs(next.s - hsv.s) < 0.005 &&
      Math.abs(next.v - hsv.v) < 0.005
    ) {
      return;
    }
    setHsv(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const ringRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);

  function emit(next: Hsv) {
    setHsv(next);
    onChange(hsvToHex(next.h, next.s, next.v));
  }

  // --- Hue ring drag handling -----------------------------------------------
  function pointToHue(clientX: number, clientY: number) {
    const rect = ringRef.current?.getBoundingClientRect();
    if (!rect) return hsv.h;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Math.atan2 returns 0 = +x axis, going CCW. Convert to standard
    // colour-wheel orientation (0 = red at 3 o'clock, increasing clockwise).
    let deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }

  function onRingPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => emit({ ...hsv, h: pointToHue(e.clientX, e.clientY) });
    const up = (e: PointerEvent) => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
    emit({ ...hsv, h: pointToHue(event.clientX, event.clientY) });
  }

  // --- SV square drag handling ---------------------------------------------
  function pointToSv(clientX: number, clientY: number) {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) return { s: hsv.s, v: hsv.v };
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return { s: x / rect.width, v: 1 - y / rect.height };
  }

  function onSvPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const { s, v } = pointToSv(e.clientX, e.clientY);
      emit({ ...hsv, s, v });
    };
    const up = (e: PointerEvent) => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
    const { s, v } = pointToSv(event.clientX, event.clientY);
    emit({ ...hsv, s, v });
  }

  // Thumb positions
  const hueRad = (hsv.h * Math.PI) / 180;
  const ringRadius = WHEEL_SIZE / 2 - RING_THICKNESS / 2;
  const hueThumbX = WHEEL_SIZE / 2 + Math.cos(hueRad) * ringRadius;
  const hueThumbY = WHEEL_SIZE / 2 + Math.sin(hueRad) * ringRadius;
  const svThumbX = hsv.s * SV_SIZE;
  const svThumbY = (1 - hsv.v) * SV_SIZE;

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };

  return (
    <div className="color-wheel">
      <div
        ref={ringRef}
        className="color-wheel-ring"
        onPointerDown={onRingPointerDown}
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
      >
        <div
          className="color-wheel-hue-thumb"
          style={{ left: hueThumbX, top: hueThumbY, background: `hsl(${hsv.h}, 100%, 50%)` }}
        />
        <div
          ref={svRef}
          className="color-wheel-sv"
          onPointerDown={onSvPointerDown}
          style={{ ["--wheel-hue" as string]: `${hsv.h}` }}
          role="slider"
          aria-label="Saturation and value"
          aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, Value ${Math.round(hsv.v * 100)}%`}
          tabIndex={0}
        >
          <div
            className="color-wheel-sv-thumb"
            style={{ left: svThumbX, top: svThumbY, background: hex }}
          />
        </div>
      </div>

      <div className="color-wheel-readout">
        <div className="color-wheel-preview" style={{ background: hex }} aria-hidden="true" />
        <div className="color-wheel-fields">
          <label>
            <span>Hex</span>
            <input
              type="text"
              value={hex}
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
                  const next = hexToHsv(raw);
                  if (next) emit(next);
                }
              }}
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
                    const updated = { ...rgb, [channel]: v };
                    const nextHex =
                      "#" +
                      [updated.r, updated.g, updated.b]
                        .map((n) => n.toString(16).padStart(2, "0"))
                        .join("");
                    const nextHsv = hexToHsv(nextHex);
                    if (nextHsv) emit(nextHsv);
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
