import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

type Props = {
  title: string;
  color: string;
  data: number[];
};

function createPath(data: number[], width: number, height: number) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(max - min, 1);
  const step = width / Math.max(data.length - 1, 1);

  return data
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function LineChartCard({ title, color, data }: Props) {
  const width = 320;
  const height = 116;
  const linePath = createPath(data, width, height);
  const fillPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.chartWrap}>
        <View style={styles.grid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={styles.gridLine} />
          ))}
        </View>
        <Svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={styles.svg}>
          <Defs>
            <LinearGradient id={`fill-${title}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.36" />
              <Stop offset="1" stopColor={color} stopOpacity="0.04" />
            </LinearGradient>
          </Defs>
          <Path d={fillPath} fill={`url(#fill-${title})`} />
          <Path d={linePath} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 174,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    padding: 14
  },
  title: {
    color: "#f5f5ff",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 12
  },
  chartWrap: {
    flex: 1,
    minHeight: 116,
    overflow: "hidden"
  },
  svg: {
    ...StyleSheet.absoluteFillObject
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between"
  },
  gridLine: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)"
  }
});
