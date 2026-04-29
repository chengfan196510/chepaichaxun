import express from 'express';
import type { Request, Response } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = express.Router();

interface VehicleInfo {
  id: string;
  owner_name: string;
  license_plate: string;
  phone?: string;
  department?: string;
  description?: string;
  created_at: string;
  updated_at?: string;
}

// GET /api/v1/vehicles?keyword=xxx
// 根据关键词查询车牌信息（支持车主姓名和车牌号模糊查询）
router.get('/', async (req: Request, res: Response) => {
  try {
    const keyword = req.query.keyword as string;

    if (!keyword || keyword.trim() === '') {
      // 如果没有关键词，返回所有记录（限制100条）
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('vehicle_infos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw new Error(`查询失败: ${error.message}`);
      }

      return res.json({
        success: true,
        data: data || [],
      });
    }

    // 使用or()查询车主姓名或车牌号
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('vehicle_infos')
      .select('*')
      .or(`owner_name.ilike.%${keyword}%,license_plate.ilike.%${keyword}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }

    return res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('查询车牌信息失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误',
    });
  }
});

export default router;
