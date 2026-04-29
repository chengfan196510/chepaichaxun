import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Screen } from '@/components/Screen';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome6 } from '@expo/vector-icons';
import { createFormDataFile } from '@/utils';

interface VehicleInfo {
  id: string;
  owner_name: string;
  license_plate: string;
  phone?: string;
  department?: string;
  description?: string;
}

export default function HomeScreen() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<VehicleInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const handleSearch = async () => {
    if (!keyword.trim()) {
      Alert.alert('提示', '请输入查询关键词');
      return;
    }

    setLoading(true);
    try {
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      /**
       * 服务端文件：server/src/routes/vehicles.ts
       * 接口：GET /api/v1/vehicles
       * Query 参数：keyword?: string
       */
      const response = await fetch(`${baseUrl}/api/v1/vehicles?keyword=${encodeURIComponent(keyword)}`);
      const data = await response.json();

      if (data.success) {
        setResults(data.data || []);
        if (data.data.length === 0) {
          Alert.alert('提示', '未找到匹配的车牌信息');
        }
      } else {
        Alert.alert('错误', data.error || '查询失败');
      }
    } catch (error) {
      console.error('查询失败:', error);
      Alert.alert('错误', '网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('提示', '需要麦克风权限才能使用语音输入');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });
      await newRecording.startAsync();

      setRecording(newRecording);
      recordingRef.current = newRecording;
    } catch (error) {
      console.error('录音启动失败:', error);
      Alert.alert('错误', '录音启动失败');
    }
  };

  const stopRecording = async () => {
    const currentRecording = recording;
    if (!currentRecording) return;

    setRecording(null);
    recordingRef.current = null;

    try {
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();
      if (!uri) return;

      // 读取音频文件
      const audioData = await (FileSystem as any).readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // 上传到服务器进行语音识别
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      const audioFile = await createFormDataFile(uri, 'audio.m4a', 'audio/m4a');
      const formData = new FormData();
      formData.append('audio', audioFile as any);

      setLoading(true);
      const response = await fetch(`${baseUrl}/api/v1/speech/recognize`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setKeyword(data.data.text);
      } else {
        Alert.alert('错误', data.error || '语音识别失败');
      }
    } catch (error) {
      console.error('语音识别失败:', error);
      Alert.alert('错误', '语音识别失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImagePick = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('提示', '需要相机权限才能使用拍照识别');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled) return;

      const uri = result.assets[0].uri;

      // 上传图片到服务器进行OCR识别
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      const imageFile = await createFormDataFile(uri, 'image.jpg', 'image/jpeg');
      const formData = new FormData();
      formData.append('image', imageFile as any);

      setLoading(true);
      const response = await fetch(`${baseUrl}/api/v1/image/ocr`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setKeyword(data.data.text);
      } else {
        Alert.alert('提示', data.error || 'OCR功能暂时不可用，请使用键盘输入');
      }
    } catch (error) {
      console.error('OCR识别失败:', error);
      Alert.alert('错误', '图片上传失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 标题 */}
          <View style={styles.header}>
            <Text style={styles.title}>车牌查询</Text>
            <Text style={styles.subtitle}>快速查找学校车辆信息</Text>
          </View>

          {/* 输入区域 */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="输入车主姓名或车牌号"
                placeholderTextColor="#CCCCCC"
                value={keyword}
                onChangeText={setKeyword}
                onSubmitEditing={handleSearch}
              />
            </View>

            {/* 操作按钮 */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={recording ? stopRecording : startRecording}
              >
                <FontAwesome6
                  name={recording ? "microphone-lines" : "microphone"}
                  size={20}
                  color={recording ? "#FF4444" : "#111111"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleImagePick}
              >
                <FontAwesome6 name="camera" size={20} color="#111111" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearch}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.searchButtonText}>查询</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 结果列表 */}
          {results.length > 0 && (
            <View style={styles.resultsContainer}>
              <Text style={styles.resultsTitle}>查询结果 ({results.length})</Text>
              {results.map((item, index) => (
                <View key={item.id} style={styles.resultItem}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.licensePlate}>{item.license_plate}</Text>
                    <Text style={styles.ownerName}>{item.owner_name}</Text>
                  </View>
                  {item.phone && (
                    <Text style={styles.resultDetail}>
                      <FontAwesome6 name="phone" size={14} color="#888888" /> {item.phone}
                    </Text>
                  )}
                  {item.department && (
                    <Text style={styles.resultDetail}>
                      <FontAwesome6 name="building" size={14} color="#888888" /> {item.department}
                    </Text>
                  )}
                  {item.description && (
                    <Text style={styles.resultDescription}>{item.description}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* 提示信息 */}
          {results.length === 0 && keyword.trim() === '' && (
            <View style={styles.emptyContainer}>
              <FontAwesome6 name="car" size={64} color="#ECECEC" />
              <Text style={styles.emptyText}>请输入关键词查询车辆信息</Text>
              <Text style={styles.emptySubtext}>支持车主姓名、车牌号、语音输入、拍照识别</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#888888',
    lineHeight: 24,
  },
  inputContainer: {
    marginBottom: 32,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#F7F7F7',
  },
  input: {
    height: 56,
    paddingHorizontal: 20,
    fontSize: 16,
    color: '#111111',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#F7F7F7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  searchButton: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#111111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  resultsContainer: {
    gap: 16,
  },
  resultsTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 8,
  },
  resultItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECECEC',
    padding: 20,
    marginBottom: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  licensePlate: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111111',
  },
  resultDetail: {
    fontSize: 14,
    color: '#888888',
    lineHeight: 21,
    marginBottom: 4,
  },
  resultDescription: {
    fontSize: 14,
    color: '#888888',
    lineHeight: 21,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ECECEC',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#888888',
    marginTop: 24,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#CCCCCC',
    marginTop: 8,
    textAlign: 'center',
  },
});
