import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";

const FULL_TEXT = "Powered by Trison";
const CHAR_DELAY_MS = 65;
const PAUSE_AFTER_MS = 350;

type Props = {
  onTypingComplete: () => void;
};

export function PoweredBySplash({ onTypingComplete }: Props) {
  const [displayed, setDisplayed] = useState("");
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  const onCompleteRef = useRef(onTypingComplete);
  onCompleteRef.current = onTypingComplete;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursorOpacity]);

  useEffect(() => {
    let index = 0;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;

    const interval = setInterval(() => {
      index += 1;
      setDisplayed(FULL_TEXT.slice(0, index));

      if (index >= FULL_TEXT.length) {
        clearInterval(interval);
        pauseTimer = setTimeout(() => {
          onCompleteRef.current();
        }, PAUSE_AFTER_MS);
      }
    }, CHAR_DELAY_MS);

    return () => {
      clearInterval(interval);
      if (pauseTimer) clearTimeout(pauseTimer);
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text} accessibilityRole="text">
        {displayed}
        <Animated.Text style={[styles.cursor, { opacity: cursorOpacity }]}>|</Animated.Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  text: {
    fontSize: 22,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: 0.3,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  cursor: {
    fontSize: 22,
    fontWeight: "300",
    color: "#3B82F6",
  },
});
