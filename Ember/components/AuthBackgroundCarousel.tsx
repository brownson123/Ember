import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export type AuthBackgroundImage = string | ImageSourcePropType;

type AuthBackgroundCarouselProps = {
  images?: AuthBackgroundImage[];
  intervalMs?: number;
  fadeMs?: number;
  scrimOpacity?: number;
};

// Default background images depicting emergency personnel and scenes.
// These reference public Unsplash CDN URLs; replace with bundled local assets
// (require('../assets/images/...')) for fully offline support.
const DEFAULT_IMAGES: AuthBackgroundImage[] = [
  // Firefighter in gear
  'https://images.unsplash.com/photo-1582401656496-58dad4f2eb1c?w=1280&q=80&auto=format&fit=crop',
  // Police lights / officer at scene
  'https://images.unsplash.com/photo-1453873531674-2151bcd01707?w=1280&q=80&auto=format&fit=crop',
  // Active fire / flames
  'https://images.unsplash.com/photo-1486915309851-b0cc1f8a0084?w=1280&q=80&auto=format&fit=crop',
  // Ambulance racing to a call
  'https://images.unsplash.com/photo-1587582345426-b169c4d0c6a3?w=1280&q=80&auto=format&fit=crop',
  // Search & rescue / helicopter operations
  'https://images.unsplash.com/photo-1583912267550-d6c2ac3196c0?w=1280&q=80&auto=format&fit=crop',
  // Paramedic / EMT working a patient
  'https://images.unsplash.com/photo-1612531386530-97286d97c2d2?w=1280&q=80&auto=format&fit=crop',
];

function toSource(item: AuthBackgroundImage) {
  if (typeof item === 'string') return { uri: item };
  return item as any;
}

export default function AuthBackgroundCarousel({
  images = DEFAULT_IMAGES,
  intervalMs = 4000,
  fadeMs = 650,
  scrimOpacity = 0.6,
}: AuthBackgroundCarouselProps) {
  const slides = useMemo(() => (images.length ? images : DEFAULT_IMAGES), [images]);
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  const currentSrc = toSource(slides[index]);
  const nextSrc = toSource(slides[(index + 1) % slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: fadeMs,
        useNativeDriver: true,
      }).start(() => {
        setIndex((i) => (i + 1) % slides.length);
        fade.setValue(1);
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [slides.length, intervalMs, fadeMs, fade]);

  return (
    <View style={styles.root} pointerEvents="none">
      {/* The "next" image sits underneath; fading the current image reveals it. */}
      <Image
        source={nextSrc}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fade }]}>
        <Image
          source={currentSrc}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      </Animated.View>

      {/* Vertical scrim so the centered form remains legible regardless of the slide. */}
      <Svg
        style={StyleSheet.absoluteFillObject}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0f1117" stopOpacity={Math.max(0, scrimOpacity - 0.15)} />
            <Stop offset="0.5" stopColor="#0f1117" stopOpacity={Math.min(0.95, scrimOpacity + 0.15)} />
            <Stop offset="1" stopColor="#0f1117" stopOpacity={Math.max(0, scrimOpacity - 0.05)} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#scrim)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f1117',
  },
});
