---
name: video-camera
description: 视频录制和播放最佳实践
---

# 视频/相机规范

## 相机录制

### 状态管理：使用 Ref 避免闭包问题

```typescript
// ❌ 错误：state 在闭包中会过期
const [isRecording, setIsRecording] = useState(false);
const startRecording = useCallback(async () => {
  // isRecording 可能是过期值
}, [isRecording]);

// ✅ 正确：ref 始终是最新值
const isRecordingRef = useRef(false);
const [isRecording, setIsRecording] = useState(false);

const startRecording = useCallback(async () => {
  if (isRecordingRef.current) return;
  isRecordingRef.current = true;
  setIsRecording(true);  // 同时更新 state 用于 UI
  // ...
}, []);  // 无需依赖
```

### 录制流程

```typescript
const startRecording = async () => {
  // 1. 设置状态
  isRecordingRef.current = true;
  
  // 2. 开始计时（用 ref 累加）
  timerRef.current = setInterval(() => {
    durationRef.current += 1;
    setDuration(durationRef.current);
  }, 1000);
  
  // 3. recordAsync 会阻塞直到停止
  const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
  
  // 4. 清理 & 导航
  clearInterval(timerRef.current);
  isRecordingRef.current = false;
  router.push({ pathname: '/upload', params: { videoUri: video.uri } });
};
```

### 权限处理

```typescript
const [cameraPermission, requestCameraPermission] = useCameraPermissions();
const [micPermission, requestMicPermission] = useMicrophonePermissions();

// 必须同时有相机和麦克风权限
if (!cameraPermission?.granted || !micPermission?.granted) {
  return <PermissionRequest />;
}
```

## 视频上传

### 存储提供商选择

| 提供商 | 优点 | 适用场景 |
|-------|------|---------|
| **Supabase Storage** | 简单集成，统一后端 | 小规模、原型验证 |
| **Cloudflare Stream** | 专业视频处理，自动转码 | 生产环境短视频应用 |

```typescript
// services/uploadService.ts
const STORAGE_PROVIDER: 'supabase' | 'cloudflare' = 'cloudflare';

export async function uploadVideo(uri: string, userId: string) {
  if (STORAGE_PROVIDER === 'cloudflare') {
    return uploadToCloudflare(uri, userId);
  }
  return uploadToSupabase(uri, userId);
}
```

### Supabase Storage

```typescript
async function uploadToSupabase(uri: string, userId: string) {
  // 1. 读取文件为 base64
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  // 2. 转 Uint8Array
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  
  // 3. 上传（路径包含 userId 用于 RLS）
  const path = `${userId}/${Date.now()}.mp4`;
  await supabase.storage.from('videos').upload(path, bytes, {
    contentType: 'video/mp4',
  });
  
  // 4. 获取公开 URL
  const { data } = supabase.storage.from('videos').getPublicUrl(path);
  return { playbackUrl: data.publicUrl };
}
```

### Storage Bucket RLS

```sql
-- 任何人可读（公开播放）
CREATE POLICY "Anyone can view videos" ON storage.objects
FOR SELECT USING (bucket_id = 'videos');

-- 只能上传到自己的文件夹
CREATE POLICY "Users upload to own folder" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### Cloudflare Stream（Flivo 使用）

**上传流程**：
1. 客户端请求上传 URL（Edge Function）
2. Cloudflare 返回 TUS 上传 URL
3. 客户端直传视频到 Cloudflare
4. 轮询检查处理状态

```typescript
// 1. 获取上传 URL（Edge Function: get-upload-url）
async function getUploadUrl(userId: string): Promise<{ uploadUrl: string; videoId: string }> {
  const { data, error } = await supabase.functions.invoke('get-upload-url', {
    body: { userId },
  });
  if (error) throw error;
  return data;
}

// 2. TUS 直传（使用 tus-js-client）
import { Upload } from 'tus-js-client';

async function uploadWithTus(uri: string, uploadUrl: string, onProgress: (p: number) => void) {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  const file = await fetch(uri).then(r => r.blob());
  
  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      uploadUrl,
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 60)); // 0-60%
      },
      onSuccess: () => resolve(true),
      onError: (err) => reject(err),
    });
    upload.start();
  });
}

// 3. 轮询检查状态（Edge Function: check-video-status）
async function pollVideoStatus(videoId: string): Promise<{ playbackUrl: string; duration: number }> {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase.functions.invoke('check-video-status', {
      body: { videoId },
    });
    if (data.status === 'ready') {
      return { playbackUrl: data.playbackUrl, duration: data.duration };
    }
    await new Promise(r => setTimeout(r, 2000)); // 2秒轮询
  }
  throw new Error('Video processing timeout');
}
```

**Edge Function 实现要点**：
- 使用 Cloudflare Stream API 创建直传 URL
- 设置 `maxDurationSeconds: 60` 限制时长
- 返回 TUS 上传 URL 和 video ID
- 处理完成后获取 HLS 播放 URL

## 视频播放

### expo-video 基础用法

```typescript
import { useVideoPlayer, VideoView } from 'expo-video';

function VideoPlayer({ uri, isActive }: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;  // 默认静音
  });

  useEffect(() => {
    if (isActive) player.play();
    else { player.pause(); player.currentTime = 0; }
  }, [isActive]);

  return <VideoView player={player} style={{ flex: 1 }} />;
}
```

### 双击点赞

```typescript
const lastTap = useRef(0);

const handleTap = () => {
  const now = Date.now();
  if (now - lastTap.current < 300) {
    onDoubleTap?.();  // 双击
  } else {
    setIsMuted(prev => !prev);  // 单击切换静音
  }
  lastTap.current = now;
};
```

## 数据库约束

```sql
-- 视频时长必须 > 0 且 <= 60 秒
duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 60)
```

确保上传时 duration 不为 0：
```typescript
const durationSeconds = uploadResult.duration || calculatedDuration || 1;
```
