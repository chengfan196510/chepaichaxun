import express from "express";
import cors from "cors";
import vehiclesRouter from "./routes/vehicles";
import speechRouter from "./routes/speech";
import imageRouter from "./routes/image";

const app = express();
const port = process.env.PORT || 9091;

// 配置query parser以正确处理多个同名参数
app.set('query parser', (qs: string | null) => {
  if (!qs) return {};
  const query: Record<string, string | string[]> = {};
  const pairs = qs.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (!key) continue;
    const decodedKey = decodeURIComponent(key);
    const decodedValue = value ? decodeURIComponent(value) : '';
    if (query[decodedKey]) {
      // 如果已存在，转为数组或追加到数组
      if (Array.isArray(query[decodedKey])) {
        (query[decodedKey] as string[]).push(decodedValue);
      } else {
        query[decodedKey] = [query[decodedKey] as string, decodedValue];
      }
    } else {
      query[decodedKey] = decodedValue;
    }
  }
  return query;
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// API Routes
app.use('/api/v1/vehicles', vehiclesRouter);
app.use('/api/v1/speech', speechRouter);
app.use('/api/v1/image', imageRouter);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
