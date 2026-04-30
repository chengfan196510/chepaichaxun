import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient, getObjectStorage, setCORSHeaders, handleOPTIONS } from '../../_lib';
import formidable from 'formidable';
import * as fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    return handleOPTIONS(res);
  }

  setCORSHeaders(res);

  if (req.method === 'POST') {
    try {
      // 使用formidable解析multipart/form-data
      const form = formidable({
        maxFileSize: 10 * 1024 * 1024, // 10MB限制
      });

      const [fields, files] = await form.parse(req);
      const file = files.image?.[0];

      if (!file) {
        return res.status(400).json({
          success: false,
          error: '请上传图片文件',
        });
      }

      console.log('收到OCR请求，文件名:', file.originalFilename, '大小:', file.size);

      // 读取文件内容
      const fileBuffer = await fs.readFile(file.filepath);

      // 1. 上传图片到对象存储
      const objectStorage = getObjectStorage();
      const fileName = `ocr/${Date.now()}_${file.originalFilename}`;
      console.log('开始上传到对象存储:', fileName);

      const fileKey = await objectStorage.uploadFile({
        fileContent: fileBuffer,
        fileName,
        contentType: file.mimetype || 'image/jpeg',
      });

      console.log('上传成功，文件key:', fileKey);

      // 2. 生成签名URL
      const imageUrl = await objectStorage.generatePresignedUrl({
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

      // 清理临时文件
      await fs.unlink(file.filepath);

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
  }

  // 其他方法不支持
  res.setHeader('Allow', ['POST', 'OPTIONS']);
  res.status(405).json({
    success: false,
    error: `Method ${req.method} Not Allowed`,
  });
}
