import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import axios from 'axios';

const router = express.Router();

// 配置multer接收文件
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB限制
  },
});

// POST /api/v1/speech/recognize
// 上传音频文件并识别文字
router.post('/recognize', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请上传音频文件',
      });
    }

    // 将音频转换为base64
    const audioBase64 = req.file.buffer.toString('base64');

    // 使用HeaderUtils提取并转发headers
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const client = new ASRClient(config, customHeaders);

    // 调用ASR识别
    const result = await client.recognize({
      uid: 'user-' + Date.now(),
      base64Data: audioBase64,
    });

    return res.json({
      success: true,
      data: {
        text: result.text,
        duration: result.duration,
      },
    });
  } catch (error) {
    console.error('语音识别失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '语音识别失败',
    });
  }
});

export default router;
