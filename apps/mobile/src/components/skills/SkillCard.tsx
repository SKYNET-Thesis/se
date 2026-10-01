import { Heart } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { corner } from "../../design-system/radius";
import { space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { useAppTheme } from "../../ThemeContext";
import { Skill } from "../../types/skill";
import { SkyCard, SkyText } from "../ui";
import { SkillMedia } from "./SkillMedia";
import { SkillStatus, skillAvailabilityLabel } from "./SkillStatus";

export type SkillCardVariant = "featured" | "standard";

type Props = {
  skill: Skill;
  // What a tap does is the screen's decision (usually: open Skill Detail).
  onPress: () => void;
  accessibilityHint?: string;
  // "standard" = 4:3 tile for the library grid; "featured" = 16:9 tile
  // for horizontal strips. Same anatomy, different frame.
  variant?: SkillCardVariant;
  // Favorites are user preference state owned by the screen; the heart only
  // renders when the screen wires it up.
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  fontsReady?: boolean;
  style?: StyleProp<ViewStyle>;
};

// A premium capability tile: the image dominates, the name sits quietly
// under it, and a status appears only for skills that aren't ready yet.
// Nothing else — the tile creates curiosity, Skill Detail explains. The
// whole tile is one control; nothing on it starts the robot.
export function SkillCard({
  accessibilityHint,
  fontsReady = true,
  isFavorite = false,
  onPress,
  onToggleFavorite,
  skill,
  style,
  variant = "standard"
}: Props) {
  const { colors } = useSkyNexTokens();
  const { mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, mode === "light"), [colors, mode]);
  const status = skillAvailabilityLabel(skill.availability);

  return (
    <SkyCard style={[styles.card, style]}>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={status ? `${skill.name}, ${status}` : skill.name}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <SkillMedia shape={variant} skill={skill}>
          {/* Renders nothing for ready skills (see SkillStatus). */}
          <View style={styles.statusOverlay}>
            <SkillStatus availability={skill.availability} fontsReady={fontsReady} />
          </View>
        </SkillMedia>

        <View style={styles.name}>
          <SkyText fontsReady={fontsReady} numberOfLines={1} variant="cardTitle">
            {skill.name}
          </SkyText>
        </View>
      </Pressable>

      {/*
        Sibling of the tile's Pressable, not nested in it, so screen readers
        expose two separate controls and a tap on the heart never opens the
        skill. Sits on the image, diagonally opposite the status.
      */}
      {onToggleFavorite && (
        <Pressable
          accessibilityLabel={isFavorite ? `Bỏ yêu thích ${skill.name}` : `Yêu thích ${skill.name}`}
          accessibilityRole="button"
          accessibilityState={{ selected: isFavorite }}
          hitSlop={6}
          onPress={onToggleFavorite}
          style={({ pressed }) => [styles.favorite, pressed && styles.pressed]}
        >
          <Heart
            color={isFavorite ? colors.accentInk : colors.textPrimary}
            fill={isFavorite ? colors.accentInk : "none"}
            size={15}
          />
        </Pressable>
      )}
    </SkyCard>
  );
}

// Heart: 32pt visual + 6pt slop each side = a 44pt touch target.
const FAVORITE_SIZE = 32;

function createStyles(colors: SkyNexColors, light: boolean) {
  return StyleSheet.create({
    // One raised object: the name band shares the media frame's tone, so
    // the tile reads as a single capability object on whatever surface
    // holds it (the Skills library sheet is `surface`).
    //
    // Edge: in Light the raised tone already stands clearly off a white
    // surface, so the outline takes the fill color — present (no layout
    // shift between modes) but invisible. In Dark the tone step is small
    // and the SkyCard border is what keeps the tile defined.
    card: {
      backgroundColor: colors.surfaceRaised,
      borderColor: light ? colors.surfaceRaised : colors.border,
      borderRadius: corner.productCard,
      overflow: "hidden",
      padding: 0
    },
    // One quiet line under the image — the only text on a tile.
    name: {
      paddingHorizontal: space.sm,
      paddingVertical: space.xs + space.xxs
    },
    statusOverlay: {
      bottom: space.xs,
      left: space.xs,
      position: "absolute"
    },
    // Borderless, so it reads as a light control floating on the image
    // rather than a second framed element competing with it.
    favorite: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: corner.pill,
      height: FAVORITE_SIZE,
      justifyContent: "center",
      position: "absolute",
      right: space.xs,
      top: space.xs,
      width: FAVORITE_SIZE
    },
    pressed: {
      opacity: 0.78
    }
  });
}
