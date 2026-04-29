import express from 'express';
import type { Request, Response } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import multer from 'multer';
import * as xlsx from 'xlsx';

const router = express.Router();

// 配置multer接收Excel文件
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
});

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

// POST /api/v1/vehicles/import
// 批量导入车牌信息（Excel文件）
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请上传Excel文件',
      });
    }

    // 检查文件扩展名
    const fileName = req.file.originalname || '';
    const fileExt = fileName.toLowerCase().split('.').pop();
    const allowedExts = ['xlsx', 'xls', 'csv'];

    if (!fileExt || !allowedExts.includes(fileExt)) {
      return res.status(400).json({
        success: false,
        error: '只支持Excel文件（.xlsx, .xls, .csv）',
      });
    }

    // 解析Excel文件
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Excel文件为空',
      });
    }

    // 转换数据格式
    const vehiclesToInsert = data.map((row: any) => {
      // 支持多种字段名格式
      const ownerName = row['车主姓名'] || row['owner_name'] || row['姓名'] || row['name'] || '';
      const licensePlate = row['车牌号'] || row['license_plate'] || row['车牌'] || row['车牌号码'] || '';
      const phone = row['电话'] || row['phone'] || row['联系电话'] || row['手机'] || '';
      const department = row['部门'] || row['department'] || row['单位'] || '';
      const description = row['描述'] || row['description'] || row['备注'] || row['remark'] || '';

      if (!ownerName || !licensePlate) {
        return null;
      }

      return {
        owner_name: String(ownerName).trim(),
        license_plate: String(licensePlate).trim().toUpperCase(),
        phone: phone ? String(phone).trim() : null,
        department: department ? String(department).trim() : null,
        description: description ? String(description).trim() : null,
      };
    }).filter((v): v is NonNullable<typeof v> => v !== null); // 过滤掉无效数据并修复类型

    if (vehiclesToInsert.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有有效的数据可导入（车主姓名和车牌号为必填项）',
      });
    }

    // 批量插入数据库 - 逐条插入以处理重复数据
    const client = getSupabaseClient();
    let insertedCount = 0;
    let skippedCount = 0;
    let skippedPlateNumbers: string[] = [];

    console.log(`开始处理 ${vehiclesToInsert.length} 条数据`);

    for (const vehicle of vehiclesToInsert) {
      console.log(`处理车牌号: ${vehicle.license_plate}`);

      // 检查车牌号是否已存在
      const { data: existing, error: checkError } = await client
        .from('vehicle_infos')
        .select('id')
        .eq('license_plate', vehicle.license_plate)
        .maybeSingle();

      if (checkError) {
        console.error(`检查失败 ${vehicle.license_plate}:`, checkError);
        skippedCount++;
        skippedPlateNumbers.push(`${vehicle.license_plate} (检查失败)`);
        continue;
      }

      if (existing) {
        // 车牌号已存在，跳过
        console.log(`车牌号已存在，跳过: ${vehicle.license_plate}`);
        skippedCount++;
        skippedPlateNumbers.push(vehicle.license_plate);
        continue;
      }

      // 插入新数据
      console.log(`插入新数据: ${vehicle.license_plate}`);
      const { data: inserted, error: insertError } = await client
        .from('vehicle_infos')
        .insert(vehicle)
        .select();

      if (insertError) {
        console.error(`插入失败 ${vehicle.license_plate}:`, insertError);
        skippedCount++;
        skippedPlateNumbers.push(`${vehicle.license_plate} (插入失败)`);
        continue;
      }

      console.log(`插入成功: ${vehicle.license_plate}`);
      insertedCount++;
    }

    console.log(`导入完成: 成功 ${insertedCount} 条，跳过 ${skippedCount} 条`);

    return res.json({
      success: true,
      data: {
        total: data.length,
        inserted: insertedCount,
        skipped: skippedCount,
        skippedDetails: skippedPlateNumbers,
      },
    });
  } catch (error) {
    console.error('导入失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误',
    });
  }
});

export default router;
