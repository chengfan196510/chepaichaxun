import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient, setCORSHeaders, handleOPTIONS } from './_lib';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    return handleOPTIONS(res);
  }

  setCORSHeaders(res);

  if (req.method === 'GET') {
    try {
      const keyword = req.query.keyword as string;
      const departments = req.query.departments as string[] | string;

      const client = getSupabaseClient();
      let query = client.from('vehicle_infos').select('*');

      // 如果没有关键词，不返回任何结果
      if (!keyword || keyword.trim() === '') {
        return res.json({
          success: true,
          data: [],
        });
      }

      // 如果没有部门筛选，也不返回任何结果
      if (!departments) {
        return res.json({
          success: true,
          data: [],
        });
      }

      // 处理部门筛选 - 支持逗号分隔的字符串或数组
      let deptArray: string[];
      if (Array.isArray(departments)) {
        deptArray = departments;
      } else {
        // 假设是逗号分隔的字符串
        deptArray = departments.split(',').map(d => d.trim());
      }

      if (deptArray.length > 0) {
        // 使用in函数筛选部门
        query = query.in('department', deptArray);
      }

      // 执行查询
      query = query.order('created_at', { ascending: false }).limit(1000);

      const { data, error } = await query;

      if (error) {
        console.error('查询错误:', error);
        throw new Error(`查询失败: ${error.message}`);
      }

      return res.json({
        success: true,
        data: data || [],
      });
    } catch (error) {
      console.error('查询失败:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '查询失败',
      });
    }
  }

  // 其他方法不支持
  res.setHeader('Allow', ['GET', 'OPTIONS']);
  res.status(405).json({
    success: false,
    error: `Method ${req.method} Not Allowed`,
  });
}
