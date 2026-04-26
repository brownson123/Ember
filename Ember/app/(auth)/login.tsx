import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import AuthBackgroundCarousel from '@/components/AuthBackgroundCarousel';
import { supabase } from '@/lib/supabase';

const ADMIN_VERIFICATION_ID = '001';

export default function LoginScreen() {
  const router = useRouter();
  const [showRegister, setShowRegister] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
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
              verification_id: verificationId,
              display_name: displayName.trim() || email.split('@')[0],
            },
          },
        });

        if (error) throw error;
        if (data.user) {
          const responderId = (data.user.user_metadata?.verification_id as string | undefined) ?? verificationId;
          navigateByRole(responderId);
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
          const responderId = data.user.user_metadata?.verification_id as string | undefined;
          navigateByRole(responderId);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const navigateByRole = (responderId: string | undefined) => {
    if (responderId === ADMIN_VERIFICATION_ID) {
      router.replace('/towerSetup' as Href);
      return;
    }

    router.replace('/controlTowerSelect' as Href);
  };

  const animatedHeight = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 136],
    extrapolate: 'clamp',
  });

  const animatedOpacity = slideAnim;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Carousel of emergency-personnel imagery */}
      <AuthBackgroundCarousel />

      <View style={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.shieldContainer}>
            <View style={styles.glow} />
            <MaterialCommunityIcons name="link-variant" size={72} color="#f59e0b" />
          </View>
          <Text style={styles.title}>
            <Text style={{ color: '#ffffff' }}>Nexus</Text>
            <Text style={{ color: '#ffffff' }}> </Text>
            <Text style={{ color: '#1e3a8a' }}>Link</Text>
          </Text>
          <Text style={styles.subtitle}>Mission coordination for first responders</Text>
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
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Display Name"
                  placeholderTextColor="#6b7280"
                  value={displayName}
                  onChangeText={setDisplayName}
                  editable={!loading}
                />
                <TextInput
                  style={[styles.input, { marginBottom: 0 }]}
                  placeholder="Responder ID / Verification Code"
                  placeholderTextColor="#6b7280"
                  value={verificationId}
                  onChangeText={setVerificationId}
                  editable={!loading}
                />
              </>
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
    fontSize: 38,
    letterSpacing: 1.6,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    color: '#cbd5f5',
    fontSize: 13,
    letterSpacing: 0.6,
    marginTop: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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