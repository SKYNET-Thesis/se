import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { layout, space } from "../../design-system/spacing";
import { Skill } from "../../types/skill";
import { SkyText } from "../ui";
import { SkillMedia } from "./SkillMedia";

type Props = {
  skill: Skill;
  // Optional: with it the stage is one button (the screen decides where it
  // goes — normally Skill Detail, never a robot start); without it the stage
  // is a plain visual with no button role.
  onPress?: () => void;
  // Defaults to the skill's name, so the stage is announced correctly even
  // when the title is hidden.
  accessibilityLabel?: string;
  accessibilityHint?: string;
  // Off by default: the media must stand complete on its own, and future
  // art-directed photography may carry its own type. When on, the name sits
  // OUTSIDE the media, one line, no subtitle.
  showTitle?: boolean;
  // Stage size. The screen owns the final number (e.g. half its viewport);
  // `height` wins over `aspectRatio`; with neither, a portrait 4:5 stage.
  height?: number;
  aspectRatio?: number;
  // Rounded by default; pass false for an edge-to-edge placement.
  rounded?: boolean;
  // Applied to the media frame itself — e.g. bottom padding so the
  // placeholder glyph centres in the part of the stage left visible when
  // the screen overlaps its lower edge. Real media still fills the frame.
  mediaStyle?: StyleProp<ViewStyle>;
  fontsReady?: boolean;
  style?: StyleProp<ViewStyle>;
};

// The Skills screen's capability stage: one featured skill, presented as
// a tall, dominant visual. The media is the message — a photo or video of
// the robot performing the skill says what it is — so the stage carries no
// summary, status, parameters, button or robot name. Home owns robot
// identity; this shows one thing the robot can do.
//
// Deliberately not a big SkillCard: no surface, border or name band, no
// favorite, a portrait frame instead of a square tile, and at most a single
// line of type below. Cards sit underneath it as the quieter layer.
export function SkillHero({
  accessibilityHint,
  accessibilityLabel,
  aspectRatio,
  fontsReady = true,
  height,
  mediaStyle,
  onPress,
  rounded = true,
  showTitle = false,
  skill,
  style
}: Props) {
  const content: ReactNode = (
    <>
      <SkillMedia
        aspectRatio={aspectRatio}
        height={height}
        rounded={rounded}
        shape="stage"
        skill={skill}
        style={mediaStyle}
      />
      {showTitle && (
        <SkyText fontsReady={fontsReady} numberOfLines={1} style={styles.title} variant="title">
          {skill.name}
        </SkyText>
      )}
    </>
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={accessibilityLabel ?? skill.name} accessible style={[styles.stage, style]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? skill.name}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.stage, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: {
    gap: layout.stackGap
  },
  // Inset slightly so the name lines up with the frame's inner curve
  // rather than its outer edge.
  title: {
    paddingHorizontal: space.xxs
  },
  pressed: {
    opacity: 0.78
  }
});
