import Svg, { Circle, Path, Rect } from "react-native-svg";

export type SkyNavIconName = "home" | "skills" | "robot" | "vision" | "profile";

type Props = {
  name: SkyNavIconName;
  active: boolean;
  // Theme colour from the caller (accent when active, neutral otherwise).
  // Nothing inside the paths is hardcoded, so Light/Dark both follow it.
  color: string;
  size?: number;
};

// SkyNex bottom-navigation icon family, tuned for icon-only mobile use at
// 24pt. One grammar on a 24-unit grid: round caps and joins, ~2-unit corner
// radii, stroke 2.0 (2.3 when active), and — in the active state only — ONE
// filled accent element per icon, so selection is designed in, not just
// recoloured. Structural dots (eyes, pupil) are filled in both states.
// Active fills are grown by about half a stroke so they match the outer
// size of their stroked shape (no optical shrink on selection).
//
// Every icon fills roughly the same 18–19 unit box around the centre, so
// the five carry similar weight and sit on the same optical centre line.
//
//   home    — a small robot companion on its dock      (active: the dock)
//   skills  — three skill modules                      (active: lead module)
//   robot   — an articulated SO-ARM101-style arm       (active: elbow joint)
//   vision  — a sensor lens inside framing corners     (active: lens core)
//   profile — a person inside a soft ring              (active: head)
export function SkyNavIcon({ active, color, name, size = 24 }: Props) {
  const stroke = {
    fill: "none",
    stroke: color,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: active ? 2.3 : 2
  };
  const solid = { fill: color };

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      {name === "home" && (
        <>
          {/* Antenna, head, eyes, neck. */}
          <Path d="M12 5.4V3.5" {...stroke} />
          <Circle cx={12} cy={2.7} r={1.15} {...solid} />
          <Rect height={10.6} rx={3.8} width={15} x={4.5} y={5.4} {...stroke} />
          <Circle cx={9.2} cy={10.7} r={1.4} {...solid} />
          <Circle cx={14.8} cy={10.7} r={1.4} {...solid} />
          <Path d="M12 16v2.2" {...stroke} />
          {/* Dock: a line at rest, a solid base when active. */}
          {active ? (
            <Rect height={3.4} rx={1.7} width={14} x={5} y={18.4} {...solid} />
          ) : (
            <Path d="M6.5 20.1h11" {...stroke} />
          )}
        </>
      )}

      {name === "skills" && (
        <>
          {/* Three strong modules: a lead module over two more. */}
          {active ? (
            <Rect height={10} rx={3} width={10} x={7} y={1.5} {...solid} />
          ) : (
            <Rect height={8} rx={2.4} width={8} x={8} y={2.5} {...stroke} />
          )}
          <Rect height={8} rx={2.4} width={8} x={2.5} y={13.5} {...stroke} />
          <Rect height={8} rx={2.4} width={8} x={13.5} y={13.5} {...stroke} />
        </>
      )}

      {name === "robot" && (
        <>
          {/* Base, sitting on which: shoulder joint → arm → elbow → forearm. */}
          <Rect height={3} rx={1.5} width={10} x={4.5} y={18.5} {...stroke} />
          <Path d="M9.5 18.5v-1.9" {...stroke} />
          <Circle cx={9.5} cy={14.6} r={2} {...stroke} />
          <Path d="M10 12.6 10.9 9.4" {...stroke} />
          <Circle cx={11.4} cy={7.2} r={active ? 3.3 : 2.2} {...(active ? solid : stroke)} />
          <Path d="M13.6 8 16.9 9.3" {...stroke} />
          {/* Wrist bar and a wide-open two-jaw gripper. */}
          <Path d="M17.6 6.6v5.4M17.6 6.6l3.6-1.4M17.6 12l3.6 1.4" {...stroke} />
        </>
      )}

      {name === "vision" && (
        <>
          {/* Framing corners: a sensor's field of view, not a camera body. */}
          <Path d="M3 7.6V5.2A2.2 2.2 0 0 1 5.2 3h2.4" {...stroke} />
          <Path d="M16.4 3h2.4A2.2 2.2 0 0 1 21 5.2v2.4" {...stroke} />
          <Path d="M21 16.4v2.4a2.2 2.2 0 0 1-2.2 2.2h-2.4" {...stroke} />
          <Path d="M7.6 21H5.2A2.2 2.2 0 0 1 3 18.8v-2.4" {...stroke} />
          {/* Lens and its core. */}
          <Circle cx={12} cy={12} r={5.3} {...stroke} />
          <Circle cx={12} cy={12} r={active ? 3 : 1.7} {...solid} />
        </>
      )}

      {name === "profile" && (
        <>
          <Circle cx={12} cy={12} r={9.2} {...stroke} />
          <Circle cx={12} cy={9.5} r={active ? 3.9 : 3.1} {...(active ? solid : stroke)} />
          <Path d="M6.6 18.4a6.5 6.5 0 0 1 10.8 0" {...stroke} />
        </>
      )}
    </Svg>
  );
}
