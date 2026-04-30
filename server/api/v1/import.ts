import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient, setCORSHeaders, handleOPTIONS } from '../_lib';
import * as XLSX from 'xlsx';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    return handleOPTIONS(res);
  }

  setCORSHeaders(res);

  if (req.method === 'POST') {
    try {
      const file = (req.files as any)?.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: '请上传Excel文件',
        });
      }

      console.log('收到导入请求，文件名:', file.name);

      // 解析Excel文件
      const workbook = XLSX.read(file.data, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      console.log('Excel数据行数:', jsonData.length);

      const client = getSupabaseClient();

      let successCount = 0;
      let skipCount = 0;
      const skipDetails: string[] = [];

      // 从第二行开始（第一行是表头）
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const owner_name = row[0] || '';
        const license_plate = row[1] || '';
        const phone = row[2] || '';
        const department = row[3] || '';
        const description = row[4] || '';

        if (!owner_name || !license_plate) {
          skipCount++;
          skipDetails.push(`第${i + 1}行：缺少车主姓名或车牌号`);
          continue;
        }

        // 检查车牌号是否已存在
        const { data: existing } = await client
          .from('vehicle_infos')
          .select('id')
          .eq('license_plate', license_plate)
          .limit(1);

        if (existing && existing.length > 0) {
          skipCount++;
          skipDetails.push(`第${i + 1}行：车牌号 ${license_plate} 已存在`);
          continue;
        }

        // 插入新记录
        const { error: insertError } = await client.from('vehicle_infos').insert({
          owner_name,
          license_plate,
          phone,
          department,
          description,
        });

        if (insertError) {
          skipCount++;
          skipDetails.push(`第${i + 1}行：${insertError.message}`);
          continue;
        }

        successCount++;
      }

      return res.json({
        success: true,
        data: {
          successCount,
          skipCount,
          skipDetails,
          message: `导入完成：成功${successCount}条，跳过${skipCount}条`,
        },
      });
    } catch (error) {
      console.error('导入失败:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '导入失败',
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
