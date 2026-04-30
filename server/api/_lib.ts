import { createClient } from '@supabase/supabase-js';
import { S3Storage, FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 获取Supabase客户端
export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// 获取对象存储客户端
export function getObjectStorage() {
  const endpointUrl = process.env.COZE_BUCKET_ENDPOINT_URL;
  const bucketName = process.env.COZE_BUCKET_NAME;

  if (!endpointUrl || !bucketName) {
    throw new Error('Missing object storage environment variables');
  }

  return new S3Storage({
    endpointUrl,
    accessKey: '',
    secretKey: '',
    bucketName,
    region: 'cn-beijing',
  });
}

// CORS处理
export function setCORSHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
}

// 处理OPTIONS请求
export function handleOPTIONS(res: any) {
  setCORSHeaders(res);
  res.status(200).end();
}
