import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, Image, Dimensions, Platform } from 'react-native';
import { Screen } from '@/components/Screen';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome6 } from '@expo/vector-icons';
import { createFormDataFile } from '@/utils';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface VehicleInfo {
  id: string;
  owner_name: string;
  license_plate: string;
  phone?: string;
  department?: string;
  description?: string;
}

// 部门列表
const DEPARTMENTS = [
  { id: '教师车辆', label: '教师车辆', color: '#2D6A4F' },
  { id: '后勤车辆', label: '后勤车辆', color: '#E9C46A' },
  { id: '集团车辆', label: '集团车辆', color: '#D4A276' },
  { id: '临时车辆', label: '临时车辆', color: '#E76F51' },
  { id: '家长车辆', label: '家长车辆', color: '#2A9D8F' },
];

export default function HomeScreen() {
  const router = useSafeRouter();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<VehicleInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [webFileSelected, setWebFileSelected] = useState<boolean>(false);
  const [webFileName, setWebFileName] = useState<string>('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(['集团车辆', '教师车辆', '后勤车辆']);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toggleDepartment = (dept: string) => {
    console.log('切换部门:', dept, '当前选中:', selectedDepartments);
    setSelectedDepartments(prev => {
      if (prev.includes(dept)) {
        // 如果至少选中一个，才允许取消
        if (prev.length > 1) {
          const newDepts = prev.filter(d => d !== dept);
          console.log('取消选中:', newDepts);
          return newDepts;
        } else {
          console.log('保持选中（至少保留一个）:', prev);
          return prev;
        }
      } else {
        const newDepts = [...prev, dept];
        console.log('添加选中:', newDepts);
        return newDepts;
      }
    });
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      const params: string[] = [];

      if (keyword.trim()) {
        params.push(`keyword=${encodeURIComponent(keyword)}`);
      }

      // 将多个部门用逗号连接成一个字符串
      if (selectedDepartments.length > 0) {
        const departmentsStr = selectedDepartments.map(dept => encodeURIComponent(dept)).join(',');
        params.push(`departments=${departmentsStr}`);
      }

      const fullUrl = `${baseUrl}/api/v1/vehicles?${params.join('&')}`;
      console.log('发送查询请求:', fullUrl);
      console.log('选中的部门:', selectedDepartments);

      /**
       * 服务端文件：server/src/routes/vehicles.ts
       * 接口：GET /api/v1/vehicles
       * Query 参数：keyword?: string, departments?: string (逗号分隔的多个部门)
       */
      const response = await fetch(fullUrl);
      const data = await response.json();

      console.log('查询结果:', data.success ? `成功，${data.data.length}条` : `失败: ${data.error}`);

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

      const audioData = await (FileSystem as any).readAsStringAsync(uri, {
        encoding: 'base64',
      });

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
    // 显示选择对话框：拍照还是从相册选择
    Alert.alert(
      '选择图片来源',
      '请选择图片来源',
      [
        {
          text: '拍照',
          onPress: () => handlePickFromCamera(),
        },
        {
          text: '从相册选择',
          onPress: () => handlePickFromLibrary(),
        },
        {
          text: '取消',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const handlePickFromCamera = async () => {
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
      await processImage(uri);
    } catch (error) {
      console.error('拍照失败:', error);
      Alert.alert('错误', '拍照失败');
    }
  };

  const handlePickFromLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('提示', '需要相册权限才能从相册选择图片');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled) return;

      const uri = result.assets[0].uri;
      await processImage(uri);
    } catch (error) {
      console.error('选择图片失败:', error);
      Alert.alert('错误', '选择图片失败');
    }
  };

  const processImage = async (uri: string) => {
    try {
      setLoading(true);

      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      const imageFile = await createFormDataFile(uri, 'image.jpg', 'image/jpeg');
      const formData = new FormData();
      formData.append('image', imageFile as any);

      console.log('开始OCR识别:', uri);
      console.log('FormData内容:', formData);

      /**
       * 服务端文件：server/src/routes/image.ts
       * 接口：POST /api/v1/image/ocr
       * Body 参数：image: File (图片文件)
       */
      const response = await fetch(`${baseUrl}/api/v1/image/ocr`, {
        method: 'POST',
        body: formData,
      });

      console.log('响应状态:', response.status, response.statusText);
      console.log('响应头:', Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log('响应原文:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON解析失败:', parseError);
        console.error('响应内容类型:', response.headers.get('content-type'));
        throw new Error(`服务器返回了非JSON格式的内容: ${responseText.substring(0, 200)}`);
      }

      console.log('OCR识别结果:', data.success ? `成功，提取文字: ${data.data.text.substring(0, 50)}...` : '失败');

      if (data.success && data.data.text) {
        setKeyword(data.data.text);
        Alert.alert('识别成功', `已识别到：${data.data.text}`);
      } else {
        Alert.alert('提示', data.error || '未识别到车牌号，请重新拍照或选择图片');
      }
    } catch (error) {
      console.error('OCR识别失败:', error);
      Alert.alert('错误', `图片上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImportFile = async () => {
    if (Platform.OS === 'web') {
      try {
        // 创建新的input元素
        if (!fileInputRef.current) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.xlsx,.xls,.csv';
          input.style.display = 'none';
          input.id = 'file-import-input';
          fileInputRef.current = input;
          document.body.appendChild(input);
        }

        const handleFileChange = (e: Event) => {
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];
          if (file) {
            setSelectedFile(file);
            setWebFileSelected(true);
            setWebFileName(file.name);
          }
          // 清理事件监听器
          fileInputRef.current?.removeEventListener('change', handleFileChange);
        };

        fileInputRef.current.addEventListener('change', handleFileChange);
        fileInputRef.current.click();
      } catch (error) {
        console.error('文件选择失败:', error);
        Alert.alert('错误', '文件选择失败');
      }
    } else {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
          ],
          copyToCacheDirectory: true,
        });

        if (result.canceled) return;

        setSelectedFile(result.assets[0]);
        setWebFileSelected(true);
        setWebFileName(result.assets[0].name);
      } catch (error) {
        console.error('文件选择失败:', error);
        Alert.alert('错误', '文件选择失败');
      }
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      Alert.alert('提示', '请先选择Excel文件');
      return;
    }

    setLoading(true);
    try {
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      const formData = new FormData();

      if (Platform.OS === 'web') {
        formData.append('file', selectedFile);
      } else {
        const file = await createFormDataFile(selectedFile.uri, selectedFile.name, selectedFile.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        formData.append('file', file as any);
      }

      const response = await fetch(`${baseUrl}/api/v1/vehicles/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        let message = `总数据：${data.data.total} 条\n成功导入：${data.data.inserted} 条\n跳过：${data.data.skipped} 条`;

        if (data.data.skipped > 0 && data.data.skippedDetails && data.data.skippedDetails.length > 0) {
          message += `\n\n跳过的车牌号：\n${data.data.skippedDetails.join('\n')}`;
        }

        Alert.alert('导入成功', message);
        setImportModalVisible(false);
        setSelectedFile(null);
        setWebFileSelected(false);
        setWebFileName('');
        handleSearch();
      } else {
        Alert.alert('导入失败', data.error || '服务器错误');
      }
    } catch (error) {
      console.error('导入失败:', error);
      Alert.alert('错误', '网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 主题图片区域 */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1577563908411-5077b6dc7624?w=1200&h=400&fit=crop' }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(45, 106, 79, 0.85)', 'rgba(212, 162, 118, 0.75)']}
            style={styles.heroOverlay}
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>🚗 校园车辆查询</Text>
            <Text style={styles.heroSubtitle}>快速查找学校车辆信息</Text>
          </View>
        </View>

        {/* 部门筛选 */}
        <View style={styles.departmentSection}>
          <View style={styles.departmentGrid}>
            {DEPARTMENTS.map((dept) => (
              <TouchableOpacity
                key={dept.id}
                style={[
                  styles.departmentButton,
                  selectedDepartments.includes(dept.id) && styles.departmentButtonSelected,
                  { borderColor: dept.color },
                  selectedDepartments.includes(dept.id) && { backgroundColor: dept.color },
                ]}
                onPress={() => toggleDepartment(dept.id)}
              >
                <Text
                  style={[
                    styles.departmentButtonText,
                    selectedDepartments.includes(dept.id) && styles.departmentButtonTextSelected,
                  ]}
                >
                  {dept.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* 调试信息 */}
          <View style={styles.debugInfo}>
            <Text style={styles.debugText}>已选中: {selectedDepartments.join(', ')}</Text>
          </View>
        </View>

        {/* 搜索区域 */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <FontAwesome6 name="search" size={18} color="#8B7D6B" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="输入车主姓名或车牌号"
              placeholderTextColor="#C4B8A8"
              value={keyword}
              onChangeText={setKeyword}
              onSubmitEditing={handleSearch}
            />
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={recording ? stopRecording : startRecording}
            >
              <FontAwesome6
                name={recording ? "microphone-lines" : "microphone"}
                size={18}
                color={recording ? "#E76F51" : "#2D6A4F"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleImagePick}
            >
              <FontAwesome6 name="camera" size={18} color="#2D6A4F" />
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
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>查询结果 ({results.length})</Text>
            {results.map((item) => (
              <View key={item.id} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <View style={styles.resultLeft}>
                    <View style={styles.plateBadge}>
                      <Text style={styles.plateText}>{item.license_plate}</Text>
                    </View>
                    <Text style={styles.ownerName}>{item.owner_name}</Text>
                  </View>
                  <View style={styles.departmentTag}>
                    <Text style={styles.departmentTagText}>{item.department || '未分类'}</Text>
                  </View>
                </View>
                {item.phone && (
                  <View style={styles.resultDetail}>
                    <FontAwesome6 name="phone" size={14} color="#8B7D6B" />
                    <Text style={styles.resultDetailText}>{item.phone}</Text>
                  </View>
                )}
                {item.description && (
                  <Text style={styles.resultDescription}>{item.description}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* 空状态 */}
        {results.length === 0 && keyword.trim() === '' && (
          <View style={styles.emptyState}>
            <FontAwesome6 name="car-side" size={64} color="#D4A276" />
            <Text style={styles.emptyText}>请输入关键词查询车辆信息</Text>
            <Text style={styles.emptySubtext}>支持车主姓名、车牌号、语音输入、拍照识别</Text>
          </View>
        )}

        {/* 导入按钮 */}
        <TouchableOpacity
          style={styles.importFloatingButton}
          onPress={() => setImportModalVisible(true)}
        >
          <FontAwesome6 name="file-import" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>

      {/* 导入模态框 */}
      <Modal
        visible={importModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setImportModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>数据导入</Text>
              <TouchableOpacity onPress={() => setImportModalVisible(false)}>
                <FontAwesome6 name="xmark" size={20} color="#3D3229" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Excel文件格式要求</Text>
                <Text style={styles.infoText}>• 必填字段：车主姓名、车牌号</Text>
                <Text style={styles.infoText}>• 选填字段：电话、部门、描述</Text>
                <Text style={styles.infoText}>• 支持 .xlsx, .xls, .csv 格式</Text>
              </View>

              {webFileSelected && webFileName ? (
                <View style={styles.filePreview}>
                  <FontAwesome6 name="file-excel" size={48} color="#2D6A4F" />
                  <Text style={styles.fileName}>{webFileName}</Text>
                  <TouchableOpacity
                    style={styles.changeButton}
                    onPress={handlePickImportFile}
                  >
                    <Text style={styles.changeButtonText}>更换文件</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={handlePickImportFile}
                >
                  <FontAwesome6 name="cloud-arrow-up" size={48} color="#C4B8A8" />
                  <Text style={styles.uploadButtonText}>点击选择Excel文件</Text>
                  <Text style={styles.uploadButtonSubtext}>支持 .xlsx, .xls, .csv</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setImportModalVisible(false);
                  setSelectedFile(null);
                  setWebFileSelected(false);
                  setWebFileName('');
                }}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              {webFileSelected && (
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleImport}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitButtonText}>导入</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  // 主题图片区域
  heroContainer: {
    position: 'relative',
    height: 220,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 32,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  // 部门筛选
  departmentSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3D3229',
    marginBottom: 16,
  },
  departmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  departmentButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C4B8A8',
    backgroundColor: '#FDF8F0',
  },
  departmentButtonSelected: {
    borderWidth: 0,
  },
  departmentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B7D6B',
  },
  departmentButtonTextSelected: {
    color: '#FFFFFF',
  },
  debugInfo: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FDF8F0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8DED4',
  },
  debugText: {
    fontSize: 12,
    color: '#8B7D6B',
  },
  // 搜索区域
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: '#3D3229',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#3D3229',
    padding: 0,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3D3229',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  searchButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2D6A4F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2D6A4F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  // 结果列表
  resultsSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  resultsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3D3229',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#3D3229',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLeft: {
    flex: 1,
  },
  plateBadge: {
    backgroundColor: 'rgba(45, 106, 79, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(45, 106, 79, 0.2)',
  },
  plateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D6A4F',
  },
  ownerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3D3229',
  },
  departmentTag: {
    backgroundColor: 'rgba(212, 162, 118, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 118, 0.3)',
  },
  departmentTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D4A276',
  },
  resultDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultDetailText: {
    fontSize: 14,
    color: '#8B7D6B',
    marginLeft: 6,
  },
  resultDescription: {
    fontSize: 13,
    color: '#8B7D6B',
    lineHeight: 20,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1EBE0',
  },
  // 空状态
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#3D3229',
    marginTop: 24,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#8B7D6B',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  // 悬浮导入按钮
  importFloatingButton: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E9C46A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E9C46A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  // 模态框
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(61, 50, 41, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FDF8F0',
    borderRadius: 24,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1EBE0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3D3229',
  },
  modalBody: {
    flex: 1,
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F1EBE0',
  },
  infoCard: {
    backgroundColor: '#F1EBE0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3D3229',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#8B7D6B',
    lineHeight: 20,
    marginBottom: 4,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: '#C4B8A8',
    borderRadius: 20,
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: '#FDF8F0',
    borderStyle: 'dashed',
    cursor: 'pointer',
    minHeight: 150,
    justifyContent: 'center',
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3D3229',
    marginTop: 12,
  },
  uploadButtonSubtext: {
    fontSize: 13,
    color: '#C4B8A8',
    marginTop: 4,
  },
  filePreview: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3D3229',
    marginTop: 12,
  },
  changeButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2D6A4F',
    borderRadius: 12,
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1EBE0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3D3229',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#2D6A4F',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
