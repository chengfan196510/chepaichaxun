import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { S3Storage, FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

const router = express.Router();

// 初始化对象存储
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// 配置multer接收文件
const multerStorage = multer.memoryStorage();
const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
});

// POST /api/v1/image/ocr
// 上传图片并进行OCR文字识别
router.post('/ocr', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请上传图片文件',
      });
    }

    console.log('收到OCR请求，文件名:', req.file.originalname, '大小:', req.file.size);

    // 1. 上传图片到对象存储
    const fileName = `ocr/${Date.now()}_${req.file.originalname}`;
    console.log('开始上传到对象存储:', fileName);

    const fileKey = await storage.uploadFile({
      fileContent: req.file.buffer,
      fileName,
      contentType: req.file.mimetype,
    });

    console.log('上传成功，文件key:', fileKey);

    // 2. 生成签名URL
    const imageUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400, // 1天有效期
    });

    console.log('生成签名URL:', imageUrl);

    // 3. 使用FetchClient调用OCR服务
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const client = new FetchClient(config, customHeaders);

    console.log('开始OCR识别...');
    const response = await client.fetch(imageUrl);

    console.log('OCR响应:', response);

    // 4. 提取文字内容
    let textContent = '';
    if (response.content && Array.isArray(response.content)) {
      textContent = response.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n');
    }

    console.log('提取到文字内容，长度:', textContent.length);

    return res.json({
      success: true,
      data: {
        text: textContent,
      },
    });
  } catch (error) {
    console.error('OCR识别失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'OCR识别失败',
    });
  }
});

export default router;
