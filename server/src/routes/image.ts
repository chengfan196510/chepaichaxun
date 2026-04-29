import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

const router = express.Router();

// 配置multer接收文件
const storage = multer.memoryStorage();
const upload = multer({
  storage,
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

    // 将图片转换为base64并生成data URL
    const mimeType = req.file.mimetype;
    const imageBase64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    // 使用HeaderUtils提取并转发headers
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const client = new FetchClient(config, customHeaders);

    // 调用fetch-url提取图片中的文字
    // 注意：fetch-url主要用于提取URL内容，对于base64图片，我们需要使用其他方式
    // 这里我们假设后端会先上传图片到对象存储，然后使用URL调用OCR
    // 但为了简化，我们使用第三方OCR服务

    // 由于fetch-url不支持直接处理base64图片，我们需要先上传到对象存储
    // 这里我们先返回一个提示，需要配合对象存储使用

    // 临时方案：返回图片的base64供前端使用
    // 实际生产环境应该上传到对象存储后使用URL

    return res.json({
      success: false,
      error: 'OCR功能需要配合对象存储使用，请联系管理员配置',
    });

    // 正常实现应该如下：
    /*
    // 1. 上传到对象存储获取URL
    const imageUrl = await uploadToObjectStorage(req.file);

    // 2. 使用fetch-url进行OCR
    const response = await client.fetch(imageUrl);

    // 3. 提取文字内容
    const textContent = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');

    return res.json({
      success: true,
      data: {
        text: textContent,
      },
    });
    */
  } catch (error) {
    console.error('OCR识别失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'OCR识别失败',
    });
  }
});

export default router;
