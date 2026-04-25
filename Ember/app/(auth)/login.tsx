import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Svg, { Rect, Defs, Pattern, Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase'; 

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const [showRegister, setShowRegister] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [verificationId, setVerificationId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const toggleRegister = () => {
    if (showRegister) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start(() => setShowRegister(false));
    } else {
      setShowRegister(true);
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
    setError(null); // clear errors when switching mode
  };

  const handleAuth = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      if (showRegister) {
        // Registration flow
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              verification_id: verificationId, // store responder ID in user metadata
            },
          },
        });

        if (error) throw error;
        if (data.user) {
          // TODO: replace with your real post-auth route when created
          router.push('/modal');
        } else {
          setError('Registration failed. Please try again.');
        }
      } else {
        // Login flow
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        if (data.user) {
          // TODO: replace with your real post-auth route when created
          router.push('/modal');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const animatedHeight = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 60],
    extrapolate: 'clamp',
  });

  const animatedOpacity = slideAnim;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Caution themed background */}
      <View style={styles.bgPattern}>
        <Svg width={width} height={height}>
          <Defs>
            <Pattern
              id="hazard"
              x="0"
              y="0"
              width="64"
              height="64"
              patternUnits="userSpaceOnUse"
            >
              <Path d="M 0 64 L 64 0" stroke="#f59e0b" strokeWidth="2" opacity="0.2" />
              <Path d="M -16 64 L 48 0" stroke="#f59e0b" strokeWidth="2" opacity="0.2" />
              <Path d="M 16 64 L 80 0" stroke="#f59e0b" strokeWidth="2" opacity="0.2" />
            </Pattern>
          </Defs>
          <Rect width={width} height={height} fill="#0f1117" />
          <Rect width={width} height={height} fill="url(#hazard)" />
        </Svg>
      </View>

      <View style={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.shieldContainer}>
            <View style={styles.glow} />
            <MaterialCommunityIcons name="alert-outline" size={72} color="#f59e0b" />
          </View>
          <Text style={styles.title}>Ember</Text>
        </View>

        {/* Error message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Auth Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email / Username"
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          {/* Slide-in Registration ID */}
          <Animated.View
            style={[
              styles.registerContainer,
              {
                maxHeight: animatedHeight,
                opacity: animatedOpacity,
                marginBottom: showRegister ? 16 : 0,
              },
            ]}
          >
            {showRegister && (
              <TextInput
                style={styles.input}
                placeholder="Responder ID / Verification Code"
                placeholderTextColor="#6b7280"
                value={verificationId}
                onChangeText={setVerificationId}
                editable={!loading}
              />
            )}
          </Animated.View>

          <TouchableOpacity
            style={[styles.authButton, loading && styles.authButtonDisabled]}
            onPress={handleAuth}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0B0E14" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="fingerprint" size={24} color="#0B0E14" />
                <Text style={styles.authButtonText}>Authenticate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Toggle register */}
        <TouchableOpacity
          onPress={toggleRegister}
          style={styles.toggleButton}
          activeOpacity={0.7}
          disabled={loading}
        >
          <Text style={styles.toggleText}>
            {showRegister ? 'Already a responder? Sign in' : 'New responder? Create account'}
          </Text>
          <MaterialCommunityIcons
            name={showRegister ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#00E5FF"
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// Styles (reuse your original styles, just add these new ones)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  bgPattern: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  content: {
    flex: 1,
    zIndex: 10,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 48,
  },
  shieldContainer: {
    width: 80,
    height: 80,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f59e0b',
    opacity: 0.18,
    transform: [{ scale: 1.5 }],
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#1a1f2e',
    borderColor: '#2a3441',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  registerContainer: {
    overflow: 'hidden',
  },
  authButton: {
    backgroundColor: '#00E5FF',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
    marginTop: 8,
  },
  authButtonDisabled: {
    opacity: 0.7,
  },
  authButtonText: {
    color: '#0B0E14',
    fontWeight: '700',
    fontSize: 18,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  toggleText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
  },
});